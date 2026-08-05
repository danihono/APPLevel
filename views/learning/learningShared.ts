import type { FirestoreEntity } from '../../services/firebase/data';
import type {
  LearningAudienceConfig,
  LearningCourseRecord,
  LearningLessonBlockRecord,
  LearningLessonBlockType,
  LearningLessonRecord,
  LearningProgressRecord,
  LearningQuizRecord,
  LearningTrackRecord,
} from '../../services/firebase/models';

export type TrackEntity = FirestoreEntity<LearningTrackRecord>;
export type CourseEntity = FirestoreEntity<LearningCourseRecord>;
export type LessonEntity = FirestoreEntity<LearningLessonRecord>;
export type LessonBlockEntity = FirestoreEntity<LearningLessonBlockRecord>;
export type QuizEntity = FirestoreEntity<LearningQuizRecord>;
export type ProgressEntity = FirestoreEntity<LearningProgressRecord>;

export type ContentStatus = 'draft' | 'published';

export type QuizQuestionDraft = {
  prompt: string;
  options: string[];
  correctOptionIndex: number;
};

export type QuizQuestionSession = {
  id: string;
  prompt: string;
  options: string[];
};

export type EditorBlockDraft = {
  tempId: string;
  blockId?: string;
  type: LearningLessonBlockType;
  title: string;
  order: number;
  sourceUrl: string;
  storagePath: string;
  mimeType: string;
  fileName: string;
  thumbnailUrl: string;
  file: File | null;
};

export type EffectiveLessonBlock = {
  id: string;
  lessonId: string;
  trackId: string;
  courseId: string;
  type: LearningLessonBlockType;
  title: string;
  order: number;
  sourceUrl?: string;
  storagePath?: string;
  mimeType?: string;
  fileName?: string;
  thumbnailUrl?: string;
  isLegacy?: boolean;
};

export type OrderedLesson = {
  lesson: LessonEntity;
  course: CourseEntity | null;
  blocks: EffectiveLessonBlock[];
};

export type LessonRuntimeStatus = 'locked' | 'available' | 'watching' | 'ready' | 'completed';

export const LEGACY_BLOCK_ID = 'legacy-youtube';

export function sortByOrder<T extends { order: number; title: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, 'pt-BR'));
}

export function contentBadge(status: ContentStatus): string {
  return status === 'published' ? 'app-badge app-badge--success' : 'app-badge app-badge--muted';
}

export function contentLabel(status: ContentStatus): string {
  return status === 'published' ? 'Publicado' : 'Rascunho';
}

export function statusBadge(status: LessonRuntimeStatus): string {
  if (status === 'completed') return 'app-badge app-badge--success';
  if (status === 'ready' || status === 'watching') return 'app-badge app-badge--gold';
  return 'app-badge app-badge--muted';
}

export function statusLabel(status: LessonRuntimeStatus): string {
  if (status === 'completed') return 'Concluído';
  if (status === 'ready') return 'Quiz liberado';
  if (status === 'watching') return 'Em andamento';
  if (status === 'available') return 'Disponível';
  return 'Bloqueado';
}

export function blockTypeLabel(type: LearningLessonBlockType): string {
  switch (type) {
    case 'youtube':
      return 'YouTube';
    case 'uploaded_video':
      return 'Vídeo';
    case 'pdf':
      return 'PDF';
    case 'image':
      return 'Imagem';
    default:
      return 'Conteúdo';
  }
}

export function emptyQuestion(): QuizQuestionDraft {
  return { prompt: '', options: ['', '', '', ''], correctOptionIndex: 0 };
}

export function createEditorBlock(type: LearningLessonBlockType, order: number): EditorBlockDraft {
  return {
    tempId: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    title: '',
    order,
    sourceUrl: '',
    storagePath: '',
    mimeType: '',
    fileName: '',
    thumbnailUrl: '',
    file: null,
  };
}

export function toEditorBlock(block: EffectiveLessonBlock): EditorBlockDraft {
  return {
    tempId: `block-${block.id}`,
    // Blocos legados nao existem no Firestore: salvar precisa criar um novo doc.
    blockId: block.isLegacy ? undefined : block.id,
    type: block.type,
    title: block.title,
    order: block.order,
    sourceUrl: block.sourceUrl ?? '',
    storagePath: block.storagePath ?? '',
    mimeType: block.mimeType ?? '',
    fileName: block.fileName ?? '',
    thumbnailUrl: block.thumbnailUrl ?? '',
    file: null,
  };
}

export function normalizeQuizDrafts(quiz: QuizEntity | undefined): QuizQuestionDraft[] {
  if (!quiz?.questions?.length) {
    return [emptyQuestion()];
  }

  return quiz.questions.map((question) => ({
    prompt: question.prompt,
    options: [...question.options],
    correctOptionIndex: question.correctOptionIndex,
  }));
}

/**
 * Blocos reais do modulo, com fallback para o video legado gravado direto em
 * `lesson.videoUrl` (conteudo anterior ao editor de blocos).
 */
export function getEffectiveLessonBlocks(
  lesson: LessonEntity,
  lessonBlocks: LessonBlockEntity[],
): EffectiveLessonBlock[] {
  const blocks = lessonBlocks
    .filter((block) => block.lessonId === lesson.id)
    .map((block) => ({
      id: block.id,
      lessonId: block.lessonId,
      trackId: block.trackId,
      courseId: block.courseId,
      type: block.type,
      title: block.title,
      order: block.order,
      sourceUrl: block.sourceUrl,
      storagePath: block.storagePath,
      mimeType: block.mimeType,
      fileName: block.fileName,
      thumbnailUrl: block.thumbnailUrl,
    }))
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, 'pt-BR'));

  if (blocks.length > 0) {
    return blocks;
  }

  if (!lesson.videoUrl) {
    return [];
  }

  return [
    {
      id: LEGACY_BLOCK_ID,
      lessonId: lesson.id,
      trackId: lesson.trackId,
      courseId: lesson.courseId,
      type: 'youtube',
      title: lesson.title,
      order: 1,
      sourceUrl: lesson.videoUrl,
      isLegacy: true,
    },
  ];
}

export function buildOrderedLessons(
  trackId: string,
  courses: CourseEntity[],
  lessons: LessonEntity[],
  lessonBlocks: LessonBlockEntity[],
): OrderedLesson[] {
  const trackCourses = sortByOrder(courses.filter((course) => course.trackId === trackId));
  const courseById = new Map(trackCourses.map((course) => [course.id, course]));

  return lessons
    .filter((lesson) => lesson.trackId === trackId && courseById.has(lesson.courseId))
    .sort((left, right) => {
      const courseDelta = (courseById.get(left.courseId)?.order ?? 0) - (courseById.get(right.courseId)?.order ?? 0);
      return courseDelta || left.order - right.order || left.title.localeCompare(right.title, 'pt-BR');
    })
    .map((lesson) => ({
      lesson,
      course: courseById.get(lesson.courseId) ?? null,
      blocks: getEffectiveLessonBlocks(lesson, lessonBlocks),
    }));
}

export function isProgressComplete(progress?: ProgressEntity | null, hasQuiz = false): boolean {
  if (!progress) {
    return false;
  }

  if (progress.lessonCompleted) {
    return true;
  }

  if (hasQuiz) {
    return !!progress.quizPassed;
  }

  return !!progress.contentCompleted;
}

/**
 * Estado do modulo para o consumidor. O desbloqueio e sequencial: so libera o
 * proximo depois de concluir o anterior — mesma regra imposta pelo backend em
 * `ensureLessonUnlocked`.
 */
export function lessonRuntimeStatus(
  orderedLessons: OrderedLesson[],
  progressByLessonId: Map<string, ProgressEntity>,
  lessonId: string,
): LessonRuntimeStatus {
  const lessonIndex = orderedLessons.findIndex((entry) => entry.lesson.id === lessonId);
  if (lessonIndex < 0) {
    return 'locked';
  }

  const currentEntry = orderedLessons[lessonIndex];
  const current = progressByLessonId.get(lessonId);
  const hasQuiz = currentEntry.lesson.quizQuestionCount > 0;

  if (isProgressComplete(current, hasQuiz)) {
    return 'completed';
  }

  if (lessonIndex > 0) {
    const previousEntry = orderedLessons[lessonIndex - 1];
    const previousProgress = progressByLessonId.get(previousEntry.lesson.id);
    if (!isProgressComplete(previousProgress, previousEntry.lesson.quizQuestionCount > 0) && !current) {
      return 'locked';
    }
  }

  if (current?.contentCompleted && hasQuiz) {
    return 'ready';
  }

  if ((current?.contentCompletionPercent ?? 0) > 0 || (current?.watchPercent ?? 0) > 0) {
    return 'watching';
  }

  return 'available';
}

export function normalizeBlocksForSave(blocks: EditorBlockDraft[]): EditorBlockDraft[] {
  return [...blocks]
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, 'pt-BR'))
    .map((block, index) => ({
      ...block,
      order: index + 1,
    }));
}

export const DEFAULT_INHERIT_AUDIENCE: LearningAudienceConfig = { mode: 'inherit', roles: [], belts: [] };
export const DEFAULT_TRACK_AUDIENCE: LearningAudienceConfig = { mode: 'custom', roles: [], belts: [] };
