// Reconhecimento facial via AWS Rekognition. Nao conhece Firebase: recebe o cliente da AWS e
// imagens, devolve ids e candidatos. As regras de negocio ficam em modules/faceBiometrics.ts.
//
// Modelo de dados na AWS: uma colecao unica; cada aluno e um "user" do Rekognition com
// UserId = uid do Firebase, ligado a 3-6 rostos indexados no cadastro. A Rekognition guarda so
// os vetores dos rostos — as imagens enviadas nao sao armazenadas.
import {
  AssociateFacesCommand,
  CreateCollectionCommand,
  CreateUserCommand,
  DeleteFacesCommand,
  DeleteUserCommand,
  DescribeCollectionCommand,
  DetectFacesCommand,
  IndexFacesCommand,
  ListFacesCommand,
  RekognitionClient,
  SearchUsersByImageCommand,
  SearchUsersCommand,
} from '@aws-sdk/client-rekognition';
import sharp from 'sharp';
import { FACE_MAX_FACES_PER_PHOTO, FACE_MIN_ENROLLMENT_SAMPLES, FACE_SEARCH_THRESHOLD, type FaceCandidate } from './faceMatching';

export type FaceEnrollErrorCode =
  | 'no_face'
  | 'multiple_faces'
  | 'low_quality'
  | 'extreme_pose'
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
  candidates: FaceCandidate[];
}

const ENROLL_MAX_SIDE = 1280;
const PHOTO_MAX_SIDE = 2560;
// Rekognition aceita no maximo 5 MB por imagem enviada em bytes.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Rosto da foto da turma: confianca minima da deteccao e tamanho minimo em pixels.
const PHOTO_MIN_FACE_CONFIDENCE = 90;
const PHOTO_MIN_FACE_PX = 24;
// Recorte de cada rosto: margem em volta e lado minimo depois de ampliar.
const CROP_MARGIN = 0.4;
const CROP_MIN_SIDE = 240;
const SEARCH_CONCURRENCY = 5;
// Similaridade minima para considerar que o rosto do cadastro ja pertence a OUTRO aluno.
const DUPLICATE_IDENTITY_THRESHOLD = 95;

function errorName(error: unknown): string {
  return typeof error === 'object' && error && 'name' in error ? String((error as { name: unknown }).name) : '';
}

async function ignoreNotFound(task: Promise<unknown>): Promise<void> {
  try {
    await task;
  } catch (error) {
    if (errorName(error) !== 'ResourceNotFoundException') {
      throw error;
    }
  }
}

// Gira pela orientacao EXIF, reduz e recomprime. Tambem valida que e uma imagem de verdade.
export async function normalizeImage(input: Buffer, maxSide: number): Promise<{ data: Buffer; width: number; height: number }> {
  try {
    const { data, info } = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > MAX_IMAGE_BYTES) {
      throw new FaceEnrollError('invalid_image');
    }
    return { data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof FaceEnrollError) {
      throw error;
    }
    throw new FaceEnrollError('invalid_image');
  }
}

const ensuredCollections = new Set<string>();

export async function ensureCollection(client: RekognitionClient, collectionId: string): Promise<void> {
  if (ensuredCollections.has(collectionId)) {
    return;
  }
  try {
    await client.send(new DescribeCollectionCommand({ CollectionId: collectionId }));
  } catch (error) {
    if (errorName(error) !== 'ResourceNotFoundException') {
      throw error;
    }
    try {
      await client.send(new CreateCollectionCommand({ CollectionId: collectionId }));
    } catch (createError) {
      // Duas chamadas simultaneas: a outra ja criou.
      if (errorName(createError) !== 'ResourceAlreadyExistsException') {
        throw createError;
      }
    }
  }
  ensuredCollections.add(collectionId);
}

// Apaga o aluno e todos os rostos dele na colecao. Idempotente.
export async function deleteUserFaces(client: RekognitionClient, collectionId: string, userId: string, knownFaceIds: string[] = []): Promise<void> {
  const faceIds = new Set(knownFaceIds);
  try {
    let nextToken: string | undefined;
    do {
      const page = await client.send(new ListFacesCommand({ CollectionId: collectionId, UserId: userId, NextToken: nextToken, MaxResults: 100 }));
      for (const face of page.Faces ?? []) {
        if (face.FaceId) {
          faceIds.add(face.FaceId);
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);
  } catch (error) {
    if (errorName(error) !== 'ResourceNotFoundException') {
      throw error;
    }
  }

  await ignoreNotFound(client.send(new DeleteUserCommand({ CollectionId: collectionId, UserId: userId })));
  const ids = [...faceIds];
  for (let index = 0; index < ids.length; index += 1000) {
    await ignoreNotFound(client.send(new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: ids.slice(index, index + 1000) })));
  }
}

function reasonToCode(reasons: string[]): FaceEnrollErrorCode {
  if (reasons.includes('EXCEEDS_MAX_FACES')) return 'multiple_faces';
  if (reasons.includes('EXTREME_POSE')) return 'extreme_pose';
  if (reasons.some((reason) => ['LOW_BRIGHTNESS', 'LOW_SHARPNESS', 'LOW_FACE_QUALITY', 'SMALL_BOUNDING_BOX'].includes(reason))) return 'low_quality';
  return 'no_face';
}

// Cadastro: indexa os quadros do video guiado, confere que sao todos da mesma pessoa (e que ela
// nao e outro aluno ja cadastrado) e liga os rostos ao aluno. Em qualquer falha desfaz tudo.
export async function enrollUserFaces(
  client: RekognitionClient,
  collectionId: string,
  userId: string,
  images: Buffer[],
): Promise<{ faceIds: string[] }> {
  await ensureCollection(client, collectionId);

  const indexed: string[] = [];
  const reasons: string[] = [];
  try {
    for (const image of images) {
      const { data } = await normalizeImage(image, ENROLL_MAX_SIDE);
      const result = await client.send(new IndexFacesCommand({
        CollectionId: collectionId,
        Image: { Bytes: data },
        ExternalImageId: userId,
        MaxFaces: 1,
        QualityFilter: 'HIGH',
        DetectionAttributes: ['DEFAULT'],
      }));
      const faceIds = (result.FaceRecords ?? []).map((record) => record.Face?.FaceId).filter((id): id is string => !!id);
      const unindexedReasons = (result.UnindexedFaces ?? []).flatMap((face) => face.Reasons ?? []);
      // Outra pessoa no quadro: descarta o quadro inteiro (pode ser a pessoa errada).
      if (unindexedReasons.includes('EXCEEDS_MAX_FACES')) {
        reasons.push('EXCEEDS_MAX_FACES');
        if (faceIds.length) {
          await client.send(new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: faceIds }));
        }
        continue;
      }
      if (!faceIds.length) {
        reasons.push(...(unindexedReasons.length ? unindexedReasons : ['NO_FACE']));
        continue;
      }
      indexed.push(faceIds[0]);
    }

    if (indexed.length < FACE_MIN_ENROLLMENT_SAMPLES) {
      throw new FaceEnrollError(reasonToCode(reasons));
    }

    // Esse rosto ja e de outro aluno? Impede cadastrar o rosto de um colega na propria conta.
    const duplicate = await client.send(new SearchUsersCommand({
      CollectionId: collectionId,
      FaceId: indexed[0],
      UserMatchThreshold: DUPLICATE_IDENTITY_THRESHOLD,
      MaxUsers: 5,
    }));
    if ((duplicate.UserMatches ?? []).some((match) => match.User?.UserId && match.User.UserId !== userId)) {
      throw new FaceEnrollError('already_enrolled_other');
    }

    await client.send(new CreateUserCommand({ CollectionId: collectionId, UserId: userId }));
    // Primeiro rosto vira a referencia; os demais so entram se baterem com ela.
    await client.send(new AssociateFacesCommand({ CollectionId: collectionId, UserId: userId, FaceIds: [indexed[0]] }));
    const rest = indexed.slice(1);
    const association = await client.send(new AssociateFacesCommand({
      CollectionId: collectionId,
      UserId: userId,
      FaceIds: rest,
      UserMatchThreshold: FACE_SEARCH_THRESHOLD,
    }));
    const associated = [indexed[0], ...(association.AssociatedFaces ?? []).map((face) => face.FaceId).filter((id): id is string => !!id)];
    if (associated.length < FACE_MIN_ENROLLMENT_SAMPLES) {
      throw new FaceEnrollError('not_same_person');
    }

    const unassociated = indexed.filter((id) => !associated.includes(id));
    if (unassociated.length) {
      await client.send(new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: unassociated }));
    }
    return { faceIds: associated };
  } catch (error) {
    try {
      await deleteUserFaces(client, collectionId, userId, indexed);
    } catch (cleanupError) {
      console.error('Falha ao desfazer cadastro facial incompleto:', cleanupError);
    }
    throw error;
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Foto da turma: acha os rostos, recorta cada um e procura o aluno correspondente na colecao.
export async function searchFacesInPhoto(client: RekognitionClient, collectionId: string, image: Buffer): Promise<DetectedPhotoFace[]> {
  await ensureCollection(client, collectionId);
  const { data, width, height } = await normalizeImage(image, PHOTO_MAX_SIDE);

  const detection = await client.send(new DetectFacesCommand({ Image: { Bytes: data }, Attributes: ['DEFAULT'] }));
  const faces = (detection.FaceDetails ?? [])
    .filter((face) => (face.Confidence ?? 0) >= PHOTO_MIN_FACE_CONFIDENCE && face.BoundingBox)
    .map((face) => {
      const box = face.BoundingBox!;
      const left = Math.max(0, box.Left ?? 0);
      const top = Math.max(0, box.Top ?? 0);
      return {
        left,
        top,
        width: Math.min(1 - left, box.Width ?? 0),
        height: Math.min(1 - top, box.Height ?? 0),
      };
    })
    .filter((box) => Math.min(box.width * width, box.height * height) >= PHOTO_MIN_FACE_PX)
    // Ordem de leitura (esquerda → direita) para a lista bater com a foto.
    .sort((left, right) => left.left - right.left)
    .slice(0, FACE_MAX_FACES_PER_PHOTO);

  return mapWithConcurrency(faces, SEARCH_CONCURRENCY, async (box) => {
    const faceW = box.width * width;
    const faceH = box.height * height;
    const side = Math.max(faceW, faceH) * (1 + CROP_MARGIN * 2);
    const cx = (box.left + box.width / 2) * width;
    const cy = (box.top + box.height / 2) * height;
    const x = Math.max(0, Math.round(cx - side / 2));
    const y = Math.max(0, Math.round(cy - side / 2));
    const w = Math.max(1, Math.min(width - x, Math.round(side)));
    const h = Math.max(1, Math.min(height - y, Math.round(side)));
    const crop = await sharp(data)
      .extract({ left: x, top: y, width: w, height: h })
      .resize({ width: Math.max(CROP_MIN_SIDE, w), height: Math.max(CROP_MIN_SIDE, h), fit: 'inside' })
      .jpeg({ quality: 90 })
      .toBuffer();

    try {
      const result = await client.send(new SearchUsersByImageCommand({
        CollectionId: collectionId,
        Image: { Bytes: crop },
        UserMatchThreshold: FACE_SEARCH_THRESHOLD,
        MaxUsers: 5,
        // O rosto pode ser pequeno ou de lado: deixamos a AWS buscar e a regra de limiar decidir.
        QualityFilter: 'NONE',
      }));
      const candidates = (result.UserMatches ?? [])
        .filter((match) => match.User?.UserId && typeof match.Similarity === 'number')
        .map((match) => ({ userId: match.User!.UserId!, similarity: Math.round(match.Similarity! * 10) / 10 }));
      return { box, candidates };
    } catch (error) {
      // Recorte em que a AWS nao achou rosto valido: vira "nao reconhecido".
      if (errorName(error) === 'InvalidParameterException') {
        return { box, candidates: [] };
      }
      throw error;
    }
  });
}
