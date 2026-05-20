import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  CirclePlay,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  Library,
  Lock,
  type LucideIcon,
  Network,
  Plus,
  Route,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  Video,
} from 'lucide-react';
import LearningVideoPlayer from '../components/LearningVideoPlayer';
import ProgressBar from '../components/ProgressBar';
import type { FirestoreEntity } from '../services/firebase/data';
import type {
  AcademyRecord,
  LearningCourseRecord,
  LearningLessonBlockRecord,
  LearningLessonBlockType,
  LearningLessonRecord,
  LearningProgressRecord,
  LearningQuizRecord,
  LearningTrackRecord,
  UserRecord,
} from '../services/firebase/models';
import { UserRole } from '../types';

type QuizQuestionDraft = {
  prompt: string;
  options: string[];
  correctOptionIndex: number;
};

type QuizQuestionSession = {
  id: string;
  prompt: string;
  options: string[];
};

type EditorBlockDraft = {
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

type EffectiveLessonBlock = {
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

type OrderedLesson = {
  lesson: FirestoreEntity<LearningLessonRecord>;
  course: FirestoreEntity<LearningCourseRecord> | null;
  blocks: EffectiveLessonBlock[];
};

type LessonRuntimeStatus = 'locked' | 'available' | 'watching' | 'ready' | 'completed';
type SuperadminLearningTab = 'overview' | 'tracks' | 'courses' | 'modules' | 'quizzes' | 'catalog';

interface LearningHubViewProps {
  academyName: string;
  userName: string;
  userRole?: UserRole;
  selectedAcademyId?: string;
  selectedAcademy?: FirestoreEntity<AcademyRecord> | null;
  academies?: Array<FirestoreEntity<AcademyRecord>>;
  allUsers?: Array<FirestoreEntity<UserRecord>>;
  academyUsers?: Array<FirestoreEntity<UserRecord>>;
  tracks: Array<FirestoreEntity<LearningTrackRecord>>;
  courses: Array<FirestoreEntity<LearningCourseRecord>>;
  lessons: Array<FirestoreEntity<LearningLessonRecord>>;
  lessonBlocks: Array<FirestoreEntity<LearningLessonBlockRecord>>;
  quizzes: Array<FirestoreEntity<LearningQuizRecord>>;
  progressRecords: Array<FirestoreEntity<LearningProgressRecord>>;
  onSelectAcademy?: (academyId: string) => void;
  onUpsertTrack: (payload: {
    trackId?: string;
    title: string;
    description?: string;
    order: number;
    status: 'draft' | 'published';
  }) => Promise<{ trackId: string }>;
  onUpsertCourse: (payload: {
    courseId?: string;
    trackId: string;
    title: string;
    description?: string;
    order: number;
    status: 'draft' | 'published';
  }) => Promise<{ courseId: string; trackId: string }>;
  onUpsertLesson: (payload: {
    lessonId?: string;
    trackId: string;
    courseId: string;
    title: string;
    description?: string;
    videoUrl?: string;
    order: number;
    status: 'draft' | 'published';
    passingScore: number;
    contentBlockCount: number;
  }) => Promise<{ lessonId: string; courseId: string; trackId: string }>;
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
  onRecordPlayback: (payload: {
    lessonId: string;
    blockId: string;
    currentSeconds: number;
    durationSeconds: number;
  }) => Promise<{ contentCompletionPercent: number; contentCompleted: boolean; quizReady: boolean }>;
  onMarkBlockComplete: (payload: {
    lessonId: string;
    blockId: string;
  }) => Promise<{ contentCompletionPercent: number; contentCompleted: boolean; lessonCompleted: boolean; quizReady: boolean }>;
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

const superadminLearningTabs: Array<{
  id: SuperadminLearningTab;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
}> = [
  {
    id: 'overview',
    label: 'Visao geral',
    title: 'Acompanhamento da rede',
    description: 'Veja academias, modulos publicados e progresso dos professores em um unico painel.',
    icon: LayoutDashboard,
    accent: '#3b82f6',
  },
  {
    id: 'tracks',
    label: 'Trilhas',
    title: 'Editor de trilhas',
    description: 'Estruture a jornada principal do Learning Hub.',
    icon: Route,
    accent: '#8b5cf6',
  },
  {
    id: 'courses',
    label: 'Cursos',
    title: 'Editor de cursos',
    description: 'Agrupe modulos por curso dentro de cada trilha.',
    icon: BookOpen,
    accent: '#10b981',
  },
  {
    id: 'modules',
    label: 'Modulos',
    title: 'Editor de modulos',
    description: 'Monte modulos com blocos em ordem, incluindo YouTube, video, PDF e imagem.',
    icon: Layers,
    accent: '#f59e0b',
  },
  {
    id: 'quizzes',
    label: 'Quizzes',
    title: 'Quiz opcional do modulo',
    description: 'Ative, edite ou remova o quiz final de cada modulo.',
    icon: ClipboardCheck,
    accent: '#f43f5e',
  },
  {
    id: 'catalog',
    label: 'Catalogo',
    title: 'Mapa do conteudo',
    description: 'Confira toda a hierarquia entre trilhas, cursos, modulos e blocos.',
    icon: Library,
    accent: '#06b6d4',
  },
];

function sortByOrder<T extends { order: number; title: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, 'pt-BR'));
}

function contentBadge(status: 'draft' | 'published') {
  return status === 'published' ? 'app-badge app-badge--success' : 'app-badge app-badge--muted';
}

function contentLabel(status: 'draft' | 'published') {
  return status === 'published' ? 'Publicado' : 'Rascunho';
}

function statusBadge(status: LessonRuntimeStatus) {
  if (status === 'completed') return 'app-badge app-badge--success';
  if (status === 'ready' || status === 'watching') return 'app-badge app-badge--gold';
  return 'app-badge app-badge--muted';
}

function statusLabel(status: LessonRuntimeStatus) {
  if (status === 'completed') return 'Concluido';
  if (status === 'ready') return 'Quiz liberado';
  if (status === 'watching') return 'Em andamento';
  if (status === 'available') return 'Disponivel';
  return 'Bloqueado';
}

function blockTypeLabel(type: LearningLessonBlockType) {
  switch (type) {
    case 'youtube':
      return 'YouTube';
    case 'uploaded_video':
      return 'Video';
    case 'pdf':
      return 'PDF';
    case 'image':
      return 'Imagem';
    default:
      return 'Conteudo';
  }
}

function blockTypeIcon(type: LearningLessonBlockType) {
  switch (type) {
    case 'youtube':
    case 'uploaded_video':
      return <Video size={16} />;
    case 'pdf':
      return <FileText size={16} />;
    case 'image':
      return <ImageIcon size={16} />;
    default:
      return <BookOpen size={16} />;
  }
}

function emptyQuestion(): QuizQuestionDraft {
  return { prompt: '', options: ['', '', '', ''], correctOptionIndex: 0 };
}

function createEditorBlock(type: LearningLessonBlockType, order: number): EditorBlockDraft {
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

function toEditorBlock(block: EffectiveLessonBlock): EditorBlockDraft {
  return {
    tempId: `block-${block.id}`,
    blockId: block.id,
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

function isProfessor(user: FirestoreEntity<UserRecord>) {
  return user.role === 'professor';
}

function normalizeQuizDrafts(quiz: FirestoreEntity<LearningQuizRecord> | undefined): QuizQuestionDraft[] {
  if (!quiz?.questions?.length) {
    return [emptyQuestion()];
  }

  return quiz.questions.map((question) => ({
    prompt: question.prompt,
    options: [...question.options],
    correctOptionIndex: question.correctOptionIndex,
  }));
}

function getEffectiveLessonBlocks(
  lesson: FirestoreEntity<LearningLessonRecord>,
  lessonBlocks: Array<FirestoreEntity<LearningLessonBlockRecord>>,
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
      id: 'legacy-youtube',
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

function buildOrderedLessons(
  trackId: string,
  courses: Array<FirestoreEntity<LearningCourseRecord>>,
  lessons: Array<FirestoreEntity<LearningLessonRecord>>,
  lessonBlocks: Array<FirestoreEntity<LearningLessonBlockRecord>>,
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

function isProgressComplete(progress?: FirestoreEntity<LearningProgressRecord> | null, hasQuiz = false) {
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

function lessonRuntimeStatus(
  orderedLessons: OrderedLesson[],
  progressByLessonId: Map<string, FirestoreEntity<LearningProgressRecord>>,
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

function normalizeBlocksForSave(blocks: EditorBlockDraft[]) {
  return [...blocks]
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, 'pt-BR'))
    .map((block, index) => ({
      ...block,
      order: index + 1,
    }));
}

const UploadedVideoPlayer: React.FC<{
  blockKey: string;
  sourceUrl: string;
  disabled?: boolean;
  onProgress: (payload: { currentSeconds: number; durationSeconds: number }) => void;
}> = ({
  blockKey,
  sourceUrl,
  disabled = false,
  onProgress,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSentSecondsRef = useRef(-1);

  useEffect(() => {
    lastSentSecondsRef.current = -1;
  }, [blockKey]);

  const emitProgress = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const currentSeconds = Math.max(0, Math.floor(video.currentTime));
    const durationSeconds = Math.max(0, Math.floor(video.duration || 0));
    if (durationSeconds <= 0) {
      return;
    }

    onProgress({
      currentSeconds,
      durationSeconds,
    });
  };

  if (!sourceUrl) {
    return <div className="app-empty">Envie um video valido para este bloco.</div>;
  }

  return (
    <div className="app-video-frame rounded-[1.6rem] border border-white/10 bg-black/30">
      <video
        ref={videoRef}
        className="h-full w-full rounded-[1.6rem]"
        controls
        src={sourceUrl}
        onLoadedMetadata={emitProgress}
        onEnded={() => {
          emitProgress();
        }}
        onTimeUpdate={() => {
          const currentSeconds = Math.max(0, Math.floor(videoRef.current?.currentTime ?? 0));
          const durationSeconds = Math.max(0, Math.floor(videoRef.current?.duration ?? 0));
          if (durationSeconds <= 0) {
            return;
          }

          if (currentSeconds === durationSeconds || currentSeconds >= lastSentSecondsRef.current + 4) {
            lastSentSecondsRef.current = currentSeconds;
            emitProgress();
          }
        }}
        style={disabled ? { pointerEvents: 'none', opacity: 0.75 } : undefined}
      />
    </div>
  );
};

const LearningHubView: React.FC<LearningHubViewProps> = (props) => {
  const {
    academyName,
    userName,
    userRole,
    selectedAcademyId,
    selectedAcademy,
    academies = [],
    allUsers = [],
    academyUsers = [],
    tracks,
    courses,
    lessons,
    lessonBlocks,
    quizzes,
    progressRecords,
    onSelectAcademy,
    onUpsertTrack,
    onUpsertCourse,
    onUpsertLesson,
    onReplaceLessonBlocks,
    onUpsertQuiz,
    onUploadLearningAsset,
    onRecordPlayback,
    onMarkBlockComplete,
    onStartQuiz,
    onSubmitQuiz,
  } = props;

  const isSuperAdmin = userRole === UserRole.SUPERADMIN;
  const isProfessorRole = userRole === UserRole.PROFESSOR;
  const firstName = userName.split(' ')[0] ?? userName;

  const publishedTracks = useMemo(() => sortByOrder(tracks.filter((track) => track.status === 'published')), [tracks]);
  const publishedCourses = useMemo(() => sortByOrder(courses.filter((course) => course.status === 'published')), [courses]);
  const publishedLessons = useMemo(() => sortByOrder(lessons.filter((lesson) => lesson.status === 'published')), [lessons]);
  const sortedTracks = useMemo(() => sortByOrder(tracks), [tracks]);
  const sortedCourses = useMemo(() => sortByOrder(courses), [courses]);
  const sortedLessons = useMemo(() => sortByOrder(lessons), [lessons]);
  const quizByLessonId = useMemo(() => new Map(quizzes.map((quiz) => [quiz.lessonId, quiz])), [quizzes]);
  const ownProgressByLessonId = useMemo(() => new Map(progressRecords.map((record) => [record.lessonId, record])), [progressRecords]);

  const [activeTrackId, setActiveTrackId] = useState('');
  const [activeLessonId, setActiveLessonId] = useState('');
  const [trackSelectionId, setTrackSelectionId] = useState('');
  const [courseSelectionId, setCourseSelectionId] = useState('');
  const [lessonSelectionId, setLessonSelectionId] = useState('');
  const [superadminTab, setSuperadminTab] = useState<SuperadminLearningTab>('overview');

  const [trackForm, setTrackForm] = useState<{
    title: string;
    description: string;
    order: number;
    status: 'draft' | 'published';
  }>({
    title: '',
    description: '',
    order: 1,
    status: 'draft' as const,
  });
  const [courseForm, setCourseForm] = useState<{
    trackId: string;
    title: string;
    description: string;
    order: number;
    status: 'draft' | 'published';
  }>({
    trackId: '',
    title: '',
    description: '',
    order: 1,
    status: 'draft' as const,
  });
  const [lessonForm, setLessonForm] = useState<{
    trackId: string;
    courseId: string;
    title: string;
    description: string;
    order: number;
    status: 'draft' | 'published';
    passingScore: number;
  }>({
    trackId: '',
    courseId: '',
    title: '',
    description: '',
    order: 1,
    status: 'draft' as const,
    passingScore: 80,
  });
  const [lessonBlockDrafts, setLessonBlockDrafts] = useState<EditorBlockDraft[]>([]);
  const [quizEnabled, setQuizEnabled] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionDraft[]>([emptyQuestion()]);

  const [busyKey, setBusyKey] = useState('');
  const [editorSuccess, setEditorSuccess] = useState('');
  const [editorError, setEditorError] = useState('');
  const [quizSessionLessonId, setQuizSessionLessonId] = useState('');
  const [quizSessionQuestions, setQuizSessionQuestions] = useState<QuizQuestionSession[]>([]);
  const [quizSessionAnswers, setQuizSessionAnswers] = useState<number[]>([]);
  const [quizPassingScore, setQuizPassingScore] = useState(80);
  const [quizAttemptCount, setQuizAttemptCount] = useState(0);
  const [quizFeedback, setQuizFeedback] = useState('');
  const [quizError, setQuizError] = useState('');
  const [actionError, setActionError] = useState('');
  const [quizBusy, setQuizBusy] = useState(false);
  const [manualBlockBusyId, setManualBlockBusyId] = useState('');

  const playbackSentSecondsRef = useRef<Record<string, number>>({});
  const playbackPendingRef = useRef<Record<string, boolean>>({});

  const activeTrack = useMemo(
    () => publishedTracks.find((track) => track.id === activeTrackId) ?? publishedTracks[0] ?? null,
    [activeTrackId, publishedTracks],
  );
  const activeTrackLessons = useMemo(
    () => activeTrack ? buildOrderedLessons(activeTrack.id, publishedCourses, publishedLessons, lessonBlocks) : [],
    [activeTrack, lessonBlocks, publishedCourses, publishedLessons],
  );
  const activeLesson = useMemo(
    () => activeTrackLessons.find((entry) => entry.lesson.id === activeLessonId) ?? activeTrackLessons[0] ?? null,
    [activeLessonId, activeTrackLessons],
  );
  const activeLessonProgress = activeLesson ? ownProgressByLessonId.get(activeLesson.lesson.id) ?? null : null;
  const activeLessonStatus = activeLesson ? lessonRuntimeStatus(activeTrackLessons, ownProgressByLessonId, activeLesson.lesson.id) : 'locked';
  const reportProfessorUsers = selectedAcademyId ? academyUsers.filter(isProfessor) : allUsers.filter(isProfessor);
  const consolidatedTrackRows = useMemo(() => publishedTracks.map((track) => {
    const trackLessons = buildOrderedLessons(track.id, publishedCourses, publishedLessons, lessonBlocks);
    const professorUsers = allUsers.filter(isProfessor);
    let startedUsers = 0;
    let completedUsers = 0;

    professorUsers.forEach((user) => {
      const progressByLessonId = new Map(
        progressRecords
          .filter((record) => record.userId === user.id && record.trackId === track.id)
          .map((record) => [record.lessonId, record]),
      );

      const completedLessons = trackLessons.filter((entry) => isProgressComplete(progressByLessonId.get(entry.lesson.id), entry.lesson.quizQuestionCount > 0)).length;
      if (progressByLessonId.size > 0) {
        startedUsers += 1;
      }

      if (trackLessons.length > 0 && completedLessons === trackLessons.length) {
        completedUsers += 1;
      }
    });

    return {
      track,
      totalLessons: trackLessons.length,
      totalBlocks: trackLessons.reduce((total, entry) => total + entry.blocks.length, 0),
      startedUsers,
      completedUsers,
    };
  }), [allUsers, lessonBlocks, progressRecords, publishedCourses, publishedLessons, publishedTracks]);

  useEffect(() => {
    if (publishedTracks.length === 0) {
      setActiveTrackId('');
      return;
    }

    if (!publishedTracks.some((track) => track.id === activeTrackId)) {
      setActiveTrackId(publishedTracks[0].id);
    }
  }, [activeTrackId, publishedTracks]);

  useEffect(() => {
    if (!isProfessorRole || activeTrackLessons.length === 0) {
      setActiveLessonId('');
      return;
    }

    const preferredLesson = activeTrackLessons.find((entry) => {
      const status = lessonRuntimeStatus(activeTrackLessons, ownProgressByLessonId, entry.lesson.id);
      return status !== 'completed' && status !== 'locked';
    }) ?? activeTrackLessons[0];

    if (!activeTrackLessons.some((entry) => entry.lesson.id === activeLessonId)) {
      setActiveLessonId(preferredLesson.lesson.id);
    }
  }, [activeLessonId, activeTrackLessons, isProfessorRole, ownProgressByLessonId]);

  useEffect(() => {
    if (trackSelectionId) {
      const selectedTrack = sortedTracks.find((track) => track.id === trackSelectionId);
      if (selectedTrack) {
        setTrackForm({
          title: selectedTrack.title,
          description: selectedTrack.description ?? '',
          order: selectedTrack.order,
          status: selectedTrack.status,
        });
        return;
      }
    }

    setTrackForm({
      title: '',
      description: '',
      order: sortedTracks.length + 1,
      status: 'draft',
    });
  }, [sortedTracks, trackSelectionId]);

  useEffect(() => {
    if (courseSelectionId) {
      const selectedCourse = sortedCourses.find((course) => course.id === courseSelectionId);
      if (selectedCourse) {
        setCourseForm({
          trackId: selectedCourse.trackId,
          title: selectedCourse.title,
          description: selectedCourse.description ?? '',
          order: selectedCourse.order,
          status: selectedCourse.status,
        });
        return;
      }
    }

    const fallbackTrackId = trackSelectionId || sortedTracks[0]?.id || '';
    setCourseForm({
      trackId: fallbackTrackId,
      title: '',
      description: '',
      order: sortedCourses.filter((course) => course.trackId === fallbackTrackId).length + 1,
      status: 'draft',
    });
  }, [courseSelectionId, sortedCourses, sortedTracks, trackSelectionId]);

  useEffect(() => {
    if (lessonSelectionId) {
      const selectedLesson = sortedLessons.find((lesson) => lesson.id === lessonSelectionId);
      if (selectedLesson) {
        setLessonForm({
          trackId: selectedLesson.trackId,
          courseId: selectedLesson.courseId,
          title: selectedLesson.title,
          description: selectedLesson.description ?? '',
          order: selectedLesson.order,
          status: selectedLesson.status,
          passingScore: selectedLesson.passingScore,
        });
        setLessonBlockDrafts(getEffectiveLessonBlocks(selectedLesson, lessonBlocks).map(toEditorBlock));
        const existingQuiz = quizByLessonId.get(selectedLesson.id);
        setQuizEnabled(Boolean(existingQuiz?.questions?.length));
        setQuizQuestions(normalizeQuizDrafts(existingQuiz));
        return;
      }
    }

    const fallbackTrackId = trackSelectionId || sortedTracks[0]?.id || '';
    const fallbackCourseId = courseSelectionId || sortedCourses.find((course) => course.trackId === fallbackTrackId)?.id || '';
    setLessonForm({
      trackId: fallbackTrackId,
      courseId: fallbackCourseId,
      title: '',
      description: '',
      order: sortedLessons.filter((lesson) => lesson.courseId === fallbackCourseId).length + 1,
      status: 'draft',
      passingScore: 80,
    });
    setLessonBlockDrafts([]);
    setQuizEnabled(false);
    setQuizQuestions([emptyQuestion()]);
  }, [courseSelectionId, lessonBlocks, lessonSelectionId, quizByLessonId, sortedCourses, sortedLessons, sortedTracks, trackSelectionId]);

  function resetAlerts() {
    setEditorSuccess('');
    setEditorError('');
    setActionError('');
  }

  function renderEditorAlerts() {
    if (!editorSuccess && !editorError) {
      return null;
    }

    return (
      <div className={`mt-6 app-panel ${editorError ? 'app-panel--danger' : 'app-panel--soft'}`}>
        <p className="text-sm">{editorError || editorSuccess}</p>
      </div>
    );
  }

  function updateDraftBlock(tempId: string, updater: (current: EditorBlockDraft) => EditorBlockDraft) {
    setLessonBlockDrafts((current) => current.map((block) => (block.tempId === tempId ? updater(block) : block)));
  }

  function addDraftBlock(type: LearningLessonBlockType) {
    setLessonBlockDrafts((current) => [...current, createEditorBlock(type, current.length + 1)]);
  }

  async function handleSaveTrack(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetAlerts();
    setBusyKey('track');

    try {
      const response = await onUpsertTrack({
        trackId: trackSelectionId || undefined,
        title: trackForm.title,
        description: trackForm.description || undefined,
        order: Number(trackForm.order),
        status: trackForm.status,
      });
      setTrackSelectionId(response.trackId);
      setEditorSuccess('Trilha salva com sucesso.');
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Nao foi possivel salvar a trilha.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleSaveCourse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetAlerts();
    setBusyKey('course');

    try {
      const response = await onUpsertCourse({
        courseId: courseSelectionId || undefined,
        trackId: courseForm.trackId,
        title: courseForm.title,
        description: courseForm.description || undefined,
        order: Number(courseForm.order),
        status: courseForm.status,
      });
      setCourseSelectionId(response.courseId);
      setEditorSuccess('Curso salvo com sucesso.');
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Nao foi possivel salvar o curso.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleSaveLesson(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetAlerts();
    setBusyKey('lesson');

    try {
      const normalizedBlocks = normalizeBlocksForSave(lessonBlockDrafts);
      const primaryYouTubeBlock = normalizedBlocks.length === 1 && normalizedBlocks[0].type === 'youtube'
        ? normalizedBlocks[0].sourceUrl || undefined
        : undefined;

      const lessonResponse = await onUpsertLesson({
        lessonId: lessonSelectionId || undefined,
        trackId: lessonForm.trackId,
        courseId: lessonForm.courseId,
        title: lessonForm.title,
        description: lessonForm.description || undefined,
        videoUrl: primaryYouTubeBlock,
        order: Number(lessonForm.order),
        status: lessonForm.status,
        passingScore: Number(lessonForm.passingScore),
        contentBlockCount: normalizedBlocks.length,
      });

      const uploadedBlocks = await Promise.all(normalizedBlocks.map(async (block) => {
        if (!block.file) {
          return block;
        }

        const uploadedAsset = await onUploadLearningAsset({
          lessonId: lessonResponse.lessonId,
          file: block.file,
        });

        return {
          ...block,
          sourceUrl: uploadedAsset.downloadURL,
          storagePath: uploadedAsset.storagePath,
          mimeType: uploadedAsset.mimeType,
          fileName: uploadedAsset.fileName,
          file: null,
        };
      }));

      await onReplaceLessonBlocks({
        lessonId: lessonResponse.lessonId,
        blocks: uploadedBlocks.map((block, index) => ({
          blockId: block.blockId,
          type: block.type,
          title: block.title,
          order: index + 1,
          ...(block.sourceUrl ? { sourceUrl: block.sourceUrl } : {}),
          ...(block.storagePath ? { storagePath: block.storagePath } : {}),
          ...(block.mimeType ? { mimeType: block.mimeType } : {}),
          ...(block.fileName ? { fileName: block.fileName } : {}),
          ...(block.thumbnailUrl ? { thumbnailUrl: block.thumbnailUrl } : {}),
        })),
      });

      setLessonSelectionId(lessonResponse.lessonId);
      setLessonBlockDrafts(uploadedBlocks.map((block, index) => ({ ...block, order: index + 1 })));
      setEditorSuccess('Modulo salvo com sucesso.');
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Nao foi possivel salvar o modulo.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleSaveQuiz(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetAlerts();

    if (!lessonSelectionId) {
      setEditorError('Salve o modulo primeiro para configurar o quiz.');
      return;
    }

    setBusyKey('quiz');

    try {
      if (!quizEnabled) {
        await onUpsertQuiz({ lessonId: lessonSelectionId, questions: [] });
        setEditorSuccess('Quiz removido do modulo.');
        return;
      }

      const normalizedQuestions = quizQuestions
        .map((question) => ({
          prompt: question.prompt.trim(),
          options: question.options.map((option) => option.trim()).filter(Boolean),
          correctOptionIndex: question.correctOptionIndex,
        }))
        .filter((question) => question.prompt.length > 0);

      if (normalizedQuestions.length === 0) {
        throw new Error('Cadastre pelo menos uma pergunta ou desative o quiz.');
      }

      await onUpsertQuiz({
        lessonId: lessonSelectionId,
        questions: normalizedQuestions,
      });
      setEditorSuccess('Quiz salvo com sucesso.');
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Nao foi possivel salvar o quiz.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleOpenQuiz() {
    if (!activeLesson) {
      return;
    }

    setQuizBusy(true);
    setQuizError('');
    setQuizFeedback('');

    try {
      const response = await onStartQuiz(activeLesson.lesson.id);
      setQuizSessionLessonId(activeLesson.lesson.id);
      setQuizSessionQuestions(response.questions);
      setQuizSessionAnswers(Array.from({ length: response.questions.length }, () => -1));
      setQuizPassingScore(response.passingScore);
      setQuizAttemptCount(response.attemptCount);
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : 'Nao foi possivel abrir o quiz.');
    } finally {
      setQuizBusy(false);
    }
  }

  async function handleSubmitQuizSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuizBusy(true);
    setQuizError('');
    setQuizFeedback('');

    try {
      const response = await onSubmitQuiz({ lessonId: quizSessionLessonId, answers: quizSessionAnswers });
      setQuizFeedback(response.passed
        ? `Quiz aprovado com ${response.scorePercent}% de acerto.`
        : `Quiz concluido com ${response.scorePercent}% de acerto. Revise o modulo e tente novamente.`);
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : 'Nao foi possivel enviar o quiz.');
    } finally {
      setQuizBusy(false);
    }
  }

  async function handleBlockPlaybackProgress(blockId: string, payload: { currentSeconds: number; durationSeconds: number }) {
    if (!activeLesson || !payload.durationSeconds) {
      return;
    }

    const progressKey = `${activeLesson.lesson.id}:${blockId}`;
    const roundedCurrentSeconds = Math.max(0, Math.floor(payload.currentSeconds));
    const lastSentSeconds = playbackSentSecondsRef.current[progressKey] ?? -1;

    if (playbackPendingRef.current[progressKey]) {
      return;
    }

    if (roundedCurrentSeconds !== Math.floor(payload.durationSeconds) && roundedCurrentSeconds < lastSentSeconds + 4) {
      return;
    }

    playbackPendingRef.current[progressKey] = true;

    try {
      await onRecordPlayback({
        lessonId: activeLesson.lesson.id,
        blockId,
        currentSeconds: roundedCurrentSeconds,
        durationSeconds: Math.max(1, Math.floor(payload.durationSeconds)),
      });
      playbackSentSecondsRef.current[progressKey] = roundedCurrentSeconds;
      setActionError('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Nao foi possivel registrar o progresso deste bloco.');
    } finally {
      playbackPendingRef.current[progressKey] = false;
    }
  }

  async function handleManualBlockComplete(blockId: string) {
    if (!activeLesson) {
      return;
    }

    setManualBlockBusyId(blockId);
    setActionError('');

    try {
      await onMarkBlockComplete({
        lessonId: activeLesson.lesson.id,
        blockId,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Nao foi possivel concluir este bloco.');
    } finally {
      setManualBlockBusyId('');
    }
  }

  const reportRows = useMemo(() => {
    if (!activeTrack) {
      return [];
    }

    const trackLessons = buildOrderedLessons(activeTrack.id, publishedCourses, publishedLessons, lessonBlocks);
    return reportProfessorUsers.map((user) => {
      const userProgressByLesson = new Map(
        progressRecords
          .filter((record) => record.userId === user.id && record.trackId === activeTrack.id)
          .map((record) => [record.lessonId, record]),
      );
      const completed = trackLessons.filter((entry) => isProgressComplete(userProgressByLesson.get(entry.lesson.id), entry.lesson.quizQuestionCount > 0)).length;
      const currentEntry = trackLessons.find((entry) => {
        const status = lessonRuntimeStatus(trackLessons, userProgressByLesson, entry.lesson.id);
        return status !== 'completed' && status !== 'locked';
      }) ?? null;

      return {
        user,
        completed,
        currentEntry,
        progressByLesson: userProgressByLesson,
      };
    });
  }, [activeTrack, lessonBlocks, progressRecords, publishedCourses, publishedLessons, reportProfessorUsers]);

  if (isProfessorRole) {
    return (
      <div className="space-y-6">
        <section className="app-panel app-panel-pad">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="app-section-label">Learning Hub</p>
              <h1 className="text-3xl font-bold">Modulos da {academyName}</h1>
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                {firstName}, avance pelos modulos publicados da rede e conclua cada etapa para liberar a seguinte.
              </p>
            </div>
            <div className="app-orb"><BookOpen size={16} />Professor</div>
          </div>

          {publishedTracks.length === 0 ? (
            <div className="app-empty mt-6">Nenhuma trilha publicada ainda.</div>
          ) : (
            <div className="mt-6 flex flex-wrap gap-2">
              {publishedTracks.map((track) => (
                <button
                  type="button"
                  key={track.id}
                  onClick={() => setActiveTrackId(track.id)}
                  className={`app-button ${activeTrack?.id === track.id ? 'app-button--gold' : 'app-button--dark'} app-button--small`}
                >
                  {track.title}
                </button>
              ))}
            </div>
          )}
        </section>

        {publishedTracks.length > 0 ? (
          <section className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
            <div className="app-panel app-panel-pad">
              <div className="flex items-center gap-3">
                <div className="app-icon-shell"><BookOpen size={18} /></div>
                <div>
                  <p className="app-section-label">Mapa da trilha</p>
                  <h2 className="text-xl font-bold">{activeTrack?.title ?? 'Trilha'}</h2>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {activeTrackLessons.map((entry) => {
                  const runtimeStatus = lessonRuntimeStatus(activeTrackLessons, ownProgressByLessonId, entry.lesson.id);
                  return (
                    <button
                      type="button"
                      key={entry.lesson.id}
                      onClick={() => setActiveLessonId(entry.lesson.id)}
                      className={`app-list-card w-full text-left ${activeLesson?.lesson.id === entry.lesson.id ? 'ring-1 ring-[color:var(--brand-gold)]' : ''}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold">{entry.lesson.title}</p>
                          <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                            {entry.course?.title ?? 'Curso sem referencia'} • {entry.blocks.length} blocos
                          </p>
                        </div>
                        <span className={statusBadge(runtimeStatus)}>{statusLabel(runtimeStatus)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-6">
              <section className="app-panel app-panel-pad">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="app-section-label">Modulo ativo</p>
                    <h2 className="text-2xl font-bold">{activeLesson?.lesson.title ?? 'Selecione um modulo'}</h2>
                    <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                      {activeLesson?.lesson.description || 'Conclua os blocos do modulo para liberar o quiz e o proximo passo.'}
                    </p>
                  </div>
                  <span className={statusBadge(activeLessonStatus)}>{statusLabel(activeLessonStatus)}</span>
                </div>

                {activeLesson ? (
                  <>
                    <div className="mt-6">
                      <ProgressBar
                        label="Progresso do modulo"
                        current={Math.min(activeLessonProgress?.contentCompletionPercent ?? 0, 100)}
                        total={100}
                      />
                    </div>

                    <div className="mt-6 space-y-4">
                      {activeLesson.blocks.map((block) => {
                        const blockProgress = activeLessonProgress?.contentProgressMap?.[block.id] ?? 0;
                        const blockCompleted = blockProgress >= 100;
                        const disabled = activeLessonStatus === 'locked';

                        return (
                          <article key={`${activeLesson.lesson.id}-${block.id}`} className="app-panel app-panel--soft p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  {blockTypeIcon(block.type)}
                                  <p className="text-sm font-bold">{block.title}</p>
                                </div>
                                <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                                  {blockTypeLabel(block.type)} • bloco {block.order}
                                  {block.isLegacy ? ' • legado' : ''}
                                </p>
                              </div>
                              <span className={blockCompleted ? 'app-badge app-badge--success' : 'app-badge app-badge--muted'}>
                                {blockCompleted ? 'Concluido' : `${blockProgress}%`}
                              </span>
                            </div>

                            <div className="mt-4">
                              {block.type === 'youtube' ? (
                                <LearningVideoPlayer
                                  lessonKey={`${activeLesson.lesson.id}-${block.id}`}
                                  videoUrl={block.sourceUrl ?? ''}
                                  disabled={disabled}
                                  onProgress={(payload) => void handleBlockPlaybackProgress(block.id, payload)}
                                />
                              ) : null}

                              {block.type === 'uploaded_video' ? (
                                <UploadedVideoPlayer
                                  blockKey={`${activeLesson.lesson.id}-${block.id}`}
                                  sourceUrl={block.sourceUrl ?? ''}
                                  disabled={disabled}
                                  onProgress={(payload) => void handleBlockPlaybackProgress(block.id, payload)}
                                />
                              ) : null}

                              {block.type === 'pdf' ? (
                                <div className="space-y-4">
                                  <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/5">
                                    <iframe
                                      title={block.title}
                                      src={block.sourceUrl}
                                      className="min-h-[26rem] w-full"
                                    />
                                  </div>
                                  <div className="flex flex-wrap gap-3">
                                    <a
                                      href={block.sourceUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="app-button app-button--dark app-button--small"
                                    >
                                      <ExternalLink size={14} />
                                      Abrir PDF
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => void handleManualBlockComplete(block.id)}
                                      disabled={disabled || blockCompleted || manualBlockBusyId === block.id}
                                      className="app-button app-button--gold app-button--small"
                                    >
                                      <CheckCircle2 size={14} />
                                      {manualBlockBusyId === block.id ? 'Salvando...' : (blockCompleted ? 'Concluido' : 'Marcar como concluido')}
                                    </button>
                                  </div>
                                </div>
                              ) : null}

                              {block.type === 'image' ? (
                                <div className="space-y-4">
                                  <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/5">
                                    <img src={block.sourceUrl} alt={block.title} className="h-auto w-full object-cover" />
                                  </div>
                                  <div className="flex flex-wrap gap-3">
                                    <a
                                      href={block.sourceUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="app-button app-button--dark app-button--small"
                                    >
                                      <ExternalLink size={14} />
                                      Abrir imagem
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => void handleManualBlockComplete(block.id)}
                                      disabled={disabled || blockCompleted || manualBlockBusyId === block.id}
                                      className="app-button app-button--gold app-button--small"
                                    >
                                      <CheckCircle2 size={14} />
                                      {manualBlockBusyId === block.id ? 'Salvando...' : (blockCompleted ? 'Concluido' : 'Marcar como concluido')}
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    {actionError ? (
                      <div className="mt-6 app-panel app-panel--danger">
                        <p className="text-sm">{actionError}</p>
                      </div>
                    ) : null}

                    <div className="mt-6 app-panel app-panel--soft p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold">Quiz do modulo</p>
                          <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                            {activeLesson.lesson.quizQuestionCount > 0
                              ? 'O quiz libera quando todos os blocos forem concluidos.'
                              : 'Este modulo nao possui quiz. Ao concluir os blocos, ele sera encerrado automaticamente.'}
                          </p>
                        </div>
                        {activeLesson.lesson.quizQuestionCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => void handleOpenQuiz()}
                            disabled={quizBusy || !activeLessonProgress?.contentCompleted}
                            className="app-button app-button--gold"
                          >
                            <ClipboardCheck size={16} />
                            {quizBusy ? 'Processando...' : (activeLessonProgress?.quizPassed ? 'Refazer quiz' : 'Abrir quiz')}
                          </button>
                        ) : (
                          <span className={activeLessonProgress?.lessonCompleted ? 'app-badge app-badge--success' : 'app-badge app-badge--muted'}>
                            {activeLessonProgress?.lessonCompleted ? 'Modulo concluido' : 'Sem quiz'}
                          </span>
                        )}
                      </div>

                      {activeLesson.lesson.quizQuestionCount > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="app-badge app-badge--muted">Tentativas: {activeLessonProgress?.attemptCount ?? 0}</span>
                          <span className="app-badge app-badge--muted">Nota minima: {quizPassingScore}%</span>
                        </div>
                      ) : null}

                      {quizSessionLessonId === activeLesson.lesson.id && quizSessionQuestions.length > 0 ? (
                        <form onSubmit={handleSubmitQuizSession} className="mt-6 space-y-4">
                          {quizSessionQuestions.map((question, questionIndex) => (
                            <div key={question.id} className="app-panel app-panel--soft p-4">
                              <p className="text-sm font-bold">{questionIndex + 1}. {question.prompt}</p>
                              <div className="mt-4 space-y-3">
                                {question.options.map((option, optionIndex) => (
                                  <label key={`${question.id}-${optionIndex}`} className="flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3">
                                    <input
                                      type="radio"
                                      name={`quiz-question-${question.id}`}
                                      checked={quizSessionAnswers[questionIndex] === optionIndex}
                                      onChange={() => setQuizSessionAnswers((current) => current.map((answer, index) => (index === questionIndex ? optionIndex : answer)))}
                                    />
                                    <span className="text-sm">{option}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}

                          {quizError ? <div className="app-panel app-panel--danger"><p className="text-sm">{quizError}</p></div> : null}
                          {quizFeedback ? <div className="app-panel app-panel--soft"><p className="text-sm">{quizFeedback}</p></div> : null}

                          <button type="submit" disabled={quizBusy} className="app-button app-button--gold">
                            <Save size={16} />
                            {quizBusy ? 'Enviando...' : 'Enviar quiz'}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="app-empty mt-6">Selecione um modulo para ver os blocos e o quiz.</div>
                )}
              </section>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6 learning-superadmin-view">
      <section className="app-panel app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-section-label">Learning Hub</p>
            <h1 className="text-3xl font-bold">Governanca de modulos multimidia</h1>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              Monte trilhas, cursos, modulos e blocos em ordem, com quiz opcional no final.
            </p>
          </div>
          <div className="app-orb"><ShieldCheck size={16} />Superadmin</div>
        </div>

        <div className="learning-superadmin-tabs mt-6 flex gap-2 overflow-x-auto">
          {superadminLearningTabs.map((tab) => {
            const isActive = superadminTab === tab.id;
            const TabIcon = tab.icon;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setSuperadminTab(tab.id)}
                className="learning-superadmin-tabs__button app-button app-button--small inline-flex items-center gap-2 whitespace-nowrap transition-all"
                style={{
                  background: isActive ? tab.accent : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${isActive ? tab.accent : `${tab.accent}66`}`,
                  color: isActive ? '#fff' : tab.accent,
                  boxShadow: isActive ? `0 8px 20px -8px ${tab.accent}` : 'none',
                }}
              >
                <TabIcon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {(() => {
          const activeTab = superadminLearningTabs.find((tab) => tab.id === superadminTab);
          const ActiveIcon = activeTab?.icon;
          return (
            <div
              className="learning-superadmin-panel mt-6 rounded-[1.8rem] border bg-white/5 p-5"
              style={{
                borderColor: activeTab ? `${activeTab.accent}55` : 'rgba(255,255,255,0.1)',
                background: activeTab ? `linear-gradient(135deg, ${activeTab.accent}1a, rgba(255,255,255,0.04))` : undefined,
              }}
            >
              <div className="app-topbar-panel__inner app-topbar-panel__inner--superadmin">
                <div className="flex items-start gap-3">
                  {ActiveIcon ? (
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: `${activeTab?.accent}26`, color: activeTab?.accent }}
                    >
                      <ActiveIcon size={22} />
                    </span>
                  ) : null}
                  <div>
                    <p className="app-section-label" style={{ color: activeTab?.accent }}>{activeTab?.label}</p>
                    <h2 className="text-2xl font-bold">{activeTab?.title}</h2>
                    <p className="mt-2 text-sm text-[color:var(--text-muted)]">{activeTab?.description}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </section>

      {superadminTab === 'overview' ? (
        <section className="app-panel app-panel-pad">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="app-section-label">Radar da rede</p>
              <h2 className="text-xl font-bold">Trilhas, modulos e professores</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="app-orb"><Network size={16} />Rede</div>
              {onSelectAcademy ? (
                <select
                  value={selectedAcademyId ?? ''}
                  onChange={(event) => onSelectAcademy(event.target.value)}
                  className="app-select min-w-[15rem]"
                >
                  <option value="">Toda a rede</option>
                  {academies.map((academyEntry) => (
                    <option key={academyEntry.id} value={academyEntry.id}>{academyEntry.name}</option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          <div className="app-stat-grid learning-superadmin-kpi-grid mt-6">
            <article className="app-stat-card"><p className="app-stat-card__label">Academias</p><p className="app-stat-card__value">{selectedAcademy ? 1 : academies.length}</p></article>
            <article className="app-stat-card"><p className="app-stat-card__label">Trilhas publicadas</p><p className="app-stat-card__value">{publishedTracks.length}</p></article>
            <article className="app-stat-card"><p className="app-stat-card__label">Cursos publicados</p><p className="app-stat-card__value">{publishedCourses.length}</p></article>
            <article className="app-stat-card"><p className="app-stat-card__label">Modulos publicados</p><p className="app-stat-card__value">{publishedLessons.length}</p></article>
          </div>

          {publishedTracks.length === 0 ? (
            <div className="app-empty mt-6">Publique pelo menos uma trilha para acompanhar o progresso da rede.</div>
          ) : (
            <div className="mt-6 app-list">
              {consolidatedTrackRows.map((row) => (
                <div key={row.track.id} className="app-list-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">{row.track.title}</p>
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">{row.totalLessons} modulos • {row.totalBlocks} blocos</p>
                    </div>
                    <span className="app-badge app-badge--muted">{row.completedUsers}/{row.startedUsers || row.completedUsers} professores concluiram</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {publishedTracks.length > 0 ? (
            <div className="mt-6">
              <div className="flex items-center gap-3">
                <div className="app-icon-shell"><Users size={18} /></div>
                <div>
                  <p className="app-section-label">Professores</p>
                  <h3 className="text-lg font-bold">Progresso por modulo na trilha selecionada</h3>
                </div>
              </div>
              <div className="mt-4 app-list">
                {reportRows.map((row) => {
                  const trackLessons = activeTrack ? buildOrderedLessons(activeTrack.id, publishedCourses, publishedLessons, lessonBlocks) : [];
                  return (
                    <div key={row.user.id} className="app-list-card">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold">{row.user.displayName}</p>
                          <p className="mt-1 text-xs text-[color:var(--text-soft)]">{row.completed}/{trackLessons.length} modulos concluidos</p>
                        </div>
                        <span className="app-badge app-badge--muted">{row.currentEntry ? `Atual: ${row.currentEntry.lesson.title}` : 'Sem modulos ativos'}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {trackLessons.map((entry) => {
                          const runtimeStatus = lessonRuntimeStatus(trackLessons, row.progressByLesson, entry.lesson.id);
                          return <span key={`${row.user.id}-${entry.lesson.id}`} className={statusBadge(runtimeStatus)}>{entry.lesson.title} • {statusLabel(runtimeStatus)}</span>;
                        })}
                      </div>
                    </div>
                  );
                })}
                {reportRows.length === 0 ? <div className="app-empty">Nenhum professor encontrado no recorte atual.</div> : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={`app-grid-2 ${superadminTab === 'tracks' ? '' : 'hidden'}`}>
        <form onSubmit={handleSaveTrack} className="app-panel app-panel-pad md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell"><BookOpen size={18} /></div>
              <div>
                <p className="app-section-label">Trilha</p>
                <h2 className="text-xl font-bold">Editor de trilhas</h2>
              </div>
            </div>
            <button type="button" onClick={() => setTrackSelectionId('')} className="app-button app-button--dark app-button--small"><Plus size={14} />Nova</button>
          </div>
          {renderEditorAlerts()}
          <div className="mt-6 app-grid-2">
            <label className="app-field md:col-span-2">
              <span className="app-field__label">Trilha existente</span>
              <select value={trackSelectionId} onChange={(event) => setTrackSelectionId(event.target.value)} className="app-select">
                <option value="">Nova trilha</option>
                {sortedTracks.map((track) => <option key={track.id} value={track.id}>{track.title} • {contentLabel(track.status)}</option>)}
              </select>
            </label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Titulo</span><input value={trackForm.title} onChange={(event) => setTrackForm((current) => ({ ...current, title: event.target.value }))} className="app-input" required /></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Descricao</span><textarea value={trackForm.description} onChange={(event) => setTrackForm((current) => ({ ...current, description: event.target.value }))} className="app-input min-h-[7rem]" /></label>
            <label className="app-field"><span className="app-field__label">Ordem</span><input type="number" min={1} value={trackForm.order} onChange={(event) => setTrackForm((current) => ({ ...current, order: Number(event.target.value) }))} className="app-input" /></label>
            <label className="app-field"><span className="app-field__label">Status</span><select value={trackForm.status} onChange={(event) => setTrackForm((current) => ({ ...current, status: event.target.value as 'draft' | 'published' }))} className="app-select"><option value="draft">Rascunho</option><option value="published">Publicado</option></select></label>
          </div>
          <button type="submit" disabled={busyKey === 'track'} className="app-button app-button--gold mt-6" style={{ '--save-accent': '#8b5cf6', '--save-accent-dark': '#7c3aed' } as React.CSSProperties}><Save size={16} />{busyKey === 'track' ? 'Salvando...' : 'Salvar trilha'}</button>
        </form>
      </section>

      <section className={`app-grid-2 ${superadminTab === 'courses' ? '' : 'hidden'}`}>
        <form onSubmit={handleSaveCourse} className="app-panel app-panel-pad md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell"><BookOpen size={18} /></div>
              <div>
                <p className="app-section-label">Curso</p>
                <h2 className="text-xl font-bold">Editor de cursos</h2>
              </div>
            </div>
            <button type="button" onClick={() => setCourseSelectionId('')} className="app-button app-button--dark app-button--small"><Plus size={14} />Novo</button>
          </div>
          {renderEditorAlerts()}
          <div className="mt-6 app-grid-2">
            <label className="app-field md:col-span-2"><span className="app-field__label">Trilha pai</span><select value={courseForm.trackId} onChange={(event) => { const nextTrackId = event.target.value; setCourseSelectionId(''); setCourseForm((current) => ({ ...current, trackId: nextTrackId, order: sortedCourses.filter((course) => course.trackId === nextTrackId).length + 1 })); }} className="app-select" required><option value="">Selecione uma trilha</option>{sortedTracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}</select></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Curso existente</span><select value={courseSelectionId} onChange={(event) => setCourseSelectionId(event.target.value)} className="app-select"><option value="">Novo curso</option>{sortByOrder(sortedCourses.filter((course) => course.trackId === courseForm.trackId)).map((course) => <option key={course.id} value={course.id}>{course.title} • {contentLabel(course.status)}</option>)}</select></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Titulo</span><input value={courseForm.title} onChange={(event) => setCourseForm((current) => ({ ...current, title: event.target.value }))} className="app-input" required /></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Descricao</span><textarea value={courseForm.description} onChange={(event) => setCourseForm((current) => ({ ...current, description: event.target.value }))} className="app-input min-h-[7rem]" /></label>
            <label className="app-field"><span className="app-field__label">Ordem</span><input type="number" min={1} value={courseForm.order} onChange={(event) => setCourseForm((current) => ({ ...current, order: Number(event.target.value) }))} className="app-input" /></label>
            <label className="app-field"><span className="app-field__label">Status</span><select value={courseForm.status} onChange={(event) => setCourseForm((current) => ({ ...current, status: event.target.value as 'draft' | 'published' }))} className="app-select"><option value="draft">Rascunho</option><option value="published">Publicado</option></select></label>
          </div>
          <button type="submit" disabled={busyKey === 'course'} className="app-button app-button--gold mt-6" style={{ '--save-accent': '#10b981', '--save-accent-dark': '#059669' } as React.CSSProperties}><Save size={16} />{busyKey === 'course' ? 'Salvando...' : 'Salvar curso'}</button>
        </form>
      </section>

      <section className={`app-grid-2 ${superadminTab === 'modules' ? '' : 'hidden'}`}>
        <form onSubmit={handleSaveLesson} className="app-panel app-panel-pad md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell"><CirclePlay size={18} /></div>
              <div>
                <p className="app-section-label">Modulo</p>
                <h2 className="text-xl font-bold">Editor de modulos</h2>
              </div>
            </div>
            <button type="button" onClick={() => setLessonSelectionId('')} className="app-button app-button--dark app-button--small"><Plus size={14} />Novo</button>
          </div>
          {renderEditorAlerts()}
          <div className="mt-6 app-grid-2">
            <label className="app-field"><span className="app-field__label">Trilha pai</span><select value={lessonForm.trackId} onChange={(event) => { const nextTrackId = event.target.value; const nextCourseId = sortByOrder(sortedCourses.filter((course) => course.trackId === nextTrackId))[0]?.id ?? ''; setLessonSelectionId(''); setLessonForm((current) => ({ ...current, trackId: nextTrackId, courseId: nextCourseId })); }} className="app-select" required><option value="">Selecione uma trilha</option>{sortedTracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}</select></label>
            <label className="app-field"><span className="app-field__label">Curso pai</span><select value={lessonForm.courseId} onChange={(event) => { const nextCourseId = event.target.value; setLessonSelectionId(''); setLessonForm((current) => ({ ...current, courseId: nextCourseId })); }} className="app-select" required><option value="">Selecione um curso</option>{sortByOrder(sortedCourses.filter((course) => course.trackId === lessonForm.trackId)).map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Modulo existente</span><select value={lessonSelectionId} onChange={(event) => setLessonSelectionId(event.target.value)} className="app-select"><option value="">Novo modulo</option>{sortByOrder(sortedLessons.filter((lesson) => lesson.courseId === lessonForm.courseId)).map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title} • {contentLabel(lesson.status)}</option>)}</select></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Titulo</span><input value={lessonForm.title} onChange={(event) => setLessonForm((current) => ({ ...current, title: event.target.value }))} className="app-input" required /></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Descricao</span><textarea value={lessonForm.description} onChange={(event) => setLessonForm((current) => ({ ...current, description: event.target.value }))} className="app-input min-h-[7rem]" /></label>
            <label className="app-field"><span className="app-field__label">Ordem</span><input type="number" min={1} value={lessonForm.order} onChange={(event) => setLessonForm((current) => ({ ...current, order: Number(event.target.value) }))} className="app-input" /></label>
            <label className="app-field"><span className="app-field__label">Nota minima (%)</span><input type="number" min={1} max={100} value={lessonForm.passingScore} onChange={(event) => setLessonForm((current) => ({ ...current, passingScore: Number(event.target.value) }))} className="app-input" /></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Status</span><select value={lessonForm.status} onChange={(event) => setLessonForm((current) => ({ ...current, status: event.target.value as 'draft' | 'published' }))} className="app-select"><option value="draft">Rascunho</option><option value="published">Publicado</option></select></label>
          </div>

          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="app-section-label">Blocos do modulo</p>
                <h3 className="text-lg font-bold">Conteudo em ordem</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => addDraftBlock('youtube')} className="app-button app-button--dark app-button--small"><Plus size={14} />YouTube</button>
                <button type="button" onClick={() => addDraftBlock('uploaded_video')} className="app-button app-button--dark app-button--small"><Plus size={14} />Video</button>
                <button type="button" onClick={() => addDraftBlock('pdf')} className="app-button app-button--dark app-button--small"><Plus size={14} />PDF</button>
                <button type="button" onClick={() => addDraftBlock('image')} className="app-button app-button--dark app-button--small"><Plus size={14} />Imagem</button>
              </div>
            </div>

            {lessonBlockDrafts.length === 0 ? <div className="app-empty mt-6">Adicione o primeiro bloco do modulo.</div> : null}

            <div className="mt-6 space-y-4">
              {lessonBlockDrafts.map((block, blockIndex) => (
                <div key={block.tempId} className="app-panel app-panel--soft p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {blockTypeIcon(block.type)}
                      <strong>Bloco {blockIndex + 1}</strong>
                    </div>
                    <button type="button" onClick={() => setLessonBlockDrafts((current) => current.filter((entry) => entry.tempId !== block.tempId))} className="app-button app-button--danger app-button--small"><Trash2 size={14} />Remover</button>
                  </div>
                  <div className="mt-4 app-grid-2">
                    <label className="app-field"><span className="app-field__label">Tipo</span><select value={block.type} onChange={(event) => updateDraftBlock(block.tempId, (current) => ({ ...current, type: event.target.value as LearningLessonBlockType, sourceUrl: current.type === 'youtube' ? current.sourceUrl : '', storagePath: '', mimeType: '', fileName: '', thumbnailUrl: '', file: null }))} className="app-select"><option value="youtube">YouTube</option><option value="uploaded_video">Video</option><option value="pdf">PDF</option><option value="image">Imagem</option></select></label>
                    <label className="app-field"><span className="app-field__label">Ordem</span><input type="number" min={1} value={block.order} onChange={(event) => updateDraftBlock(block.tempId, (current) => ({ ...current, order: Number(event.target.value) }))} className="app-input" /></label>
                    <label className="app-field md:col-span-2"><span className="app-field__label">Titulo do bloco</span><input value={block.title} onChange={(event) => updateDraftBlock(block.tempId, (current) => ({ ...current, title: event.target.value }))} className="app-input" required /></label>

                    {block.type === 'youtube' ? (
                      <label className="app-field md:col-span-2">
                        <span className="app-field__label">URL do YouTube</span>
                        <input value={block.sourceUrl} onChange={(event) => updateDraftBlock(block.tempId, (current) => ({ ...current, sourceUrl: event.target.value }))} className="app-input" placeholder="https://www.youtube.com/watch?v=..." required />
                      </label>
                    ) : (
                      <>
                        <label className="app-field md:col-span-2">
                          <span className="app-field__label">Arquivo</span>
                          <label className="app-button app-button--dark app-button--small w-fit cursor-pointer">
                            <Upload size={14} />
                            {block.fileName || 'Selecionar arquivo'}
                            <input
                              type="file"
                              accept={block.type === 'uploaded_video' ? 'video/*' : block.type === 'pdf' ? 'application/pdf' : 'image/*'}
                              className="hidden"
                              onChange={(event) => {
                                const selectedFile = event.target.files?.[0] ?? null;
                                if (!selectedFile) {
                                  return;
                                }
                                updateDraftBlock(block.tempId, (current) => ({
                                  ...current,
                                  file: selectedFile,
                                  fileName: selectedFile.name,
                                  mimeType: selectedFile.type,
                                  title: current.title || selectedFile.name.replace(/\.[^.]+$/, ''),
                                }));
                              }}
                            />
                          </label>
                        </label>
                        {block.sourceUrl ? (
                          <div className="md:col-span-2 flex flex-wrap gap-3">
                            <a href={block.sourceUrl} target="_blank" rel="noreferrer" className="app-button app-button--dark app-button--small">
                              <ExternalLink size={14} />
                              Abrir arquivo atual
                            </a>
                            <span className="app-badge app-badge--muted">{block.fileName || block.mimeType || 'Arquivo pronto para uso'}</span>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button type="submit" disabled={busyKey === 'lesson'} className="app-button app-button--gold mt-6" style={{ '--save-accent': '#f59e0b', '--save-accent-dark': '#d97706' } as React.CSSProperties}><Save size={16} />{busyKey === 'lesson' ? 'Salvando...' : 'Salvar modulo'}</button>
        </form>
      </section>

      <section className={`app-grid-2 ${superadminTab === 'quizzes' ? '' : 'hidden'}`}>
        <form onSubmit={handleSaveQuiz} className="app-panel app-panel-pad md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell"><ClipboardCheck size={18} /></div>
              <div>
                <p className="app-section-label">Quiz</p>
                <h2 className="text-xl font-bold">Quiz opcional do modulo</h2>
              </div>
            </div>
            <button type="button" onClick={() => setQuizQuestions((current) => [...current, emptyQuestion()])} disabled={!lessonSelectionId || !quizEnabled} className="app-button app-button--dark app-button--small"><Plus size={14} />Pergunta</button>
          </div>
          {renderEditorAlerts()}

          <div className="mt-6 app-grid-2">
            <label className="app-field">
              <span className="app-field__label">Trilha pai</span>
              <select value={lessonForm.trackId} onChange={(event) => { const nextTrackId = event.target.value; const nextCourseId = sortByOrder(sortedCourses.filter((course) => course.trackId === nextTrackId))[0]?.id ?? ''; setLessonSelectionId(''); setLessonForm((current) => ({ ...current, trackId: nextTrackId, courseId: nextCourseId })); }} className="app-select" required>
                <option value="">Selecione uma trilha</option>
                {sortedTracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}
              </select>
            </label>
            <label className="app-field">
              <span className="app-field__label">Curso pai</span>
              <select value={lessonForm.courseId} onChange={(event) => { const nextCourseId = event.target.value; setLessonSelectionId(''); setLessonForm((current) => ({ ...current, courseId: nextCourseId })); }} className="app-select" required>
                <option value="">Selecione um curso</option>
                {sortByOrder(sortedCourses.filter((course) => course.trackId === lessonForm.trackId)).map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
              </select>
            </label>
            <label className="app-field md:col-span-2">
              <span className="app-field__label">Modulo para o quiz</span>
              <select value={lessonSelectionId} onChange={(event) => setLessonSelectionId(event.target.value)} className="app-select">
                <option value="">Selecione um modulo</option>
                {sortByOrder(sortedLessons.filter((lesson) => lesson.courseId === lessonForm.courseId)).map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title} • {contentLabel(lesson.status)}</option>)}
              </select>
            </label>
            <label className="app-field md:col-span-2">
              <span className="app-field__label">Modo do quiz</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setQuizEnabled(true)} className={`app-button app-button--small ${quizEnabled ? 'app-button--gold' : 'app-button--dark'}`}>Ativar quiz</button>
                <button type="button" onClick={() => setQuizEnabled(false)} className={`app-button app-button--small ${!quizEnabled ? 'app-button--gold' : 'app-button--dark'}`}>Sem quiz</button>
              </div>
            </label>
          </div>

          {lessonSelectionId && quizEnabled ? (
            <div className="mt-6 space-y-4">
              {quizQuestions.map((question, questionIndex) => (
                <div key={`quiz-question-${questionIndex}`} className="app-panel app-panel--soft p-4">
                  <div className="flex items-center justify-between gap-3">
                    <strong>Pergunta {questionIndex + 1}</strong>
                    <button type="button" onClick={() => setQuizQuestions((current) => current.filter((_, index) => index !== questionIndex))} disabled={quizQuestions.length <= 1} className="app-button app-button--danger app-button--small"><Trash2 size={14} />Remover</button>
                  </div>
                  <label className="app-field mt-4"><span className="app-field__label">Enunciado</span><input value={question.prompt} onChange={(event) => setQuizQuestions((current) => current.map((item, index) => index === questionIndex ? { ...item, prompt: event.target.value } : item))} className="app-input" required /></label>
                  <div className="mt-4 space-y-3">
                    {question.options.map((option, optionIndex) => (
                      <div key={`quiz-option-${questionIndex}-${optionIndex}`} className="flex items-center gap-3">
                        <input type="radio" checked={question.correctOptionIndex === optionIndex} onChange={() => setQuizQuestions((current) => current.map((item, index) => index === questionIndex ? { ...item, correctOptionIndex: optionIndex } : item))} />
                        <input value={option} onChange={(event) => setQuizQuestions((current) => current.map((item, index) => index === questionIndex ? { ...item, options: item.options.map((itemOption, itemOptionIndex) => itemOptionIndex === optionIndex ? event.target.value : itemOption) } : item))} className="app-input" placeholder={`Opcao ${optionIndex + 1}`} required />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : lessonSelectionId ? (
            <div className="app-panel app-panel--soft mt-6">
              <p className="text-sm">Este modulo sera publicado sem quiz. Salve para remover qualquer quiz existente.</p>
            </div>
          ) : (
            <div className="app-empty mt-6">Selecione um modulo para editar o quiz correspondente.</div>
          )}

          <button type="submit" disabled={busyKey === 'quiz' || !lessonSelectionId} className="app-button app-button--gold mt-6" style={{ '--save-accent': '#f43f5e', '--save-accent-dark': '#e11d48' } as React.CSSProperties}><Save size={16} />{busyKey === 'quiz' ? 'Salvando...' : 'Salvar quiz'}</button>
        </form>
      </section>

      <section className={`app-panel app-panel-pad ${superadminTab === 'catalog' ? '' : 'hidden'}`}>
        <div className="flex items-center gap-3">
          <div className="app-icon-shell"><BookOpen size={18} /></div>
          <div>
            <p className="app-section-label">Mapa do catalogo</p>
            <h2 className="text-xl font-bold">Trilhas, cursos, modulos e blocos</h2>
          </div>
        </div>
        <div className="mt-6 app-list">
          {sortedTracks.map((track) => (
            <div key={track.id} className="app-list-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">{track.title}</p>
                  <p className="mt-1 text-xs text-[color:var(--text-soft)]">{track.description || 'Sem descricao'}</p>
                </div>
                <span className={contentBadge(track.status)}>{contentLabel(track.status)}</span>
              </div>
              <div className="mt-4 space-y-3">
                {sortByOrder(sortedCourses.filter((course) => course.trackId === track.id)).map((course) => (
                  <div key={course.id} className="rounded-2xl border border-white/10 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold">{course.title}</p>
                        <p className="mt-1 text-xs text-[color:var(--text-soft)]">{course.description || 'Sem descricao'}</p>
                      </div>
                      <span className={contentBadge(course.status)}>{contentLabel(course.status)}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {sortByOrder(sortedLessons.filter((lesson) => lesson.courseId === course.id)).map((lesson) => {
                        const blocks = getEffectiveLessonBlocks(lesson, lessonBlocks);
                        return <span key={lesson.id} className={contentBadge(lesson.status)}>{lesson.title} • {blocks.length} blocos • quiz {lesson.quizQuestionCount}</span>;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default LearningHubView;
