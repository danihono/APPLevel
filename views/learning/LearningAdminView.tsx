import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Layers,
  Network,
  RefreshCw,
  Route,
  ShieldCheck,
  Users,
} from 'lucide-react';
import CourseEditorModal, { type CourseEditorSubmit } from '../../components/learning/CourseEditorModal';
import LearningContentTree, { type LearningNodeRef } from '../../components/learning/LearningContentTree';
import LessonEditorModal, { type LessonEditorSubmit } from '../../components/learning/LessonEditorModal';
import TrackEditorModal, { type TrackEditorSubmit } from '../../components/learning/TrackEditorModal';
import { useConfirm } from '../../components/ConfirmDialog';
import {
  computeEffectiveAudience,
  describeAudience,
  isEmptyAudience,
  matchesEffectiveAudience,
  resolveTrackAudience,
} from '../../learningAudience';
import {
  buildOrderedLessons,
  contentBadge,
  contentLabel,
  getEffectiveLessonBlocks,
  isProgressComplete,
  lessonRuntimeStatus,
  sortByOrder,
  statusBadge,
  statusLabel,
  type CourseEntity,
  type LessonBlockEntity,
  type LessonEntity,
  type ProgressEntity,
  type QuizEntity,
  type TrackEntity,
} from './learningShared';
import type { FirestoreEntity } from '../../services/firebase/data';
import type { AcademyRecord, UserRecord } from '../../services/firebase/models';
import type { LearningHubHandlers } from './learningHandlers';

interface LearningAdminViewProps extends LearningHubHandlers {
  selectedAcademyId?: string;
  selectedAcademy?: FirestoreEntity<AcademyRecord> | null;
  academies: Array<FirestoreEntity<AcademyRecord>>;
  allUsers: Array<FirestoreEntity<UserRecord>>;
  academyUsers: Array<FirestoreEntity<UserRecord>>;
  tracks: TrackEntity[];
  courses: CourseEntity[];
  lessons: LessonEntity[];
  lessonBlocks: LessonBlockEntity[];
  quizzes: QuizEntity[];
  progressRecords: ProgressEntity[];
  onSelectAcademy?: (academyId: string) => void;
}

type EditorState =
  | { kind: 'none' }
  | { kind: 'track'; track: TrackEntity | null }
  | { kind: 'course'; course: CourseEntity | null; trackId: string }
  | { kind: 'lesson'; lesson: LessonEntity | null; trackId: string; courseId: string };

const LearningAdminView: React.FC<LearningAdminViewProps> = ({
  selectedAcademyId,
  selectedAcademy,
  academies,
  allUsers,
  academyUsers,
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
  onDeleteTrack,
  onDeleteCourse,
  onDeleteLesson,
  onBackfillAudience,
  onReplaceLessonBlocks,
  onUpsertQuiz,
  onUploadLearningAsset,
}) => {
  const confirm = useConfirm();

  const [selected, setSelected] = useState<LearningNodeRef | null>(null);
  const [editor, setEditor] = useState<EditorState>({ kind: 'none' });
  const [editorError, setEditorError] = useState('');
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorBusyLabel, setEditorBusyLabel] = useState('');
  const [busyNodeId, setBusyNodeId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');

  const trackById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const courseById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const lessonById = useMemo(() => new Map(lessons.map((lesson) => [lesson.id, lesson])), [lessons]);
  const quizByLessonId = useMemo(() => new Map(quizzes.map((quiz) => [quiz.lessonId, quiz])), [quizzes]);

  // Base usada na prévia "quem vai ver": a academia em foco, ou a rede inteira.
  const audienceUsers = selectedAcademyId ? academyUsers : allUsers;

  const publishedTracks = useMemo(() => sortByOrder(tracks.filter((track) => track.status === 'published')), [tracks]);
  const publishedCourses = useMemo(() => sortByOrder(courses.filter((course) => course.status === 'published')), [courses]);
  const publishedLessons = useMemo(() => sortByOrder(lessons.filter((lesson) => lesson.status === 'published')), [lessons]);

  const selectedTrack = selected?.kind === 'track' ? trackById.get(selected.id) ?? null : null;
  const selectedCourse = selected?.kind === 'course' ? courseById.get(selected.id) ?? null : null;
  const selectedLesson = selected?.kind === 'lesson' ? lessonById.get(selected.id) ?? null : null;

  function resolveNodeContext(node: LearningNodeRef): {
    track: TrackEntity | null;
    course: CourseEntity | null;
    lesson: LessonEntity | null;
  } {
    if (node.kind === 'track') {
      return { track: trackById.get(node.id) ?? null, course: null, lesson: null };
    }

    if (node.kind === 'course') {
      const course = courseById.get(node.id) ?? null;
      return { track: course ? trackById.get(course.trackId) ?? null : null, course, lesson: null };
    }

    const lesson = lessonById.get(node.id) ?? null;
    const course = lesson ? courseById.get(lesson.courseId) ?? null : null;
    return { track: lesson ? trackById.get(lesson.trackId) ?? null : null, course, lesson };
  }

  function resetFeedback() {
    setFeedback('');
    setActionError('');
  }

  function closeEditor() {
    setEditor({ kind: 'none' });
    setEditorError('');
    setEditorBusy(false);
    setEditorBusyLabel('');
  }

  async function runNodeAction(nodeId: string, action: () => Promise<void>, successMessage: string) {
    resetFeedback();
    setBusyNodeId(nodeId);

    try {
      await action();
      setFeedback(successMessage);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível concluir a ação.');
    } finally {
      setBusyNodeId('');
    }
  }

  async function handleSaveTrack(payload: TrackEditorSubmit) {
    setEditorBusy(true);
    setEditorError('');

    try {
      const response = await onUpsertTrack(payload);
      setSelected({ kind: 'track', id: response.trackId });
      setFeedback('Trilha salva.');
      closeEditor();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Não foi possível salvar a trilha.');
      setEditorBusy(false);
    }
  }

  async function handleSaveCourse(payload: CourseEditorSubmit) {
    setEditorBusy(true);
    setEditorError('');

    try {
      const response = await onUpsertCourse(payload);
      setSelected({ kind: 'course', id: response.courseId });
      setFeedback('Curso salvo.');
      closeEditor();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Não foi possível salvar o curso.');
      setEditorBusy(false);
    }
  }

  /**
   * Salvar um módulo é uma sequência: grava o módulo (para ter o id), sobe os
   * arquivos novos, substitui os blocos e por fim grava o quiz.
   */
  async function handleSaveLesson(payload: LessonEditorSubmit) {
    setEditorBusy(true);
    setEditorError('');
    setEditorBusyLabel('Salvando módulo...');

    try {
      const onlyYouTubeBlock = payload.blocks.length === 1 && payload.blocks[0].type === 'youtube'
        ? payload.blocks[0].sourceUrl || undefined
        : undefined;

      const lessonResponse = await onUpsertLesson({
        lessonId: payload.lessonId,
        trackId: payload.trackId,
        courseId: payload.courseId,
        title: payload.title,
        description: payload.description,
        videoUrl: onlyYouTubeBlock,
        order: payload.order,
        status: payload.status,
        passingScore: payload.passingScore,
        audience: payload.audience,
        contentBlockCount: payload.blocks.length,
      });

      if (payload.blocks.some((block) => block.file)) {
        setEditorBusyLabel('Enviando arquivos...');
      }

      const uploadedBlocks = await Promise.all(payload.blocks.map(async (block) => {
        if (!block.file) {
          return block;
        }

        const asset = await onUploadLearningAsset({
          lessonId: lessonResponse.lessonId,
          file: block.file,
        });

        return {
          ...block,
          sourceUrl: asset.downloadURL,
          storagePath: asset.storagePath,
          mimeType: asset.mimeType,
          fileName: asset.fileName,
          file: null,
        };
      }));

      setEditorBusyLabel('Gravando blocos...');
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

      setEditorBusyLabel('Gravando quiz...');
      await onUpsertQuiz({
        lessonId: lessonResponse.lessonId,
        questions: payload.quizEnabled ? payload.quizQuestions : [],
      });

      setSelected({ kind: 'lesson', id: lessonResponse.lessonId });
      setFeedback('Módulo salvo.');
      closeEditor();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Não foi possível salvar o módulo.');
      setEditorBusy(false);
      setEditorBusyLabel('');
    }
  }

  async function handleToggleStatus(node: LearningNodeRef) {
    const { track, course, lesson } = resolveNodeContext(node);

    if (node.kind === 'track' && track) {
      const nextStatus = track.status === 'published' ? 'draft' : 'published';
      await runNodeAction(node.id, async () => {
        await onUpsertTrack({
          trackId: track.id,
          title: track.title,
          description: track.description,
          order: track.order,
          status: nextStatus,
          // Trilha legada não tem `audience`: envia o alcance resolvido para
          // que publicar não altere quem enxerga o conteúdo.
          audience: resolveTrackAudience(track),
        });
      }, nextStatus === 'published' ? 'Trilha publicada.' : 'Trilha voltou para rascunho.');
      return;
    }

    if (node.kind === 'course' && course) {
      const nextStatus = course.status === 'published' ? 'draft' : 'published';
      await runNodeAction(node.id, async () => {
        await onUpsertCourse({
          courseId: course.id,
          trackId: course.trackId,
          title: course.title,
          description: course.description,
          order: course.order,
          status: nextStatus,
          audience: course.audience,
        });
      }, nextStatus === 'published' ? 'Curso publicado.' : 'Curso voltou para rascunho.');
      return;
    }

    if (node.kind === 'lesson' && lesson) {
      const nextStatus = lesson.status === 'published' ? 'draft' : 'published';
      await runNodeAction(node.id, async () => {
        await onUpsertLesson({
          lessonId: lesson.id,
          trackId: lesson.trackId,
          courseId: lesson.courseId,
          title: lesson.title,
          description: lesson.description,
          order: lesson.order,
          status: nextStatus,
          passingScore: lesson.passingScore,
          audience: lesson.audience,
        });
      }, nextStatus === 'published' ? 'Módulo publicado.' : 'Módulo voltou para rascunho.');
    }
  }

  /**
   * Reordenar é trocar o `order` com o vizinho. O backend não tem callable de
   * reordenação: são dois upserts.
   */
  async function handleMove(node: LearningNodeRef, direction: -1 | 1) {
    const { track, course, lesson } = resolveNodeContext(node);

    if (node.kind === 'track' && track) {
      const ordered = sortByOrder(tracks);
      const index = ordered.findIndex((entry) => entry.id === track.id);
      const neighbour = ordered[index + direction];
      if (!neighbour) {
        return;
      }

      await runNodeAction(node.id, async () => {
        await onUpsertTrack({
          trackId: track.id,
          title: track.title,
          description: track.description,
          order: neighbour.order,
          status: track.status,
          audience: resolveTrackAudience(track),
        });
        await onUpsertTrack({
          trackId: neighbour.id,
          title: neighbour.title,
          description: neighbour.description,
          order: track.order,
          status: neighbour.status,
          audience: resolveTrackAudience(neighbour),
        });
      }, 'Ordem atualizada.');
      return;
    }

    if (node.kind === 'course' && course) {
      const ordered = sortByOrder(courses.filter((entry) => entry.trackId === course.trackId));
      const index = ordered.findIndex((entry) => entry.id === course.id);
      const neighbour = ordered[index + direction];
      if (!neighbour) {
        return;
      }

      await runNodeAction(node.id, async () => {
        await onUpsertCourse({
          courseId: course.id,
          trackId: course.trackId,
          title: course.title,
          description: course.description,
          order: neighbour.order,
          status: course.status,
          audience: course.audience,
        });
        await onUpsertCourse({
          courseId: neighbour.id,
          trackId: neighbour.trackId,
          title: neighbour.title,
          description: neighbour.description,
          order: course.order,
          status: neighbour.status,
          audience: neighbour.audience,
        });
      }, 'Ordem atualizada.');
      return;
    }

    if (node.kind === 'lesson' && lesson) {
      const ordered = sortByOrder(lessons.filter((entry) => entry.courseId === lesson.courseId));
      const index = ordered.findIndex((entry) => entry.id === lesson.id);
      const neighbour = ordered[index + direction];
      if (!neighbour) {
        return;
      }

      await runNodeAction(node.id, async () => {
        await onUpsertLesson({
          lessonId: lesson.id,
          trackId: lesson.trackId,
          courseId: lesson.courseId,
          title: lesson.title,
          description: lesson.description,
          order: neighbour.order,
          status: lesson.status,
          passingScore: lesson.passingScore,
          audience: lesson.audience,
        });
        await onUpsertLesson({
          lessonId: neighbour.id,
          trackId: neighbour.trackId,
          courseId: neighbour.courseId,
          title: neighbour.title,
          description: neighbour.description,
          order: lesson.order,
          status: neighbour.status,
          passingScore: neighbour.passingScore,
          audience: neighbour.audience,
        });
      }, 'Ordem atualizada.');
    }
  }

  /**
   * Duplicar módulo: cria uma cópia em rascunho reaproveitando blocos e quiz.
   * Os arquivos já enviados são reaproveitados pela URL, sem novo upload.
   */
  async function handleDuplicate(node: LearningNodeRef) {
    if (node.kind !== 'lesson') {
      return;
    }

    const { lesson } = resolveNodeContext(node);
    if (!lesson) {
      return;
    }

    const blocks = getEffectiveLessonBlocks(lesson, lessonBlocks);
    const quiz = quizByLessonId.get(lesson.id);
    const siblingCount = lessons.filter((entry) => entry.courseId === lesson.courseId).length;

    await runNodeAction(node.id, async () => {
      const response = await onUpsertLesson({
        trackId: lesson.trackId,
        courseId: lesson.courseId,
        title: `${lesson.title} (cópia)`,
        description: lesson.description,
        order: siblingCount + 1,
        status: 'draft',
        passingScore: lesson.passingScore,
        audience: lesson.audience,
        contentBlockCount: blocks.length,
      });

      if (blocks.length > 0) {
        await onReplaceLessonBlocks({
          lessonId: response.lessonId,
          blocks: blocks.map((block, index) => ({
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
      }

      if (quiz?.questions?.length) {
        await onUpsertQuiz({
          lessonId: response.lessonId,
          questions: quiz.questions.map((question) => ({
            prompt: question.prompt,
            options: [...question.options],
            correctOptionIndex: question.correctOptionIndex,
          })),
        });
      }

      setSelected({ kind: 'lesson', id: response.lessonId });
    }, 'Módulo duplicado como rascunho.');
  }

  async function handleDelete(node: LearningNodeRef) {
    const { track, course, lesson } = resolveNodeContext(node);

    if (node.kind === 'track' && track) {
      const confirmed = await confirm({
        title: 'Excluir trilha',
        message: `Excluir "${track.title}"?\n\nA trilha precisa estar sem cursos.`,
        confirmLabel: 'Excluir',
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }

      await runNodeAction(node.id, async () => {
        await onDeleteTrack(track.id);
        setSelected(null);
      }, 'Trilha excluída.');
      return;
    }

    if (node.kind === 'course' && course) {
      const confirmed = await confirm({
        title: 'Excluir curso',
        message: `Excluir "${course.title}"?\n\nO curso precisa estar sem módulos.`,
        confirmLabel: 'Excluir',
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }

      await runNodeAction(node.id, async () => {
        await onDeleteCourse(course.id);
        setSelected(null);
      }, 'Curso excluído.');
      return;
    }

    if (node.kind === 'lesson' && lesson) {
      const confirmed = await confirm({
        title: 'Excluir módulo',
        message: `Excluir "${lesson.title}"?\n\nOs blocos, o quiz e todo o progresso já registrado neste módulo serão apagados. Não dá para desfazer.`,
        confirmLabel: 'Excluir',
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }

      await runNodeAction(node.id, async () => {
        await onDeleteLesson(lesson.id);
        setSelected(null);
      }, 'Módulo excluído.');
    }
  }

  async function handleBackfill() {
    resetFeedback();
    setBusyNodeId('backfill');

    try {
      const response = await onBackfillAudience();
      setFeedback(`Público-alvo sincronizado em ${response.trackCount} ${response.trackCount === 1 ? 'trilha' : 'trilhas'}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível sincronizar o público-alvo.');
    } finally {
      setBusyNodeId('');
    }
  }

  function openEditor(node: LearningNodeRef) {
    setEditorError('');
    const { track, course, lesson } = resolveNodeContext(node);

    if (node.kind === 'track' && track) {
      setEditor({ kind: 'track', track });
      return;
    }

    if (node.kind === 'course' && course) {
      setEditor({ kind: 'course', course, trackId: course.trackId });
      return;
    }

    if (node.kind === 'lesson' && lesson) {
      setEditor({ kind: 'lesson', lesson, trackId: lesson.trackId, courseId: lesson.courseId });
    }
  }

  const detailPanel = useMemo(() => {
    if (selectedTrack) {
      const audience = computeEffectiveAudience(selectedTrack, { audience: undefined }, { audience: undefined });
      const trackCourses = courses.filter((course) => course.trackId === selectedTrack.id);
      const trackLessons = lessons.filter((lesson) => lesson.trackId === selectedTrack.id);

      return {
        kind: 'Trilha',
        title: selectedTrack.title,
        description: selectedTrack.description,
        status: selectedTrack.status,
        audience,
        stats: [
          { label: 'Cursos', value: trackCourses.length },
          { label: 'Módulos', value: trackLessons.length },
          { label: 'Publicados', value: trackLessons.filter((lesson) => lesson.status === 'published').length },
        ],
      };
    }

    if (selectedCourse) {
      const track = trackById.get(selectedCourse.trackId) ?? null;
      const audience = track
        ? computeEffectiveAudience(track, selectedCourse, { audience: undefined })
        : { roles: [], belts: [] };
      const courseLessons = lessons.filter((lesson) => lesson.courseId === selectedCourse.id);

      return {
        kind: 'Curso',
        title: selectedCourse.title,
        description: selectedCourse.description,
        status: selectedCourse.status,
        audience,
        stats: [
          { label: 'Módulos', value: courseLessons.length },
          { label: 'Publicados', value: courseLessons.filter((lesson) => lesson.status === 'published').length },
        ],
      };
    }

    if (selectedLesson) {
      const track = trackById.get(selectedLesson.trackId) ?? null;
      const course = courseById.get(selectedLesson.courseId) ?? null;
      const audience = track && course
        ? computeEffectiveAudience(track, course, selectedLesson)
        : { roles: [], belts: [] };
      const blocks = getEffectiveLessonBlocks(selectedLesson, lessonBlocks);

      return {
        kind: 'Módulo',
        title: selectedLesson.title,
        description: selectedLesson.description,
        status: selectedLesson.status,
        audience,
        stats: [
          { label: 'Blocos', value: blocks.length },
          { label: 'Perguntas', value: quizByLessonId.get(selectedLesson.id)?.questions?.length ?? selectedLesson.quizQuestionCount },
          { label: 'Nota mínima', value: `${selectedLesson.passingScore}%` },
        ],
      };
    }

    return null;
  }, [courseById, courses, lessonBlocks, lessons, quizByLessonId, selectedCourse, selectedLesson, selectedTrack, trackById]);

  const reachCount = detailPanel
    ? audienceUsers.filter((user) => matchesEffectiveAudience(detailPanel.audience, { role: user.role, belt: user.belt })).length
    : 0;

  const progressReport = useMemo(() => {
    const track = selectedTrack
      ?? (selectedCourse ? trackById.get(selectedCourse.trackId) ?? null : null)
      ?? (selectedLesson ? trackById.get(selectedLesson.trackId) ?? null : null)
      ?? publishedTracks[0]
      ?? null;

    if (!track) {
      return { track: null, rows: [] as Array<{ user: FirestoreEntity<UserRecord>; completed: number; total: number; current: string }> };
    }

    const trackLessons = buildOrderedLessons(track.id, publishedCourses, publishedLessons, lessonBlocks);
    const rows = audienceUsers
      .filter((user) => {
        const lessonAudience = trackLessons[0]
          ? computeEffectiveAudience(
            track,
            courseById.get(trackLessons[0].lesson.courseId) ?? { audience: undefined },
            trackLessons[0].lesson,
          )
          : null;
        return !lessonAudience || matchesEffectiveAudience(lessonAudience, { role: user.role, belt: user.belt });
      })
      .map((user) => {
        const progressByLesson = new Map(
          progressRecords
            .filter((record) => record.userId === user.id && record.trackId === track.id)
            .map((record) => [record.lessonId, record]),
        );
        const completed = trackLessons.filter((entry) => (
          isProgressComplete(progressByLesson.get(entry.lesson.id), entry.lesson.quizQuestionCount > 0)
        )).length;
        const currentEntry = trackLessons.find((entry) => {
          const runtime = lessonRuntimeStatus(trackLessons, progressByLesson, entry.lesson.id);
          return runtime !== 'completed' && runtime !== 'locked';
        });

        return {
          user,
          completed,
          total: trackLessons.length,
          current: currentEntry ? currentEntry.lesson.title : 'Sem módulo ativo',
        };
      })
      .filter((row) => row.total > 0)
      .sort((left, right) => right.completed - left.completed
        || left.user.displayName.localeCompare(right.user.displayName, 'pt-BR'));

    return { track, rows };
  }, [audienceUsers, courseById, lessonBlocks, progressRecords, publishedCourses, publishedLessons, publishedTracks, selectedCourse, selectedLesson, selectedTrack, trackById]);

  const editorTrack = editor.kind === 'course' || editor.kind === 'lesson'
    ? trackById.get(editor.trackId) ?? null
    : null;
  const editorCourse = editor.kind === 'lesson' ? courseById.get(editor.courseId) ?? null : null;

  return (
    <div className="learning-admin">
      <section className="app-panel app-panel-pad learning-admin__header">
        <div className="learning-admin__header-main">
          <div>
            <p className="app-section-label">Learning Hub</p>
            <h1 className="text-3xl font-bold">Catálogo da rede</h1>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              Monte trilhas, cursos e módulos, defina para quem cada conteúdo aparece e acompanhe o progresso.
            </p>
          </div>
          <div className="app-orb"><ShieldCheck size={16} />Superadmin</div>
        </div>

        <div className="learning-admin__header-tools">
          {onSelectAcademy ? (
            <label className="app-field learning-admin__academy">
              <span className="app-field__label"><Network size={13} /> Recorte de acompanhamento</span>
              <select
                value={selectedAcademyId ?? ''}
                onChange={(event) => onSelectAcademy(event.target.value)}
                className="app-select"
              >
                <option value="">Toda a rede</option>
                {academies.map((academy) => (
                  <option key={academy.id} value={academy.id}>{academy.name}</option>
                ))}
              </select>
            </label>
          ) : null}

          <button
            type="button"
            onClick={() => void handleBackfill()}
            disabled={busyNodeId === 'backfill'}
            className="app-button app-button--dark app-button--small"
            title="Recalcula o público-alvo do conteúdo criado antes da segmentação"
          >
            <RefreshCw size={14} />
            {busyNodeId === 'backfill' ? 'Sincronizando...' : 'Sincronizar conteúdo legado'}
          </button>
        </div>

        <div className="app-stat-grid learning-admin__kpis">
          <article className="app-stat-card">
            <p className="app-stat-card__label">Academias</p>
            <p className="app-stat-card__value">{selectedAcademy ? 1 : academies.length}</p>
          </article>
          <article className="app-stat-card">
            <p className="app-stat-card__label">Trilhas publicadas</p>
            <p className="app-stat-card__value">{publishedTracks.length}</p>
          </article>
          <article className="app-stat-card">
            <p className="app-stat-card__label">Cursos publicados</p>
            <p className="app-stat-card__value">{publishedCourses.length}</p>
          </article>
          <article className="app-stat-card">
            <p className="app-stat-card__label">Módulos publicados</p>
            <p className="app-stat-card__value">{publishedLessons.length}</p>
          </article>
        </div>

        {feedback ? <div className="app-panel app-panel--soft learning-admin__flash"><p className="text-sm">{feedback}</p></div> : null}
        {actionError ? <div className="app-panel app-panel--danger learning-admin__flash"><p className="text-sm">{actionError}</p></div> : null}
      </section>

      <section className="learning-admin__workspace">
        <div className="app-panel app-panel-pad learning-admin__tree-panel">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell"><Route size={18} /></div>
            <div>
              <p className="app-section-label">Estrutura</p>
              <h2 className="text-xl font-bold">Trilhas, cursos e módulos</h2>
            </div>
          </div>

          <LearningContentTree
            tracks={tracks}
            courses={courses}
            lessons={lessons}
            lessonBlocks={lessonBlocks}
            quizzes={quizzes}
            selected={selected}
            busyNodeId={busyNodeId}
            onSelect={setSelected}
            onCreateTrack={() => setEditor({ kind: 'track', track: null })}
            onCreateCourse={(trackId) => setEditor({ kind: 'course', course: null, trackId })}
            onCreateLesson={(trackId, courseId) => setEditor({ kind: 'lesson', lesson: null, trackId, courseId })}
            onEdit={openEditor}
            onDuplicate={(node) => void handleDuplicate(node)}
            onDelete={(node) => void handleDelete(node)}
            onToggleStatus={(node) => void handleToggleStatus(node)}
            onMove={(node, direction) => void handleMove(node, direction)}
          />
        </div>

        <div className="learning-admin__detail">
          <div className="app-panel app-panel-pad">
            {detailPanel ? (
              <>
                <div className="learning-admin__detail-head">
                  <div>
                    <p className="app-section-label">{detailPanel.kind}</p>
                    <h2 className="text-xl font-bold">{detailPanel.title}</h2>
                  </div>
                  <span className={contentBadge(detailPanel.status)}>{contentLabel(detailPanel.status)}</span>
                </div>

                {detailPanel.description ? (
                  <p className="mt-3 text-sm text-[color:var(--text-muted)]">{detailPanel.description}</p>
                ) : null}

                <div className="learning-admin__detail-stats">
                  {detailPanel.stats.map((stat) => (
                    <div key={stat.label} className="learning-admin__detail-stat">
                      <p className="learning-admin__detail-stat-label">{stat.label}</p>
                      <p className="learning-admin__detail-stat-value">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className={`learning-audience__preview ${isEmptyAudience(detailPanel.audience) ? 'is-empty' : ''}`}>
                  <p className="learning-audience__preview-label"><Users size={13} /> Quem vê este conteúdo</p>
                  <p className="learning-audience__preview-value">{describeAudience(detailPanel.audience)}</p>
                  {isEmptyAudience(detailPanel.audience) ? (
                    <p className="learning-audience__preview-warning">
                      <AlertTriangle size={14} />
                      Nenhum perfil atende à combinação atual. Ajuste o público-alvo.
                    </p>
                  ) : (
                    <p className="learning-audience__preview-count">
                      {reachCount} de {audienceUsers.length} pessoas {selectedAcademyId ? 'na academia em foco' : 'na rede'}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => selected && openEditor(selected)}
                  className="app-button app-button--gold mt-4"
                >
                  <Layers size={16} />
                  Editar {detailPanel.kind.toLowerCase()}
                </button>
              </>
            ) : (
              <div className="app-empty">
                Selecione uma trilha, curso ou módulo na estrutura ao lado para ver os detalhes e o público-alvo.
              </div>
            )}
          </div>

          <div className="app-panel app-panel-pad">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell"><BookOpen size={18} /></div>
              <div>
                <p className="app-section-label">Progresso</p>
                <h2 className="text-lg font-bold">
                  {progressReport.track ? progressReport.track.title : 'Nenhuma trilha publicada'}
                </h2>
              </div>
            </div>

            {progressReport.rows.length === 0 ? (
              <div className="app-empty mt-4">
                {progressReport.track
                  ? 'Ninguém do público-alvo iniciou esta trilha ainda.'
                  : 'Publique uma trilha para acompanhar o progresso.'}
              </div>
            ) : (
              <div className="app-list mt-4 learning-admin__progress-list">
                {progressReport.rows.map((row) => (
                  <div key={row.user.id} className="app-list-card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold">{row.user.displayName}</p>
                        <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                          {row.completed}/{row.total} módulos · {row.current}
                        </p>
                      </div>
                      <span className={statusBadge(row.completed === row.total ? 'completed' : 'watching')}>
                        {row.completed === row.total ? statusLabel('completed') : `${Math.round((row.completed / row.total) * 100)}%`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <TrackEditorModal
        open={editor.kind === 'track'}
        track={editor.kind === 'track' ? editor.track : null}
        nextOrder={tracks.length + 1}
        audienceUsers={audienceUsers}
        busy={editorBusy}
        error={editorError}
        onClose={closeEditor}
        onSubmit={(payload) => void handleSaveTrack(payload)}
      />

      <CourseEditorModal
        open={editor.kind === 'course'}
        course={editor.kind === 'course' ? editor.course : null}
        track={editorTrack}
        nextOrder={editor.kind === 'course'
          ? courses.filter((course) => course.trackId === editor.trackId).length + 1
          : 1}
        audienceUsers={audienceUsers}
        busy={editorBusy}
        error={editorError}
        onClose={closeEditor}
        onSubmit={(payload) => void handleSaveCourse(payload)}
      />

      <LessonEditorModal
        open={editor.kind === 'lesson'}
        lesson={editor.kind === 'lesson' ? editor.lesson : null}
        course={editorCourse}
        track={editorTrack}
        lessonBlocks={lessonBlocks}
        quiz={editor.kind === 'lesson' && editor.lesson ? quizByLessonId.get(editor.lesson.id) ?? null : null}
        nextOrder={editor.kind === 'lesson'
          ? lessons.filter((lesson) => lesson.courseId === editor.courseId).length + 1
          : 1}
        audienceUsers={audienceUsers}
        busy={editorBusy}
        busyLabel={editorBusyLabel}
        error={editorError}
        onClose={closeEditor}
        onSubmit={(payload) => void handleSaveLesson(payload)}
      />
    </div>
  );
};

export default LearningAdminView;
