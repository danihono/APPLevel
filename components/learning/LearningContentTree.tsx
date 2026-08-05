import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Eye,
  EyeOff,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  computeEffectiveAudience,
  describeAudience,
  isEmptyAudience,
} from '../../learningAudience';
import {
  contentBadge,
  contentLabel,
  sortByOrder,
  type ContentStatus,
  type CourseEntity,
  type LessonBlockEntity,
  type LessonEntity,
  type QuizEntity,
  type TrackEntity,
} from '../../views/learning/learningShared';

export type LearningNodeKind = 'track' | 'course' | 'lesson';

export interface LearningNodeRef {
  kind: LearningNodeKind;
  id: string;
}

type StatusFilter = 'all' | ContentStatus;

interface LearningContentTreeProps {
  tracks: TrackEntity[];
  courses: CourseEntity[];
  lessons: LessonEntity[];
  lessonBlocks: LessonBlockEntity[];
  quizzes: QuizEntity[];
  selected: LearningNodeRef | null;
  onSelect: (node: LearningNodeRef) => void;
  onCreateTrack: () => void;
  onCreateCourse: (trackId: string) => void;
  onCreateLesson: (trackId: string, courseId: string) => void;
  onEdit: (node: LearningNodeRef) => void;
  onDuplicate: (node: LearningNodeRef) => void;
  onDelete: (node: LearningNodeRef) => void;
  onToggleStatus: (node: LearningNodeRef) => void;
  onMove: (node: LearningNodeRef, direction: -1 | 1) => void;
  /** Id do nó com ação em andamento — desabilita os botões daquele item. */
  busyNodeId?: string;
}

/**
 * Navegador hierárquico trilha › curso › módulo. Substitui o fluxo antigo de
 * "escolher no dropdown para editar": cada nó traz status, público-alvo e as
 * ações diretamente.
 */
const LearningContentTree: React.FC<LearningContentTreeProps> = ({
  tracks,
  courses,
  lessons,
  lessonBlocks,
  quizzes,
  selected,
  onSelect,
  onCreateTrack,
  onCreateCourse,
  onCreateLesson,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleStatus,
  onMove,
  busyNodeId,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [collapsedTrackIds, setCollapsedTrackIds] = useState<string[]>([]);
  const [collapsedCourseIds, setCollapsedCourseIds] = useState<string[]>([]);

  const quizByLessonId = useMemo(
    () => new Map(quizzes.map((quiz) => [quiz.lessonId, quiz])),
    [quizzes],
  );
  const blockCountByLessonId = useMemo(() => {
    const counts = new Map<string, number>();
    lessonBlocks.forEach((block) => {
      counts.set(block.lessonId, (counts.get(block.lessonId) ?? 0) + 1);
    });
    return counts;
  }, [lessonBlocks]);

  const normalizedSearch = search.trim().toLowerCase();

  function matchesSearch(value: string): boolean {
    return !normalizedSearch || value.toLowerCase().includes(normalizedSearch);
  }

  function matchesStatus(status: ContentStatus): boolean {
    return statusFilter === 'all' || status === statusFilter;
  }

  /**
   * Um nó pai continua visível quando algum filho casa com a busca, senão a
   * árvore some inteira enquanto se digita o nome de um módulo.
   */
  const visibleTree = useMemo(() => sortByOrder(tracks).map((track) => {
    const trackCourses = sortByOrder(courses.filter((course) => course.trackId === track.id)).map((course) => {
      const courseLessons = sortByOrder(lessons.filter((lesson) => lesson.courseId === course.id))
        .filter((lesson) => matchesSearch(lesson.title) && matchesStatus(lesson.status));

      return { course, lessons: courseLessons };
    });

    const filteredCourses = trackCourses.filter((entry) => (
      entry.lessons.length > 0
      || (matchesSearch(entry.course.title) && matchesStatus(entry.course.status))
    ));

    return { track, courses: filteredCourses };
  }).filter((entry) => (
    entry.courses.length > 0
    || (matchesSearch(entry.track.title) && matchesStatus(entry.track.status))
  )), [courses, lessons, normalizedSearch, statusFilter, tracks]);

  function isSelected(kind: LearningNodeKind, id: string): boolean {
    return selected?.kind === kind && selected.id === id;
  }

  function renderActions(node: LearningNodeRef, status: ContentStatus, canDuplicate: boolean) {
    const busy = busyNodeId === node.id;

    return (
      <div className="learning-tree__actions">
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onMove(node, -1); }}
          disabled={busy}
          className="learning-icon-button"
          aria-label="Mover para cima"
          title="Mover para cima"
        >
          <ArrowUp size={13} />
        </button>
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onMove(node, 1); }}
          disabled={busy}
          className="learning-icon-button"
          aria-label="Mover para baixo"
          title="Mover para baixo"
        >
          <ArrowDown size={13} />
        </button>
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onToggleStatus(node); }}
          disabled={busy}
          className="learning-icon-button"
          aria-label={status === 'published' ? 'Despublicar' : 'Publicar'}
          title={status === 'published' ? 'Despublicar' : 'Publicar'}
        >
          {status === 'published' ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        {canDuplicate ? (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onDuplicate(node); }}
            disabled={busy}
            className="learning-icon-button"
            aria-label="Duplicar"
            title="Duplicar"
          >
            <Copy size={13} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onEdit(node); }}
          disabled={busy}
          className="learning-icon-button"
          aria-label="Editar"
          title="Editar"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onDelete(node); }}
          disabled={busy}
          className="learning-icon-button learning-icon-button--danger"
          aria-label="Excluir"
          title="Excluir"
        >
          <Trash2 size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="learning-tree">
      <div className="learning-tree__toolbar">
        <label className="learning-tree__search">
          <Search size={14} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar trilha, curso ou módulo"
            aria-label="Buscar conteúdo"
          />
        </label>
        <div className="learning-tree__filters">
          {([
            { id: 'all', label: 'Todos' },
            { id: 'published', label: 'Publicados' },
            { id: 'draft', label: 'Rascunhos' },
          ] as Array<{ id: StatusFilter; label: string }>).map((option) => (
            <button
              type="button"
              key={option.id}
              onClick={() => setStatusFilter(option.id)}
              className={`learning-chip ${statusFilter === option.id ? 'is-selected' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onCreateTrack} className="app-button app-button--gold app-button--small">
          <Plus size={14} />
          Nova trilha
        </button>
      </div>

      {visibleTree.length === 0 ? (
        <div className="app-empty">
          {tracks.length === 0
            ? 'Nenhuma trilha ainda. Crie a primeira para começar o catálogo.'
            : 'Nenhum conteúdo bate com a busca ou o filtro atual.'}
        </div>
      ) : (
        <ul className="learning-tree__list">
          {visibleTree.map(({ track, courses: trackCourses }) => {
            const trackCollapsed = collapsedTrackIds.includes(track.id);
            const trackAudience = computeEffectiveAudience(track, { audience: undefined }, { audience: undefined });

            return (
              <li key={track.id} className="learning-tree__track">
                <div
                  className={`learning-tree__node learning-tree__node--track ${isSelected('track', track.id) ? 'is-selected' : ''}`}
                  onClick={() => onSelect({ kind: 'track', id: track.id })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect({ kind: 'track', id: track.id });
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setCollapsedTrackIds((current) => (
                        current.includes(track.id)
                          ? current.filter((id) => id !== track.id)
                          : [...current, track.id]
                      ));
                    }}
                    className={`learning-tree__caret ${trackCollapsed ? '' : 'is-open'}`}
                    aria-label={trackCollapsed ? 'Expandir trilha' : 'Recolher trilha'}
                  >
                    <ChevronRight size={14} />
                  </button>

                  <div className="learning-tree__node-main">
                    <p className="learning-tree__node-title">{track.title}</p>
                    <p className={`learning-tree__node-audience ${isEmptyAudience(trackAudience) ? 'is-empty' : ''}`}>
                      {describeAudience(trackAudience)}
                    </p>
                  </div>

                  <span className={contentBadge(track.status)}>{contentLabel(track.status)}</span>
                  {renderActions({ kind: 'track', id: track.id }, track.status, false)}
                </div>

                {!trackCollapsed ? (
                  <ul className="learning-tree__courses">
                    {trackCourses.map(({ course, lessons: courseLessons }) => {
                      const courseCollapsed = collapsedCourseIds.includes(course.id);
                      const courseAudience = computeEffectiveAudience(track, course, { audience: undefined });

                      return (
                        <li key={course.id}>
                          <div
                            className={`learning-tree__node learning-tree__node--course ${isSelected('course', course.id) ? 'is-selected' : ''}`}
                            onClick={() => onSelect({ kind: 'course', id: course.id })}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onSelect({ kind: 'course', id: course.id });
                              }
                            }}
                          >
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setCollapsedCourseIds((current) => (
                                  current.includes(course.id)
                                    ? current.filter((id) => id !== course.id)
                                    : [...current, course.id]
                                ));
                              }}
                              className={`learning-tree__caret ${courseCollapsed ? '' : 'is-open'}`}
                              aria-label={courseCollapsed ? 'Expandir curso' : 'Recolher curso'}
                            >
                              <ChevronRight size={14} />
                            </button>

                            <div className="learning-tree__node-main">
                              <p className="learning-tree__node-title">{course.title}</p>
                              <p className={`learning-tree__node-audience ${isEmptyAudience(courseAudience) ? 'is-empty' : ''}`}>
                                {describeAudience(courseAudience)}
                              </p>
                            </div>

                            <span className={contentBadge(course.status)}>{contentLabel(course.status)}</span>
                            {renderActions({ kind: 'course', id: course.id }, course.status, false)}
                          </div>

                          {!courseCollapsed ? (
                            <ul className="learning-tree__lessons">
                              {courseLessons.map((lesson) => {
                                const lessonAudience = computeEffectiveAudience(track, course, lesson);
                                const blockCount = blockCountByLessonId.get(lesson.id)
                                  ?? (lesson.videoUrl ? 1 : 0);
                                const questionCount = quizByLessonId.get(lesson.id)?.questions?.length
                                  ?? lesson.quizQuestionCount;

                                return (
                                  <li key={lesson.id}>
                                    <div
                                      className={`learning-tree__node learning-tree__node--lesson ${isSelected('lesson', lesson.id) ? 'is-selected' : ''}`}
                                      onClick={() => onSelect({ kind: 'lesson', id: lesson.id })}
                                      role="button"
                                      tabIndex={0}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault();
                                          onSelect({ kind: 'lesson', id: lesson.id });
                                        }
                                      }}
                                    >
                                      <span className="learning-tree__caret learning-tree__caret--leaf" aria-hidden="true" />

                                      <div className="learning-tree__node-main">
                                        <p className="learning-tree__node-title">{lesson.title}</p>
                                        <p className="learning-tree__node-meta">
                                          <Layers size={12} />
                                          {blockCount} {blockCount === 1 ? 'bloco' : 'blocos'}
                                          {questionCount > 0 ? (
                                            <>
                                              <ClipboardCheck size={12} />
                                              quiz · {questionCount}
                                            </>
                                          ) : null}
                                        </p>
                                        <p className={`learning-tree__node-audience ${isEmptyAudience(lessonAudience) ? 'is-empty' : ''}`}>
                                          {describeAudience(lessonAudience)}
                                        </p>
                                      </div>

                                      <span className={contentBadge(lesson.status)}>{contentLabel(lesson.status)}</span>
                                      {renderActions({ kind: 'lesson', id: lesson.id }, lesson.status, true)}
                                    </div>
                                  </li>
                                );
                              })}

                              <li>
                                <button
                                  type="button"
                                  onClick={() => onCreateLesson(track.id, course.id)}
                                  className="learning-tree__add"
                                >
                                  <Plus size={13} />
                                  Novo módulo em {course.title}
                                </button>
                              </li>
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}

                    <li>
                      <button
                        type="button"
                        onClick={() => onCreateCourse(track.id)}
                        className="learning-tree__add learning-tree__add--course"
                      >
                        <Plus size={13} />
                        Novo curso em {track.title}
                      </button>
                    </li>
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default LearningContentTree;
