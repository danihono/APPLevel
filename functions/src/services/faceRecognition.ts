// Reconhecimento facial no NOSSO servidor (sem servico externo). Modelo dlib ResNet (pesos em
// dominio publico) via @vladmandic/face-api (MIT), com o TensorFlow em WebAssembly — leve para o
// container e sem binario nativo. Nao conhece Firebase: recebe imagens, devolve vetores e caixas.
//
// A biblioteca e os modelos so sao carregados na primeira chamada (require tardio), para nao
// pesar na inicializacao das outras Cloud Functions do app.
import path from 'node:path';
import sharp from 'sharp';
import { consistentEnrollment, FACE_MAX_FACES_PER_PHOTO, FACE_MIN_ENROLLMENT_SAMPLES } from './faceMatching';

export type FaceEnrollErrorCode =
  | 'no_face'
  | 'multiple_faces'
  | 'low_quality'
  | 'not_same_person'
  | 'already_enrolled_other'
  | 'invalid_image';

export class FaceEnrollError extends Error {
  code: FaceEnrollErrorCode;

  constructor(code: FaceEnrollErrorCode) {
    super(code);
    this.name = 'FaceEnrollError';
    this.code = code;
  }
}

export interface DetectedPhotoFace {
  // Posicao em fracao (0..1) da imagem ja orientada, para o app recortar a miniatura.
  box: { left: number; top: number; width: number; height: number };
  descriptor: number[];
}

type FaceApi = typeof import('@vladmandic/face-api');

const ENROLL_MAX_SIDE = 1024;
const PHOTO_MAX_SIDE = 2560;
const DETECTION_MIN_CONFIDENCE = 0.5;
// Cadastro: deteccao firme e rosto grande o bastante para um vetor confiavel.
const ENROLL_MIN_SCORE = 0.6;
const ENROLL_MIN_FACE_PX = 80;
// Outro rosto "de verdade" no quadro do cadastro (nao um rostinho la no fundo).
const ENROLL_OTHER_FACE_RATIO = 0.45;
// Foto da turma: o detector reduz a entrada para ~512px, entao a foto e analisada tambem em
// blocos (~600px) com sobreposicao — assim rostos pequenos continuam visiveis.
const PHOTO_TILE_TARGET = 600;
const PHOTO_TILE_OVERLAP = 1.3;
const PHOTO_MIN_FACE_PX = 24;

let faceApiPromise: Promise<FaceApi> | null = null;

function loadFaceApi(): Promise<FaceApi> {
  if (!faceApiPromise) {
    faceApiPromise = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const wasm = require('@tensorflow/tfjs-backend-wasm') as { setWasmPaths: (prefix: string) => void };
      wasm.setWasmPaths(path.join(path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/package.json')), 'dist') + path.sep);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js') as FaceApi;
      // A tipagem do face-api expoe so parte do tfjs; setBackend/ready existem em tempo de execucao.
      const tf = faceapi.tf as unknown as { setBackend: (name: string) => Promise<boolean>; ready: () => Promise<void> };
      await tf.setBackend('wasm');
      await tf.ready();
      const modelDir = path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')), 'model');
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromDisk(modelDir),
        faceapi.nets.faceLandmark68Net.loadFromDisk(modelDir),
        faceapi.nets.faceRecognitionNet.loadFromDisk(modelDir),
      ]);
      return faceapi;
    })().catch((error) => {
      faceApiPromise = null;
      throw error;
    });
  }
  return faceApiPromise;
}

// Gira pela orientacao EXIF, reduz e entrega os pixels RGB. Tambem valida que e uma imagem.
async function decodeImage(input: Buffer, maxSide: number): Promise<{ data: Buffer; width: number; height: number }> {
  try {
    const { data, info } = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new FaceEnrollError('invalid_image');
  }
}

interface RawFace {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  descriptor: number[];
}

// 5 casas bastam para a comparacao e deixam o documento menor.
const compact = (descriptor: Float32Array | number[]) => Array.from(descriptor, (value) => Math.round(value * 1e5) / 1e5);

async function detect(
  faceapi: FaceApi,
  pixels: { data: Buffer; width: number; height: number },
  region?: { x: number; y: number; width: number; height: number },
): Promise<RawFace[]> {
  const full = faceapi.tf.tensor3d(new Uint8Array(pixels.data), [pixels.height, pixels.width, 3], 'int32');
  const input = region
    ? faceapi.tf.slice(full, [region.y, region.x, 0], [region.height, region.width, 3])
    : full;
  try {
    const results = await faceapi
      .detectAllFaces(input as unknown as Parameters<FaceApi['detectAllFaces']>[0], new faceapi.SsdMobilenetv1Options({ minConfidence: DETECTION_MIN_CONFIDENCE }))
      .withFaceLandmarks()
      .withFaceDescriptors();
    return results.map((result) => ({
      x: result.detection.box.x + (region?.x ?? 0),
      y: result.detection.box.y + (region?.y ?? 0),
      width: result.detection.box.width,
      height: result.detection.box.height,
      score: result.detection.score,
      descriptor: compact(result.descriptor),
    }));
  } finally {
    if (input !== full) {
      input.dispose();
    }
    full.dispose();
  }
}

// Cadastro: um vetor por quadro do video guiado. Exige um rosto nitido por quadro e descarta
// quadros que nao batem com o primeiro (de frente). Erro se sobrar menos que o minimo.
export async function describeEnrollment(images: Buffer[]): Promise<number[][]> {
  const faceapi = await loadFaceApi();
  const descriptors: number[][] = [];
  const problems: FaceEnrollErrorCode[] = [];

  for (const image of images) {
    const pixels = await decodeImage(image, ENROLL_MAX_SIDE);
    const faces = (await detect(faceapi, pixels)).sort((left, right) => right.width * right.height - left.width * left.height);
    if (!faces.length) {
      problems.push('no_face');
      continue;
    }
    const [main, second] = faces;
    if (second && second.width >= main.width * ENROLL_OTHER_FACE_RATIO) {
      problems.push('multiple_faces');
      continue;
    }
    if (main.score < ENROLL_MIN_SCORE || Math.min(main.width, main.height) < ENROLL_MIN_FACE_PX) {
      problems.push('low_quality');
      continue;
    }
    descriptors.push(main.descriptor);
  }

  if (descriptors.length < FACE_MIN_ENROLLMENT_SAMPLES) {
    // O problema mais grave que apareceu explica melhor o que refazer.
    const order: FaceEnrollErrorCode[] = ['multiple_faces', 'low_quality', 'no_face'];
    throw new FaceEnrollError(order.find((code) => problems.includes(code)) ?? 'no_face');
  }

  const consistent = consistentEnrollment(descriptors);
  if (consistent.length < FACE_MIN_ENROLLMENT_SAMPLES) {
    throw new FaceEnrollError('not_same_person');
  }
  return consistent;
}

function overlapRatio(a: RawFace, b: RawFace): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) {
    return 0;
  }
  // Sobre a MENOR caixa: o mesmo rosto visto no bloco e na foto inteira tem tamanhos diferentes.
  return (width * height) / Math.min(a.width * a.height, b.width * b.height);
}

// Foto da turma: todos os rostos, com o vetor de cada um, em ordem de leitura (esquerda → direita).
export async function detectFacesInPhoto(image: Buffer): Promise<DetectedPhotoFace[]> {
  const faceapi = await loadFaceApi();
  const pixels = await decodeImage(image, PHOTO_MAX_SIDE);
  const { width, height } = pixels;
  const found = await detect(faceapi, pixels);

  const columns = Math.max(1, Math.round(width / PHOTO_TILE_TARGET));
  const rows = Math.max(1, Math.round(height / PHOTO_TILE_TARGET));
  if (columns * rows > 1) {
    const tileWidth = Math.min(width, Math.ceil((width / columns) * PHOTO_TILE_OVERLAP));
    const tileHeight = Math.min(height, Math.ceil((height / rows) * PHOTO_TILE_OVERLAP));
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = columns === 1 ? 0 : Math.round(((width - tileWidth) * column) / (columns - 1));
        const y = rows === 1 ? 0 : Math.round(((height - tileHeight) * row) / (rows - 1));
        found.push(...await detect(faceapi, pixels, { x, y, width: tileWidth, height: tileHeight }));
      }
    }
  }

  // O mesmo rosto aparece na foto inteira e em mais de um bloco: fica a deteccao mais firme.
  const kept: RawFace[] = [];
  for (const face of [...found].sort((left, right) => right.score - left.score)) {
    if (Math.min(face.width, face.height) < PHOTO_MIN_FACE_PX) continue;
    if (!kept.some((other) => overlapRatio(face, other) > 0.45)) {
      kept.push(face);
    }
  }

  return kept
    .sort((left, right) => left.x - right.x)
    .slice(0, FACE_MAX_FACES_PER_PHOTO)
    .map((face) => ({
      box: {
        left: Math.max(0, face.x / width),
        top: Math.max(0, face.y / height),
        width: Math.min(1, face.width / width),
        height: Math.min(1, face.height / height),
      },
      descriptor: face.descriptor,
    }));
}
