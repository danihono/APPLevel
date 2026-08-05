import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Lock,
  Send,
  Video,
} from 'lucide-react';
import LearningVideoPlayer from '../../components/LearningVideoPlayer';
import ProgressBar from '../../components/ProgressBar';
import { computeEffectiveAudience, matchesEffectiveAudience } from '../../learningAudience';
import {
  blockTypeLabel,
  buildOrderedLessons,
  lessonRuntimeStatus,
  sortByOrder,
  statusBadge,
  statusLabel,
  type CourseEntity,
  type LessonBlockEntity,
  type LessonEntity,
  type ProgressEntity,
  type QuizQuestionSession,
  type TrackEntity,
} from './learningShared';
import type { LearningPlayerHandlers } from './learningHandlers';
import type { LearningLessonBlockType } from '../../services/firebase/models';

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
    return <div className="app-empty">Este bloco ainda não tem um vídeo válido.</div>;
  }

  return (
    <div className="app-video-frame rounded-[1.6rem] border border-white/10 bg-black/30">
      <video
        ref={videoRef}
        className="h-full w-full rounded-[1.6rem]"
        controls
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
  const firstName = userName.split(' ')[0] ?? userName;
  const isStudent = viewerRole === 'student';

  const [activeTrackId, setActiveTrackId] = useState('');
  const [activeLessonId, setActiveLessonId] = useState('');
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

  const activeTrack = useMemo(
    () => visibleTracks.find((track) => track.id === activeTrackId) ?? visibleTracks[0] ?? null,
    [activeTrackId, visibleTracks],
  );

  const activeTrackLessons = useMemo(
    () => (activeTrack ? buildOrderedLessons(activeTrack.id, publishedCourses, visibleLessons, lessonBlocks) : []),
    [activeTrack, lessonBlocks, publishedCourses, visibleLessons],
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
      setActionError(error instanceof Error ? error.message : 'Não foi possível registrar o progresso deste bloco.');
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
      setActionError(error instanceof Error ? error.message : 'Não foi possível concluir este bloco.');
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
      setQuizError(error instanceof Error ? error.message : 'Não foi possível abrir o quiz.');
    } finally {
      setQuizBusy(false);
    }
  }

  async function handleSubmitQuizSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (quizSessionAnswers.some((answer) => answer < 0)) {
      setQuizError('Responda todas as perguntas antes de enviar.');
      return;
    }

    setQuizBusy(true);
    setQuizError('');
    setQuizFeedback('');

    try {
      const response = await onSubmitQuiz({ lessonId: quizSessionLessonId, answers: quizSessionAnswers });
      setQuizFeedback(response.passed
        ? `Aprovado com ${response.scorePercent}% de acerto.`
        : `Você fez ${response.scorePercent}%. Revise o módulo e tente de novo.`);
      if (response.passed) {
        setQuizSessionQuestions([]);
        setQuizSessionLessonId('');
      }
    } catch (error) {
      setQuizError(error instanceof Error ? error.message : 'Não foi possível enviar o quiz.');
    } finally {
      setQuizBusy(false);
    }
  }

  if (visibleTracks.length === 0) {
    return (
      <div className="learning-player">
        <section className="app-panel app-panel-pad">
          <p className="app-section-label">Learning Hub</p>
          <h1 className="text-3xl font-bold">Nada liberado por enquanto</h1>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">
            {firstName}, ainda não há videoaulas publicadas para o seu perfil
            {isStudent ? ' e a sua faixa' : ''}. Assim que a {academyName} liberar um módulo, ele aparece aqui.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="learning-player">
      <section className="app-panel app-panel-pad">
        <div className="learning-player__hero">
          <div>
            <p className="app-section-label">Learning Hub</p>
            <h1 className="text-3xl font-bold">Sua trilha na {academyName}</h1>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              {firstName}, conclua os blocos de cada módulo para liberar o próximo passo.
            </p>
          </div>
          <div className="app-orb"><BookOpen size={16} />{isStudent ? 'Aluno' : 'Professor'}</div>
        </div>

        <div className="learning-player__tracks">
          {visibleTracks.map((track) => (
            <button
              type="button"
              key={track.id}
              onClick={() => setActiveTrackId(track.id)}
              className={`app-button app-button--small ${activeTrack?.id === track.id ? 'app-button--gold' : 'app-button--dark'}`}
            >
              {track.title}
            </button>
          ))}
        </div>
      </section>

      <section className="learning-player__workspace">
        <div className="app-panel app-panel-pad learning-player__map">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell"><BookOpen size={18} /></div>
            <div>
              <p className="app-section-label">Mapa da trilha</p>
              <h2 className="text-xl font-bold">{activeTrack?.title ?? 'Trilha'}</h2>
            </div>
          </div>

          <div className="learning-player__lesson-list">
            {activeTrackLessons.map((entry) => {
              const runtime = lessonRuntimeStatus(activeTrackLessons, ownProgressByLessonId, entry.lesson.id);
              const isActive = activeLesson?.lesson.id === entry.lesson.id;

              return (
                <button
                  type="button"
                  key={entry.lesson.id}
                  onClick={() => setActiveLessonId(entry.lesson.id)}
                  className={`app-list-card learning-player__lesson ${isActive ? 'is-active' : ''}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">
                        {runtime === 'locked' ? <Lock size={12} className="inline mr-1" /> : null}
                        {entry.lesson.title}
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                        {entry.course?.title ?? 'Curso'} · {entry.blocks.length} {entry.blocks.length === 1 ? 'bloco' : 'blocos'}
                      </p>
                    </div>
                    <span className={statusBadge(runtime)}>{statusLabel(runtime)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="learning-player__stage">
          <section className="app-panel app-panel-pad">
            <div className="learning-player__stage-head">
              <div>
                <p className="app-section-label">Módulo ativo</p>
                <h2 className="text-2xl font-bold">{activeLesson?.lesson.title ?? 'Selecione um módulo'}</h2>
                {activeLesson?.lesson.description ? (
                  <p className="mt-2 text-sm text-[color:var(--text-muted)]">{activeLesson.lesson.description}</p>
                ) : null}
              </div>
              <span className={statusBadge(activeLessonStatus)}>{statusLabel(activeLessonStatus)}</span>
            </div>

            {activeLesson ? (
              <>
                <div className="mt-6">
                  <ProgressBar
                    label="Progresso do módulo"
                    current={Math.min(activeLessonProgress?.contentCompletionPercent ?? 0, 100)}
                    total={100}
                    unit="percent"
                  />
                </div>

                {activeLessonStatus === 'locked' ? (
                  <div className="app-empty mt-6">
                    <Lock size={14} className="inline mr-1" />
                    Conclua o módulo anterior para liberar este.
                  </div>
                ) : null}

                <div className="learning-player__blocks">
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
                              {blockTypeLabel(block.type)} · bloco {block.order}
                            </p>
                          </div>
                          <span className={blockCompleted ? 'app-badge app-badge--success' : 'app-badge app-badge--muted'}>
                            {blockCompleted ? 'Concluído' : `${blockProgress}%`}
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
                                <iframe title={block.title} src={block.sourceUrl} className="min-h-[26rem] w-full" />
                              </div>
                              <div className="flex flex-wrap gap-3">
                                <a href={block.sourceUrl} target="_blank" rel="noreferrer" className="app-button app-button--dark app-button--small">
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
                                  {manualBlockBusyId === block.id ? 'Salvando...' : (blockCompleted ? 'Concluído' : 'Marcar como concluído')}
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
                                <a href={block.sourceUrl} target="_blank" rel="noreferrer" className="app-button app-button--dark app-button--small">
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
                                  {manualBlockBusyId === block.id ? 'Salvando...' : (blockCompleted ? 'Concluído' : 'Marcar como concluído')}
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
                  <div className="mt-6 app-panel app-panel--danger"><p className="text-sm">{actionError}</p></div>
                ) : null}

                <div className="mt-6 app-panel app-panel--soft p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">Quiz do módulo</p>
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                        {activeLesson.lesson.quizQuestionCount > 0
                          ? 'Libera quando todos os blocos estiverem concluídos.'
                          : 'Este módulo não tem quiz: ele fecha sozinho quando você concluir os blocos.'}
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
                        {activeLessonProgress?.lessonCompleted ? 'Módulo concluído' : 'Sem quiz'}
                      </span>
                    )}
                  </div>

                  {activeLesson.lesson.quizQuestionCount > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="app-badge app-badge--muted">Tentativas: {activeLessonProgress?.attemptCount ?? 0}</span>
                      <span className="app-badge app-badge--muted">Nota mínima: {activeLessonProgress ? activeLesson.lesson.passingScore : quizPassingScore}%</span>
                      {activeLessonProgress?.bestScore ? (
                        <span className="app-badge app-badge--muted">Melhor nota: {activeLessonProgress.bestScore}%</span>
                      ) : null}
                    </div>
                  ) : null}

                  {quizFeedback ? (
                    <div className="app-panel app-panel--soft mt-4"><p className="text-sm">{quizFeedback}</p></div>
                  ) : null}

                  {quizSessionLessonId === activeLesson.lesson.id && quizSessionQuestions.length > 0 ? (
                    <form onSubmit={handleSubmitQuizSession} className="mt-6 space-y-4">
                      {quizSessionQuestions.map((question, questionIndex) => (
                        <div key={question.id} className="app-panel app-panel--soft p-4">
                          <p className="text-sm font-bold">{questionIndex + 1}. {question.prompt}</p>
                          <div className="mt-4 space-y-3">
                            {question.options.map((option, optionIndex) => (
                              <label
                                key={`${question.id}-${optionIndex}`}
                                className="flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3"
                              >
                                <input
                                  type="radio"
                                  name={`quiz-question-${question.id}`}
                                  checked={quizSessionAnswers[questionIndex] === optionIndex}
                                  onChange={() => setQuizSessionAnswers((current) => current.map((answer, index) => (
                                    index === questionIndex ? optionIndex : answer
                                  )))}
                                />
                                <span className="text-sm">{option}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}

                      {quizError ? <div className="app-panel app-panel--danger"><p className="text-sm">{quizError}</p></div> : null}

                      <button type="submit" disabled={quizBusy} className="app-button app-button--gold">
                        <Send size={16} />
                        {quizBusy ? 'Enviando...' : 'Enviar quiz'}
                      </button>
                    </form>
                  ) : null}

                  {quizError && quizSessionQuestions.length === 0 ? (
                    <div className="app-panel app-panel--danger mt-4"><p className="text-sm">{quizError}</p></div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="app-empty mt-6">Selecione um módulo para ver os blocos e o quiz.</div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
};

export default LearningPlayerView;
