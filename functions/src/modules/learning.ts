import { Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import {
  COLLECTIONS,
  LearningAudienceConfig,
  LearningContentStatus,
  LearningCourseDoc,
  LearningLessonBlockDoc,
  LearningLessonBlockType,
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
  optionalNumber,
  optionalString,
  requiredNumber,
  requiredString,
} from '../lib/payload';
import {
  LEGACY_TRACK_AUDIENCE,
  assertLearningAudience,
  computeEffectiveAudience,
  parseAudience,
} from '../services/learningAudience';

const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };
const DEFAULT_REQUIRED_WATCH_PERCENT = 80;
const LEGACY_VIDEO_BLOCK_ID = 'legacy-youtube';

type ResolvedLessonBlock = LearningLessonBlockDoc & { id: string };

type LearningActor = Awaited<ReturnType<typeof getRequestContext>>;

type PublishedLessonContext = {
  track: LearningTrackDoc;
  course: LearningCourseDoc;
  lesson: LearningLessonDoc;
  blocks: ResolvedLessonBlock[];
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

type ParsedBlockInput = {
  blockId?: string;
  type: LearningLessonBlockType;
  title: string;
  order: number;
  sourceUrl?: string;
  storagePath?: string;
  mimeType?: string;
  fileName?: string;
  thumbnailUrl?: string;
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

function normalizeBlockType(value: string): LearningLessonBlockType {
  assertCondition(
    value === 'youtube' || value === 'uploaded_video' || value === 'pdf' || value === 'image',
    'invalid-argument',
    'Tipo de conteudo invalido.',
  );

  return value;
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
    'Informe uma URL valida do YouTube para o modulo.',
  );
}

function progressDocId(userId: string, lessonId: string): string {
  return `${userId}__${lessonId}`;
}

function hasQuizConfigured(lesson: LearningLessonDoc, quiz?: LearningQuizDoc): boolean {
  if (quiz) {
    return Array.isArray(quiz.questions) && quiz.questions.length > 0;
  }

  return lesson.quizQuestionCount > 0;
}

function isManualBlockType(type: LearningLessonBlockType): boolean {
  return type === 'pdf' || type === 'image';
}

function isVideoBlockType(type: LearningLessonBlockType): boolean {
  return type === 'youtube' || type === 'uploaded_video';
}

function clampProgressValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeProgressMap(progress?: LearningProgressDoc): Record<string, number> {
  const base = progress?.contentProgressMap;
  if (!base || typeof base !== 'object') {
    return {};
  }

  return Object.entries(base).reduce<Record<string, number>>((accumulator, [blockId, value]) => {
    accumulator[blockId] = clampProgressValue(value);
    return accumulator;
  }, {});
}

function deriveContentState(blocks: ResolvedLessonBlock[], rawProgressMap: Record<string, number>) {
  const contentProgressMap: Record<string, number> = {};
  const completedContentIds: string[] = [];

  let progressTotal = 0;

  blocks.forEach((block) => {
    const progress = clampProgressValue(rawProgressMap[block.id] ?? 0);
    contentProgressMap[block.id] = progress;
    progressTotal += progress;

    if (progress >= 100) {
      completedContentIds.push(block.id);
    }
  });

  const contentCompletionPercent = blocks.length > 0
    ? Math.round(progressTotal / blocks.length)
    : 0;
  const contentCompleted = blocks.length > 0 && completedContentIds.length === blocks.length;

  return {
    contentProgressMap,
    completedContentIds,
    contentCompletionPercent,
    contentCompleted,
  };
}

function isLessonCompleted(progress?: LearningProgressDoc): boolean {
  if (!progress) {
    return false;
  }

  return !!progress.lessonCompleted || !!progress.quizPassed || !!progress.contentCompleted;
}

function buildLegacyLessonBlock(lesson: LearningLessonDoc): ResolvedLessonBlock | null {
  if (!lesson.videoUrl) {
    return null;
  }

  return {
    id: LEGACY_VIDEO_BLOCK_ID,
    lessonId: '',
    trackId: lesson.trackId,
    courseId: lesson.courseId,
    type: 'youtube',
    title: lesson.title,
    order: 1,
    sourceUrl: lesson.videoUrl,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  };
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
  assertCondition(snapshot.exists, 'not-found', 'Modulo nao encontrado.');
  return snapshot;
}

async function listLessonBlocks(lessonId: string): Promise<ResolvedLessonBlock[]> {
  const snapshot = await db.collection(COLLECTIONS.learningLessonBlocks).where('lessonId', '==', lessonId).get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as LearningLessonBlockDoc) }))
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, 'pt-BR'));
}

async function resolveLessonBlocks(lessonId: string, lesson: LearningLessonDoc): Promise<ResolvedLessonBlock[]> {
  const storedBlocks = await listLessonBlocks(lessonId);
  if (storedBlocks.length > 0) {
    return storedBlocks;
  }

  const legacyBlock = buildLegacyLessonBlock(lesson);
  if (!legacyBlock) {
    return [];
  }

  return [
    {
      ...legacyBlock,
      lessonId,
    },
  ];
}

async function getLessonContext(lessonId: string, includeQuiz = false): Promise<PublishedLessonContext> {
  const lessonSnap = await getLessonOrThrow(lessonId);
  const lesson = lessonSnap.data() as LearningLessonDoc;

  const [trackSnap, courseSnap, quizSnap, blocks] = await Promise.all([
    getTrackOrThrow(lesson.trackId),
    getCourseOrThrow(lesson.courseId),
    includeQuiz ? db.collection(COLLECTIONS.learningQuizzes).doc(lessonId).get() : Promise.resolve(null),
    resolveLessonBlocks(lessonId, lesson),
  ]);

  const track = trackSnap.data() as LearningTrackDoc;
  const course = courseSnap.data() as LearningCourseDoc;
  assertCondition(course.trackId === lesson.trackId, 'failed-precondition', 'Curso e modulo estao fora da mesma trilha.');

  return {
    track,
    course,
    lesson,
    blocks,
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

/**
 * Ponto unico de enforcement do consumo: exige conteudo publicado em toda a
 * hierarquia e que o usuario pertenca ao publico-alvo efetivo do modulo.
 */
function assertPublishedContext(
  context: PublishedLessonContext,
  actor: LearningActor,
): void {
  assertCondition(context.track.status === 'published', 'failed-precondition', 'A trilha ainda nao foi publicada.');
  assertCondition(context.course.status === 'published', 'failed-precondition', 'O curso ainda nao foi publicado.');
  assertCondition(context.lesson.status === 'published', 'failed-precondition', 'O modulo ainda nao foi publicado.');
  assertLearningAudience(actor, context.track, context.course, context.lesson);
}

async function ensureLessonUnlocked(params: {
  userId: string;
  lessonId: string;
  orderedLessons: OrderedTrackLesson[];
}): Promise<void> {
  const lessonIndex = params.orderedLessons.findIndex((lesson) => lesson.id === params.lessonId);
  assertCondition(lessonIndex >= 0, 'not-found', 'O modulo nao faz parte da trilha publicada.');

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
    previousProgress.exists && isLessonCompleted(previousData),
    'failed-precondition',
    'Conclua o modulo anterior antes de liberar esta etapa.',
  );
}

function parseQuizQuestions(data: unknown, options?: { allowEmpty?: boolean }): LearningQuizQuestionDoc[] {
  const rawQuestions = (data as { questions?: unknown } | null)?.questions;
  assertCondition(Array.isArray(rawQuestions), 'invalid-argument', 'Envie as perguntas do quiz em formato de lista.');

  if (rawQuestions.length === 0) {
    assertCondition(!!options?.allowEmpty, 'invalid-argument', 'Cadastre ao menos uma pergunta no quiz.');
    return [];
  }

  return rawQuestions.map((question, index) => {
    assertCondition(typeof question === 'object' && question !== null, 'invalid-argument', `Pergunta ${index + 1} invalida.`);

    const prompt = typeof (question as { prompt?: unknown }).prompt === 'string'
      ? (question as { prompt: string }).prompt.trim()
      : '';
    const optionsList = Array.isArray((question as { options?: unknown }).options)
      ? (question as { options: unknown[] }).options
        .map((option) => (typeof option === 'string' ? option.trim() : ''))
        .filter(Boolean)
      : [];
    const correctOptionIndex = (question as { correctOptionIndex?: unknown }).correctOptionIndex;

    assertCondition(prompt.length > 0, 'invalid-argument', `Informe o enunciado da pergunta ${index + 1}.`);
    assertCondition(optionsList.length >= 2, 'invalid-argument', `A pergunta ${index + 1} precisa ter ao menos duas opcoes.`);
    assertCondition(
      typeof correctOptionIndex === 'number' && Number.isInteger(correctOptionIndex),
      'invalid-argument',
      `Informe a resposta correta da pergunta ${index + 1}.`,
    );
    assertCondition(
      correctOptionIndex >= 0 && correctOptionIndex < optionsList.length,
      'invalid-argument',
      `A resposta correta da pergunta ${index + 1} esta fora do intervalo.`,
    );

    return {
      prompt,
      options: optionsList,
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

function parseLessonBlocks(data: unknown): ParsedBlockInput[] {
  const rawBlocks = (data as { blocks?: unknown } | null)?.blocks;
  assertCondition(Array.isArray(rawBlocks), 'invalid-argument', 'Envie os blocos do modulo em formato de lista.');

  const parsedBlocks = rawBlocks.map((entry, index) => {
    assertCondition(typeof entry === 'object' && entry !== null, 'invalid-argument', `Bloco ${index + 1} invalido.`);

    const record = entry as {
      blockId?: unknown;
      type?: unknown;
      title?: unknown;
      order?: unknown;
      sourceUrl?: unknown;
      storagePath?: unknown;
      mimeType?: unknown;
      fileName?: unknown;
      thumbnailUrl?: unknown;
    };

    const blockId = typeof record.blockId === 'string' && record.blockId.trim().length > 0
      ? record.blockId.trim()
      : undefined;
    const type = normalizeBlockType(requiredString(record, 'type'));
    const title = requiredString(record, 'title').trim();
    const order = normalizePositiveInteger(requiredNumber(record, 'order'), 'order', 1);
    const sourceUrl = optionalString(record, 'sourceUrl');
    const storagePath = optionalString(record, 'storagePath');
    const mimeType = optionalString(record, 'mimeType');
    const fileName = optionalString(record, 'fileName');
    const thumbnailUrl = optionalString(record, 'thumbnailUrl');

    if (type === 'youtube') {
      assertCondition(!!sourceUrl, 'invalid-argument', `Informe a URL do YouTube no bloco ${index + 1}.`);
      assertYouTubeUrl(sourceUrl);
    } else {
      assertCondition(!!sourceUrl, 'invalid-argument', `Informe a URL publica do arquivo no bloco ${index + 1}.`);
      assertCondition(!!storagePath, 'invalid-argument', `Informe o storagePath do bloco ${index + 1}.`);
      assertCondition(!!mimeType, 'invalid-argument', `Informe o mimeType do bloco ${index + 1}.`);
      assertCondition(!!fileName, 'invalid-argument', `Informe o nome do arquivo no bloco ${index + 1}.`);

      if (type === 'uploaded_video') {
        assertCondition(mimeType.startsWith('video/'), 'invalid-argument', `O bloco ${index + 1} precisa apontar para um video.`);
      }

      if (type === 'pdf') {
        assertCondition(mimeType === 'application/pdf', 'invalid-argument', `O bloco ${index + 1} precisa apontar para um PDF.`);
      }

      if (type === 'image') {
        assertCondition(mimeType.startsWith('image/'), 'invalid-argument', `O bloco ${index + 1} precisa apontar para uma imagem.`);
      }
    }

    return {
      blockId,
      type,
      title,
      order,
      sourceUrl,
      storagePath,
      mimeType,
      fileName,
      thumbnailUrl,
    };
  });

  const seenIds = new Set<string>();
  parsedBlocks.forEach((block, index) => {
    if (!block.blockId) {
      return;
    }

    assertCondition(!seenIds.has(block.blockId), 'invalid-argument', `O bloco ${index + 1} usa um id duplicado.`);
    seenIds.add(block.blockId);
  });

  return parsedBlocks;
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

function buildProgressPayload(params: {
  actor: LearningActor;
  lessonId: string;
  context: PublishedLessonContext;
  existing?: LearningProgressDoc;
  now: Timestamp;
  contentProgressMap: Record<string, number>;
  videoSecondsWatched: number;
  durationSeconds: number;
  watchPercent: number;
  videoCompleted: boolean;
  quizPassed?: boolean;
  attemptCount?: number;
  lastScore?: number;
  bestScore?: number;
  lastAttemptAt?: Timestamp;
  passedAt?: Timestamp;
}) {
  const contentState = deriveContentState(params.context.blocks, params.contentProgressMap);
  const quizPassed = params.quizPassed ?? params.existing?.quizPassed ?? false;
  const hasQuiz = hasQuizConfigured(params.context.lesson, params.context.quiz);
  const lessonCompleted = hasQuiz
    ? contentState.contentCompleted && quizPassed
    : contentState.contentCompleted;

  return {
    academyId: params.actor.academyId,
    userId: params.actor.uid,
    userDisplayName: params.actor.user.displayName,
    trackId: params.context.lesson.trackId,
    courseId: params.context.lesson.courseId,
    lessonId: params.lessonId,
    videoSecondsWatched: params.videoSecondsWatched,
    durationSeconds: params.durationSeconds,
    watchPercent: params.watchPercent,
    videoCompleted: params.videoCompleted,
    quizReady: contentState.contentCompleted,
    quizPassed,
    lessonCompleted,
    completedContentIds: contentState.completedContentIds,
    contentProgressMap: contentState.contentProgressMap,
    contentCompletionPercent: contentState.contentCompletionPercent,
    contentCompleted: contentState.contentCompleted,
    lastScore: params.lastScore ?? params.existing?.lastScore ?? 0,
    bestScore: params.bestScore ?? params.existing?.bestScore ?? 0,
    attemptCount: params.attemptCount ?? params.existing?.attemptCount ?? 0,
    unlockedAt: params.existing?.unlockedAt ?? params.now,
    passedAt: params.passedAt ?? params.existing?.passedAt,
    lastAttemptAt: params.lastAttemptAt ?? params.existing?.lastAttemptAt,
    createdAt: params.existing?.createdAt ?? params.now,
    updatedAt: params.now,
  } satisfies LearningProgressDoc;
}

function getDefaultVideoBlock(context: PublishedLessonContext): ResolvedLessonBlock {
  const block = context.blocks.find((entry) => isVideoBlockType(entry.type));
  assertCondition(!!block, 'failed-precondition', 'O modulo nao possui um bloco de video reproduzivel.');
  if (!block) {
    throw new Error('O modulo nao possui um bloco de video reproduzivel.');
  }
  return block;
}

async function recordVideoProgress(params: {
  actor: LearningActor;
  lessonId: string;
  blockId: string;
  currentSeconds: number;
  durationSeconds: number;
}) {
  const context = await getLessonContext(params.lessonId);
  const orderedLessons = await listOrderedTrackLessons(context.lesson.trackId);
  const progressRef = db.collection(COLLECTIONS.learningProgress).doc(progressDocId(params.actor.uid, params.lessonId));
  const block = context.blocks.find((entry) => entry.id === params.blockId);

  assertPublishedContext(context, params.actor);
  await ensureLessonUnlocked({
    userId: params.actor.uid,
    lessonId: params.lessonId,
    orderedLessons,
  });

  if (!block) {
    throw new Error('Bloco de conteudo nao encontrado.');
  }
  assertCondition(isVideoBlockType(block.type), 'failed-precondition', 'Este bloco nao aceita progresso por reproducao.');

  const now = Timestamp.now();
  const clampedCurrentSeconds = Math.min(params.currentSeconds, params.durationSeconds);
  const safeDuration = Math.max(params.durationSeconds, 1);
  const rawWatchPercent = Math.min(100, Math.round((clampedCurrentSeconds / safeDuration) * 100));
  const normalizedBlockProgress = Math.min(
    100,
    Math.round((rawWatchPercent / Math.max(context.lesson.requiredWatchPercent, 1)) * 100),
  );

  await db.runTransaction(async (transaction) => {
    const existingSnapshot = await transaction.get(progressRef);
    const existing = existingSnapshot.exists ? (existingSnapshot.data() as LearningProgressDoc) : undefined;
    const contentProgressMap = normalizeProgressMap(existing);
    contentProgressMap[block.id] = Math.max(contentProgressMap[block.id] ?? 0, normalizedBlockProgress);

    const payload = buildProgressPayload({
      actor: params.actor,
      lessonId: params.lessonId,
      context,
      existing,
      now,
      contentProgressMap,
      videoSecondsWatched: clampedCurrentSeconds,
      durationSeconds: safeDuration,
      watchPercent: rawWatchPercent,
      videoCompleted: (contentProgressMap[block.id] ?? 0) >= 100,
    });

    transaction.set(progressRef, payload, { merge: true });
  });

  const updated = await progressRef.get();
  const progress = updated.data() as LearningProgressDoc;

  return {
    lessonId: params.lessonId,
    blockId: block.id,
    watchPercent: progress.watchPercent,
    contentCompletionPercent: progress.contentCompletionPercent ?? 0,
    contentCompleted: progress.contentCompleted ?? false,
    quizReady: progress.quizReady,
  };
}

type PendingWrite = {
  ref: FirebaseFirestore.DocumentReference;
  data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>;
};

async function commitInChunks(writes: PendingWrite[]): Promise<void> {
  for (let index = 0; index < writes.length; index += 400) {
    const batch = db.batch();
    writes.slice(index, index + 400).forEach((write) => {
      batch.update(write.ref, write.data);
    });
    await batch.commit();
  }
}

function sameStringList(left: string[] | undefined, right: string[]): boolean {
  const current = left ?? [];
  return current.length === right.length && current.every((entry, index) => entry === right[index]);
}

/**
 * Recalcula o publico efetivo denormalizado dos modulos e blocos de uma trilha.
 * Chamado depois de alterar a audiencia de uma trilha ou curso, ja que os filhos
 * em modo `inherit` dependem do pai. Escreve apenas o que mudou.
 */
async function cascadeAudience(trackId: string, options?: { courseId?: string }): Promise<void> {
  const trackSnap = await db.collection(COLLECTIONS.learningTracks).doc(trackId).get();
  if (!trackSnap.exists) {
    return;
  }

  const track = trackSnap.data() as LearningTrackDoc;
  const [coursesSnapshot, lessonsSnapshot, blocksSnapshot] = await Promise.all([
    db.collection(COLLECTIONS.learningCourses).where('trackId', '==', trackId).get(),
    db.collection(COLLECTIONS.learningLessons).where('trackId', '==', trackId).get(),
    db.collection(COLLECTIONS.learningLessonBlocks).where('trackId', '==', trackId).get(),
  ]);

  const courseById = new Map(
    coursesSnapshot.docs.map((doc) => [doc.id, doc.data() as LearningCourseDoc]),
  );
  const effectiveByLessonId = new Map<string, { roles: string[]; belts: string[]; status: LearningContentStatus }>();
  const now = Timestamp.now();
  const writes: PendingWrite[] = [];

  lessonsSnapshot.docs.forEach((doc) => {
    const lesson = doc.data() as LearningLessonDoc;
    if (options?.courseId && lesson.courseId !== options.courseId) {
      return;
    }

    const course = courseById.get(lesson.courseId);
    if (!course) {
      return;
    }

    const effective = computeEffectiveAudience(track, course, lesson);
    effectiveByLessonId.set(doc.id, { ...effective, status: lesson.status });

    if (
      sameStringList(lesson.effectiveAudienceRoles, effective.roles)
      && sameStringList(lesson.effectiveAudienceBelts, effective.belts)
    ) {
      return;
    }

    writes.push({
      ref: doc.ref,
      data: {
        effectiveAudienceRoles: effective.roles,
        effectiveAudienceBelts: effective.belts,
        updatedAt: now,
      },
    });
  });

  blocksSnapshot.docs.forEach((doc) => {
    const block = doc.data() as LearningLessonBlockDoc;
    const effective = effectiveByLessonId.get(block.lessonId);
    if (!effective) {
      return;
    }

    if (
      sameStringList(block.effectiveAudienceRoles, effective.roles)
      && sameStringList(block.effectiveAudienceBelts, effective.belts)
      && block.lessonStatus === effective.status
    ) {
      return;
    }

    writes.push({
      ref: doc.ref,
      data: {
        effectiveAudienceRoles: effective.roles,
        effectiveAudienceBelts: effective.belts,
        lessonStatus: effective.status,
        updatedAt: now,
      },
    });
  });

  await commitInChunks(writes);
}

export const upsertLearningTrack = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');
  const trackId = optionalString(request.data, 'trackId');
  const title = requiredString(request.data, 'title');
  const description = optionalString(request.data, 'description');
  const order = normalizePositiveInteger(requiredNumber(request.data, 'order'), 'order');
  const status = normalizeContentStatus(requiredString(request.data, 'status'));
  // A trilha e a raiz da hierarquia: precisa sempre definir o proprio publico.
  const audience = parseAudience(request.data, { allowInherit: false });
  const now = Timestamp.now();
  const trackRef = trackId
    ? db.collection(COLLECTIONS.learningTracks).doc(trackId)
    : db.collection(COLLECTIONS.learningTracks).doc();
  const existing = trackId ? await trackRef.get() : null;
  const existingTrack = existing?.exists ? (existing.data() as LearningTrackDoc) : undefined;
  // Trilha nova sem audiencia informada = aberta a todos. Trilha ja existente que
  // ainda nao tem audiencia e conteudo legado: mantem o alcance antigo (professor),
  // para que publicar ou reordenar nao alargue o publico sem querer.
  const fallbackAudience: LearningAudienceConfig = existingTrack
    ? LEGACY_TRACK_AUDIENCE
    : { mode: 'custom', roles: [], belts: [] };
  const effectiveAudience: LearningAudienceConfig = audience
    ?? existingTrack?.audience
    ?? fallbackAudience;

  const payload: LearningTrackDoc = {
    title,
    description,
    order,
    status,
    audience: effectiveAudience,
    createdAt: (existing?.get('createdAt') as FirebaseFirestore.Timestamp | undefined) ?? now,
    updatedAt: now,
  };

  await trackRef.set(payload, { merge: true });
  await cascadeAudience(trackRef.id);

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
  const audience = parseAudience(request.data);
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

  const existingCourse = existing?.exists ? (existing.data() as LearningCourseDoc) : undefined;
  const effectiveAudience: LearningAudienceConfig = audience
    ?? existingCourse?.audience
    ?? { mode: 'inherit', roles: [], belts: [] };

  const payload: LearningCourseDoc = {
    trackId,
    title,
    description,
    order,
    status,
    audience: effectiveAudience,
    createdAt: (existing?.get('createdAt') as FirebaseFirestore.Timestamp | undefined) ?? now,
    updatedAt: now,
  };

  await courseRef.set(payload, { merge: true });
  await cascadeAudience(trackId, { courseId: courseRef.id });

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
  const videoUrl = optionalString(request.data, 'videoUrl');
  const order = normalizePositiveInteger(requiredNumber(request.data, 'order'), 'order');
  const status = normalizeContentStatus(requiredString(request.data, 'status'));
  const passingScore = normalizePercentage(requiredNumber(request.data, 'passingScore'), 'passingScore');
  const audience = parseAudience(request.data);
  const hintedContentBlockCount = normalizePositiveInteger(optionalNumber(request.data, 'contentBlockCount') ?? (videoUrl ? 1 : 0), 'contentBlockCount');
  const now = Timestamp.now();

  if (videoUrl) {
    assertYouTubeUrl(videoUrl);
  }

  const lessonRef = lessonId
    ? db.collection(COLLECTIONS.learningLessons).doc(lessonId)
    : db.collection(COLLECTIONS.learningLessons).doc();
  const [trackSnap, courseSnap, existing, quizSnap, storedBlocks] = await Promise.all([
    getTrackOrThrow(trackId),
    getCourseOrThrow(courseId),
    lessonId ? lessonRef.get() : Promise.resolve(null),
    lessonId ? db.collection(COLLECTIONS.learningQuizzes).doc(lessonId).get() : Promise.resolve(null),
    lessonId ? listLessonBlocks(lessonId) : Promise.resolve([]),
  ]);

  const course = courseSnap.data() as LearningCourseDoc;
  const existingLesson = existing?.exists ? (existing.data() as LearningLessonDoc) : undefined;
  const legacyVideoUrl = videoUrl ?? existingLesson?.videoUrl;
  const effectiveContentBlockCount = Math.max(
    hintedContentBlockCount,
    storedBlocks.length,
    existingLesson?.contentBlockCount ?? 0,
    legacyVideoUrl ? 1 : 0,
  );

  assertCondition(trackSnap.exists, 'not-found', 'Trilha nao encontrada.');
  assertCondition(course.trackId === trackId, 'failed-precondition', 'O curso precisa pertencer a trilha informada.');

  if (existing?.exists) {
    assertCondition(existing.get('trackId') === trackId, 'failed-precondition', 'Nao e possivel mover um modulo para outra trilha no v1.');
    assertCondition(existing.get('courseId') === courseId, 'failed-precondition', 'Nao e possivel mover um modulo para outro curso no v1.');
  }

  if (status === 'published') {
    assertCondition(
      effectiveContentBlockCount > 0,
      'failed-precondition',
      'Salve ao menos um bloco de conteudo antes de publicar o modulo.',
    );
  }

  const track = trackSnap.data() as LearningTrackDoc;
  const effectiveAudience: LearningAudienceConfig = audience
    ?? existingLesson?.audience
    ?? { mode: 'inherit', roles: [], belts: [] };
  const denormalizedAudience = computeEffectiveAudience(track, course, { audience: effectiveAudience });

  const payload: LearningLessonDoc = {
    trackId,
    courseId,
    title,
    description,
    ...(legacyVideoUrl ? { videoUrl: legacyVideoUrl } : {}),
    order,
    status,
    audience: effectiveAudience,
    effectiveAudienceRoles: denormalizedAudience.roles,
    effectiveAudienceBelts: denormalizedAudience.belts,
    passingScore,
    requiredWatchPercent: DEFAULT_REQUIRED_WATCH_PERCENT,
    quizQuestionCount: Array.isArray(quizSnap?.get('questions')) ? (quizSnap?.get('questions') as unknown[]).length : ((existingLesson?.quizQuestionCount) ?? 0),
    contentBlockCount: effectiveContentBlockCount,
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

  // Blocos ja gravados herdam o publico e o status do modulo.
  storedBlocks.forEach((block) => {
    if (
      sameStringList(block.effectiveAudienceRoles, denormalizedAudience.roles)
      && sameStringList(block.effectiveAudienceBelts, denormalizedAudience.belts)
      && block.lessonStatus === status
    ) {
      return;
    }

    batch.update(db.collection(COLLECTIONS.learningLessonBlocks).doc(block.id), {
      effectiveAudienceRoles: denormalizedAudience.roles,
      effectiveAudienceBelts: denormalizedAudience.belts,
      lessonStatus: status,
      updatedAt: now,
    });
  });

  await batch.commit();

  return {
    lessonId: lessonRef.id,
    courseId,
    trackId,
    status,
  };
});

export const replaceLearningLessonBlocks = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');
  const lessonId = requiredString(request.data, 'lessonId');
  const parsedBlocks = parseLessonBlocks(request.data);
  const now = Timestamp.now();
  const lessonSnap = await getLessonOrThrow(lessonId);
  const lesson = lessonSnap.data() as LearningLessonDoc;
  const [trackSnap, courseSnap, existingBlocks] = await Promise.all([
    getTrackOrThrow(lesson.trackId),
    getCourseOrThrow(lesson.courseId),
    listLessonBlocks(lessonId),
  ]);
  const denormalizedAudience = computeEffectiveAudience(
    trackSnap.data() as LearningTrackDoc,
    courseSnap.data() as LearningCourseDoc,
    lesson,
  );

  if (lesson.status === 'published') {
    assertCondition(parsedBlocks.length > 0, 'failed-precondition', 'Um modulo publicado precisa ter ao menos um bloco de conteudo.');
  }

  const batch = db.batch();
  const existingBlocksById = new Map(existingBlocks.map((block) => [block.id, block]));
  existingBlocks.forEach((block) => {
    batch.delete(db.collection(COLLECTIONS.learningLessonBlocks).doc(block.id));
  });

  parsedBlocks.forEach((block) => {
    const blockRef = block.blockId
      ? db.collection(COLLECTIONS.learningLessonBlocks).doc(block.blockId)
      : db.collection(COLLECTIONS.learningLessonBlocks).doc();
    const previousBlock = existingBlocksById.get(blockRef.id);
    const payload: LearningLessonBlockDoc = {
      lessonId,
      trackId: lesson.trackId,
      courseId: lesson.courseId,
      type: block.type,
      title: block.title,
      order: block.order,
      ...(block.sourceUrl ? { sourceUrl: block.sourceUrl } : {}),
      ...(block.storagePath ? { storagePath: block.storagePath } : {}),
      ...(block.mimeType ? { mimeType: block.mimeType } : {}),
      ...(block.fileName ? { fileName: block.fileName } : {}),
      ...(block.thumbnailUrl ? { thumbnailUrl: block.thumbnailUrl } : {}),
      effectiveAudienceRoles: denormalizedAudience.roles,
      effectiveAudienceBelts: denormalizedAudience.belts,
      lessonStatus: lesson.status,
      createdAt: previousBlock?.createdAt ?? now,
      updatedAt: now,
    };

    batch.set(blockRef, payload);
  });

  batch.update(lessonSnap.ref, {
    contentBlockCount: parsedBlocks.length,
    updatedAt: now,
  });

  await batch.commit();

  return {
    lessonId,
    blockCount: parsedBlocks.length,
  };
});

export const upsertLessonQuiz = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');
  const lessonId = requiredString(request.data, 'lessonId');
  const questions = parseQuizQuestions(request.data, { allowEmpty: true });
  const now = Timestamp.now();
  const lessonSnap = await getLessonOrThrow(lessonId);
  const lesson = lessonSnap.data() as LearningLessonDoc;
  const quizRef = db.collection(COLLECTIONS.learningQuizzes).doc(lessonId);
  const existing = await quizRef.get();

  const batch = db.batch();

  if (questions.length === 0) {
    if (existing.exists) {
      batch.delete(quizRef);
    }
    batch.update(lessonSnap.ref, {
      quizQuestionCount: 0,
      updatedAt: now,
    });
    await batch.commit();

    return {
      lessonId,
      questionCount: 0,
    };
  }

  const payload: LearningQuizDoc = {
    lessonId,
    trackId: lesson.trackId,
    courseId: lesson.courseId,
    passingScore: lesson.passingScore,
    questions,
    createdAt: (existing.get('createdAt') as FirebaseFirestore.Timestamp | undefined) ?? now,
    updatedAt: now,
  };

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

export const recordLearningBlockPlayback = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');

  const lessonId = requiredString(request.data, 'lessonId');
  const blockId = requiredString(request.data, 'blockId');
  const currentSeconds = normalizePositiveInteger(requiredNumber(request.data, 'currentSeconds'), 'currentSeconds');
  const durationSeconds = normalizePositiveInteger(requiredNumber(request.data, 'durationSeconds'), 'durationSeconds', 1);

  return recordVideoProgress({
    actor,
    lessonId,
    blockId,
    currentSeconds,
    durationSeconds,
  });
});

export const recordLessonPlayback = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');

  const lessonId = requiredString(request.data, 'lessonId');
  const currentSeconds = normalizePositiveInteger(requiredNumber(request.data, 'currentSeconds'), 'currentSeconds');
  const durationSeconds = normalizePositiveInteger(requiredNumber(request.data, 'durationSeconds'), 'durationSeconds', 1);
  const context = await getLessonContext(lessonId);
  const defaultBlock = getDefaultVideoBlock(context);

  return recordVideoProgress({
    actor,
    lessonId,
    blockId: defaultBlock.id,
    currentSeconds,
    durationSeconds,
  });
});

export const markLearningBlockComplete = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');

  const lessonId = requiredString(request.data, 'lessonId');
  const blockId = requiredString(request.data, 'blockId');
  const context = await getLessonContext(lessonId);
  const orderedLessons = await listOrderedTrackLessons(context.lesson.trackId);
  const progressRef = db.collection(COLLECTIONS.learningProgress).doc(progressDocId(actor.uid, lessonId));
  const block = context.blocks.find((entry) => entry.id === blockId);

  assertPublishedContext(context, actor);
  await ensureLessonUnlocked({
    userId: actor.uid,
    lessonId,
    orderedLessons,
  });

  if (!block) {
    throw new Error('Bloco de conteudo nao encontrado.');
  }
  assertCondition(isManualBlockType(block.type), 'failed-precondition', 'Este bloco nao permite conclusao manual.');

  const now = Timestamp.now();

  await db.runTransaction(async (transaction) => {
    const existingSnapshot = await transaction.get(progressRef);
    const existing = existingSnapshot.exists ? (existingSnapshot.data() as LearningProgressDoc) : undefined;
    const contentProgressMap = normalizeProgressMap(existing);
    contentProgressMap[block.id] = 100;

    const payload = buildProgressPayload({
      actor,
      lessonId,
      context,
      existing,
      now,
      contentProgressMap,
      videoSecondsWatched: existing?.videoSecondsWatched ?? 0,
      durationSeconds: existing?.durationSeconds ?? 0,
      watchPercent: existing?.watchPercent ?? 0,
      videoCompleted: existing?.videoCompleted ?? false,
    });

    transaction.set(progressRef, payload, { merge: true });
  });

  const updated = await progressRef.get();
  const progress = updated.data() as LearningProgressDoc;

  return {
    lessonId,
    blockId,
    contentCompletionPercent: progress.contentCompletionPercent ?? 0,
    contentCompleted: progress.contentCompleted ?? false,
    lessonCompleted: progress.lessonCompleted ?? false,
    quizReady: progress.quizReady,
  };
});

export const startLessonQuiz = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');

  const lessonId = requiredString(request.data, 'lessonId');
  const context = await getLessonContext(lessonId, true);
  const orderedLessons = await listOrderedTrackLessons(context.lesson.trackId);
  const progressSnapshot = await db.collection(COLLECTIONS.learningProgress).doc(progressDocId(actor.uid, lessonId)).get();
  const progress = progressSnapshot.data() as LearningProgressDoc | undefined;

  assertPublishedContext(context, actor);
  await ensureLessonUnlocked({
    userId: actor.uid,
    lessonId,
    orderedLessons,
  });
  assertCondition(!!context.quiz && context.quiz.questions.length > 0, 'failed-precondition', 'O quiz deste modulo ainda nao foi configurado.');
  assertCondition(!!progress?.contentCompleted, 'failed-precondition', 'Conclua todos os blocos do modulo antes de abrir o quiz.');
  const quiz = context.quiz as LearningQuizDoc;

  return {
    questions: sanitizeQuizQuestions(quiz.questions),
    passingScore: quiz.passingScore,
    attemptCount: progress.attemptCount ?? 0,
  };
});

export const submitLessonQuiz = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');

  const lessonId = requiredString(request.data, 'lessonId');
  const answers = parseAnswerIndexes(request.data);
  const context = await getLessonContext(lessonId, true);
  const orderedLessons = await listOrderedTrackLessons(context.lesson.trackId);
  const progressRef = db.collection(COLLECTIONS.learningProgress).doc(progressDocId(actor.uid, lessonId));
  const existingProgressSnapshot = await progressRef.get();
  const existingProgress = existingProgressSnapshot.data() as LearningProgressDoc | undefined;

  assertPublishedContext(context, actor);
  await ensureLessonUnlocked({
    userId: actor.uid,
    lessonId,
    orderedLessons,
  });
  assertCondition(!!context.quiz && context.quiz.questions.length > 0, 'failed-precondition', 'O quiz deste modulo ainda nao foi configurado.');
  assertCondition(!!existingProgress?.contentCompleted, 'failed-precondition', 'Conclua todos os blocos do modulo antes de enviar o quiz.');
  const quiz = context.quiz as LearningQuizDoc;
  assertCondition(
    answers.length === quiz.questions.length,
    'invalid-argument',
    'Responda todas as perguntas antes de enviar o quiz.',
  );

  const correctAnswers = quiz.questions.reduce((total, question, index) => (
    total + (answers[index] === question.correctOptionIndex ? 1 : 0)
  ), 0);
  const scorePercent = Math.round((correctAnswers / Math.max(quiz.questions.length, 1)) * 100);
  const passed = scorePercent >= quiz.passingScore;
  const unlockedLessonId = passed ? findNextLessonId(orderedLessons, lessonId) : undefined;
  const now = Timestamp.now();
  const attemptRef = db.collection(COLLECTIONS.learningQuizAttempts).doc();

  await db.runTransaction(async (transaction) => {
    const freshProgressSnapshot = await transaction.get(progressRef);
    const freshProgress = freshProgressSnapshot.exists ? (freshProgressSnapshot.data() as LearningProgressDoc) : undefined;

    assertCondition(!!freshProgress?.contentCompleted, 'failed-precondition', 'Conclua todos os blocos do modulo antes de enviar o quiz.');

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

    const payload = buildProgressPayload({
      actor,
      lessonId,
      context,
      existing: freshProgress,
      now,
      contentProgressMap: normalizeProgressMap(freshProgress),
      videoSecondsWatched: freshProgress?.videoSecondsWatched ?? 0,
      durationSeconds: freshProgress?.durationSeconds ?? 0,
      watchPercent: freshProgress?.watchPercent ?? 0,
      videoCompleted: freshProgress?.videoCompleted ?? false,
      quizPassed: (freshProgress?.quizPassed ?? false) || passed,
      attemptCount: attemptNumber,
      lastScore: scorePercent,
      bestScore: Math.max(freshProgress?.bestScore ?? 0, scorePercent),
      lastAttemptAt: now,
      passedAt: freshProgress?.passedAt ?? (passed ? now : undefined),
    });

    transaction.set(attemptRef, attemptPayload);
    transaction.set(progressRef, payload, { merge: true });
  });

  return {
    scorePercent,
    passed,
    unlockedLessonId,
  };
});

async function deleteQueryInChunks(query: FirebaseFirestore.Query): Promise<number> {
  const snapshot = await query.get();

  for (let index = 0; index < snapshot.docs.length; index += 400) {
    const batch = db.batch();
    snapshot.docs.slice(index, index + 400).forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  }

  return snapshot.size;
}

/**
 * Recalcula o publico efetivo de todo o catalogo.
 * Necessario uma vez para o conteudo criado antes da segmentacao por
 * publico-alvo, que ainda nao tem os campos denormalizados usados pelas
 * queries e pelas regras do Firestore. E idempotente e pode ser repetido.
 */
export const backfillLearningAudience = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');
  const tracksSnapshot = await db.collection(COLLECTIONS.learningTracks).get();

  for (const trackDoc of tracksSnapshot.docs) {
    const track = trackDoc.data() as LearningTrackDoc;
    if (!track.audience) {
      // Conteudo legado era visivel so para professores — preserva isso.
      await trackDoc.ref.update({
        audience: LEGACY_TRACK_AUDIENCE,
        updatedAt: Timestamp.now(),
      });
    }

    await cascadeAudience(trackDoc.id);
  }

  return { trackCount: tracksSnapshot.size };
});

export const deleteLearningTrack = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');
  const trackId = requiredString(request.data, 'trackId');
  const trackSnap = await getTrackOrThrow(trackId);

  const coursesSnapshot = await db.collection(COLLECTIONS.learningCourses)
    .where('trackId', '==', trackId)
    .limit(1)
    .get();

  assertCondition(
    coursesSnapshot.empty,
    'failed-precondition',
    'Exclua os cursos desta trilha antes de excluir a trilha.',
  );

  await trackSnap.ref.delete();

  return { trackId };
});

export const deleteLearningCourse = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');
  const courseId = requiredString(request.data, 'courseId');
  const courseSnap = await getCourseOrThrow(courseId);

  const lessonsSnapshot = await db.collection(COLLECTIONS.learningLessons)
    .where('courseId', '==', courseId)
    .limit(1)
    .get();

  assertCondition(
    lessonsSnapshot.empty,
    'failed-precondition',
    'Exclua os modulos deste curso antes de excluir o curso.',
  );

  await courseSnap.ref.delete();

  return { courseId };
});

/**
 * Exclui o modulo junto com blocos, quiz, progresso e tentativas.
 * O progresso dos usuarios naquele modulo e perdido por definicao — a UI
 * confirma a acao antes de chamar.
 */
export const deleteLearningLesson = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');
  const lessonId = requiredString(request.data, 'lessonId');
  const lessonSnap = await getLessonOrThrow(lessonId);

  const [blockCount, progressCount, attemptCount] = await Promise.all([
    deleteQueryInChunks(db.collection(COLLECTIONS.learningLessonBlocks).where('lessonId', '==', lessonId)),
    deleteQueryInChunks(db.collection(COLLECTIONS.learningProgress).where('lessonId', '==', lessonId)),
    deleteQueryInChunks(db.collection(COLLECTIONS.learningQuizAttempts).where('lessonId', '==', lessonId)),
  ]);

  const batch = db.batch();
  batch.delete(db.collection(COLLECTIONS.learningQuizzes).doc(lessonId));
  batch.delete(lessonSnap.ref);
  await batch.commit();

  return {
    lessonId,
    blockCount,
    progressCount,
    attemptCount,
  };
});
