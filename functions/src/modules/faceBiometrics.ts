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
import {
  bestDistance,
  candidatesForFace,
  type EnrolledFace,
  FACE_DUPLICATE_MAX_DISTANCE,
  FACE_MAX_ENROLLMENT_SAMPLES,
  FACE_MIN_ENROLLMENT_SAMPLES,
  FACE_MODEL_VERSION,
  isAdultByBirthDate,
  isValidDescriptor,
  suggestFaceMatches,
} from '../services/faceMatching';
import { describeEnrollment, detectFacesInPhoto, FaceEnrollError, type FaceEnrollErrorCode } from '../services/faceRecognition';

// O modelo de reconhecimento roda aqui mesmo: precisa de memoria, e a foto da turma leva alguns
// segundos (ela e analisada inteira e em blocos).
const callableOptions = {
  region: 'southamerica-east1',
  invoker: 'public' as const,
  memory: '2GiB' as const,
  timeoutSeconds: 120,
};

// Versao do termo de consentimento exibido no app (faceBiometricsRules.ts).
// Mudou o texto do termo? Suba a versao aqui e la: o aceite fica registrado por versao.
export const FACE_CONSENT_VERSION = '2026-11-v3';

// Tamanho maximo das imagens em base64 (o app ja manda bem menor que isso).
const MAX_ENROLL_IMAGE_CHARS = 900_000;
const MAX_PHOTO_CHARS = 6_000_000;
const GET_ALL_CHUNK = 300;

const ENROLL_ERROR_MESSAGES: Record<FaceEnrollErrorCode, string> = {
  no_face: 'Não encontramos seu rosto nas imagens. Tente de novo com boa luz, olhando para a câmera.',
  multiple_faces: 'Apareceu mais de uma pessoa na câmera. Faça o cadastro sozinho(a).',
  low_quality: 'As imagens ficaram escuras ou tremidas. Procure um lugar mais iluminado e segure o celular firme.',
  not_same_person: 'As imagens não parecem ser da mesma pessoa. Refaça o cadastro.',
  already_enrolled_other: 'Este rosto já está cadastrado para outro aluno. Se for um engano, fale com o professor.',
  invalid_image: 'Não foi possível ler as imagens enviadas. Tente de novo.',
};

function readImage(value: unknown, maxChars: number): Buffer {
  assertCondition(typeof value === 'string' && value.length > 0, 'invalid-argument', 'Imagem não enviada.');
  assertCondition(value.length <= maxChars, 'invalid-argument', 'Imagem grande demais.');
  const base64 = value.replace(/^data:image\/[a-z]+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  assertCondition(buffer.length > 1000, 'invalid-argument', 'Imagem inválida.');
  return buffer;
}

async function assertFaceAttendanceEnabled(academyId: string): Promise<void> {
  const academy = await db.collection(COLLECTIONS.academies).doc(academyId).get();
  assertCondition(
    academy.exists && (academy.data() as AcademyDoc).faceAttendanceEnabled === true,
    'failed-precondition',
    'A chamada por foto não está liberada nesta academia.',
  );
}

// Erros do reconhecimento viram mensagens que o aluno/professor entende; o detalhe vai para o log.
function rethrowRecognitionError(context: string, error: unknown): never {
  if (error instanceof HttpsError) {
    throw error;
  }
  if (error instanceof FaceEnrollError) {
    throw new HttpsError('invalid-argument', ENROLL_ERROR_MESSAGES[error.code]);
  }
  logger.error(`Falha no reconhecimento facial (${context})`, {
    message: error instanceof Error ? error.message : String(error),
  });
  throw new HttpsError('unavailable', 'O reconhecimento facial está indisponível agora. Tente de novo em instantes.');
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

// Vetores de quem tem cadastro valido (mesmo modelo). Cadastro de outro modelo fica de fora ate o
// aluno refazer.
async function loadEnrolledFaces(userIds: string[]): Promise<EnrolledFace[]> {
  const enrolled: EnrolledFace[] = [];
  for (let index = 0; index < userIds.length; index += GET_ALL_CHUNK) {
    const refs = userIds.slice(index, index + GET_ALL_CHUNK).map((userId) => db.collection(COLLECTIONS.faceBiometrics).doc(userId));
    if (!refs.length) continue;
    for (const snapshot of await db.getAll(...refs)) {
      if (!snapshot.exists) continue;
      const data = snapshot.data() as FaceBiometricsDoc;
      if (data.modelVersion !== FACE_MODEL_VERSION) continue;
      const descriptors = (data.samples ?? []).map((sample) => sample.values).filter(isValidDescriptor);
      if (descriptors.length) {
        enrolled.push({ userId: snapshot.id, descriptors });
      }
    }
  }
  return enrolled;
}

async function enrolledStudentIds(academyId: string): Promise<string[]> {
  const snapshot = await db
    .collection(COLLECTIONS.users)
    .where('academyId', '==', academyId)
    .where('faceBiometricsStatus', '==', 'enrolled')
    .get();
  // Mesmo publico da chamada manual: alunos ativos da unidade.
  return snapshot.docs
    .filter((doc) => {
      const user = doc.data() as UserDoc;
      return user.role === 'student' && user.status !== 'suspended';
    })
    .map((doc) => doc.id);
}

// Cadastro da biometria pelo PROPRIO aluno, com os quadros do video guiado. As imagens sao usadas
// so para gerar os vetores aqui no servidor e descartadas; nenhuma foto e salva.
export const enrollFaceBiometrics = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  assertCondition(actor.role === 'student', 'permission-denied', 'A biometria facial é destinada aos alunos.');
  await assertFaceAttendanceEnabled(actor.academyId);

  assertCondition(
    request.data?.consentAccepted === true && requiredString(request.data, 'consentVersion') === FACE_CONSENT_VERSION,
    'failed-precondition',
    'É necessário aceitar o termo de consentimento atual para cadastrar a biometria facial.',
  );
  assertCondition(
    isAdultByBirthDate(actor.user.birthDate),
    'failed-precondition',
    'A biometria facial está disponível apenas para maiores de 18 anos com data de nascimento cadastrada.',
  );

  const rawImages = request.data?.images;
  assertCondition(
    Array.isArray(rawImages) && rawImages.length >= FACE_MIN_ENROLLMENT_SAMPLES && rawImages.length <= FACE_MAX_ENROLLMENT_SAMPLES,
    'invalid-argument',
    `Envie de ${FACE_MIN_ENROLLMENT_SAMPLES} a ${FACE_MAX_ENROLLMENT_SAMPLES} imagens do rosto.`,
  );
  const images = rawImages.map((image: unknown) => readImage(image, MAX_ENROLL_IMAGE_CHARS));

  let descriptors: number[][];
  try {
    descriptors = await describeEnrollment(images);
    // Esse rosto ja e de outro aluno da academia? Impede cadastrar o rosto de um colega.
    const others = (await loadEnrolledFaces(await enrolledStudentIds(actor.academyId))).filter((entry) => entry.userId !== actor.uid);
    const duplicate = others.some((entry) => descriptors.some((descriptor) => bestDistance(descriptor, entry) <= FACE_DUPLICATE_MAX_DISTANCE));
    if (duplicate) {
      throw new FaceEnrollError('already_enrolled_other');
    }
  } catch (error) {
    rethrowRecognitionError('cadastro', error);
  }

  const now = Timestamp.now();
  const biometricsRef = db.collection(COLLECTIONS.faceBiometrics).doc(actor.uid);
  const existing = await biometricsRef.get();
  const biometrics: FaceBiometricsDoc = {
    userId: actor.uid,
    samples: descriptors.map((values) => ({ values })),
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

  return { userId: actor.uid, status: 'enrolled' as const, faces: descriptors.length };
});

// Revogacao do consentimento: apaga os vetores na hora. Funciona mesmo com a chamada por foto
// desligada na academia (o aluno sempre pode desistir).
export const revokeFaceBiometrics = onCall({ region: 'southamerica-east1', invoker: 'public' as const }, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const now = Timestamp.now();

  const batch = db.batch();
  batch.delete(db.collection(COLLECTIONS.faceBiometrics).doc(actor.uid));
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

  const [enrolled, attendancesSnapshot] = await Promise.all([
    enrolledStudentIds(classData.academyId).then(loadEnrolledFaces),
    db
      .collection(COLLECTIONS.attendances)
      .where('academyId', '==', classData.academyId)
      .where('classId', '==', classId)
      .get(),
  ]);
  const presentUserIds = new Set(attendancesSnapshot.docs.map((doc) => (doc.data() as AttendanceDoc).userId));

  let faces;
  try {
    faces = enrolled.length ? await detectFacesInPhoto(image) : [];
  } catch (error) {
    if (error instanceof FaceEnrollError) {
      throw new HttpsError('invalid-argument', 'Não foi possível ler a foto. Tente outra imagem.');
    }
    rethrowRecognitionError('foto da turma', error);
  }

  const suggestions = suggestFaceMatches(faces.map((face) => candidatesForFace(face.descriptor, enrolled)));

  return {
    classId,
    enrolledCount: enrolled.length,
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

// Qualquer caminho que apague o usuario (auto-exclusao, exclusao pelo admin no console/app) leva
// junto a biometria: dado sensivel nunca fica orfao.
export const onUserDeletedPurgeFaceBiometrics = onDocumentDeleted(
  { document: `${COLLECTIONS.users}/{userId}`, region: 'southamerica-east1' },
  async (event) => {
    await db.collection(COLLECTIONS.faceBiometrics).doc(event.params.userId).delete();
  },
);
