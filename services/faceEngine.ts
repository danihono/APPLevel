// Motor de reconhecimento facial. Roda 100% no aparelho (biblioteca Human, rede neural via
// WebGL): a foto NUNCA sai do dispositivo — so o vetor numerico de cada rosto vai ao servidor.
//
// Este arquivo e a unica fronteira com o motor. Para trocar por outro (ex.: AWS Rekognition),
// reimplemente as duas funcoes exportadas e suba FACE_MODEL_VERSION aqui e em
// functions/src/services/faceMatching.ts (cadastros antigos deixam de ser comparaveis).
import type { Config, Human } from '@vladmandic/human';

export const FACE_MODEL_VERSION = 'human-faceres-v1';
export const FACE_ENROLLMENT_SAMPLES = 3;
// Teto do backend (FACE_MAX_FACES_PER_PHOTO).
const MAX_FACES_PER_PHOTO = 80;

export type FaceEngineErrorCode = 'no_face' | 'multiple_faces' | 'face_too_small' | 'invalid_image' | 'engine_unavailable';

export class FaceEngineError extends Error {
  code: FaceEngineErrorCode;

  constructor(code: FaceEngineErrorCode) {
    super(code);
    this.name = 'FaceEngineError';
    this.code = code;
  }
}

export interface DetectedFace {
  embedding: number[];
  // Recorte pequeno do rosto (data URL), so para o professor conferir na tela. Fica em memoria.
  thumbnail: string;
  box: { x: number; y: number; width: number; height: number };
  score: number;
}

const SELFIE_MAX_SIDE = 1024;
const GROUP_MAX_SIDE = 2560;
// Rosto menor que isso nao gera um vetor confiavel.
const SELFIE_MIN_FACE_PX = 110;
const GROUP_MIN_FACE_PX = 34;
// Duas notas por rosto: a do detector (caixa) e a da malha facial (rosto nitido e de frente).
// Na selfie exigimos a malha; na foto da turma basta o detector — rosto pequeno ou de lado
// costuma reprovar na malha e, como o professor confere tudo, vale mais sugerir do que omitir.
const SELFIE_MIN_MESH_SCORE = 0.6;
const GROUP_MIN_BOX_SCORE = 0.4;
const THUMBNAIL_SIZE = 112;

const humanConfig: Partial<Config> = {
  backend: 'webgl',
  modelBasePath: `${import.meta.env.BASE_URL}models/human/`,
  // Foto parada: sem cache entre quadros, cada chamada analisa a imagem inteira.
  cacheSensitivity: 0,
  warmup: 'none',
  debug: false,
  filter: { enabled: true, equalization: false, flip: false },
  face: {
    enabled: true,
    detector: { rotation: false, maxDetected: 40, minConfidence: 0.3, return: false },
    mesh: { enabled: true, keepInvalid: true },
    iris: { enabled: false },
    emotion: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
    description: { enabled: true },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
};

let humanPromise: Promise<Human> | null = null;

// Import dinamico: a biblioteca (~2 MB) e os modelos (~9 MB) so sao baixados por quem abre a
// biometria, nao entram no carregamento inicial do app.
function getHuman(): Promise<Human> {
  if (!humanPromise) {
    humanPromise = (async () => {
      const { Human: HumanClass } = await import('@vladmandic/human');
      const human = new HumanClass(humanConfig);
      await human.load();
      return human;
    })().catch((error) => {
      humanPromise = null;
      console.error('Falha ao iniciar o motor de reconhecimento facial:', error);
      throw new FaceEngineError('engine_unavailable');
    });
  }
  return humanPromise;
}

// Adianta o download dos modelos enquanto o usuario le o termo / escolhe a foto.
export function preloadFaceEngine(): void {
  void getHuman().catch(() => undefined);
}

async function loadToCanvas(file: Blob, maxSide: number): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    // 'from-image' respeita a orientacao EXIF (foto de celular em pe).
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new FaceEngineError('invalid_image');
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

function cropCanvas(source: HTMLCanvasElement, x: number, y: number, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(source, x, y, width, height, 0, 0, width, height);
  return canvas;
}

function makeThumbnail(source: HTMLCanvasElement, box: DetectedFace['box']): string {
  const margin = Math.max(box.width, box.height) * 0.25;
  const side = Math.max(box.width, box.height) + margin * 2;
  const x = box.x + box.width / 2 - side / 2;
  const y = box.y + box.height / 2 - side / 2;
  const canvas = document.createElement('canvas');
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  canvas.getContext('2d')?.drawImage(source, x, y, side, side, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  return canvas.toDataURL('image/jpeg', 0.8);
}

type RawFace = Omit<DetectedFace, 'thumbnail'>;

async function detectIn(
  human: Human,
  canvas: HTMLCanvasElement,
  mode: 'selfie' | 'group',
  offsetX = 0,
  offsetY = 0,
): Promise<RawFace[]> {
  const result = await human.detect(canvas);
  const faces: RawFace[] = [];
  for (const face of result.face) {
    const accepted = mode === 'selfie'
      ? face.faceScore >= SELFIE_MIN_MESH_SCORE
      : face.faceScore >= SELFIE_MIN_MESH_SCORE || face.boxScore >= GROUP_MIN_BOX_SCORE;
    if (!face.embedding || face.embedding.length === 0 || !accepted) {
      continue;
    }
    faces.push({
      // 4 casas bastam para a comparacao e deixam o envio bem menor.
      embedding: face.embedding.map((value) => Math.round(value * 10000) / 10000),
      box: { x: face.box[0] + offsetX, y: face.box[1] + offsetY, width: face.box[2], height: face.box[3] },
      // Rosto validado pela malha sempre vence o mesmo rosto visto so pelo detector.
      score: face.faceScore >= SELFIE_MIN_MESH_SCORE ? 1 + face.faceScore : face.boxScore,
    });
  }
  return faces;
}

function overlapRatio(a: RawFace['box'], b: RawFace['box']): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) {
    return 0;
  }
  // Sobre a MENOR caixa: o mesmo rosto visto no bloco e na foto inteira tem tamanhos diferentes.
  return (width * height) / Math.min(a.width * a.height, b.width * b.height);
}

// O mesmo rosto aparece na foto inteira e em mais de um bloco: fica a deteccao mais nitida.
function dedupeFaces(faces: RawFace[]): RawFace[] {
  const kept: RawFace[] = [];
  for (const face of [...faces].sort((left, right) => right.score - left.score)) {
    if (!kept.some((other) => overlapRatio(face.box, other.box) > 0.45)) {
      kept.push(face);
    }
  }
  return kept;
}

// Selfie do cadastro: exige exatamente um rosto, grande o bastante.
export async function extractEnrollmentEmbedding(file: Blob): Promise<number[]> {
  const human = await getHuman();
  const canvas = await loadToCanvas(file, SELFIE_MAX_SIDE);
  const faces = dedupeFaces(await detectIn(human, canvas, 'selfie'));

  if (faces.length === 0) {
    throw new FaceEngineError('no_face');
  }
  if (faces.length > 1) {
    throw new FaceEngineError('multiple_faces');
  }
  if (Math.min(faces[0].box.width, faces[0].box.height) < SELFIE_MIN_FACE_PX) {
    throw new FaceEngineError('face_too_small');
  }
  return faces[0].embedding;
}

// Foto da turma. O detector enxerga mal rostos pequenos, entao alem da foto inteira analisamos
// blocos sobrepostos (cada rosto fica proporcionalmente maior dentro do bloco).
export async function extractFacesFromGroupPhoto(file: Blob): Promise<DetectedFace[]> {
  const human = await getHuman();
  const canvas = await loadToCanvas(file, GROUP_MAX_SIDE);
  const found: RawFace[] = await detectIn(human, canvas, 'group');

  if (Math.max(canvas.width, canvas.height) > 900) {
    const landscape = canvas.width >= canvas.height;
    const columns = landscape ? 3 : 2;
    const rows = landscape ? 2 : 3;
    // Blocos 40% maiores que a celula: quem esta na emenda aparece inteiro em pelo menos um.
    const tileWidth = Math.min(canvas.width, Math.round((canvas.width / columns) * 1.4));
    const tileHeight = Math.min(canvas.height, Math.round((canvas.height / rows) * 1.4));

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = Math.round(((canvas.width - tileWidth) * column) / (columns - 1));
        const y = Math.round(((canvas.height - tileHeight) * row) / (rows - 1));
        const tile = cropCanvas(canvas, x, y, tileWidth, tileHeight);
        found.push(...await detectIn(human, tile, 'group', x, y));
      }
    }
  }

  return dedupeFaces(found)
    .filter((face) => Math.min(face.box.width, face.box.height) >= GROUP_MIN_FACE_PX)
    // Ordem de leitura (esquerda → direita) para a lista bater com a foto.
    .sort((left, right) => left.box.x - right.box.x)
    .slice(0, MAX_FACES_PER_PHOTO)
    .map((face) => ({ ...face, thumbnail: makeThumbnail(canvas, face.box) }));
}
