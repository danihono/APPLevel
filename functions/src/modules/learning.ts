import { Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import {
  COLLECTIONS,
  LearningContentStatus,
  LearningCourseDoc,
  LearningLessonDoc,
  LearningProgressDoc,
  LearningQuizAttemptDoc,
  LearningQuizDoc,
  LearningQuizQuestionDoc,
  LearningTrackDoc,
} from '../domain/models';
import { getRequestContext } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import {
  optionalString,
  requiredNumber,
  requiredString,
} from '../lib/payload';

const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };
const DEFAULT_REQUIRED_WATCH_PERCENT = 80;

type PublishedLessonContext = {
  track: LearningTrackDoc;
  course: LearningCourseDoc;
  lesson: LearningLessonDoc;
  quiz?: LearningQuizDoc;
};

type OrderedTrackLesson = {
  id: string;
  trackId: string;
  courseId: string;
  courseOrder: number;
  lessonOrder: number;
  title: string;
};

function normalizeContentStatus(value: string): LearningContentStatus {
  assertCondition(
    value === 'draft' || value === 'published',
    'invalid-argument',
    'Status de conteudo invalido.',
  );

  return value;
}

function normalizePositiveInteger(value: number, fieldName: string, minimum = 0): number {
  assertCondition(Number.isFinite(value), 'invalid-argument', `O campo "${fieldName}" precisa ser numerico.`);
  const normalized = Math.floor(value);
  assertCondition(normalized >= minimum, 'invalid-argument', `O campo "${fieldName}" precisa ser maior ou igual a ${minimum}.`);
  return normalized;
}

function normalizePercentage(value: number, fieldName: string): number {
  const normalized = Math.floor(value);
  assertCondition(normalized >= 1 && normalized <= 100, 'invalid-argument', `O campo "${fieldName}" precisa ficar entre 1 e 100.`);
  return normalized;
}

function assertProfessorOnly(actorRole: string): void {
  assertCondition(actorRole === 'professor' || actorRole === 'admin', 'permission-denied', 'Somente professores e admins podem consumir o Learning Hub.');
}

function isYouTubeUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, '');
    return host === 'youtube.com'
      || host === 'youtu.be'
      || host === 'm.youtube.com';
  } catch {
    return false;
  }
}

function assertYouTubeUrl(value: string): void {
  assertCondition(
    isYouTubeUrl(value),
    'invalid-argument',
    'Informe uma URL valida do YouTube para a aula.',
  );
}

function progressDocId(userId: string, lessonId: string): string {
  return `${userId}__${lessonId}`;
}

async function getTrackOrThrow(trackId: string): Promise<FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>> {
  const snapshot = await db.collection(COLLECTIONS.learningTracks).doc(trackId).get();
  assertCondition(snapshot.exists, 'not-found', 'Trilha nao encontrada.');
  return snapshot;
}

async function getCourseOrThrow(courseId: string): Promise<FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>> {
  const snapshot = await db.collection(COLLECTIONS.learningCourses).doc(courseId).get();
  assertCondition(snapshot.exists, 'not-found', 'Curso nao encontrado.');
  return snapshot;
}

async function getLessonOrThrow(lessonId: string): Promise<FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>> {
  const snapshot = await db.collection(COLLECTIONS.learningLessons).doc(lessonId).get();
  assertCondition(snapshot.exists, 'not-found', 'Aula nao encontrada.');
  return snapshot;
}

async function getLessonContext(lessonId: string, includeQuiz = false): Promise<PublishedLessonContext> {
  const lessonSnap = await getLessonOrThrow(lessonId);
  const lesson = lessonSnap.data() as LearningLessonDoc;

  const [trackSnap, courseSnap, quizSnap] = await Promise.all([
    getTrackOrThrow(lesson.trackId),
    getCourseOrThrow(lesson.courseId),
    includeQuiz ? db.collection(COLLECTIONS.learningQuizzes).doc(lessonId).get() : Promise.resolve(null),
  ]);

  const track = trackSnap.data() as LearningTrackDoc;
  const course = courseSnap.data() as LearningCourseDoc;
  assertCondition(course.trackId === lesson.trackId, 'failed-precondition', 'Curso e aula estao fora da mesma trilha.');

  return {
    track,
    course,
    lesson,
    quiz: quizSnap?.exists ? (quizSnap.data() as LearningQuizDoc) : undefined,
  };
}

async function listOrderedTrackLessons(trackId: string): Promise<OrderedTrackLesson[]> {
  const [coursesSnapshot, lessonsSnapshot] = await Promise.all([
    db.collection(COLLECTIONS.learningCourses).where('trackId', '==', trackId).get(),
    db.collection(COLLECTIONS.learningLessons).where('trackId', '==', trackId).get(),
  ]);

  const publishedCourses = coursesSnapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as LearningCourseDoc) }))
    .filter((course) => course.status === 'published');
  const courseById = new Map(
    publishedCourses.map((course) => [course.id, course]),
  );

  return lessonsSnapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as LearningLessonDoc) }))
    .filter((lesson) => lesson.status === 'published' && courseById.has(lesson.courseId))
    .map((lesson) => ({
      id: lesson.id,
      trackId: lesson.trackId,
      courseId: lesson.courseId,
      courseOrder: courseById.get(lesson.courseId)?.order ?? 0,
      lessonOrder: lesson.order,
      title: lesson.title,
    }))
    .sort((left, right) => {
      if (left.courseOrder !== right.courseOrder) {
        return left.courseOrder - right.courseOrder;
      }

      if (left.lessonOrder !== right.lessonOrder) {
        return left.lessonOrder - right.lessonOrder;
      }

      return left.title.localeCompare(right.title, 'pt-BR');
    });
}

function assertPublishedContext(context: PublishedLessonContext): void {
  assertCondition(context.track.status === 'published', 'failed-precondition', 'A trilha ainda nao foi publicada.');
  assertCondition(context.course.status === 'published', 'failed-precondition', 'O curso ainda nao foi publicado.');
  assertCondition(context.lesson.status === 'published', 'failed-precondition', 'A aula ainda nao foi publicada.');
}

async function ensureLessonUnlocked(params: {
  userId: string;
  lessonId: string;
  orderedLessons: OrderedTrackLesson[];
}): Promise<void> {
  const lessonIndex = params.orderedLessons.findIndex((lesson) => lesson.id === params.lessonId);
  assertCondition(lessonIndex >= 0, 'not-found', 'A aula nao faz parte da trilha publicada.');

  if (lessonIndex === 0) {
    return;
  }

  const currentProgress = await db.collection(COLLECTIONS.learningProgress).doc(progressDocId(params.userId, params.lessonId)).get();
  if (currentProgress.exists) {
    return;
  }

  const previousLesson = params.orderedLessons[lessonIndex - 1];
  const previousProgress = await db.collection(COLLECTIONS.learningProgress).doc(progressDocId(params.userId, previousLesson.id)).get();
  const previousData = previousProgress.data() as LearningProgressDoc | undefined;

  assertCondition(
    previousProgress.exists && !!previousData?.quizPassed,
    'failed-precondition',
    'Conclua a aula anterior antes de liberar esta etapa.',
  );
}

function parseQuizQuestions(data: unknown): LearningQuizQuestionDoc[] {
  const rawQuestions = (data as { questions?: unknown } | null)?.questions;
  assertCondition(Array.isArray(rawQuestions) && rawQuestions.length > 0, 'invalid-argument', 'Cadastre ao menos uma pergunta no quiz.');

  return rawQuestions.map((question, index) => {
    assertCondition(typeof question === 'object' && question !== null, 'invalid-argument', `Pergunta ${index + 1} invalida.`);

    const prompt = typeof (question as { prompt?: unknown }).prompt === 'string'
      ? (question as { prompt: string }).prompt.trim()
      : '';
    const options = Array.isArray((question as { options?: unknown }).options)
      ? (question as { options: unknown[] }).options
        .map((option) => (typeof option === 'string' ? option.trim() : ''))
        .filter(Boolean)
      : [];
    const correctOptionIndex = (question as { correctOptionIndex?: unknown }).correctOptionIndex;

    assertCondition(prompt.length > 0, 'invalid-argument', `Informe o enunciado da pergunta ${index + 1}.`);
    assertCondition(options.length >= 2, 'invalid-argument', `A pergunta ${index + 1} precisa ter ao menos duas opcoes.`);
    assertCondition(
      typeof correctOptionIndex === 'number' && Number.isInteger(correctOptionIndex),
      'invalid-argument',
      `Informe a resposta correta da pergunta ${index + 1}.`,
    );
    assertCondition(
      correctOptionIndex >= 0 && correctOptionIndex < options.length,
      'invalid-argument',
      `A resposta correta da pergunta ${index + 1} esta fora do intervalo.`,
    );

    return {
      prompt,
      options,
      correctOptionIndex,
    };
  });
}

function parseAnswerIndexes(data: unknown): number[] {
  const rawAnswers = (data as { answers?: unknown } | null)?.answers;
  assertCondition(Array.isArray(rawAnswers), 'invalid-argument', 'Envie as respostas do quiz em formato de lista.');
  assertCondition(
    rawAnswers.every((answer) => typeof answer === 'number' && Number.isInteger(answer)),
    'invalid-argument',
    'Cada resposta do quiz precisa ser um indice numerico.',
  );

  return rawAnswers as number[];
}

function sanitizeQuizQuestions(questions: LearningQuizQuestionDoc[]) {
  return questions.map((question, index) => ({
    id: String(index + 1),
    prompt: question.prompt,
    options: question.options,
  }));
}

function findNextLessonId(orderedLessons: OrderedTrackLesson[], lessonId: string): string | undefined {
  const lessonIndex = orderedLessons.findIndex((lesson) => lesson.id === lessonId);
  if (lessonIndex < 0) {
    return undefined;
  }

  return orderedLessons[lessonIndex + 1]?.id;
}

export const upsertLearningTrack = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');
  const trackId = optionalString(request.data, 'trackId');
  const title = requiredString(request.data, 'title');
  const description = optionalString(request.data, 'description');
  const order = normalizePositiveInteger(requiredNumber(request.data, 'order'), 'order');
  const status = normalizeContentStatus(requiredString(request.data, 'status'));
  const now = Timestamp.now();
  const trackRef = trackId
    ? db.collection(COLLECTIONS.learningTracks).doc(trackId)
    : db.collection(COLLECTIONS.learningTracks).doc();
  const existing = trackId ? await trackRef.get() : null;

  const payload: LearningTrackDoc = {
    title,
    description,
    order,
    status,
    createdAt: (existing?.get('createdAt') as FirebaseFirestore.Timestamp | undefined) ?? now,
    updatedAt: now,
  };

  await trackRef.set(payload, { merge: true });

  return {
    trackId: trackRef.id,
    status,
  };
});

export const upsertLearningCourse = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');
  const courseId = optionalString(request.data, 'courseId');
  const trackId = requiredString(request.data, 'trackId');
  const title = requiredString(request.data, 'title');
  const description = optionalString(request.data, 'description');
  const order = normalizePositiveInteger(requiredNumber(request.data, 'order'), 'order');
  const status = normalizeContentStatus(requiredString(request.data, 'status'));
  const now = Timestamp.now();
  const courseRef = courseId
    ? db.collection(COLLECTIONS.learningCourses).doc(courseId)
    : db.collection(COLLECTIONS.learningCourses).doc();
  const [trackSnap, existing] = await Promise.all([
    getTrackOrThrow(trackId),
    courseId ? courseRef.get() : Promise.resolve(null),
  ]);

  assertCondition(trackSnap.exists, 'not-found', 'Trilha nao encontrada.');
  if (existing?.exists) {
    assertCondition(existing.get('trackId') === trackId, 'failed-precondition', 'Nao e possivel mover um curso para outra trilha no v1.');
  }

  const payload: LearningCourseDoc = {
    trackId,
    title,
    description,
    order,
    status,
    createdAt: (existing?.get('createdAt') as FirebaseFirestore.Timestamp | undefined) ?? now,
    updatedAt: now,
  };

  await courseRef.set(payload, { merge: true });

  return {
    courseId: courseRef.id,
    trackId,
    status,
  };
});

export const upsertLearningLesson = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');
  const lessonId = optionalString(request.data, 'lessonId');
  const trackId = requiredString(request.data, 'trackId');
  const courseId = requiredString(request.data, 'courseId');
  const title = requiredString(request.data, 'title');
  const description = optionalString(request.data, 'description');
  const videoUrl = requiredString(request.data, 'videoUrl');
  const order = normalizePositiveInteger(requiredNumber(request.data, 'order'), 'order');
  const status = normalizeContentStatus(requiredString(request.data, 'status'));
  const passingScore = normalizePercentage(requiredNumber(request.data, 'passingScore'), 'passingScore');
  const now = Timestamp.now();

  assertYouTubeUrl(videoUrl);

  const lessonRef = lessonId
    ? db.collection(COLLECTIONS.learningLessons).doc(lessonId)
    : db.collection(COLLECTIONS.learningLessons).doc();
  const [trackSnap, courseSnap, existing, quizSnap] = await Promise.all([
    getTrackOrThrow(trackId),
    getCourseOrThrow(courseId),
    lessonId ? lessonRef.get() : Promise.resolve(null),
    lessonId ? db.collection(COLLECTIONS.learningQuizzes).doc(lessonId).get() : Promise.resolve(null),
  ]);

  const course = courseSnap.data() as LearningCourseDoc;
  assertCondition(trackSnap.exists, 'not-found', 'Trilha nao encontrada.');
  assertCondition(course.trackId === trackId, 'failed-precondition', 'O curso precisa pertencer a trilha informada.');

  if (existing?.exists) {
    assertCondition(existing.get('trackId') === trackId, 'failed-precondition', 'Nao e possivel mover uma aula para outra trilha no v1.');
    assertCondition(existing.get('courseId') === courseId, 'failed-precondition', 'Nao e possivel mover uma aula para outro curso no v1.');
  }

  if (status === 'published') {
    const questionCount = Array.isArray(quizSnap?.get('questions')) ? (quizSnap?.get('questions') as unknown[]).length : 0;
    assertCondition(
      questionCount > 0,
      'failed-precondition',
      'Salve a aula como draft, cadastre o quiz e publique depois.',
    );
  }

  const payload: LearningLessonDoc = {
    trackId,
    courseId,
    title,
    description,
    videoUrl,
    order,
    status,
    passingScore,
    requiredWatchPercent: DEFAULT_REQUIRED_WATCH_PERCENT,
    quizQuestionCount: Array.isArray(quizSnap?.get('questions')) ? (quizSnap?.get('questions') as unknown[]).length : ((existing?.get('quizQuestionCount') as number | undefined) ?? 0),
    createdAt: (existing?.get('createdAt') as FirebaseFirestore.Timestamp | undefined) ?? now,
    updatedAt: now,
  };

  const batch = db.batch();
  batch.set(lessonRef, payload, { merge: true });

  if (quizSnap?.exists) {
    batch.update(quizSnap.ref, {
      passingScore,
      updatedAt: now,
    });
  }

  await batch.commit();

  return {
    lessonId: lessonRef.id,
    courseId,
    trackId,
    status,
  };
});

export const upsertLessonQuiz = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');
  const lessonId = requiredString(request.data, 'lessonId');
  const questions = parseQuizQuestions(request.data);
  const now = Timestamp.now();
  const lessonSnap = await getLessonOrThrow(lessonId);
  const lesson = lessonSnap.data() as LearningLessonDoc;
  const quizRef = db.collection(COLLECTIONS.learningQuizzes).doc(lessonId);
  const existing = await quizRef.get();

  const payload: LearningQuizDoc = {
    lessonId,
    trackId: lesson.trackId,
    courseId: lesson.courseId,
    passingScore: lesson.passingScore,
    questions,
    createdAt: (existing.get('createdAt') as FirebaseFirestore.Timestamp | undefined) ?? now,
    updatedAt: now,
  };

  const batch = db.batch();
  batch.set(quizRef, payload, { merge: true });
  batch.update(lessonSnap.ref, {
    quizQuestionCount: questions.length,
    updatedAt: now,
  });
  await batch.commit();

  return {
    lessonId,
    questionCount: questions.length,
  };
});

export const recordLessonPlayback = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOnly(actor.role);

  const lessonId = requiredString(request.data, 'lessonId');
  const currentSeconds = normalizePositiveInteger(requiredNumber(request.data, 'currentSeconds'), 'currentSeconds');
  const durationSeconds = normalizePositiveInteger(requiredNumber(request.data, 'durationSeconds'), 'durationSeconds', 1);
  const context = await getLessonContext(lessonId);
  const orderedLessons = await listOrderedTrackLessons(context.lesson.trackId);
  const progressRef = db.collection(COLLECTIONS.learningProgress).doc(progressDocId(actor.uid, lessonId));

  assertPublishedContext(context);
  await ensureLessonUnlocked({
    userId: actor.uid,
    lessonId,
    orderedLessons,
  });

  const now = Timestamp.now();
  const clampedCurrentSeconds = Math.min(currentSeconds, durationSeconds);

  await db.runTransaction(async (transaction) => {
    const existingSnapshot = await transaction.get(progressRef);
    const existing = existingSnapshot.exists ? (existingSnapshot.data() as LearningProgressDoc) : undefined;
    const videoSecondsWatched = Math.max(existing?.videoSecondsWatched ?? 0, clampedCurrentSeconds);
    const safeDuration = Math.max(existing?.durationSeconds ?? 0, durationSeconds);
    const watchPercent = Math.min(100, Math.round((videoSecondsWatched / Math.max(safeDuration, 1)) * 100));
    const videoCompleted = (existing?.videoCompleted ?? false) || watchPercent >= context.lesson.requiredWatchPercent;
    const payload: LearningProgressDoc = {
      academyId: actor.academyId,
      userId: actor.uid,
      userDisplayName: actor.user.displayName,
      trackId: context.lesson.trackId,
      courseId: context.lesson.courseId,
      lessonId,
      videoSecondsWatched,
      durationSeconds: safeDuration,
      watchPercent,
      videoCompleted,
      quizReady: videoCompleted,
      quizPassed: existing?.quizPassed ?? false,
      lastScore: existing?.lastScore ?? 0,
      bestScore: existing?.bestScore ?? 0,
      attemptCount: existing?.attemptCount ?? 0,
      unlockedAt: existing?.unlockedAt ?? now,
      passedAt: existing?.passedAt,
      lastAttemptAt: existing?.lastAttemptAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    transaction.set(progressRef, payload, { merge: true });
  });

  const updated = await progressRef.get();
  const progress = updated.data() as LearningProgressDoc;

  return {
    lessonId,
    watchPercent: progress.watchPercent,
    quizReady: progress.quizReady,
  };
});

export const startLessonQuiz = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOnly(actor.role);

  const lessonId = requiredString(request.data, 'lessonId');
  const context = await getLessonContext(lessonId, true);
  const orderedLessons = await listOrderedTrackLessons(context.lesson.trackId);
  const progressSnapshot = await db.collection(COLLECTIONS.learningProgress).doc(progressDocId(actor.uid, lessonId)).get();
  const progress = progressSnapshot.data() as LearningProgressDoc | undefined;

  assertPublishedContext(context);
  await ensureLessonUnlocked({
    userId: actor.uid,
    lessonId,
    orderedLessons,
  });
  assertCondition(!!context.quiz && context.quiz.questions.length > 0, 'failed-precondition', 'O quiz desta aula ainda nao foi configurado.');
  assertCondition(!!progress?.quizReady, 'failed-precondition', 'Assista ao minimo exigido da aula antes de abrir o quiz.');

  return {
    questions: sanitizeQuizQuestions(context.quiz.questions),
    passingScore: context.quiz.passingScore,
    attemptCount: progress.attemptCount ?? 0,
  };
});

export const submitLessonQuiz = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOnly(actor.role);

  const lessonId = requiredString(request.data, 'lessonId');
  const answers = parseAnswerIndexes(request.data);
  const context = await getLessonContext(lessonId, true);
  const orderedLessons = await listOrderedTrackLessons(context.lesson.trackId);
  const progressRef = db.collection(COLLECTIONS.learningProgress).doc(progressDocId(actor.uid, lessonId));
  const existingProgressSnapshot = await progressRef.get();
  const existingProgress = existingProgressSnapshot.data() as LearningProgressDoc | undefined;

  assertPublishedContext(context);
  await ensureLessonUnlocked({
    userId: actor.uid,
    lessonId,
    orderedLessons,
  });
  assertCondition(!!context.quiz && context.quiz.questions.length > 0, 'failed-precondition', 'O quiz desta aula ainda nao foi configurado.');
  assertCondition(!!existingProgress?.quizReady, 'failed-precondition', 'Assista ao minimo exigido da aula antes de enviar o quiz.');
  assertCondition(
    answers.length === context.quiz.questions.length,
    'invalid-argument',
    'Responda todas as perguntas antes de enviar o quiz.',
  );

  const correctAnswers = context.quiz.questions.reduce((total, question, index) => (
    total + (answers[index] === question.correctOptionIndex ? 1 : 0)
  ), 0);
  const scorePercent = Math.round((correctAnswers / Math.max(context.quiz.questions.length, 1)) * 100);
  const passed = scorePercent >= context.quiz.passingScore;
  const unlockedLessonId = passed ? findNextLessonId(orderedLessons, lessonId) : undefined;
  const now = Timestamp.now();
  const attemptRef = db.collection(COLLECTIONS.learningQuizAttempts).doc();

  await db.runTransaction(async (transaction) => {
    const freshProgressSnapshot = await transaction.get(progressRef);
    const freshProgress = freshProgressSnapshot.exists ? (freshProgressSnapshot.data() as LearningProgressDoc) : undefined;

    assertCondition(!!freshProgress?.quizReady, 'failed-precondition', 'Assista ao minimo exigido da aula antes de enviar o quiz.');

    const attemptNumber = (freshProgress?.attemptCount ?? 0) + 1;
    const attemptPayload: LearningQuizAttemptDoc = {
      academyId: actor.academyId,
      userId: actor.uid,
      userDisplayName: actor.user.displayName,
      trackId: context.lesson.trackId,
      courseId: context.lesson.courseId,
      lessonId,
      answers,
      scorePercent,
      passed,
      attemptNumber,
      createdAt: now,
      updatedAt: now,
    };

    const nextProgress: LearningProgressDoc = {
      academyId: actor.academyId,
      userId: actor.uid,
      userDisplayName: actor.user.displayName,
      trackId: context.lesson.trackId,
      courseId: context.lesson.courseId,
      lessonId,
      videoSecondsWatched: freshProgress?.videoSecondsWatched ?? 0,
      durationSeconds: freshProgress?.durationSeconds ?? 0,
      watchPercent: freshProgress?.watchPercent ?? 0,
      videoCompleted: freshProgress?.videoCompleted ?? false,
      quizReady: freshProgress?.quizReady ?? false,
      quizPassed: (freshProgress?.quizPassed ?? false) || passed,
      lastScore: scorePercent,
      bestScore: Math.max(freshProgress?.bestScore ?? 0, scorePercent),
      attemptCount: attemptNumber,
      unlockedAt: freshProgress?.unlockedAt ?? now,
      passedAt: freshProgress?.passedAt ?? (passed ? now : undefined),
      lastAttemptAt: now,
      createdAt: freshProgress?.createdAt ?? now,
      updatedAt: now,
    };

    transaction.set(attemptRef, attemptPayload);
    transaction.set(progressRef, nextProgress, { merge: true });
  });

  return {
    scorePercent,
    passed,
    unlockedLessonId,
  };
});
