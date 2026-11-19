import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Lock,
  Play,
  Send,
  Video,
} from 'lucide-react';
import LearningVideoPlayer from '../../components/LearningVideoPlayer';
import { useRedesignShell } from '../../components/redesign/ShellContext';
import { computeEffectiveAudience, matchesEffectiveAudience } from '../../learningAudience';
import {
  blockTypeLabel,
  buildOrderedLessons,
  lessonRuntimeStatus,
  sortByOrder,
  statusLabel,
  type CourseEntity,
  type LessonBlockEntity,
  type LessonEntity,
  type LessonRuntimeStatus,
  type OrderedLesson,
  type ProgressEntity,
  type QuizQuestionSession,
  type TrackEntity,
} from './learningShared';
import type { LearningPlayerHandlers } from './learningHandlers';
import { LIGHT_TRACK_COLORS, lessonCover, trackColor, trackIcon } from './learningLook';
import type { LearningLessonBlockType } from '../../services/firebase/models';
import { t } from '../../i18n';
import './learning-player.css';

interface LearningPlayerViewProps extends LearningPlayerHandlers {
  academyName: string;
  userName: string;
  /** Papel real do usuário logado (não a visão simulada do superadmin). */
  viewerRole?: string;
  viewerBelt?: string;
  tracks: TrackEntity[];
  courses: CourseEntity[];
  lessons: LessonEntity[];
  lessonBlocks: LessonBlockEntity[];
  progressRecords: ProgressEntity[];
}

type Screen = 'home' | 'track' | 'lesson';

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

function statusTone(status: LessonRuntimeStatus): string {
  if (status === 'completed') return 'is-done';
  if (status === 'ready' || status === 'watching') return 'is-going';
  if (status === 'locked') return 'is-locked';
  return '';
}

const UploadedVideoPlayer: React.FC<{
  blockKey: string;
  sourceUrl: string;
  disabled?: boolean;
  onProgress: (payload: { currentSeconds: number; durationSeconds: number }) => void;
}> = ({ blockKey, sourceUrl, disabled = false, onProgress }) => {
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

    onProgress({ currentSeconds, durationSeconds });
  };

  if (!sourceUrl) {
    return <div className="rd-learn__empty">{t('Este bloco ainda não tem um vídeo válido.')}</div>;
  }

  return (
    <div className="app-video-frame rd-learn__video">
      <video
        ref={videoRef}
        className="h-full w-full"
        controls
        playsInline
        src={sourceUrl}
        onLoadedMetadata={emitProgress}
        onEnded={emitProgress}
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

/**
 * Consumo do Learning Hub para aluno e professor. Só renderiza o que o público
 * efetivo do usuário libera — o backend impõe a mesma regra em cada callable.
 *
 * Três telas no mesmo lugar: Início do Learning (continuar + trilhas + cursos), a trilha
 * (módulos em ordem, com a trava do próximo) e o módulo (blocos + quiz).
 */
const LearningPlayerView: React.FC<LearningPlayerViewProps> = ({
  academyName,
  userName,
  viewerRole,
  viewerBelt,
  tracks,
  courses,
  lessons,
  lessonBlocks,
  progressRecords,
  onRecordPlayback,
  onMarkBlockComplete,
  onStartQuiz,
  onSubmitQuiz,
}) => {
  const shell = useRedesignShell();
  const firstName = userName.split(' ')[0] ?? userName;
  const isStudent = viewerRole === 'student';

  const [screen, setScreen] = useState<Screen>('home');
  const [activeTrackId, setActiveTrackId] = useState('');
  const [activeLessonId, setActiveLessonId] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [quizSessionLessonId, setQuizSessionLessonId] = useState('');
  const [quizSessionQuestions, setQuizSessionQuestions] = useState<QuizQuestionSession[]>([]);
  const [quizSessionAnswers, setQuizSessionAnswers] = useState<number[]>([]);
  const [quizPassingScore, setQuizPassingScore] = useState(80);
  const [quizFeedback, setQuizFeedback] = useState('');
  const [quizError, setQuizError] = useState('');
  const [quizBusy, setQuizBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [manualBlockBusyId, setManualBlockBusyId] = useState('');

  const playbackSentSecondsRef = useRef<Record<string, number>>({});
  const playbackPendingRef = useRef<Record<string, boolean>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);

  const viewer = useMemo(() => ({ role: viewerRole, belt: viewerBelt }), [viewerBelt, viewerRole]);

  const publishedTracks = useMemo(
    () => sortByOrder(tracks.filter((track) => track.status === 'published')),
    [tracks],
  );
  const publishedCourses = useMemo(
    () => sortByOrder(courses.filter((course) => course.status === 'published')),
    [courses],
  );

  const courseById = useMemo(() => new Map(publishedCourses.map((course) => [course.id, course])), [publishedCourses]);
  const trackById = useMemo(() => new Map(publishedTracks.map((track) => [track.id, track])), [publishedTracks]);
  const trackOrderIds = useMemo(() => publishedTracks.map((track) => track.id), [publishedTracks]);

  /** Módulos publicados cujo público efetivo inclui este usuário. */
  const visibleLessons = useMemo(() => lessons.filter((lesson) => {
    if (lesson.status !== 'published') {
      return false;
    }

    const track = trackById.get(lesson.trackId);
    const course = courseById.get(lesson.courseId);
    if (!track || !course) {
      return false;
    }

    return matchesEffectiveAudience(computeEffectiveAudience(track, course, lesson), viewer);
  }), [courseById, lessons, trackById, viewer]);

  const visibleTracks = useMemo(() => {
    const trackIdsWithContent = new Set(visibleLessons.map((lesson) => lesson.trackId));
    return publishedTracks.filter((track) => trackIdsWithContent.has(track.id));
  }, [publishedTracks, visibleLessons]);

  const ownProgressByLessonId = useMemo(
    () => new Map(progressRecords.map((record) => [record.lessonId, record])),
    [progressRecords],
  );

  /** Módulos em ordem de cada trilha visível (a trava do próximo depende desta ordem). */
  const lessonsByTrack = useMemo(() => {
    const map = new Map<string, OrderedLesson[]>();
    visibleTracks.forEach((track) => {
      map.set(track.id, buildOrderedLessons(track.id, publishedCourses, visibleLessons, lessonBlocks));
    });
    return map;
  }, [lessonBlocks, publishedCourses, visibleLessons, visibleTracks]);

  const activeTrack = useMemo(
    () => visibleTracks.find((track) => track.id === activeTrackId) ?? visibleTracks[0] ?? null,
    [activeTrackId, visibleTracks],
  );

  const activeTrackLessons = useMemo(
    () => (activeTrack ? lessonsByTrack.get(activeTrack.id) ?? [] : []),
    [activeTrack, lessonsByTrack],
  );

  const activeLesson = useMemo(
    () => activeTrackLessons.find((entry) => entry.lesson.id === activeLessonId) ?? activeTrackLessons[0] ?? null,
    [activeLessonId, activeTrackLessons],
  );

  const activeLessonProgress = activeLesson ? ownProgressByLessonId.get(activeLesson.lesson.id) ?? null : null;
  const activeLessonStatus = activeLesson
    ? lessonRuntimeStatus(activeTrackLessons, ownProgressByLessonId, activeLesson.lesson.id)
    : 'locked';

  useEffect(() => {
    if (visibleTracks.length === 0) {
      setActiveTrackId('');
      return;
    }

    if (!visibleTracks.some((track) => track.id === activeTrackId)) {
      setActiveTrackId(visibleTracks[0].id);
    }
  }, [activeTrackId, visibleTracks]);

  // Abre no primeiro módulo ainda não concluído, para o usuário cair onde parou.
  useEffect(() => {
    if (activeTrackLessons.length === 0) {
      setActiveLessonId('');
      return;
    }

    if (activeTrackLessons.some((entry) => entry.lesson.id === activeLessonId)) {
      return;
    }

    const preferred = activeTrackLessons.find((entry) => {
      const runtime = lessonRuntimeStatus(activeTrackLessons, ownProgressByLessonId, entry.lesson.id);
      return runtime !== 'completed' && runtime !== 'locked';
    }) ?? activeTrackLessons[0];

    setActiveLessonId(preferred.lesson.id);
  }, [activeLessonId, activeTrackLessons, ownProgressByLessonId]);

  // Ao trocar de tela, volta ao topo (no celular a tela anterior podia estar rolada).
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY - 8;
    if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top) });
  }, [screen, activeLessonId, activeTrackId]);

  /** Resumo de cada trilha: concluídos, total e o próximo módulo a fazer. */
  const trackSummaries = useMemo(() => new Map(visibleTracks.map((track) => {
    const ordered = lessonsByTrack.get(track.id) ?? [];
    const statuses = ordered.map((entry) => lessonRuntimeStatus(ordered, ownProgressByLessonId, entry.lesson.id));
    const done = statuses.filter((status) => status === 'completed').length;
    const nextIndex = statuses.findIndex((status) => status !== 'completed' && status !== 'locked');
    return [track.id, { ordered, statuses, done, total: ordered.length, next: nextIndex >= 0 ? ordered[nextIndex] : null }];
  })), [lessonsByTrack, ownProgressByLessonId, visibleTracks]);

  /** "Continue de onde parou": o módulo em andamento mais recente, ou o próximo da 1ª trilha aberta. */
  const resume = useMemo(() => {
    const touched = [...progressRecords]
      .filter((record) => !record.lessonCompleted)
      .sort((left, right) => (right.updatedAt?.toMillis?.() ?? 0) - (left.updatedAt?.toMillis?.() ?? 0));
    for (const record of touched) {
      const summary = trackSummaries.get(record.trackId);
      const entry = summary?.ordered.find((item) => item.lesson.id === record.lessonId);
      if (summary && entry) return { trackId: record.trackId, entry, summary };
    }
    for (const track of visibleTracks) {
      const summary = trackSummaries.get(track.id);
      if (summary?.next) return { trackId: track.id, entry: summary.next, summary };
    }
    return null;
  }, [progressRecords, trackSummaries, visibleTracks]);

  /** Cursos das trilhas visíveis, com capa e progresso (trilho "Cursos"). */
  const courseCards = useMemo(() => {
    const cards: Array<{ course: CourseEntity; trackId: string; first: OrderedLesson; count: number; done: number; cover: string }> = [];
    visibleTracks.forEach((track) => {
      const summary = trackSummaries.get(track.id);
      if (!summary) return;
      const byCourse = new Map<string, OrderedLesson[]>();
      summary.ordered.forEach((entry) => {
        const key = entry.lesson.courseId;
        byCourse.set(key, [...(byCourse.get(key) ?? []), entry]);
      });
      byCourse.forEach((entries, courseId) => {
        const course = courseById.get(courseId);
        if (!course) return;
        const done = entries.filter((entry) => ownProgressByLessonId.get(entry.lesson.id)?.lessonCompleted).length;
        const cover = entries.map((entry) => lessonCover(entry)).find(Boolean) ?? '';
        cards.push({ course, trackId: track.id, first: entries[0], count: entries.length, done, cover });
      });
    });
    return cards;
  }, [courseById, ownProgressByLessonId, trackSummaries, visibleTracks]);

  const openTrack = (trackId: string, courseId = '') => {
    setActiveTrackId(trackId);
    setCourseFilter(courseId);
    setActiveLessonId('');
    setScreen('track');
  };

  const openLesson = (trackId: string, lessonId: string) => {
    setActiveTrackId(trackId);
    setActiveLessonId(lessonId);
    setQuizFeedback('');
    setQuizError('');
    setActionError('');
    setScreen('lesson');
  };

  async function handleBlockPlaybackProgress(
    blockId: string,
    payload: { currentSeconds: number; durationSeconds: number },
  ) {
    if (!activeLesson || !payload.durationSeconds) {
      return;
    }

    const progressKey = `${activeLesson.lesson.id}:${blockId}`;
    const roundedCurrentSeconds = Math.max(0, Math.floor(payload.currentSeconds));
    const lastSentSeconds = playbackSentSecondsRef.current[progressKey] ?? -1;

    if (playbackPendingRef.current[progressKey]) {
      return;
    }

    // Envia no máximo a cada 4s de vídeo, ou no fim.
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
      setActionError(error instanceof Error ? error.message : t('Não foi possível registrar o progresso deste bloco.'));
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
      await onMarkBlockComplete({ lessonId: activeLesson.lesson.id, blockId });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('Não foi possível concluir este bloco.'));
    } finally {
      setManualBlockBusyId('');
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
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : t('Não foi possível abrir o quiz.'));
    } finally {
      setQuizBusy(false);
    }
  }

  async function handleSubmitQuizSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (quizSessionAnswers.some((answer) => answer < 0)) {
      setQuizError(t('Responda todas as perguntas antes de enviar.'));
      return;
    }

    setQuizBusy(true);
    setQuizError('');
    setQuizFeedback('');

    try {
      const response = await onSubmitQuiz({ lessonId: quizSessionLessonId, answers: quizSessionAnswers });
      setQuizFeedback(response.passed
        ? t('Aprovado com {score}% de acerto.', { score: response.scorePercent })
        : t('Você fez {score}%. Revise o módulo e tente de novo.', { score: response.scorePercent }));
      if (response.passed) {
        setQuizSessionQuestions([]);
        setQuizSessionLessonId('');
      }
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : t('Não foi possível enviar o quiz.'));
    } finally {
      setQuizBusy(false);
    }
  }

  /* ─── Pedaços reutilizados ─────────────────────────────────────────── */

  const renderTile = (track: TrackEntity, size: 'md' | 'lg' = 'md') => {
    const color = trackColor(track.id, trackOrderIds);
    const Icon = trackIcon(track.title);
    return (
      <span
        className={`rd-learn__tile rd-learn__tile--${size}${LIGHT_TRACK_COLORS.has(color) ? ' is-light' : ''}`}
        style={{ '--tc': color } as React.CSSProperties}
        aria-hidden="true"
      >
        <Icon size={size === 'lg' ? 28 : 21} strokeWidth={2} />
      </span>
    );
  };

  const renderThumb = (entry: OrderedLesson, trackId: string, extra = '') => {
    const cover = lessonCover(entry);
    const color = trackColor(trackId, trackOrderIds);
    return (
      <span className={`rd-learn__thumb ${extra}`.trim()} style={{ '--tc': color } as React.CSSProperties} aria-hidden="true">
        {cover ? <img src={cover} alt="" loading="lazy" /> : null}
        <span className="rd-learn__play"><Play size={14} fill="currentColor" /></span>
      </span>
    );
  };

  const bell = isStudent ? (
    <button
      type="button"
      className="lv-icon-btn"
      onClick={shell.openNotifications}
      aria-label={shell.unreadCount > 0
        ? `${t('Avisos')} · ${t('{count} não lidas', { count: shell.unreadCount })}`
        : t('Avisos')}
    >
      <Bell size={20} strokeWidth={2} />
      {shell.unreadCount > 0 ? (
        <span className="lv-badge-count" aria-hidden="true">{shell.unreadCount > 9 ? '9+' : shell.unreadCount}</span>
      ) : null}
    </button>
  ) : null;

  const renderTopBar = (onBack?: () => void, right?: React.ReactNode) => (
    <div className="rd-learn__bar">
      {onBack ? (
        <button type="button" className="lv-icon-btn" onClick={onBack} aria-label={t('Voltar')}>
          <ChevronLeft size={22} strokeWidth={2.2} />
        </button>
      ) : (
        <span className="rd-learn__me">
          <span className={`rd-learn__avatar${isStudent ? '' : ' is-staff'}`} aria-hidden="true">
            {(firstName || '?').charAt(0).toLocaleUpperCase()}
          </span>
          <span className="rd-learn__me-text">
            <small>{isStudent ? t('Learning · {academy}', { academy: academyName }) : t('Professor · {academy}', { academy: academyName })}</small>
            <b>{firstName}</b>
          </span>
        </span>
      )}
      <span className="rd-learn__bar-right">{right}{bell}</span>
    </div>
  );

  /* ─── Nada liberado ─────────────────────────────────────────────────── */

  if (visibleTracks.length === 0) {
    return (
      <div className="lv-screen rd-learn" ref={rootRef}>
        {renderTopBar()}
        <h1 className="rd-learn__title">
          {t('Learning Hub')}
          <span className="rd-learn__dim">{t('Nada liberado por enquanto')}</span>
        </h1>
        <div className="lv-glass rd-learn__empty-card">
          <span className="rd-learn__empty-icon" aria-hidden="true"><BookOpen size={26} /></span>
          <p>
            {isStudent
              ? t('{name}, ainda não há videoaulas publicadas para o seu perfil e a sua faixa. Assim que a {academy} liberar um módulo, ele aparece aqui.', { name: firstName, academy: academyName })
              : t('{name}, ainda não há videoaulas publicadas para o seu perfil. Assim que a {academy} liberar um módulo, ele aparece aqui.', { name: firstName, academy: academyName })}
          </p>
        </div>
      </div>
    );
  }

  /* ─── Módulo (blocos + quiz) ────────────────────────────────────────── */

  if (screen === 'lesson' && activeTrack && activeLesson) {
    const lessonIndex = activeTrackLessons.findIndex((entry) => entry.lesson.id === activeLesson.lesson.id);
    const nextEntry = lessonIndex >= 0 ? activeTrackLessons[lessonIndex + 1] : undefined;
    const percent = Math.min(activeLessonProgress?.contentCompletionPercent ?? 0, 100);
    const locked = activeLessonStatus === 'locked';

    return (
      <div className="lv-screen rd-learn rd-learn--lesson" ref={rootRef}>
        {renderTopBar(() => setScreen('track'), (
          <span className={`rd-learn__status ${statusTone(activeLessonStatus)}`}>
            {locked ? <Lock size={12} aria-hidden="true" /> : null}
            {statusLabel(activeLessonStatus)}
          </span>
        ))}

        <div className="rd-learn__lesson-head">
          <p className="rd-learn__eyebrow">
            {activeTrack.title}
            {activeLesson.course?.title ? ` · ${activeLesson.course.title}` : ''}
            {` · ${t('Módulo {n} de {total}', { n: lessonIndex + 1, total: activeTrackLessons.length })}`}
          </p>
          <h1 className="rd-learn__title rd-learn__title--sm">{activeLesson.lesson.title}</h1>
          {activeLesson.lesson.description ? <p className="rd-learn__lead">{activeLesson.lesson.description}</p> : null}
        </div>

        <div className="lv-glass rd-learn__progress-card">
          <div className="rd-learn__progress-top">
            <span>{t('Progresso do módulo')}</span>
            <b>{percent}%</b>
          </div>
          <div
            className="rd-learn__meter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t('Progresso do módulo')}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>

        {locked ? (
          <div className="rd-learn__notice" role="status">
            <Lock size={16} aria-hidden="true" />
            {t('Conclua o módulo anterior para liberar este.')}
          </div>
        ) : null}

        <div className="rd-learn__blocks">
          {activeLesson.blocks.map((block) => {
            const blockProgress = activeLessonProgress?.contentProgressMap?.[block.id] ?? 0;
            const blockCompleted = blockProgress >= 100;
            const disabled = locked;

            return (
              <article key={`${activeLesson.lesson.id}-${block.id}`} className="lv-glass rd-learn__block">
                <div className="rd-learn__block-head">
                  <span className="rd-learn__block-icon" aria-hidden="true">{blockTypeIcon(block.type)}</span>
                  <div className="rd-learn__block-text">
                    <b>{block.title}</b>
                    <span>{blockTypeLabel(block.type)} · {t('bloco {n}', { n: block.order })}</span>
                  </div>
                  <span className={`rd-learn__status ${blockCompleted ? 'is-done' : ''}`}>
                    {blockCompleted ? <CheckCircle2 size={12} aria-hidden="true" /> : null}
                    {blockCompleted ? t('Concluído') : `${blockProgress}%`}
                  </span>
                </div>

                {block.type === 'youtube' ? (
                  <div className="rd-learn__media">
                    <LearningVideoPlayer
                      lessonKey={`${activeLesson.lesson.id}-${block.id}`}
                      videoUrl={block.sourceUrl ?? ''}
                      disabled={disabled}
                      onProgress={(payload) => void handleBlockPlaybackProgress(block.id, payload)}
                    />
                  </div>
                ) : null}

                {block.type === 'uploaded_video' ? (
                  <div className="rd-learn__media">
                    <UploadedVideoPlayer
                      blockKey={`${activeLesson.lesson.id}-${block.id}`}
                      sourceUrl={block.sourceUrl ?? ''}
                      disabled={disabled}
                      onProgress={(payload) => void handleBlockPlaybackProgress(block.id, payload)}
                    />
                  </div>
                ) : null}

                {block.type === 'pdf' || block.type === 'image' ? (
                  <>
                    <div className="rd-learn__media rd-learn__media--doc">
                      {block.type === 'pdf'
                        ? <iframe title={block.title} src={block.sourceUrl} />
                        : <img src={block.sourceUrl} alt={block.title} />}
                    </div>
                    <div className="rd-learn__block-actions">
                      <a href={block.sourceUrl} target="_blank" rel="noreferrer" className="lv-btn lv-btn--neutral lv-btn--sm">
                        <ExternalLink size={14} />
                        {block.type === 'pdf' ? t('Abrir PDF') : t('Abrir imagem')}
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleManualBlockComplete(block.id)}
                        disabled={disabled || blockCompleted || manualBlockBusyId === block.id}
                        className="lv-btn lv-btn--primary lv-btn--sm"
                      >
                        <CheckCircle2 size={14} />
                        {manualBlockBusyId === block.id ? t('Salvando...') : (blockCompleted ? t('Concluído') : t('Marcar como concluído'))}
                      </button>
                    </div>
                  </>
                ) : null}
              </article>
            );
          })}
        </div>

        {actionError ? <p className="rd-learn__error" role="alert">{actionError}</p> : null}

        <section className="rd-learn__quiz">
          <div className="rd-learn__quiz-head">
            <span className="rd-learn__quiz-icon" aria-hidden="true"><ClipboardCheck size={20} /></span>
            <div>
              <b>{t('Quiz do módulo')}</b>
              <p>
                {activeLesson.lesson.quizQuestionCount > 0
                  ? t('Libera quando todos os blocos estiverem concluídos.')
                  : t('Este módulo não tem quiz: ele fecha sozinho quando você concluir os blocos.')}
              </p>
            </div>
          </div>

          {activeLesson.lesson.quizQuestionCount > 0 ? (
            <div className="rd-learn__chips">
              <span>{t('Tentativas: {count}', { count: activeLessonProgress?.attemptCount ?? 0 })}</span>
              <span>{t('Nota mínima: {score}%', { score: activeLessonProgress ? activeLesson.lesson.passingScore : quizPassingScore })}</span>
              {activeLessonProgress?.bestScore ? (
                <span>{t('Melhor nota: {score}%', { score: activeLessonProgress.bestScore })}</span>
              ) : null}
            </div>
          ) : null}

          {activeLesson.lesson.quizQuestionCount > 0 ? (
            <button
              type="button"
              onClick={() => void handleOpenQuiz()}
              disabled={quizBusy || !activeLessonProgress?.contentCompleted}
              className="rd-learn__pill rd-learn__pill--white rd-learn__pill--block"
            >
              <ClipboardCheck size={16} />
              {quizBusy ? t('Processando...') : (activeLessonProgress?.quizPassed ? t('Refazer quiz') : t('Abrir quiz'))}
            </button>
          ) : (
            <span className={`rd-learn__status rd-learn__status--on-dark ${activeLessonProgress?.lessonCompleted ? 'is-done' : ''}`}>
              {activeLessonProgress?.lessonCompleted ? t('Módulo concluído') : t('Sem quiz')}
            </span>
          )}

          {quizFeedback ? <p className="rd-learn__quiz-feedback" role="status">{quizFeedback}</p> : null}

          {quizSessionLessonId === activeLesson.lesson.id && quizSessionQuestions.length > 0 ? (
            <form onSubmit={handleSubmitQuizSession} className="rd-learn__quiz-form">
              {quizSessionQuestions.map((question, questionIndex) => (
                <fieldset key={question.id} className="rd-learn__question">
                  <legend>{questionIndex + 1}. {question.prompt}</legend>
                  {question.options.map((option, optionIndex) => (
                    <label
                      key={`${question.id}-${optionIndex}`}
                      className={`rd-learn__option${quizSessionAnswers[questionIndex] === optionIndex ? ' is-on' : ''}`}
                    >
                      <input
                        type="radio"
                        name={`quiz-question-${question.id}`}
                        checked={quizSessionAnswers[questionIndex] === optionIndex}
                        onChange={() => setQuizSessionAnswers((current) => current.map((answer, index) => (
                          index === questionIndex ? optionIndex : answer
                        )))}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </fieldset>
              ))}

              {quizError ? <p className="rd-learn__error rd-learn__error--on-dark" role="alert">{quizError}</p> : null}

              <button type="submit" disabled={quizBusy} className="lv-btn lv-btn--primary lv-btn--block">
                <Send size={16} />
                {quizBusy ? t('Enviando...') : t('Enviar quiz')}
              </button>
            </form>
          ) : null}

          {quizError && quizSessionQuestions.length === 0 ? (
            <p className="rd-learn__error rd-learn__error--on-dark" role="alert">{quizError}</p>
          ) : null}
        </section>

        {nextEntry ? (
          <button
            type="button"
            className="lv-glass rd-learn__next"
            onClick={() => openLesson(activeTrack.id, nextEntry.lesson.id)}
          >
            {renderThumb(nextEntry, activeTrack.id, 'rd-learn__thumb--sm')}
            <span className="rd-learn__next-text">
              <small>{t('Próximo módulo')}</small>
              <b>{nextEntry.lesson.title}</b>
            </span>
            {lessonRuntimeStatus(activeTrackLessons, ownProgressByLessonId, nextEntry.lesson.id) === 'locked'
              ? <Lock size={16} aria-hidden="true" />
              : <ChevronRight size={18} aria-hidden="true" />}
          </button>
        ) : null}
      </div>
    );
  }

  /* ─── Trilha (módulos em ordem) ─────────────────────────────────────── */

  if (screen === 'track' && activeTrack) {
    const summary = trackSummaries.get(activeTrack.id);
    const trackCourses = sortByOrder(
      [...new Set(activeTrackLessons.map((entry) => entry.lesson.courseId))]
        .map((courseId) => courseById.get(courseId))
        .filter((course): course is CourseEntity => Boolean(course)),
    );
    const filter = trackCourses.some((course) => course.id === courseFilter) ? courseFilter : '';
    const shown = activeTrackLessons.filter((entry) => !filter || entry.lesson.courseId === filter);
    const percent = summary && summary.total ? Math.round((summary.done / summary.total) * 100) : 0;

    return (
      <div className="lv-screen rd-learn rd-learn--track" ref={rootRef}>
        {renderTopBar(() => setScreen('home'), (
          <span className="rd-learn__count">
            {activeTrackLessons.length === 1 ? t('1 módulo') : t('{count} módulos', { count: activeTrackLessons.length })}
          </span>
        ))}

        <div className="rd-learn__track-head">
          {renderTile(activeTrack, 'lg')}
          <div>
            <p className="rd-learn__eyebrow">{t('Trilha')}</p>
            <h1 className="rd-learn__title rd-learn__title--sm">{activeTrack.title}</h1>
          </div>
        </div>
        {activeTrack.description ? <p className="rd-learn__lead">{activeTrack.description}</p> : null}

        {summary ? (
          <div className="lv-glass rd-learn__progress-card">
            <div className="rd-learn__progress-top">
              <span>{t('{done} de {total} módulos concluídos', { done: summary.done, total: summary.total })}</span>
              <b>{percent}%</b>
            </div>
            <div className="rd-learn__meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t('Progresso da trilha')}>
              <span style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : null}

        {trackCourses.length > 1 ? (
          <div className="rd-learn__filters" role="group" aria-label={t('Cursos')}>
            <button type="button" className={!filter ? 'is-on' : ''} aria-pressed={!filter} onClick={() => setCourseFilter('')}>
              {t('Todos')}
            </button>
            {trackCourses.map((course) => (
              <button
                type="button"
                key={course.id}
                className={filter === course.id ? 'is-on' : ''}
                aria-pressed={filter === course.id}
                onClick={() => setCourseFilter(course.id)}
              >
                {course.title}
              </button>
            ))}
          </div>
        ) : null}

        <ol className="lv-glass rd-learn__lessons">
          {shown.map((entry) => {
            const runtime = lessonRuntimeStatus(activeTrackLessons, ownProgressByLessonId, entry.lesson.id);
            const position = activeTrackLessons.indexOf(entry) + 1;
            return (
              <li key={entry.lesson.id}>
                <button
                  type="button"
                  className={`rd-learn__lesson ${statusTone(runtime)}`}
                  onClick={() => openLesson(activeTrack.id, entry.lesson.id)}
                >
                  {renderThumb(entry, activeTrack.id)}
                  <span className="rd-learn__lesson-text">
                    <b>
                      <span className="rd-learn__num">{position}.</span> {entry.lesson.title}
                    </b>
                    <span>
                      {entry.course?.title ?? t('Curso')} · {entry.blocks.length === 1 ? t('1 bloco') : t('{count} blocos', { count: entry.blocks.length })}
                    </span>
                    <span className={`rd-learn__status ${statusTone(runtime)}`}>
                      {runtime === 'locked' ? <Lock size={11} aria-hidden="true" /> : null}
                      {runtime === 'completed' ? <CheckCircle2 size={11} aria-hidden="true" /> : null}
                      {statusLabel(runtime)}
                    </span>
                  </span>
                  <ChevronRight size={18} className="rd-learn__chev" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
        <p className="rd-learn__hint">{t('{name}, conclua os blocos de cada módulo para liberar o próximo passo.', { name: firstName })}</p>
      </div>
    );
  }

  /* ─── Início do Learning ────────────────────────────────────────────── */

  const resumeProgress = resume ? ownProgressByLessonId.get(resume.entry.lesson.id) : undefined;
  const resumePercent = Math.min(resumeProgress?.contentCompletionPercent ?? 0, 100);
  const resumeTrack = resume ? trackById.get(resume.trackId) : undefined;
  const stackColors = visibleTracks.slice(0, 3).map((track) => trackColor(track.id, trackOrderIds));

  return (
    <div className="lv-screen rd-learn" ref={rootRef}>
      {renderTopBar()}

      <h1 className="rd-learn__title">
        {isStudent ? t('Bora estudar,') : t('Prepare a aula,')}
        <span className="rd-learn__dim">{isStudent ? t('o que vamos treinar?') : t('estude antes.')}</span>
      </h1>

      {resume && resumeTrack ? (
        <section className="rd-learn__hero" aria-label={t('Continue de onde parou')}>
          <span className="rd-learn__stack" aria-hidden="true">
            {stackColors.map((color) => <i key={color} style={{ '--c': color } as React.CSSProperties} />)}
          </span>
          <p className="rd-learn__hero-eyebrow">{t('Continue de onde parou')}</p>
          <p className="rd-learn__big">{resumePercent}<small>%</small></p>
          <p className="rd-learn__hero-title">{resume.entry.lesson.title}</p>
          <p className="rd-learn__hero-sub">
            {resumeTrack.title} · {t('{done} de {total} módulos', { done: resume.summary.done, total: resume.summary.total })}
          </p>
          <span className="rd-learn__path" aria-hidden="true">
            {resume.summary.statuses.slice(0, 24).map((status, index) => (
              <i key={index} className={status === 'completed' ? 'is-on' : ''} />
            ))}
          </span>
          <span className="rd-learn__hero-acts">
            <button type="button" className="rd-learn__pill rd-learn__pill--white" onClick={() => openLesson(resume.trackId, resume.entry.lesson.id)}>
              <Play size={15} fill="currentColor" />
              {resumePercent > 0 ? t('Continuar') : t('Começar')}
            </button>
            <button type="button" className="rd-learn__pill rd-learn__pill--glass" onClick={() => openTrack(resume.trackId)}>
              <BookOpen size={15} />
              {t('Ver trilha')}
            </button>
          </span>
        </section>
      ) : (
        <section className="rd-learn__hero rd-learn__hero--done">
          <p className="rd-learn__hero-eyebrow">{t('Tudo em dia')}</p>
          <p className="rd-learn__hero-title">{t('Você concluiu todos os módulos liberados. Oss!')}</p>
        </section>
      )}

      <div className="rd-learn__sec">
        <h2>{t('Trilhas')}</h2>
      </div>
      <div className="rd-learn__grid">
        {visibleTracks.map((track, index) => {
          const summary = trackSummaries.get(track.id);
          const done = summary?.done ?? 0;
          const total = summary?.total ?? 0;
          const wide = visibleTracks.length % 2 === 1 && index === visibleTracks.length - 1;
          return (
            <button
              type="button"
              key={track.id}
              className={`lv-glass rd-learn__track${wide ? ' is-wide' : ''}`}
              onClick={() => openTrack(track.id)}
            >
              {renderTile(track)}
              <span className="rd-learn__track-text">
                <b>{track.title}</b>
                <span>{t('{done} de {total} módulos', { done, total })}</span>
                <span className="rd-learn__mini" aria-hidden="true">
                  <i style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
                </span>
              </span>
              <span className="rd-learn__go" aria-hidden="true"><ArrowUpRight size={15} /></span>
            </button>
          );
        })}
      </div>

      {courseCards.length > 0 ? (
        <>
          <div className="rd-learn__sec">
            <h2>{t('Cursos')}</h2>
          </div>
          <div className="rd-learn__rail">
            {courseCards.map((card) => {
              const track = trackById.get(card.trackId);
              const color = trackColor(card.trackId, trackOrderIds);
              return (
                <button
                  type="button"
                  key={card.course.id}
                  className="rd-learn__cover"
                  style={{ '--tc': color } as React.CSSProperties}
                  onClick={() => openTrack(card.trackId, card.course.id)}
                >
                  {card.cover ? <img src={card.cover} alt="" loading="lazy" /> : null}
                  <span className="rd-learn__cover-tag">{track?.title}</span>
                  <span className="rd-learn__cover-text">
                    <b>{card.course.title}</b>
                    <small>{t('{done} de {total} módulos', { done: card.done, total: card.count })}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default LearningPlayerView;
