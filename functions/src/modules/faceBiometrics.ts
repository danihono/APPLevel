import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import {
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
  EnrolledFace,
  FACE_MATCH_THRESHOLD,
  FACE_MAX_ENROLLMENT_SAMPLES,
  FACE_MAX_FACES_PER_PHOTO,
  FACE_MODEL_VERSION,
  isAdultByBirthDate,
  isValidEmbedding,
  minPairwiseSimilarity,
  suggestFaceMatches,
} from '../services/faceMatching';

const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };

// Versao do termo de consentimento exibido no app (components/FaceEnrollmentModal.tsx).
// Mudou o texto do termo? Suba a versao aqui e la: o aceite fica registrado por versao.
export const FACE_CONSENT_VERSION = '2026-11-v1';

const GET_ALL_CHUNK = 300;

function readEmbeddings(data: unknown, fieldName: string, maxItems: number): number[][] {
  const value = data && typeof data === 'object' ? (data as Record<string, unknown>)[fieldName] : undefined;
  assertCondition(
    Array.isArray(value) && value.length > 0,
    'invalid-argument',
    'Nenhum rosto foi enviado para analise.',
  );
  assertCondition(value.length <= maxItems, 'invalid-argument', 'Rostos demais em um unico envio.');
  assertCondition(value.every(isValidEmbedding), 'invalid-argument', 'Dados biometricos em formato invalido.');
  return value as number[][];
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

// Cadastro da biometria pelo PROPRIO usuario. Recebe so os vetores calculados no aparelho —
// nenhuma foto chega ao servidor.
export const enrollFaceBiometrics = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  assertCondition(actor.role === 'student', 'permission-denied', 'A biometria facial e destinada aos alunos.');

  assertCondition(
    request.data?.consentAccepted === true && requiredString(request.data, 'consentVersion') === FACE_CONSENT_VERSION,
    'failed-precondition',
    'E necessario aceitar o termo de consentimento atual para cadastrar a biometria facial.',
  );
  assertCondition(
    requiredString(request.data, 'modelVersion') === FACE_MODEL_VERSION,
    'failed-precondition',
    'Atualize o aplicativo para cadastrar a biometria facial.',
  );
  assertCondition(
    isAdultByBirthDate(actor.user.birthDate),
    'failed-precondition',
    'A biometria facial esta disponivel apenas para maiores de 18 anos com data de nascimento cadastrada.',
  );

  const embeddings = readEmbeddings(request.data, 'embeddings', FACE_MAX_ENROLLMENT_SAMPLES);
  assertCondition(
    minPairwiseSimilarity(embeddings) >= FACE_MATCH_THRESHOLD,
    'invalid-argument',
    'As fotos nao parecem ser da mesma pessoa. Refaca o cadastro.',
  );

  const now = Timestamp.now();
  const biometricsRef = db.collection(COLLECTIONS.faceBiometrics).doc(actor.uid);
  const existing = await biometricsRef.get();

  const biometrics: FaceBiometricsDoc = {
    userId: actor.uid,
    // Firestore nao aceita array dentro de array, por isso cada amostra vai embrulhada.
    samples: embeddings.map((values) => ({ values })),
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

  return { userId: actor.uid, status: 'enrolled' as const };
});

// Revogacao do consentimento: apaga os vetores na hora. O log guarda apenas o fato e a data.
export const revokeFaceBiometrics = onCall(callableOptions, async (request) => {
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

async function loadEnrolledFaces(userIds: string[]): Promise<EnrolledFace[]> {
  const enrolled: EnrolledFace[] = [];

  for (let index = 0; index < userIds.length; index += GET_ALL_CHUNK) {
    const refs = userIds
      .slice(index, index + GET_ALL_CHUNK)
      .map((userId) => db.collection(COLLECTIONS.faceBiometrics).doc(userId));
    const snapshots = await db.getAll(...refs);

    for (const snapshot of snapshots) {
      if (!snapshot.exists) {
        continue;
      }
      const data = snapshot.data() as FaceBiometricsDoc;
      // Cadastro feito com outro modelo nao e comparavel: fica de fora ate o aluno refazer.
      if (data.modelVersion !== FACE_MODEL_VERSION) {
        continue;
      }
      enrolled.push({ userId: snapshot.id, embeddings: data.samples.map((sample) => sample.values) });
    }
  }

  return enrolled;
}

// Recebe os rostos detectados na foto da turma e SUGERE quem sao. Nao grava presenca: o
// professor aprova na tela e a confirmacao passa pelo `registerAttendance` de sempre.
export const suggestClassAttendanceFromFaces = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const classId = requiredString(request.data, 'classId');
  const faces = readEmbeddings(request.data, 'embeddings', FACE_MAX_FACES_PER_PHOTO);

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

  // Mesmo publico da chamada manual: alunos ativos da unidade.
  const eligibleUserIds = usersSnapshot.docs
    .filter((doc) => {
      const user = doc.data() as UserDoc;
      return user.role === 'student' && user.status !== 'suspended';
    })
    .map((doc) => doc.id);
  const presentUserIds = new Set(attendancesSnapshot.docs.map((doc) => (doc.data() as AttendanceDoc).userId));

  const enrolled = await loadEnrolledFaces(eligibleUserIds);
  const suggestions = suggestFaceMatches(faces, enrolled);

  return {
    classId,
    enrolledCount: enrolled.length,
    faces: suggestions.map((suggestion) => ({
      faceIndex: suggestion.faceIndex,
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
// leva junto a biometria: dado sensivel nunca fica orfao.
export const onUserDeletedPurgeFaceBiometrics = onDocumentDeleted(
  { document: `${COLLECTIONS.users}/{userId}`, region: 'southamerica-east1' },
  async (event) => {
    await db.collection(COLLECTIONS.faceBiometrics).doc(event.params.userId).delete();
  },
);
