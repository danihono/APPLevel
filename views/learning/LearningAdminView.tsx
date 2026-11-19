import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Network,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Route,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import CourseEditorModal, { type CourseEditorSubmit } from '../../components/learning/CourseEditorModal';
import type { LearningNodeRef } from '../../components/learning/LearningContentTree';
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
  contentLabel,
  getEffectiveLessonBlocks,
  isProgressComplete,
  lessonRuntimeStatus,
  sortByOrder,
  statusLabel,
  type ContentStatus,
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
import { LIGHT_TRACK_COLORS, lessonCover, trackColor, trackIcon } from './learningLook';
import './learning-studio.css';
import { t } from '../../i18n';

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

type StudioFilter = 'all' | ContentStatus;

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
  // Navegacao do Estudio: lista de trilhas -> trilha (cursos) -> curso (modulos).
  const [studioTrackId, setStudioTrackId] = useState('');
  const [studioCourseId, setStudioCourseId] = useState('');
  const [studioSearch, setStudioSearch] = useState('');
  const [studioFilter, setStudioFilter] = useState<StudioFilter>('all');

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
      setActionError(error instanceof Error ? error.message : t('Não foi possível concluir a ação.'));
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
      if (!payload.trackId) {
        // Trilha nova: abre direto nela, onde ficam os botoes de criar curso.
        setStudioTrackId(response.trackId);
        setStudioCourseId('');
      }
      setFeedback(t('Trilha salva.'));
      closeEditor();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : t('Não foi possível salvar a trilha.'));
      setEditorBusy(false);
    }
  }

  async function handleSaveCourse(payload: CourseEditorSubmit) {
    setEditorBusy(true);
    setEditorError('');

    try {
      const response = await onUpsertCourse(payload);
      setSelected({ kind: 'course', id: response.courseId });
      if (!payload.courseId) {
        // Curso novo: abre direto nele, onde ficam os botoes de criar modulo.
        setStudioTrackId(payload.trackId);
        setStudioCourseId(response.courseId);
      }
      setFeedback(t('Curso salvo.'));
      closeEditor();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : t('Não foi possível salvar o curso.'));
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
    setEditorBusyLabel(t('Salvando módulo...'));

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
        setEditorBusyLabel(t('Enviando arquivos...'));
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

      setEditorBusyLabel(t('Gravando blocos...'));
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

      setEditorBusyLabel(t('Gravando quiz...'));
      await onUpsertQuiz({
        lessonId: lessonResponse.lessonId,
        questions: payload.quizEnabled ? payload.quizQuestions : [],
      });

      setSelected({ kind: 'lesson', id: lessonResponse.lessonId });
      setFeedback(t('Módulo salvo.'));
      closeEditor();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : t('Não foi possível salvar o módulo.'));
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
      }, nextStatus === 'published' ? t('Trilha publicada.') : t('Trilha voltou para rascunho.'));
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
      }, nextStatus === 'published' ? t('Curso publicado.') : t('Curso voltou para rascunho.'));
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
      }, nextStatus === 'published' ? t('Módulo publicado.') : t('Módulo voltou para rascunho.'));
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
      }, t('Ordem atualizada.'));
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
      }, t('Ordem atualizada.'));
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
      }, t('Ordem atualizada.'));
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
    }, t('Módulo duplicado como rascunho.'));
  }

  async function handleDelete(node: LearningNodeRef) {
    const { track, course, lesson } = resolveNodeContext(node);

    if (node.kind === 'track' && track) {
      const confirmed = await confirm({
        title: t('Excluir trilha'),
        message: t('Excluir "{title}"?\n\nA trilha precisa estar sem cursos.', { title: track.title }),
        confirmLabel: t('Excluir'),
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }

      await runNodeAction(node.id, async () => {
        await onDeleteTrack(track.id);
        setSelected(null);
      }, t('Trilha excluída.'));
      return;
    }

    if (node.kind === 'course' && course) {
      const confirmed = await confirm({
        title: t('Excluir curso'),
        message: t('Excluir "{title}"?\n\nO curso precisa estar sem módulos.', { title: course.title }),
        confirmLabel: t('Excluir'),
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }

      await runNodeAction(node.id, async () => {
        await onDeleteCourse(course.id);
        setSelected(null);
      }, t('Curso excluído.'));
      return;
    }

    if (node.kind === 'lesson' && lesson) {
      const confirmed = await confirm({
        title: t('Excluir módulo'),
        message: t('Excluir "{title}"?\n\nOs blocos, o quiz e todo o progresso já registrado neste módulo serão apagados. Não dá para desfazer.', { title: lesson.title }),
        confirmLabel: t('Excluir'),
        tone: 'danger',
      });
      if (!confirmed) {
        return;
      }

      await runNodeAction(node.id, async () => {
        await onDeleteLesson(lesson.id);
        setSelected(null);
      }, t('Módulo excluído.'));
    }
  }

  async function handleBackfill() {
    resetFeedback();
    setBusyNodeId('backfill');

    try {
      const response = await onBackfillAudience();
      setFeedback(response.trackCount === 1 ? t('Público-alvo sincronizado em 1 trilha.') : t('Público-alvo sincronizado em {count} trilhas.', { count: response.trackCount }));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('Não foi possível sincronizar o público-alvo.'));
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
        kind: t('Trilha'),
        title: selectedTrack.title,
        description: selectedTrack.description,
        status: selectedTrack.status,
        audience,
        stats: [
          { label: t('Cursos'), value: trackCourses.length },
          { label: t('Módulos'), value: trackLessons.length },
          { label: t('Publicados'), value: trackLessons.filter((lesson) => lesson.status === 'published').length },
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
        kind: t('Curso'),
        title: selectedCourse.title,
        description: selectedCourse.description,
        status: selectedCourse.status,
        audience,
        stats: [
          { label: t('Módulos'), value: courseLessons.length },
          { label: t('Publicados'), value: courseLessons.filter((lesson) => lesson.status === 'published').length },
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
        kind: t('Módulo'),
        title: selectedLesson.title,
        description: selectedLesson.description,
        status: selectedLesson.status,
        audience,
        stats: [
          { label: t('Blocos'), value: blocks.length },
          { label: t('Perguntas'), value: quizByLessonId.get(selectedLesson.id)?.questions?.length ?? selectedLesson.quizQuestionCount },
          { label: t('Nota mínima'), value: `${selectedLesson.passingScore}%` },
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
          current: currentEntry ? currentEntry.lesson.title : t('Sem módulo ativo'),
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

  const trackOrderIds = sortByOrder(tracks).map((track) => track.id);
  const studioTrack = studioTrackId ? trackById.get(studioTrackId) ?? null : null;
  const studioCourse = studioTrack && studioCourseId ? courseById.get(studioCourseId) ?? null : null;
  const normalizedSearch = studioSearch.trim().toLocaleLowerCase('pt-BR');

  const openStudioTrack = (trackId: string) => {
    resetFeedback();
    setStudioTrackId(trackId);
    setStudioCourseId('');
    setSelected({ kind: 'track', id: trackId });
  };
  const openStudioCourse = (trackId: string, courseId: string) => {
    resetFeedback();
    setStudioTrackId(trackId);
    setStudioCourseId(courseId);
    setSelected({ kind: 'course', id: courseId });
  };
  const backToTracks = () => {
    resetFeedback();
    setStudioTrackId('');
    setStudioCourseId('');
    setSelected(null);
  };

  const statusPill = (status: ContentStatus) => (
    <span className={`rd-studio__status ${status === 'published' ? 'is-pub' : ''}`}>{contentLabel(status)}</span>
  );

  const renderTile = (track: TrackEntity, size: 'md' | 'lg' = 'md') => {
    const color = trackColor(track.id, trackOrderIds);
    const Icon = trackIcon(track.title);
    return (
      <span
        className={`rd-studio__tile rd-studio__tile--${size}${LIGHT_TRACK_COLORS.has(color) ? ' is-light' : ''}`}
        style={{ '--tc': color } as React.CSSProperties}
        aria-hidden="true"
      >
        <Icon size={size === 'lg' ? 28 : 20} strokeWidth={2} />
      </span>
    );
  };

  const moveButtons = (node: LearningNodeRef) => (
    <span className="rd-studio__order">
      <button type="button" className="rd-studio__icon" onClick={() => void handleMove(node, -1)} disabled={busyNodeId === node.id} aria-label={t('Mover para cima')} title={t('Mover para cima')}>
        <ArrowUp size={15} />
      </button>
      <button type="button" className="rd-studio__icon" onClick={() => void handleMove(node, 1)} disabled={busyNodeId === node.id} aria-label={t('Mover para baixo')} title={t('Mover para baixo')}>
        <ArrowDown size={15} />
      </button>
    </span>
  );

  const headActions = (node: LearningNodeRef, status: ContentStatus, editLabel: string) => (
    <div className="rd-studio__actions">
      <button type="button" className="lv-btn lv-btn--primary lv-btn--sm" onClick={() => openEditor(node)}>
        <Pencil size={15} />
        {editLabel}
      </button>
      <button type="button" className="lv-btn lv-btn--neutral lv-btn--sm" onClick={() => void handleToggleStatus(node)} disabled={busyNodeId === node.id}>
        {status === 'published' ? <EyeOff size={15} /> : <Eye size={15} />}
        {status === 'published' ? t('Despublicar') : t('Publicar')}
      </button>
      <button type="button" className="lv-btn lv-btn--neutral lv-btn--sm rd-studio__danger" onClick={() => void handleDelete(node)} disabled={busyNodeId === node.id}>
        <Trash2 size={15} />
        {t('Excluir')}
      </button>
    </div>
  );

  const audienceCard = detailPanel ? (
    <div className={`lv-glass rd-studio__audience ${isEmptyAudience(detailPanel.audience) ? 'is-empty' : ''}`}>
      <span className="rd-studio__audience-icon" aria-hidden="true"><Users size={18} /></span>
      <span className="rd-studio__audience-text">
        <small>{t('Quem vê este conteúdo')}</small>
        <b>{describeAudience(detailPanel.audience)}</b>
        {isEmptyAudience(detailPanel.audience) ? (
          <em><AlertTriangle size={13} /> {t('Nenhum perfil atende à combinação atual. Ajuste o público-alvo.')}</em>
        ) : null}
      </span>
      {!isEmptyAudience(detailPanel.audience) ? (
        <span className="rd-studio__reach">
          {selectedAcademyId
            ? t('{reach} de {total} pessoas na academia em foco', { reach: reachCount, total: audienceUsers.length })
            : t('{reach} de {total} pessoas na rede', { reach: reachCount, total: audienceUsers.length })}
        </span>
      ) : null}
    </div>
  ) : null;

  const flash = (
    <>
      {feedback ? <p className="rd-studio__flash" role="status">{feedback}</p> : null}
      {actionError ? <p className="rd-studio__flash is-error" role="alert">{actionError}</p> : null}
    </>
  );

  let screen: React.ReactNode;

  if (studioTrack && studioCourse) {
    /* ─── Curso: modulos em ordem ─────────────────────────────────── */
    const courseLessons = sortByOrder(lessons.filter((lesson) => lesson.courseId === studioCourse.id));
    const color = trackColor(studioTrack.id, trackOrderIds);
    screen = (
      <>
        <div className="rd-studio__bar">
          <button type="button" className="lv-icon-btn" onClick={() => openStudioTrack(studioTrack.id)} aria-label={t('Voltar')}>
            <ChevronLeft size={22} strokeWidth={2.2} />
          </button>
          <span className="rd-studio__crumb">{studioTrack.title}</span>
        </div>

        <div className="rd-studio__cover" style={{ '--tc': color } as React.CSSProperties}>
          {(() => {
            const first = courseLessons[0];
            const cover = first ? lessonCover({ blocks: getEffectiveLessonBlocks(first, lessonBlocks) }) : '';
            return cover ? <img src={cover} alt="" /> : null;
          })()}
          <span className="rd-studio__cover-text">
            <small>{t('Curso')}</small>
            <b>{studioCourse.title}</b>
          </span>
          {statusPill(studioCourse.status)}
        </div>
        {studioCourse.description ? <p className="rd-studio__lead">{studioCourse.description}</p> : null}
        {headActions({ kind: 'course', id: studioCourse.id }, studioCourse.status, t('Editar curso'))}
        {flash}
        {audienceCard}

        <div className="rd-studio__sec">
          <h2>{t('Módulos')}</h2>
          <span>{courseLessons.length === 1 ? t('1 módulo') : t('{count} módulos', { count: courseLessons.length })}</span>
        </div>
        {courseLessons.length ? (
          <ol className="lv-glass rd-studio__list">
            {courseLessons.map((lesson, index) => {
              const blocks = getEffectiveLessonBlocks(lesson, lessonBlocks);
              const questions = quizByLessonId.get(lesson.id)?.questions?.length ?? lesson.quizQuestionCount;
              const cover = lessonCover({ blocks });
              const node: LearningNodeRef = { kind: 'lesson', id: lesson.id };
              return (
                <li key={lesson.id} className="rd-studio__row rd-studio__row--lesson">
                  <button type="button" className="rd-studio__row-main" onClick={() => openEditor(node)}>
                    <span className="rd-studio__thumb" style={{ '--tc': color } as React.CSSProperties} aria-hidden="true">
                      {cover ? <img src={cover} alt="" loading="lazy" /> : <Play size={14} fill="currentColor" />}
                    </span>
                    <span className="rd-studio__row-text">
                      <b><span className="rd-studio__num">{index + 1}.</span> {lesson.title}</b>
                      <span>
                        {blocks.length === 1 ? t('1 bloco') : t('{count} blocos', { count: blocks.length })}
                        {questions > 0 ? ` · ${t('quiz com {count} perguntas', { count: questions })}` : ''}
                      </span>
                    </span>
                    {statusPill(lesson.status)}
                  </button>
                  <span className="rd-studio__row-tools">
                    {moveButtons(node)}
                    <button type="button" className="rd-studio__icon" onClick={() => void handleToggleStatus(node)} disabled={busyNodeId === lesson.id} aria-label={lesson.status === 'published' ? t('Despublicar') : t('Publicar')} title={lesson.status === 'published' ? t('Despublicar') : t('Publicar')}>
                      {lesson.status === 'published' ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button type="button" className="rd-studio__icon" onClick={() => void handleDuplicate(node)} disabled={busyNodeId === lesson.id} aria-label={t('Duplicar')} title={t('Duplicar')}>
                      <Copy size={15} />
                    </button>
                    <button type="button" className="rd-studio__icon rd-studio__danger" onClick={() => void handleDelete(node)} disabled={busyNodeId === lesson.id} aria-label={t('Excluir')} title={t('Excluir')}>
                      <Trash2 size={15} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="rd-studio__empty">{t('Nenhum módulo neste curso ainda.')}</p>
        )}
        <button type="button" className="rd-studio__add" onClick={() => setEditor({ kind: 'lesson', lesson: null, trackId: studioTrack.id, courseId: studioCourse.id })}>
          <Plus size={16} />
          {t('Novo módulo')}
        </button>
      </>
    );
  } else if (studioTrack) {
    /* ─── Trilha: cursos + progresso ──────────────────────────────── */
    const trackCourses = sortByOrder(courses.filter((course) => course.trackId === studioTrack.id));
    const color = trackColor(studioTrack.id, trackOrderIds);
    screen = (
      <>
        <div className="rd-studio__bar">
          <button type="button" className="lv-icon-btn" onClick={backToTracks} aria-label={t('Voltar')}>
            <ChevronLeft size={22} strokeWidth={2.2} />
          </button>
          <span className="rd-studio__crumb">{t('Trilhas')}</span>
        </div>

        <div className="rd-studio__head">
          {renderTile(studioTrack, 'lg')}
          <div className="rd-studio__head-text">
            <p className="rd-studio__eyebrow">{t('Trilha')}</p>
            <h1 className="rd-studio__title rd-studio__title--sm">{studioTrack.title}</h1>
          </div>
          {statusPill(studioTrack.status)}
        </div>
        {studioTrack.description ? <p className="rd-studio__lead">{studioTrack.description}</p> : null}
        {headActions({ kind: 'track', id: studioTrack.id }, studioTrack.status, t('Editar trilha'))}
        {flash}
        {audienceCard}

        <div className="rd-studio__sec">
          <h2>{t('Cursos')}</h2>
          <span>{trackCourses.length === 1 ? t('1 curso') : t('{count} cursos', { count: trackCourses.length })}</span>
        </div>
        {trackCourses.length ? (
          <div className="rd-studio__courses">
            {trackCourses.map((course) => {
              const courseLessons = sortByOrder(lessons.filter((lesson) => lesson.courseId === course.id));
              const first = courseLessons[0];
              const cover = first ? lessonCover({ blocks: getEffectiveLessonBlocks(first, lessonBlocks) }) : '';
              return (
                <div key={course.id} className="rd-studio__course">
                  <button
                    type="button"
                    className="rd-studio__course-cover"
                    style={{ '--tc': color } as React.CSSProperties}
                    onClick={() => openStudioCourse(studioTrack.id, course.id)}
                  >
                    {cover ? <img src={cover} alt="" loading="lazy" /> : null}
                    {statusPill(course.status)}
                    <span className="rd-studio__cover-text">
                      <b>{course.title}</b>
                      <small>{courseLessons.length === 1 ? t('1 módulo') : t('{count} módulos', { count: courseLessons.length })}</small>
                    </span>
                  </button>
                  {moveButtons({ kind: 'course', id: course.id })}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rd-studio__empty">{t('Nenhum curso nesta trilha ainda. Crie o primeiro.')}</p>
        )}
        <button type="button" className="rd-studio__add" onClick={() => setEditor({ kind: 'course', course: null, trackId: studioTrack.id })}>
          <Plus size={16} />
          {t('Novo curso')}
        </button>

        <div className="rd-studio__sec">
          <h2>{t('Progresso')}</h2>
        </div>
        {progressReport.track?.id === studioTrack.id && progressReport.rows.length ? (
          <ul className="lv-glass rd-studio__list">
            {progressReport.rows.map((row) => (
              <li key={row.user.id} className="rd-studio__row">
                <span className="rd-studio__row-main is-static">
                  <span className="rd-studio__avatar" aria-hidden="true">{(row.user.displayName || '?').charAt(0).toLocaleUpperCase()}</span>
                  <span className="rd-studio__row-text">
                    <b>{row.user.displayName}</b>
                    <span>{t('{completed}/{total} módulos', { completed: row.completed, total: row.total })} · {row.current}</span>
                  </span>
                  <span className={`rd-studio__status ${row.completed === row.total ? 'is-pub' : 'is-going'}`}>
                    {row.completed === row.total ? statusLabel('completed') : `${Math.round((row.completed / row.total) * 100)}%`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rd-studio__empty">
            {studioTrack.status === 'published'
              ? t('Ninguém do público-alvo iniciou esta trilha ainda.')
              : t('Publique a trilha (e os cursos e módulos) para os alunos começarem.')}
          </p>
        )}
      </>
    );
  } else {
    /* ─── Lista de trilhas (com busca) ────────────────────────────── */
    const matches = (value: string) => !normalizedSearch || value.toLocaleLowerCase('pt-BR').includes(normalizedSearch);
    const statusOk = (status: ContentStatus) => studioFilter === 'all' || status === studioFilter;
    const sortedTracks = sortByOrder(tracks).filter((track) => statusOk(track.status) && (matches(track.title)
      || (normalizedSearch && courses.some((course) => course.trackId === track.id && matches(course.title)))
      || (normalizedSearch && lessons.some((lesson) => lesson.trackId === track.id && matches(lesson.title)))));
    const lessonHits = normalizedSearch
      ? sortByOrder(lessons.filter((lesson) => matches(lesson.title) && statusOk(lesson.status))).slice(0, 12)
      : [];

    screen = (
      <>
        <div className="rd-studio__hero">
          <div>
            <p className="rd-studio__eyebrow">{t('Learning · Superadmin')}</p>
            <h1 className="rd-studio__title">{t('Estúdio')}</h1>
            <p className="rd-studio__lead">{t('Tudo que alunos e professores veem no Learning nasce aqui. Comece pela trilha; dentro dela, os cursos; dentro do curso, os módulos.')}</p>
          </div>
          <button type="button" className="lv-btn lv-btn--primary rd-studio__new" onClick={() => setEditor({ kind: 'track', track: null })}>
            <Plus size={18} />
            {t('Nova trilha')}
          </button>
        </div>

        <div className="rd-studio__kpis">
          <span><b>{publishedTracks.length}</b>{t('Trilhas publicadas')}</span>
          <span><b>{publishedCourses.length}</b>{t('Cursos publicados')}</span>
          <span><b>{publishedLessons.length}</b>{t('Módulos publicados')}</span>
          <span><b>{selectedAcademy ? 1 : academies.length}</b>{t('Academias')}</span>
        </div>

        <div className="rd-studio__tools">
          <label className="rd-studio__search">
            <Search size={16} aria-hidden="true" />
            <input
              value={studioSearch}
              onChange={(event) => setStudioSearch(event.target.value)}
              placeholder={t('Buscar trilha, curso ou módulo')}
              aria-label={t('Buscar conteúdo')}
            />
          </label>
          <div className="rd-studio__filters" role="group" aria-label={t('Status')}>
            {([['all', t('Todos')], ['published', t('Publicados')], ['draft', t('Rascunhos')]] as Array<[StudioFilter, string]>).map(([id, label]) => (
              <button key={id} type="button" className={studioFilter === id ? 'is-on' : ''} aria-pressed={studioFilter === id} onClick={() => setStudioFilter(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {flash}

        {sortedTracks.length ? (
          <ul className="lv-glass rd-studio__list">
            {sortedTracks.map((track) => {
              const trackCourses = courses.filter((course) => course.trackId === track.id);
              const trackLessons = lessons.filter((lesson) => lesson.trackId === track.id);
              const audience = computeEffectiveAudience(track, { audience: undefined }, { audience: undefined });
              return (
                <li key={track.id} className="rd-studio__row">
                  <button type="button" className="rd-studio__row-main" onClick={() => openStudioTrack(track.id)}>
                    {renderTile(track)}
                    <span className="rd-studio__row-text">
                      <b>{track.title}</b>
                      <span>
                        {trackCourses.length === 1 ? t('1 curso') : t('{count} cursos', { count: trackCourses.length })}
                        {' · '}
                        {trackLessons.length === 1 ? t('1 módulo') : t('{count} módulos', { count: trackLessons.length })}
                      </span>
                      <span className={isEmptyAudience(audience) ? 'is-warn' : ''}>{describeAudience(audience)}</span>
                    </span>
                    {statusPill(track.status)}
                    <ChevronRight size={18} className="rd-studio__chev" aria-hidden="true" />
                  </button>
                  <span className="rd-studio__row-tools">{moveButtons({ kind: 'track', id: track.id })}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="lv-glass rd-studio__blank">
            <span className="rd-studio__blank-icon" aria-hidden="true"><Route size={24} /></span>
            <b>{tracks.length === 0 ? t('Nenhuma trilha ainda') : t('Nada encontrado')}</b>
            <p>
              {tracks.length === 0
                ? t('Nenhuma trilha ainda. Crie a primeira para começar o catálogo.')
                : t('Nenhum conteúdo bate com a busca ou o filtro atual.')}
            </p>
          </div>
        )}

        {lessonHits.length ? (
          <>
            <div className="rd-studio__sec"><h2>{t('Módulos encontrados')}</h2></div>
            <ul className="lv-glass rd-studio__list">
              {lessonHits.map((lesson) => {
                const course = courseById.get(lesson.courseId);
                const track = trackById.get(lesson.trackId);
                return (
                  <li key={lesson.id} className="rd-studio__row">
                    <button
                      type="button"
                      className="rd-studio__row-main"
                      onClick={() => (track && course ? openStudioCourse(track.id, course.id) : openEditor({ kind: 'lesson', id: lesson.id }))}
                    >
                      <span className="rd-studio__row-text">
                        <b>{lesson.title}</b>
                        <span>{[track?.title, course?.title].filter(Boolean).join(' · ')}</span>
                      </span>
                      {statusPill(lesson.status)}
                      <ChevronRight size={18} className="rd-studio__chev" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        <div className="rd-studio__foot">
          {onSelectAcademy ? (
            <label className="rd-studio__select">
              <span><Network size={14} /> {t('Recorte de acompanhamento')}</span>
              <select value={selectedAcademyId ?? ''} onChange={(event) => onSelectAcademy(event.target.value)}>
                <option value="">{t('Toda a rede')}</option>
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
            className="rd-studio__link"
            title={t('Recalcula o público-alvo do conteúdo criado antes da segmentação')}
          >
            <RefreshCw size={14} />
            {busyNodeId === 'backfill' ? t('Sincronizando...') : t('Sincronizar conteúdo legado')}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="lv-screen rd-studio">
      {screen}

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
