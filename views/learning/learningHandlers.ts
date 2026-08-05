import type {
  LearningAudienceConfig,
  LearningLessonBlockType,
} from '../../services/firebase/models';
import type { ContentStatus, QuizQuestionSession } from './learningShared';

/**
 * Contrato entre o `App.tsx` e as views do Learning Hub. Fica num arquivo
 * próprio para que a casca, o CMS e o player compartilhem os mesmos tipos sem
 * import circular.
 */
export interface LearningHubHandlers {
  onUpsertTrack: (payload: {
    trackId?: string;
    title: string;
    description?: string;
    order: number;
    status: ContentStatus;
    audience?: LearningAudienceConfig;
  }) => Promise<{ trackId: string }>;

  onUpsertCourse: (payload: {
    courseId?: string;
    trackId: string;
    title: string;
    description?: string;
    order: number;
    status: ContentStatus;
    audience?: LearningAudienceConfig;
  }) => Promise<{ courseId: string; trackId: string }>;

  onUpsertLesson: (payload: {
    lessonId?: string;
    trackId: string;
    courseId: string;
    title: string;
    description?: string;
    videoUrl?: string;
    order: number;
    status: ContentStatus;
    passingScore: number;
    audience?: LearningAudienceConfig;
    contentBlockCount?: number;
  }) => Promise<{ lessonId: string; courseId: string; trackId: string }>;

  onDeleteTrack: (trackId: string) => Promise<{ trackId: string }>;
  onDeleteCourse: (courseId: string) => Promise<{ courseId: string }>;
  onDeleteLesson: (lessonId: string) => Promise<{ lessonId: string }>;
  onBackfillAudience: () => Promise<{ trackCount: number }>;

  onReplaceLessonBlocks: (payload: {
    lessonId: string;
    blocks: Array<{
      blockId?: string;
      type: LearningLessonBlockType;
      title: string;
      order: number;
      sourceUrl?: string;
      storagePath?: string;
      mimeType?: string;
      fileName?: string;
      thumbnailUrl?: string;
    }>;
  }) => Promise<{ lessonId: string; blockCount: number }>;

  onUpsertQuiz: (payload: {
    lessonId: string;
    questions: Array<{
      prompt: string;
      options: string[];
      correctOptionIndex: number;
    }>;
  }) => Promise<{ lessonId: string }>;

  onUploadLearningAsset: (payload: {
    lessonId: string;
    file: File;
  }) => Promise<{
    downloadURL: string;
    storagePath: string;
    mimeType: string;
    fileName: string;
  }>;
}

export interface LearningPlayerHandlers {
  onRecordPlayback: (payload: {
    lessonId: string;
    blockId: string;
    currentSeconds: number;
    durationSeconds: number;
  }) => Promise<{ contentCompletionPercent: number; contentCompleted: boolean; quizReady: boolean }>;

  onMarkBlockComplete: (payload: {
    lessonId: string;
    blockId: string;
  }) => Promise<{
    contentCompletionPercent: number;
    contentCompleted: boolean;
    lessonCompleted: boolean;
    quizReady: boolean;
  }>;

  onStartQuiz: (lessonId: string) => Promise<{
    questions: QuizQuestionSession[];
    passingScore: number;
    attemptCount: number;
  }>;

  onSubmitQuiz: (payload: {
    lessonId: string;
    answers: number[];
  }) => Promise<{
    scorePercent: number;
    passed: boolean;
    unlockedLessonId?: string;
  }>;
}
