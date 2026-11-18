import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  AcademyDoc,
  AttendanceDoc,
  ClassDoc,
  COLLECTIONS,
  FaceBiometricsDoc,
  FaceConsentLogDoc,
  UserDoc,
} from '../domain/models';
import { getRequestContext } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import { requiredString } from '../lib/payload';
import { faceSecrets, getFaceCollectionId, getFaceRegion, getRekognitionClient } from '../lib/rekognition';
import {
  FACE_MAX_ENROLLMENT_SAMPLES,
  FACE_MIN_ENROLLMENT_SAMPLES,
  FACE_MODEL_VERSION,
  isAdultByBirthDate,
  suggestFaceMatches,
} from '../services/faceMatching';
import { deleteUserFaces, enrollUserFaces, FaceEnrollError, searchFacesInPhoto, type FaceEnrollErrorCode } from '../services/faceRecognition';

// sharp precisa de memoria; a foto da turma leva alguns segundos (varias buscas na AWS).
const callableOptions = {
  region: 'southamerica-east1',
  invoker: 'public' as const,
  secrets: faceSecrets,
  memory: '1GiB' as const,
  timeoutSeconds: 120,
};

// Versao do termo de consentimento exibido no app (faceBiometricsRules.ts).
// Mudou o texto do termo? Suba a versao aqui e la: o aceite fica registrado por versao.
export const FACE_CONSENT_VERSION = '2026-11-v2';

// Tamanho maximo das imagens em base64 (o app ja manda bem menor que isso).
const MAX_ENROLL_IMAGE_CHARS = 900_000;
const MAX_PHOTO_CHARS = 6_000_000;

const ENROLL_ERROR_MESSAGES: Record<FaceEnrollErrorCode, string> = {
  no_face: 'Nao encontramos seu rosto nas imagens. Tente de novo com boa luz, olhando para a camera.',
  multiple_faces: 'Apareceu mais de uma pessoa na camera. Faca o cadastro sozinho(a).',
  low_quality: 'As imagens ficaram escuras ou tremidas. Procure um lugar mais iluminado e segure o celular firme.',
  extreme_pose: 'O rosto ficou virado demais. Gire so um pouco para cada lado.',
  not_same_person: 'As imagens nao parecem ser da mesma pessoa. Refaca o cadastro.',
  already_enrolled_other: 'Este rosto ja esta cadastrado para outro aluno. Se for um engano, fale com o professor.',
  invalid_image: 'Nao foi possivel ler as imagens enviadas. Tente de novo.',
};

function readImage(value: unknown, maxChars: number): Buffer {
  assertCondition(typeof value === 'string' && value.length > 0, 'invalid-argument', 'Imagem nao enviada.');
  assertCondition(value.length <= maxChars, 'invalid-argument', 'Imagem grande demais.');
  const base64 = value.replace(/^data:image\/[a-z]+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  assertCondition(buffer.length > 1000, 'invalid-argument', 'Imagem invalida.');
  return buffer;
}

async function assertFaceAttendanceEnabled(academyId: string): Promise<void> {
  const academy = await db.collection(COLLECTIONS.academies).doc(academyId).get();
  assertCondition(
    academy.exists && (academy.data() as AcademyDoc).faceAttendanceEnabled === true,
    'failed-precondition',
    'A chamada por foto nao esta liberada nesta academia.',
  );
}

// Erros da AWS viram mensagens que o aluno/professor entende; o detalhe vai para o log.
function rethrowAwsError(context: string, error: unknown): never {
  if (error instanceof HttpsError) {
    throw error;
  }
  if (error instanceof FaceEnrollError) {
    throw new HttpsError('invalid-argument', ENROLL_ERROR_MESSAGES[error.code]);
  }
  logger.error(`Falha no reconhecimento facial (${context})`, {
    name: typeof error === 'object' && error && 'name' in error ? String((error as { name: unknown }).name) : '',
    message: error instanceof Error ? error.message : String(error),
  });
  throw new HttpsError('unavailable', 'O reconhecimento facial esta indisponivel agora. Tente de novo em instantes.');
}

function consentLog(params: {
  userId: string;
  academyId: string;
  action: FaceConsentLogDoc['action'];
  now: Timestamp;
}): FaceConsentLogDoc {
  return {
    userId: params.userId,
    academyId: params.academyId,
    action: params.action,
    consentVersion: FACE_CONSENT_VERSION,
    modelVersion: FACE_MODEL_VERSION,
    createdAt: params.now,
  };
}

// Cadastro da biometria pelo PROPRIO aluno, com os quadros do video guiado. As imagens sao
// usadas so para gerar os vetores na AWS e descartadas; nada e salvo no Firebase.
export const enrollFaceBiometrics = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  assertCondition(actor.role === 'student', 'permission-denied', 'A biometria facial e destinada aos alunos.');
  await assertFaceAttendanceEnabled(actor.academyId);

  assertCondition(
    request.data?.consentAccepted === true && requiredString(request.data, 'consentVersion') === FACE_CONSENT_VERSION,
    'failed-precondition',
    'E necessario aceitar o termo de consentimento atual para cadastrar a biometria facial.',
  );
  assertCondition(
    isAdultByBirthDate(actor.user.birthDate),
    'failed-precondition',
    'A biometria facial esta disponivel apenas para maiores de 18 anos com data de nascimento cadastrada.',
  );

  const rawImages = request.data?.images;
  assertCondition(
    Array.isArray(rawImages) && rawImages.length >= FACE_MIN_ENROLLMENT_SAMPLES && rawImages.length <= FACE_MAX_ENROLLMENT_SAMPLES,
    'invalid-argument',
    `Envie de ${FACE_MIN_ENROLLMENT_SAMPLES} a ${FACE_MAX_ENROLLMENT_SAMPLES} imagens do rosto.`,
  );
  const images = rawImages.map((image: unknown) => readImage(image, MAX_ENROLL_IMAGE_CHARS));

  const client = getRekognitionClient();
  const collectionId = getFaceCollectionId();
  const biometricsRef = db.collection(COLLECTIONS.faceBiometrics).doc(actor.uid);
  const existing = await biometricsRef.get();

  let faceIds: string[];
  try {
    // Refazer o cadastro substitui o anterior por completo.
    await deleteUserFaces(client, collectionId, actor.uid, existing.exists ? (existing.data() as FaceBiometricsDoc).faceIds ?? [] : []);
    ({ faceIds } = await enrollUserFaces(client, collectionId, actor.uid, images));
  } catch (error) {
    if (existing.exists) {
      // O cadastro antigo ja foi apagado na AWS: o status precisa acompanhar.
      await biometricsRef.delete();
      await db.collection(COLLECTIONS.users).doc(actor.uid).update({
        faceBiometricsStatus: FieldValue.delete(),
        faceBiometricsEnrolledAt: FieldValue.delete(),
        updatedAt: Timestamp.now(),
      });
    }
    rethrowAwsError('cadastro', error);
  }

  const now = Timestamp.now();
  const biometrics: FaceBiometricsDoc = {
    userId: actor.uid,
    faceIds,
    collectionId,
    region: getFaceRegion(),
    modelVersion: FACE_MODEL_VERSION,
    consentVersion: FACE_CONSENT_VERSION,
    consentAcceptedAt: now,
    createdAt: existing.exists ? (existing.data() as FaceBiometricsDoc).createdAt : now,
    updatedAt: now,
  };

  const batch = db.batch();
  batch.set(biometricsRef, biometrics);
  batch.update(db.collection(COLLECTIONS.users).doc(actor.uid), {
    faceBiometricsStatus: 'enrolled',
    faceBiometricsEnrolledAt: now,
    updatedAt: now,
  });
  batch.set(
    db.collection(COLLECTIONS.faceConsentLogs).doc(),
    consentLog({ userId: actor.uid, academyId: actor.academyId, action: 'granted', now }),
  );
  await batch.commit();

  return { userId: actor.uid, status: 'enrolled' as const, faces: faceIds.length };
});

// Revogacao do consentimento: apaga na AWS e no Firebase na hora. Funciona mesmo com a chamada
// por foto desligada na academia (o aluno sempre pode desistir).
export const revokeFaceBiometrics = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const biometricsRef = db.collection(COLLECTIONS.faceBiometrics).doc(actor.uid);
  const existing = await biometricsRef.get();

  if (existing.exists || actor.user.faceBiometricsStatus === 'enrolled') {
    try {
      const data = existing.data() as FaceBiometricsDoc | undefined;
      await deleteUserFaces(getRekognitionClient(), data?.collectionId ?? getFaceCollectionId(), actor.uid, data?.faceIds ?? []);
    } catch (error) {
      rethrowAwsError('revogacao', error);
    }
  }

  const now = Timestamp.now();
  const batch = db.batch();
  batch.delete(biometricsRef);
  batch.update(db.collection(COLLECTIONS.users).doc(actor.uid), {
    faceBiometricsStatus: FieldValue.delete(),
    faceBiometricsEnrolledAt: FieldValue.delete(),
    updatedAt: now,
  });
  batch.set(
    db.collection(COLLECTIONS.faceConsentLogs).doc(),
    consentLog({ userId: actor.uid, academyId: actor.academyId, action: 'revoked', now }),
  );
  await batch.commit();

  return { userId: actor.uid, status: 'revoked' as const };
});

// Recebe a foto da turma e SUGERE quem e cada rosto. Nao grava presenca: o professor aprova na
// tela e a confirmacao passa pelo `registerAttendance` de sempre. A foto nao e armazenada.
export const suggestClassAttendanceFromFaces = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const classId = requiredString(request.data, 'classId');
  const image = readImage(request.data?.image, MAX_PHOTO_CHARS);

  const classSnap = await db.collection(COLLECTIONS.classes).doc(classId).get();
  assertCondition(classSnap.exists, 'not-found', 'Aula nao encontrada.');
  const classData = classSnap.data() as ClassDoc;
  assertCondition(
    classData.academyId === actor.academyId || actor.role === 'superadmin',
    'permission-denied',
    'Aula fora da sua academia.',
  );
  assertCondition(
    classData.status === 'active' || classData.status === 'finished',
    'failed-precondition',
    'A aula precisa estar ativa para registrar presenca.',
  );
  await assertFaceAttendanceEnabled(classData.academyId);

  const [usersSnapshot, attendancesSnapshot] = await Promise.all([
    db
      .collection(COLLECTIONS.users)
      .where('academyId', '==', classData.academyId)
      .where('faceBiometricsStatus', '==', 'enrolled')
      .get(),
    db
      .collection(COLLECTIONS.attendances)
      .where('academyId', '==', classData.academyId)
      .where('classId', '==', classId)
      .get(),
  ]);

  // Mesmo publico da chamada manual: alunos ativos da unidade. A colecao na AWS e unica para
  // todas as academias; aqui descartamos qualquer match de fora desta.
  const eligible = new Set(usersSnapshot.docs
    .filter((doc) => {
      const user = doc.data() as UserDoc;
      return user.role === 'student' && user.status !== 'suspended';
    })
    .map((doc) => doc.id));
  const presentUserIds = new Set(attendancesSnapshot.docs.map((doc) => (doc.data() as AttendanceDoc).userId));

  let faces;
  try {
    faces = eligible.size ? await searchFacesInPhoto(getRekognitionClient(), getFaceCollectionId(), image) : [];
  } catch (error) {
    if (error instanceof FaceEnrollError) {
      throw new HttpsError('invalid-argument', 'Nao foi possivel ler a foto. Tente outra imagem.');
    }
    rethrowAwsError('foto da turma', error);
  }

  const suggestions = suggestFaceMatches(faces.map((face) => face.candidates.filter((candidate) => eligible.has(candidate.userId))));

  return {
    classId,
    enrolledCount: eligible.size,
    faces: suggestions.map((suggestion) => ({
      faceIndex: suggestion.faceIndex,
      box: faces[suggestion.faceIndex].box,
      best: suggestion.best
        ? { ...suggestion.best, alreadyPresent: presentUserIds.has(suggestion.best.userId) }
        : null,
      alternatives: suggestion.alternatives.map((candidate) => ({
        ...candidate,
        alreadyPresent: presentUserIds.has(candidate.userId),
      })),
    })),
  };
});

// Qualquer caminho que apague o usuario (auto-exclusao, exclusao pelo admin no console/app)
// leva junto a biometria, na AWS e no Firebase: dado sensivel nunca fica orfao.
export const onUserDeletedPurgeFaceBiometrics = onDocumentDeleted(
  { document: `${COLLECTIONS.users}/{userId}`, region: 'southamerica-east1', secrets: faceSecrets },
  async (event) => {
    const userId = event.params.userId;
    const biometricsRef = db.collection(COLLECTIONS.faceBiometrics).doc(userId);
    const existing = await biometricsRef.get();
    const wasEnrolled = existing.exists || (event.data?.data() as UserDoc | undefined)?.faceBiometricsStatus === 'enrolled';
    if (!wasEnrolled) {
      return;
    }
    const data = existing.data() as FaceBiometricsDoc | undefined;
    await deleteUserFaces(getRekognitionClient(), data?.collectionId ?? getFaceCollectionId(), userId, data?.faceIds ?? []);
    await biometricsRef.delete();
  },
);
