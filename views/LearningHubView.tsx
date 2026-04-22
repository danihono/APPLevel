import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  CirclePlay,
  ClipboardCheck,
  Filter,
  Lock,
  Network,
  Plus,
  Save,
  ShieldCheck,
  TimerReset,
  Users,
} from 'lucide-react';
import LearningVideoPlayer from '../components/LearningVideoPlayer';
import ProgressBar from '../components/ProgressBar';
import type { FirestoreEntity } from '../services/firebase/data';
import type {
  AcademyRecord,
  LearningCourseRecord,
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

type OrderedLesson = {
  lesson: FirestoreEntity<LearningLessonRecord>;
  course: FirestoreEntity<LearningCourseRecord> | null;
};

type LessonRuntimeStatus = 'locked' | 'available' | 'watching' | 'ready' | 'completed';

type SuperadminLearningTab = 'overview' | 'tracks' | 'courses' | 'lessons' | 'quizzes' | 'catalog';

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
    videoUrl: string;
    order: number;
    status: 'draft' | 'published';
    passingScore: number;
  }) => Promise<{ lessonId: string; courseId: string; trackId: string }>;
  onUpsertQuiz: (payload: {
    lessonId: string;
    questions: Array<{
      prompt: string;
      options: string[];
      correctOptionIndex: number;
    }>;
  }) => Promise<{ lessonId: string }>;
  onRecordPlayback: (payload: {
    lessonId: string;
    currentSeconds: number;
    durationSeconds: number;
  }) => Promise<{ watchPercent: number; quizReady: boolean }>;
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

function sortByOrder<T extends { order: number; title: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title, 'pt-BR'));
}

function emptyQuestion(): QuizQuestionDraft {
  return { prompt: '', options: ['', '', '', ''], correctOptionIndex: 0 };
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
  if (status === 'completed') return 'Concluida';
  if (status === 'ready') return 'Quiz liberado';
  if (status === 'watching') return 'Em andamento';
  if (status === 'available') return 'Disponivel';
  return 'Bloqueada';
}

function isProfessor(user: FirestoreEntity<UserRecord>) {
  return user.role === 'professor';
}

function inferTrackLevel(
  track: FirestoreEntity<LearningTrackRecord>,
  index: number,
  total: number,
) {
  const source = `${track.title} ${track.description ?? ''}`.toLocaleLowerCase('pt-BR');

  if (source.includes('inic') || source.includes('fundament') || source.includes('basic')) {
    return 'Iniciante';
  }

  if (source.includes('intermedi') || source.includes('guarda')) {
    return 'Intermediario';
  }

  if (source.includes('avanc') || source.includes('compet') || source.includes('estrateg')) {
    return 'Avancado';
  }

  if (total <= 1) {
    return 'Iniciante';
  }

  const ratio = (index + 1) / total;
  if (ratio <= 0.34) {
    return 'Iniciante';
  }

  if (ratio <= 0.67) {
    return 'Intermediario';
  }

  return 'Avancado';
}

function buildOrderedLessons(
  trackId: string,
  courses: Array<FirestoreEntity<LearningCourseRecord>>,
  lessons: Array<FirestoreEntity<LearningLessonRecord>>,
): OrderedLesson[] {
  const trackCourses = sortByOrder(courses.filter((course) => course.trackId === trackId));
  const courseById = new Map(trackCourses.map((course) => [course.id, course]));

  return lessons
    .filter((lesson) => lesson.trackId === trackId && courseById.has(lesson.courseId))
    .sort((left, right) => {
      const courseDelta = (courseById.get(left.courseId)?.order ?? 0) - (courseById.get(right.courseId)?.order ?? 0);
      return courseDelta || left.order - right.order || left.title.localeCompare(right.title, 'pt-BR');
    })
    .map((lesson) => ({ lesson, course: courseById.get(lesson.courseId) ?? null }));
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

  const current = progressByLessonId.get(lessonId);
  if (current?.quizPassed) {
    return 'completed';
  }

  if (lessonIndex > 0) {
    const previousLessonId = orderedLessons[lessonIndex - 1].lesson.id;
    if (!progressByLessonId.get(previousLessonId)?.quizPassed && !current) {
      return 'locked';
    }
  }

  if (current?.quizReady) {
    return 'ready';
  }

  if ((current?.watchPercent ?? 0) > 0) {
    return 'watching';
  }

  return 'available';
}

const superadminLearningTabs: Array<{
  id: SuperadminLearningTab;
  label: string;
  title: string;
  description: string;
}> = [
  {
    id: 'overview',
    label: 'Visao geral',
    title: 'Relatorios e acompanhamento da rede',
    description: 'Acompanhe academias, trilhas publicadas e o ritmo de capacitacao dos professores em um so lugar.',
  },
  {
    id: 'tracks',
    label: 'Trilhas',
    title: 'Governanca de trilhas',
    description: 'Crie, ordene e publique as trilhas que estruturam a jornada de aprendizado da rede.',
  },
  {
    id: 'courses',
    label: 'Cursos',
    title: 'Estrutura de cursos',
    description: 'Organize cursos por trilha e mantenha a biblioteca editorial mais clara para a equipe.',
  },
  {
    id: 'lessons',
    label: 'Aulas',
    title: 'Cadastro de aulas',
    description: 'Centralize videos, descricoes e criterios de aprovacao sem misturar com outros blocos operacionais.',
  },
  {
    id: 'quizzes',
    label: 'Quizzes',
    title: 'Validacao de aprendizado',
    description: 'Edite perguntas e respostas por aula com um fluxo dedicado, sem depender da tela inteira.',
  },
  {
    id: 'catalog',
    label: 'Catalogo',
    title: 'Mapa consolidado do catalogo',
    description: 'Visualize a hierarquia completa entre trilhas, cursos e aulas publicadas ou em rascunho.',
  },
];

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
    quizzes,
    progressRecords,
    onSelectAcademy,
    onUpsertTrack,
    onUpsertCourse,
    onUpsertLesson,
    onUpsertQuiz,
    onRecordPlayback,
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
  }>({ title: '', description: '', order: 1, status: 'draft' });
  const [courseForm, setCourseForm] = useState<{
    trackId: string;
    title: string;
    description: string;
    order: number;
    status: 'draft' | 'published';
  }>({ trackId: '', title: '', description: '', order: 1, status: 'draft' });
  const [lessonForm, setLessonForm] = useState<{
    trackId: string;
    courseId: string;
    title: string;
    description: string;
    videoUrl: string;
    order: number;
    status: 'draft' | 'published';
    passingScore: number;
  }>({
    trackId: '',
    courseId: '',
    title: '',
    description: '',
    videoUrl: '',
    order: 1,
    status: 'draft' as const,
    passingScore: 80,
  });
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
  const [playerError, setPlayerError] = useState('');
  const [quizBusy, setQuizBusy] = useState(false);

  const playbackSentSecondsRef = useRef<Record<string, number>>({});
  const playbackPendingRef = useRef<Record<string, boolean>>({});

  const activeTrack = useMemo(
    () => publishedTracks.find((track) => track.id === activeTrackId) ?? publishedTracks[0] ?? null,
    [activeTrackId, publishedTracks],
  );
  const activeTrackLessons = useMemo(
    () => activeTrack ? buildOrderedLessons(activeTrack.id, publishedCourses, publishedLessons) : [],
    [activeTrack, publishedCourses, publishedLessons],
  );
  const activeLesson = useMemo(
    () => activeTrackLessons.find((entry) => entry.lesson.id === activeLessonId) ?? activeTrackLessons[0] ?? null,
    [activeLessonId, activeTrackLessons],
  );
  const activeLessonProgress = activeLesson ? ownProgressByLessonId.get(activeLesson.lesson.id) ?? null : null;
  const activeLessonStatus = activeLesson ? lessonRuntimeStatus(activeTrackLessons, ownProgressByLessonId, activeLesson.lesson.id) : 'locked';
  const reportProfessorUsers = selectedAcademyId ? academyUsers.filter(isProfessor) : allUsers.filter(isProfessor);
  const reportTrackLessons = useMemo(
    () => activeTrack ? buildOrderedLessons(activeTrack.id, publishedCourses, publishedLessons) : [],
    [activeTrack, publishedCourses, publishedLessons],
  );
  const consolidatedTrackRows = useMemo(() => publishedTracks.map((track) => {
    const trackLessons = buildOrderedLessons(track.id, publishedCourses, publishedLessons);
    const professorUsers = allUsers.filter(isProfessor);
    let startedUsers = 0;
    let completedUsers = 0;

    professorUsers.forEach((user) => {
      const userTrackProgress = progressRecords.filter((record) => record.userId === user.id && record.trackId === track.id);
      const completedLessons = trackLessons.filter((entry) => userTrackProgress.some((record) => record.lessonId === entry.lesson.id && record.quizPassed)).length;

      if (userTrackProgress.length > 0) {
        startedUsers += 1;
      }

      if (trackLessons.length > 0 && completedLessons === trackLessons.length) {
        completedUsers += 1;
      }
    });

    return {
      track,
      totalLessons: trackLessons.length,
      startedUsers,
      completedUsers,
    };
  }), [allUsers, progressRecords, publishedCourses, publishedLessons, publishedTracks]);
  const activeSuperadminTabMeta = superadminLearningTabs.find((tab) => tab.id === superadminTab) ?? superadminLearningTabs[0];

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
          videoUrl: selectedLesson.videoUrl,
          order: selectedLesson.order,
          status: selectedLesson.status,
          passingScore: selectedLesson.passingScore,
        });
        const existingQuiz = quizByLessonId.get(selectedLesson.id);
        setQuizQuestions(existingQuiz?.questions?.length
          ? existingQuiz.questions.map((question) => ({
            prompt: question.prompt,
            options: [...question.options],
            correctOptionIndex: question.correctOptionIndex,
          }))
          : [emptyQuestion()]);
        return;
      }
    }

    const fallbackTrackId = courseForm.trackId || trackSelectionId || sortedTracks[0]?.id || '';
    const fallbackCourseId = courseForm.trackId
      ? sortByOrder(sortedCourses.filter((course) => course.trackId === courseForm.trackId))[0]?.id ?? ''
      : '';
    setLessonForm({
      trackId: fallbackTrackId,
      courseId: fallbackCourseId,
      title: '',
      description: '',
      videoUrl: '',
      order: sortedLessons.filter((lesson) => lesson.courseId === fallbackCourseId).length + 1,
      status: 'draft',
      passingScore: 80,
    });
    setQuizQuestions([emptyQuestion()]);
  }, [courseForm.trackId, lessonSelectionId, quizByLessonId, sortedCourses, sortedLessons, sortedTracks, trackSelectionId]);

  const professorTrackStats = useMemo(() => {
    const totalLessons = activeTrackLessons.length;
    const completedLessons = activeTrackLessons.filter((entry) => ownProgressByLessonId.get(entry.lesson.id)?.quizPassed).length;
    const notStarted = activeTrackLessons.filter((entry) => !ownProgressByLessonId.has(entry.lesson.id)).length;
    const inProgress = totalLessons - completedLessons - notStarted;

    return {
      totalLessons,
      completedLessons,
      notStarted,
      inProgress,
      completionPercent: totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100),
    };
  }, [activeTrackLessons, ownProgressByLessonId]);
  const professorTrackRows = useMemo(() => publishedTracks.map((track, index) => {
    const orderedLessons = buildOrderedLessons(track.id, publishedCourses, publishedLessons);
    const completedLessons = orderedLessons.filter((entry) => ownProgressByLessonId.get(entry.lesson.id)?.quizPassed).length;
    const startedLessons = orderedLessons.filter((entry) => (ownProgressByLessonId.get(entry.lesson.id)?.watchPercent ?? 0) > 0).length;
    const completionPercent = orderedLessons.length === 0 ? 0 : Math.round((completedLessons / orderedLessons.length) * 100);
    const nextEntry = orderedLessons.find((entry) => {
      const status = lessonRuntimeStatus(orderedLessons, ownProgressByLessonId, entry.lesson.id);
      return status !== 'completed' && status !== 'locked';
    }) ?? orderedLessons[0] ?? null;

    return {
      track,
      lessonCount: orderedLessons.length,
      level: inferTrackLevel(track, index, publishedTracks.length),
      completionPercent,
      ctaLabel: completionPercent >= 100
        ? 'Rever trilha'
        : startedLessons > 0 || completedLessons > 0
          ? 'Continuar'
          : 'Comecar trilha',
      badgeLabel: completionPercent > 0 ? `${completionPercent}%` : 'Novo',
      nextLessonId: nextEntry?.lesson.id ?? '',
    };
  }), [ownProgressByLessonId, publishedCourses, publishedLessons, publishedTracks]);

  async function runEditorAction<T>(key: string, action: () => Promise<T>) {
    setBusyKey(key);
    setEditorSuccess('');
    setEditorError('');

    try {
      return await action();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Nao foi possivel salvar o conteudo.');
      throw error;
    } finally {
      setBusyKey('');
    }
  }

  async function handleSaveTrack(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await runEditorAction('track', () => onUpsertTrack({
      trackId: trackSelectionId || undefined,
      title: trackForm.title,
      description: trackForm.description || undefined,
      order: Number(trackForm.order),
      status: trackForm.status,
    }));
    setTrackSelectionId(result.trackId);
    setEditorSuccess('Trilha salva com sucesso.');
  }

  async function handleSaveCourse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await runEditorAction('course', () => onUpsertCourse({
      courseId: courseSelectionId || undefined,
      trackId: courseForm.trackId,
      title: courseForm.title,
      description: courseForm.description || undefined,
      order: Number(courseForm.order),
      status: courseForm.status,
    }));
    setCourseSelectionId(result.courseId);
    setEditorSuccess('Curso salvo com sucesso.');
  }

  async function handleSaveLesson(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await runEditorAction('lesson', () => onUpsertLesson({
      lessonId: lessonSelectionId || undefined,
      trackId: lessonForm.trackId,
      courseId: lessonForm.courseId,
      title: lessonForm.title,
      description: lessonForm.description || undefined,
      videoUrl: lessonForm.videoUrl,
      order: Number(lessonForm.order),
      status: lessonForm.status,
      passingScore: Number(lessonForm.passingScore),
    }));
    setTrackSelectionId(result.trackId);
    setCourseSelectionId(result.courseId);
    setLessonSelectionId(result.lessonId);
    setEditorSuccess('Aula salva com sucesso.');
  }

  async function handleSaveQuiz(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lessonSelectionId) {
      setEditorError('Selecione uma aula antes de salvar o quiz.');
      return;
    }

    await runEditorAction('quiz', () => onUpsertQuiz({
      lessonId: lessonSelectionId,
      questions: quizQuestions.map((question) => ({
        prompt: question.prompt,
        options: question.options.filter((option) => option.trim().length > 0),
        correctOptionIndex: question.correctOptionIndex,
      })),
    }));
    setEditorSuccess('Quiz salvo com sucesso.');
  }

  async function handleOpenQuiz() {
    if (!activeLesson) {
      return;
    }

    setQuizBusy(true);
    setQuizFeedback('');
    setQuizError('');
    try {
      const response = await onStartQuiz(activeLesson.lesson.id);
      setQuizSessionLessonId(activeLesson.lesson.id);
      setQuizSessionQuestions(response.questions);
      setQuizSessionAnswers(new Array(response.questions.length).fill(-1));
      setQuizPassingScore(response.passingScore);
      setQuizAttemptCount(response.attemptCount);
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : 'Nao foi possivel abrir o quiz.');
    } finally {
      setQuizBusy(false);
    }
  }

  async function handleSubmitActiveQuiz(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quizSessionLessonId) {
      return;
    }

    setQuizBusy(true);
    setQuizFeedback('');
    setQuizError('');
    try {
      const response = await onSubmitQuiz({ lessonId: quizSessionLessonId, answers: quizSessionAnswers });
      setQuizFeedback(
        response.passed
          ? `Quiz aprovado com ${response.scorePercent}% de acerto.`
          : `Quiz enviado com ${response.scorePercent}% de acerto. Tente novamente para atingir ${quizPassingScore}%.`,
      );
      setQuizAttemptCount((current) => current + 1);
      if (response.unlockedLessonId) {
        setActiveLessonId(response.unlockedLessonId);
        setQuizSessionLessonId('');
        setQuizSessionQuestions([]);
        setQuizSessionAnswers([]);
      }
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : 'Nao foi possivel enviar o quiz.');
    } finally {
      setQuizBusy(false);
    }
  }

  async function handlePlaybackProgress(payload: { currentSeconds: number; durationSeconds: number }) {
    if (!activeLesson) {
      return;
    }

    const lessonId = activeLesson.lesson.id;
    const lastSent = playbackSentSecondsRef.current[lessonId] ?? 0;
    const reachedMinimum = payload.durationSeconds > 0 && (payload.currentSeconds / payload.durationSeconds) >= 0.8;
    if (payload.currentSeconds < lastSent + 8 && !reachedMinimum) {
      return;
    }
    if (playbackPendingRef.current[lessonId]) {
      return;
    }

    playbackPendingRef.current[lessonId] = true;
    try {
      await onRecordPlayback(payload.durationSeconds > 0 ? { ...payload, lessonId } : { lessonId, currentSeconds: 0, durationSeconds: 1 });
      playbackSentSecondsRef.current[lessonId] = payload.currentSeconds;
      setPlayerError('');
    } catch (error) {
      setPlayerError(error instanceof Error ? error.message : 'Nao foi possivel registrar o progresso do video.');
    } finally {
      playbackPendingRef.current[lessonId] = false;
    }
  }

  if (isProfessorRole) {
    return (
      <div className="view-shell learning-mobile">
        <section className="learning-mobile__hero">
          <div>
            <p className="learning-mobile__eyebrow">Hub da equipe</p>
            <h1 className="learning-mobile__title">Learning Hub</h1>
            <p className="learning-mobile__copy">Trilhas de aprendizado da equipe {academyName}.</p>
          </div>
        </section>

        <section className="learning-mobile__section" aria-labelledby="learning-mobile-section-title">
          <p id="learning-mobile-section-title" className="learning-mobile__section-label">Trilhas disponiveis</p>

          {professorTrackRows.length > 0 ? (
            <div className="learning-mobile__track-list">
              {professorTrackRows.map((row) => {
                const isActive = activeTrack?.id === row.track.id;
                const lessonLabel = row.lessonCount === 1 ? '1 aula' : `${row.lessonCount} aulas`;

                return (
                  <article key={row.track.id} className={`learning-mobile__track-card ${isActive ? 'is-active' : ''}`}>
                    <div className="learning-mobile__track-head">
                      <div className="learning-mobile__track-copy">
                        <h2 className="learning-mobile__track-title">{row.track.title}</h2>
                        <p className="learning-mobile__track-meta">{lessonLabel} - {row.level}</p>
                      </div>
                      <span className={`learning-mobile__track-badge ${row.badgeLabel === 'Novo' ? 'is-new' : ''}`}>{row.badgeLabel}</span>
                    </div>

                    <div className="learning-mobile__track-progress">
                      <ProgressBar current={row.completionPercent} total={100} />
                    </div>

                    <button
                      type="button"
                      className="learning-mobile__track-cta"
                      onClick={() => {
                        setActiveTrackId(row.track.id);
                        setActiveLessonId(row.nextLessonId);
                      }}
                    >
                      {row.ctaLabel}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="learning-mobile__empty">
              Ainda nao existe nenhuma trilha publicada. Assim que o catalogo for liberado, ele aparece aqui.
            </div>
          )}
        </section>
      </div>
    );

    if (publishedTracks.length === 0) {
      return (
        <div className="view-shell">
          <section className="app-panel app-panel-pad">
            <p className="text-sm font-bold">{academyName}</p>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              Ainda nao existe nenhuma trilha publicada. Assim que o superadmin publicar o catalogo, ele aparecera aqui.
            </p>
          </section>
        </div>
      );
    }

    return (
      <div className="view-shell">
        <section className="app-panel app-panel-pad">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold">{academyName}</p>
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                Videos, trilhas e quizzes obrigatorios para apoiar a rotina da equipe.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="app-badge app-badge--muted">Master Black</span>
              <span className="app-badge app-badge--muted">Modo telespectador</span>
            </div>
          </div>
        </section>

        <section className="app-stat-grid">
          <article className="app-stat-card">
            <p className="app-stat-card__label">Trilhas publicadas</p>
            <p className="app-stat-card__value">{publishedTracks.length}</p>
          </article>
          <article className="app-stat-card">
            <p className="app-stat-card__label">Aulas concluidas</p>
            <p className="app-stat-card__value">{professorTrackStats.completedLessons}</p>
          </article>
          <article className="app-stat-card">
            <p className="app-stat-card__label">Seu progresso</p>
            <p className="app-stat-card__value">{professorTrackStats.completionPercent}%</p>
          </article>
        </section>

        <section className="app-panel app-panel-pad">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell"><Filter size={18} /></div>
              <div>
                <p className="app-section-label">Trilha em foco</p>
                <h2 className="text-xl font-bold">{activeTrack?.title ?? 'Selecione uma trilha'}</h2>
              </div>
            </div>
            <label className="app-field min-w-[18rem]">
              <span className="app-field__label">Trilha</span>
              <select value={activeTrack?.id ?? ''} onChange={(event) => setActiveTrackId(event.target.value)} className="app-select">
                {publishedTracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-6">
            <ProgressBar label="Progresso da trilha" current={professorTrackStats.completedLessons} total={Math.max(professorTrackStats.totalLessons, 1)} />
          </div>
        </section>

        <section className="app-grid-2">
          <article className="app-panel app-panel-pad">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell"><BookOpen size={18} /></div>
              <div>
                <p className="app-section-label">Biblioteca</p>
                <h2 className="text-xl font-bold">Aulas da trilha</h2>
              </div>
            </div>
            <div className="mt-6 app-list">
              {activeTrackLessons.map((entry) => {
                const runtimeStatus = lessonRuntimeStatus(activeTrackLessons, ownProgressByLessonId, entry.lesson.id);
                const progress = ownProgressByLessonId.get(entry.lesson.id);
                return (
                  <button key={entry.lesson.id} type="button" onClick={() => runtimeStatus !== 'locked' && setActiveLessonId(entry.lesson.id)} disabled={runtimeStatus === 'locked'} className="app-list-card text-left">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold">{entry.lesson.title}</p>
                        <p className="mt-1 text-xs text-[color:var(--text-soft)]">{entry.course?.title ?? 'Curso'} • nota minima {entry.lesson.passingScore}%</p>
                        <p className="mt-2 text-xs text-[color:var(--text-muted)]">{progress ? `${progress.watchPercent}% assistido` : 'Aguardando inicio'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {runtimeStatus === 'locked' ? <Lock size={16} /> : null}
                        <span className={statusBadge(runtimeStatus)}>{statusLabel(runtimeStatus)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </article>

          <article className="app-panel app-panel-pad">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell"><CirclePlay size={18} /></div>
              <div>
                <p className="app-section-label">Aula atual</p>
                <h2 className="text-xl font-bold">{activeLesson?.lesson.title ?? 'Selecione uma aula'}</h2>
              </div>
            </div>

            {activeLesson ? (
              <>
                <div className="mt-6">
                  {activeLessonStatus === 'locked'
                    ? <div className="app-empty">Conclua a aula anterior para liberar este conteudo.</div>
                    : <LearningVideoPlayer lessonKey={activeLesson.lesson.id} videoUrl={activeLesson.lesson.videoUrl} onProgress={handlePlaybackProgress} />}
                </div>

                <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-soft)]">Proxima acao</p>
                  <p className="mt-2 text-lg font-bold">{firstName}, avance ate 80% do video para abrir o quiz.</p>
                  <p className="mt-2 text-sm text-[color:var(--text-muted)]">{activeLesson.lesson.description || 'O quiz libera automaticamente quando voce atinge o minimo exigido da aula.'}</p>
                  <div className="mt-4">
                    <ProgressBar label="Progresso do video" current={Math.min(activeLessonProgress?.watchPercent ?? 0, 100)} total={100} />
                  </div>
                  {playerError ? <div className="app-alert app-alert--error mt-4">{playerError}</div> : null}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => void handleOpenQuiz()} disabled={quizBusy || (!activeLessonProgress?.quizReady && !activeLessonProgress?.quizPassed)} className="app-button app-button--gold">
                    <ClipboardCheck size={16} />
                    {quizBusy ? 'Processando...' : activeLessonProgress?.quizPassed ? 'Refazer quiz' : 'Abrir quiz'}
                  </button>
                  <span className="app-badge app-badge--muted">Tentativas: {activeLessonProgress?.attemptCount ?? 0}</span>
                </div>

                {quizSessionLessonId === activeLesson.lesson.id && quizSessionQuestions.length > 0 ? (
                  <form onSubmit={handleSubmitActiveQuiz} className="mt-6 space-y-4">
                    {quizFeedback ? <div className="app-alert app-alert--success">{quizFeedback}</div> : null}
                    {quizError ? <div className="app-alert app-alert--error">{quizError}</div> : null}
                    {quizSessionQuestions.map((question, questionIndex) => (
                      <div key={question.id} className="app-panel app-panel--soft p-4">
                        <p className="text-sm font-bold">{questionIndex + 1}. {question.prompt}</p>
                        <div className="mt-4 space-y-3">
                          {question.options.map((option, optionIndex) => (
                            <label key={`${question.id}-${optionIndex}`} className="app-field flex items-center gap-3">
                              <input type="radio" name={`quiz-${question.id}`} checked={quizSessionAnswers[questionIndex] === optionIndex} onChange={() => setQuizSessionAnswers((current) => current.map((answer, index) => index === questionIndex ? optionIndex : answer))} />
                              <span>{option}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button type="submit" disabled={quizBusy} className="app-button app-button--gold">
                      <CheckCircle2 size={16} />
                      {quizBusy ? 'Enviando...' : `Enviar quiz (${quizPassingScore}% minimo)`}
                    </button>
                  </form>
                ) : null}
              </>
            ) : <div className="app-empty mt-6">Selecione uma aula para assistir e validar o aprendizado.</div>}
          </article>
        </section>

        <section className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell"><TimerReset size={18} /></div>
            <div>
              <p className="app-section-label">Status</p>
              <h2 className="text-xl font-bold">Panorama da trilha</h2>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="app-list-card"><p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Nao iniciado</p><p className="mt-2 text-2xl font-bold">{professorTrackStats.notStarted}</p></div>
            <div className="app-list-card"><p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Em andamento</p><p className="mt-2 text-2xl font-bold">{professorTrackStats.inProgress}</p></div>
            <div className="app-list-card"><p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Concluido</p><p className="mt-2 text-2xl font-bold">{professorTrackStats.completedLessons}</p></div>
          </div>
        </section>
      </div>
    );
  }

  const reportRows = reportProfessorUsers.map((user) => {
    const progressByLesson = new Map(progressRecords.filter((record) => record.userId === user.id && record.trackId === activeTrack?.id).map((record) => [record.lessonId, record]));
    const completed = reportTrackLessons.filter((entry) => progressByLesson.get(entry.lesson.id)?.quizPassed).length;
    const currentEntry = reportTrackLessons.find((entry) => lessonRuntimeStatus(reportTrackLessons, progressByLesson, entry.lesson.id) !== 'completed') ?? reportTrackLessons[reportTrackLessons.length - 1] ?? null;
    return { user, progressByLesson, completed, currentEntry };
  });
  const renderEditorAlerts = () => (
    <>
      {editorSuccess ? <div className="app-alert app-alert--success mt-6">{editorSuccess}</div> : null}
      {editorError ? <div className="app-alert app-alert--error mt-6">{editorError}</div> : null}
    </>
  );

  return (
    <div className="view-shell">
      <section className="app-panel app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-section-label">Navegacao da hub</p>
            <h2 className="text-xl font-bold">{activeSuperadminTabMeta.title}</h2>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">{activeSuperadminTabMeta.description}</p>
          </div>
          <div className="app-orb">{superadminLearningTabs.length} secoes</div>
        </div>

        <div className="mt-6">
          <div className="app-segment learning-superadmin-tabs" role="tablist" aria-label="Secoes da learning hub do superadmin">
            {superadminLearningTabs.map((tab) => {
              const isActive = superadminTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`learning-superadmin-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`learning-superadmin-panel-${tab.id}`}
                  onClick={() => setSuperadminTab(tab.id)}
                  className={`app-segment__button learning-superadmin-tabs__button ${isActive ? 'is-active' : ''}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div
        id={`learning-superadmin-panel-${superadminTab}`}
        role="tabpanel"
        aria-labelledby={`learning-superadmin-tab-${superadminTab}`}
        className="learning-superadmin-panel"
      >
        {superadminTab === 'overview' ? (
          <section className="app-panel app-panel--hero app-panel-pad">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="app-section-label">Learning hub</p>
                <h1 className="app-section-title">Governanca do catalogo e progresso da rede</h1>
                <p className="app-section-copy">Crie trilhas globais, publique cursos e acompanhe a capacitacao dos professores por academia.</p>
              </div>
              <div className="app-orb"><ShieldCheck size={16} />Superadmin</div>
            </div>
            <div className="app-stat-grid mt-6">
              <article className="app-stat-card"><p className="app-stat-card__label">Academias</p><p className="app-stat-card__value">{academies.length}</p></article>
              <article className="app-stat-card"><p className="app-stat-card__label">Trilhas</p><p className="app-stat-card__value">{sortedTracks.length}</p></article>
              <article className="app-stat-card"><p className="app-stat-card__label">Cursos publicados</p><p className="app-stat-card__value">{publishedCourses.length}</p></article>
              <article className="app-stat-card"><p className="app-stat-card__label">Aulas publicadas</p><p className="app-stat-card__value">{publishedLessons.length}</p></article>
              <article className="app-stat-card"><p className="app-stat-card__label">Quizzes</p><p className="app-stat-card__value">{quizzes.length}</p></article>
              <article className="app-stat-card"><p className="app-stat-card__label">Professores</p><p className="app-stat-card__value">{allUsers.filter(isProfessor).length}</p></article>
            </div>
          </section>
        ) : null}

        {superadminTab === 'overview' ? (
          <section className="app-panel app-panel-pad">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="app-icon-shell"><Network size={18} /></div>
                <div>
                  <p className="app-section-label">Filtro operacional</p>
                  <h2 className="text-xl font-bold">{selectedAcademy?.name ?? 'Rede inteira'}</h2>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="app-field min-w-[18rem]">
                  <span className="app-field__label">Academia</span>
                  <select value={selectedAcademyId ?? ''} onChange={(event) => onSelectAcademy?.(event.target.value)} className="app-select">
                    <option value="">Rede inteira</option>
                    {academies.map((academyOption) => <option key={academyOption.id} value={academyOption.id}>{academyOption.name}</option>)}
                  </select>
                </label>
                <label className="app-field min-w-[18rem]">
                  <span className="app-field__label">Trilha analisada</span>
                  <select value={activeTrack?.id ?? ''} onChange={(event) => setActiveTrackId(event.target.value)} className="app-select" disabled={publishedTracks.length === 0}>
                    {publishedTracks.length === 0 ? <option value="">Nenhuma trilha publicada</option> : null}
                    {publishedTracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}
                  </select>
                </label>
              </div>
            </div>
          </section>
        ) : null}

        {superadminTab === 'overview' ? (
          <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell"><Users size={18} /></div>
          <div>
            <p className="app-section-label">{selectedAcademyId ? 'Academia em foco' : 'Rede inteira'}</p>
            <h2 className="text-xl font-bold">Professores e status da trilha</h2>
          </div>
        </div>
        {publishedTracks.length === 0 ? (
          <div className="app-empty mt-6">Publique pelo menos uma trilha para liberar o acompanhamento de progresso da rede.</div>
        ) : !selectedAcademyId ? (
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {consolidatedTrackRows.map((row) => (
              <div key={row.track.id} className="app-list-card">
                <p className="text-sm font-bold">{row.track.title}</p>
                <p className="mt-2 text-xs text-[color:var(--text-soft)]">{row.totalLessons} aulas publicadas</p>
                <p className="mt-2 text-sm text-[color:var(--text-muted)]">{row.startedUsers} professores iniciaram • {row.completedUsers} concluiram</p>
              </div>
            ))}
          </div>
        ) : null}
        {publishedTracks.length > 0 ? (
        <div className="mt-6 app-list">
          {reportRows.map((row) => (
            <div key={row.user.id} className="app-list-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">{row.user.displayName}</p>
                  <p className="mt-1 text-xs text-[color:var(--text-soft)]">{row.completed}/{reportTrackLessons.length} aulas concluidas</p>
                </div>
                <span className="app-badge app-badge--muted">{row.currentEntry ? `Atual: ${row.currentEntry.lesson.title}` : 'Sem aulas publicadas'}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {reportTrackLessons.map((entry) => {
                  const runtimeStatus = lessonRuntimeStatus(reportTrackLessons, row.progressByLesson, entry.lesson.id);
                  return <span key={`${row.user.id}-${entry.lesson.id}`} className={statusBadge(runtimeStatus)}>{entry.lesson.title} • {statusLabel(runtimeStatus)}</span>;
                })}
              </div>
            </div>
          ))}
          {reportRows.length === 0 ? <div className="app-empty">Nenhum professor encontrado no recorte atual.</div> : null}
        </div>
        ) : null}
          </section>
        ) : null}

      <section className={`app-grid-2 ${superadminTab === 'tracks' || superadminTab === 'courses' ? '' : 'hidden'}`}>
        <form onSubmit={handleSaveTrack} className={`app-panel app-panel-pad md:col-span-2 ${superadminTab === 'tracks' ? '' : 'hidden'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3"><div className="app-icon-shell"><BookOpen size={18} /></div><div><p className="app-section-label">Trilha</p><h2 className="text-xl font-bold">Editor de trilhas</h2></div></div>
            <button type="button" onClick={() => setTrackSelectionId('')} className="app-button app-button--dark app-button--small"><Plus size={14} />Nova</button>
          </div>
          {renderEditorAlerts()}
          <div className="mt-6 app-grid-2">
            <label className="app-field md:col-span-2"><span className="app-field__label">Trilha existente</span><select value={trackSelectionId} onChange={(event) => setTrackSelectionId(event.target.value)} className="app-select"><option value="">Nova trilha</option>{sortedTracks.map((track) => <option key={track.id} value={track.id}>{track.title} • {contentLabel(track.status)}</option>)}</select></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Titulo</span><input value={trackForm.title} onChange={(event) => setTrackForm((current) => ({ ...current, title: event.target.value }))} className="app-input" required /></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Descricao</span><textarea value={trackForm.description} onChange={(event) => setTrackForm((current) => ({ ...current, description: event.target.value }))} className="app-input min-h-[7rem]" /></label>
            <label className="app-field"><span className="app-field__label">Ordem</span><input type="number" min={1} value={trackForm.order} onChange={(event) => setTrackForm((current) => ({ ...current, order: Number(event.target.value) }))} className="app-input" /></label>
            <label className="app-field"><span className="app-field__label">Status</span><select value={trackForm.status} onChange={(event) => setTrackForm((current) => ({ ...current, status: event.target.value as 'draft' | 'published' }))} className="app-select"><option value="draft">Rascunho</option><option value="published">Publicado</option></select></label>
          </div>
          <button type="submit" disabled={busyKey === 'track'} className="app-button app-button--gold mt-6"><Save size={16} />{busyKey === 'track' ? 'Salvando...' : 'Salvar trilha'}</button>
        </form>

        <form onSubmit={handleSaveCourse} className={`app-panel app-panel-pad md:col-span-2 ${superadminTab === 'courses' ? '' : 'hidden'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3"><div className="app-icon-shell"><BookOpen size={18} /></div><div><p className="app-section-label">Curso</p><h2 className="text-xl font-bold">Editor de cursos</h2></div></div>
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
          <button type="submit" disabled={busyKey === 'course'} className="app-button app-button--gold mt-6"><Save size={16} />{busyKey === 'course' ? 'Salvando...' : 'Salvar curso'}</button>
        </form>
      </section>

      <section className={`app-grid-2 ${superadminTab === 'lessons' || superadminTab === 'quizzes' ? '' : 'hidden'}`}>
        <form onSubmit={handleSaveLesson} className={`app-panel app-panel-pad md:col-span-2 ${superadminTab === 'lessons' ? '' : 'hidden'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3"><div className="app-icon-shell"><CirclePlay size={18} /></div><div><p className="app-section-label">Aula</p><h2 className="text-xl font-bold">Editor de aulas</h2></div></div>
            <button type="button" onClick={() => setLessonSelectionId('')} className="app-button app-button--dark app-button--small"><Plus size={14} />Nova</button>
          </div>
          {renderEditorAlerts()}
          <div className="mt-6 app-grid-2">
            <label className="app-field"><span className="app-field__label">Trilha pai</span><select value={lessonForm.trackId} onChange={(event) => { const nextTrackId = event.target.value; const nextCourseId = sortByOrder(sortedCourses.filter((course) => course.trackId === nextTrackId))[0]?.id ?? ''; setLessonSelectionId(''); setLessonForm((current) => ({ ...current, trackId: nextTrackId, courseId: nextCourseId })); }} className="app-select" required><option value="">Selecione uma trilha</option>{sortedTracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}</select></label>
            <label className="app-field"><span className="app-field__label">Curso pai</span><select value={lessonForm.courseId} onChange={(event) => { const nextCourseId = event.target.value; setLessonSelectionId(''); setLessonForm((current) => ({ ...current, courseId: nextCourseId })); }} className="app-select" required><option value="">Selecione um curso</option>{sortByOrder(sortedCourses.filter((course) => course.trackId === lessonForm.trackId)).map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Aula existente</span><select value={lessonSelectionId} onChange={(event) => setLessonSelectionId(event.target.value)} className="app-select"><option value="">Nova aula</option>{sortByOrder(sortedLessons.filter((lesson) => lesson.courseId === lessonForm.courseId)).map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title} • {contentLabel(lesson.status)}</option>)}</select></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Titulo</span><input value={lessonForm.title} onChange={(event) => setLessonForm((current) => ({ ...current, title: event.target.value }))} className="app-input" required /></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Descricao</span><textarea value={lessonForm.description} onChange={(event) => setLessonForm((current) => ({ ...current, description: event.target.value }))} className="app-input min-h-[7rem]" /></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">URL do YouTube</span><input value={lessonForm.videoUrl} onChange={(event) => setLessonForm((current) => ({ ...current, videoUrl: event.target.value }))} className="app-input" placeholder="https://www.youtube.com/watch?v=..." required /></label>
            <label className="app-field"><span className="app-field__label">Ordem</span><input type="number" min={1} value={lessonForm.order} onChange={(event) => setLessonForm((current) => ({ ...current, order: Number(event.target.value) }))} className="app-input" /></label>
            <label className="app-field"><span className="app-field__label">Nota minima (%)</span><input type="number" min={1} max={100} value={lessonForm.passingScore} onChange={(event) => setLessonForm((current) => ({ ...current, passingScore: Number(event.target.value) }))} className="app-input" /></label>
            <label className="app-field md:col-span-2"><span className="app-field__label">Status</span><select value={lessonForm.status} onChange={(event) => setLessonForm((current) => ({ ...current, status: event.target.value as 'draft' | 'published' }))} className="app-select"><option value="draft">Rascunho</option><option value="published">Publicado</option></select></label>
          </div>
          <button type="submit" disabled={busyKey === 'lesson'} className="app-button app-button--gold mt-6"><Save size={16} />{busyKey === 'lesson' ? 'Salvando...' : 'Salvar aula'}</button>
        </form>

        <form onSubmit={handleSaveQuiz} className={`app-panel app-panel-pad md:col-span-2 ${superadminTab === 'quizzes' ? '' : 'hidden'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3"><div className="app-icon-shell"><ClipboardCheck size={18} /></div><div><p className="app-section-label">Quiz</p><h2 className="text-xl font-bold">Editor do quiz</h2></div></div>
            <button type="button" onClick={() => setQuizQuestions((current) => [...current, emptyQuestion()])} disabled={!lessonSelectionId} className="app-button app-button--dark app-button--small"><Plus size={14} />Pergunta</button>
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
              <span className="app-field__label">Aula para o quiz</span>
              <select value={lessonSelectionId} onChange={(event) => setLessonSelectionId(event.target.value)} className="app-select">
                <option value="">Selecione uma aula</option>
                {sortByOrder(sortedLessons.filter((lesson) => lesson.courseId === lessonForm.courseId)).map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title} • {contentLabel(lesson.status)}</option>)}
              </select>
            </label>
          </div>
          {lessonSelectionId ? (
            <div className="mt-6 space-y-4">
              {quizQuestions.map((question, questionIndex) => (
                <div key={`quiz-question-${questionIndex}`} className="app-panel app-panel--soft p-4">
                  <label className="app-field"><span className="app-field__label">Pergunta {questionIndex + 1}</span><input value={question.prompt} onChange={(event) => setQuizQuestions((current) => current.map((item, index) => index === questionIndex ? { ...item, prompt: event.target.value } : item))} className="app-input" required /></label>
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
          ) : <div className="app-empty mt-6">Selecione uma aula para editar o quiz correspondente.</div>}
          <button type="submit" disabled={busyKey === 'quiz' || !lessonSelectionId} className="app-button app-button--gold mt-6"><Save size={16} />{busyKey === 'quiz' ? 'Salvando...' : 'Salvar quiz'}</button>
        </form>
      </section>

      <section className={`app-panel app-panel-pad ${superadminTab === 'catalog' ? '' : 'hidden'}`}>
        <div className="flex items-center gap-3">
          <div className="app-icon-shell"><BookOpen size={18} /></div>
          <div>
            <p className="app-section-label">Mapa do catalogo</p>
            <h2 className="text-xl font-bold">Trilhas, cursos e aulas</h2>
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
              <div className="mt-4 flex flex-wrap gap-2">
                {sortByOrder(sortedCourses.filter((course) => course.trackId === track.id)).flatMap((course) => sortByOrder(sortedLessons.filter((lesson) => lesson.courseId === course.id)).map((lesson) => (
                  <span key={lesson.id} className={contentBadge(lesson.status)}>{course.title}: {lesson.title} • quiz {lesson.quizQuestionCount}</span>
                )))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
    </div>
  );
};

export default LearningHubView;
