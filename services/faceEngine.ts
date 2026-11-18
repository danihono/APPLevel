// Imagens da biometria facial.
//
// O RECONHECIMENTO e feito no nosso servidor (functions/src/services/faceRecognition.ts).
// Aqui no aparelho ficam so duas coisas:
//  1. a GUIA do cadastro por video: detecta o rosto ao vivo (biblioteca Human, so deteccao + malha,
//     sem reconhecimento) para dizer "aproxime", "vire para o lado" e capturar os quadros sozinho;
//  2. preparar as imagens que vao para o servidor (orientar, reduzir, comprimir).
import type { Config, Human } from '@vladmandic/human';

export const FACE_ENROLLMENT_SAMPLES = 5;

export type FaceEngineErrorCode = 'invalid_image' | 'engine_unavailable';

export class FaceEngineError extends Error {
  code: FaceEngineErrorCode;

  constructor(code: FaceEngineErrorCode) {
    super(code);
    this.name = 'FaceEngineError';
    this.code = code;
  }
}

// Leitura do rosto num quadro do video, em fracoes do quadro (0..1).
export interface FaceReading {
  faces: number;
  centerX: number;
  centerY: number;
  // Largura do rosto / largura do quadro: mede o quao perto a pessoa esta.
  size: number;
  // Rotacao da cabeca em radianos (0 = de frente).
  yaw: number;
  pitch: number;
  // 0..1: a malha facial confirmou um rosto nitido.
  quality: number;
}

const ENROLL_FRAME_MAX_SIDE = 720;
const GROUP_PHOTO_MAX_SIDE = 2560;

const humanConfig: Partial<Config> = {
  backend: 'webgl',
  modelBasePath: `${import.meta.env.BASE_URL}models/human/`,
  // Video ao vivo: cada quadro e analisado de novo (sem reaproveitar o anterior).
  cacheSensitivity: 0,
  warmup: 'none',
  debug: false,
  filter: { enabled: true, equalization: false, flip: false },
  face: {
    enabled: true,
    detector: { rotation: false, maxDetected: 3, minConfidence: 0.4, return: false },
    mesh: { enabled: true },
    iris: { enabled: false },
    emotion: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
    description: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
};

let humanPromise: Promise<Human> | null = null;

// Import dinamico: a biblioteca (~2 MB) e os modelos (~2 MB) so sao baixados por quem abre o
// cadastro facial, nao entram no carregamento inicial do app.
function getHuman(): Promise<Human> {
  if (!humanPromise) {
    humanPromise = (async () => {
      const { Human: HumanClass } = await import('@vladmandic/human');
      const human = new HumanClass(humanConfig);
      await human.load();
      return human;
    })().catch((error) => {
      humanPromise = null;
      console.error('Falha ao iniciar a deteccao facial:', error);
      throw new FaceEngineError('engine_unavailable');
    });
  }
  return humanPromise;
}

export function preloadFaceGuide(): Promise<void> {
  return getHuman().then(() => undefined);
}

export async function readFace(video: HTMLVideoElement): Promise<FaceReading | null> {
  if (!video.videoWidth || !video.videoHeight) {
    return null;
  }
  const human = await getHuman();
  const result = await human.detect(video);
  const faces = result.face.filter((face) => face.boxScore >= 0.5);
  if (!faces.length) {
    return { faces: 0, centerX: 0.5, centerY: 0.5, size: 0, yaw: 0, pitch: 0, quality: 0 };
  }
  const face = faces.sort((left, right) => right.box[2] * right.box[3] - left.box[2] * left.box[3])[0];
  const [x, y, w, h] = face.box;
  return {
    faces: faces.length,
    centerX: (x + w / 2) / video.videoWidth,
    centerY: (y + h / 2) / video.videoHeight,
    size: w / video.videoWidth,
    yaw: face.rotation?.angle.yaw ?? 0,
    pitch: face.rotation?.angle.pitch ?? 0,
    quality: face.faceScore,
  };
}

function toJpegBase64(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL('image/jpeg', quality).replace(/^data:image\/jpeg;base64,/, '');
}

// Quadro do video, sem espelhar (o servidor precisa da imagem real), reduzido e em JPEG.
export function captureFrame(video: HTMLVideoElement): string {
  const scale = Math.min(1, ENROLL_FRAME_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return toJpegBase64(canvas, 0.88);
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

// Foto avulsa do cadastro (quando a camera ao vivo nao esta disponivel).
export async function prepareEnrollmentPhoto(file: Blob): Promise<string> {
  return toJpegBase64(await loadToCanvas(file, ENROLL_FRAME_MAX_SIDE * 1.4), 0.88);
}

// Foto da turma: ja orientada e reduzida. O canvas fica em memoria para recortar as miniaturas
// dos rostos com as caixas que o servidor devolve.
export async function prepareGroupPhoto(file: Blob): Promise<{ base64: string; canvas: HTMLCanvasElement }> {
  const canvas = await loadToCanvas(file, GROUP_PHOTO_MAX_SIDE);
  return { base64: toJpegBase64(canvas, 0.85), canvas };
}

export function cropThumbnail(
  canvas: HTMLCanvasElement,
  box: { left: number; top: number; width: number; height: number },
  size = 112,
): string {
  const w = box.width * canvas.width;
  const h = box.height * canvas.height;
  const side = Math.max(w, h) * 1.5;
  const x = box.left * canvas.width + w / 2 - side / 2;
  const y = box.top * canvas.height + h / 2 - side / 2;
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  out.getContext('2d')?.drawImage(canvas, x, y, side, side, 0, 0, size, size);
  return out.toDataURL('image/jpeg', 0.8);
}
