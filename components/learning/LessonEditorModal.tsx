import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Layers, Sliders, Users } from 'lucide-react';
import LearningAudienceField from './LearningAudienceField';
import LearningEditorModal from './LearningEditorModal';
import LessonBlockEditor from './LessonBlockEditor';
import QuizEditor from './QuizEditor';
import {
  DEFAULT_INHERIT_AUDIENCE,
  getEffectiveLessonBlocks,
  normalizeBlocksForSave,
  normalizeQuizDrafts,
  toEditorBlock,
  type ContentStatus,
  type CourseEntity,
  type EditorBlockDraft,
  type LessonBlockEntity,
  type LessonEntity,
  type QuizEntity,
  type QuizQuestionDraft,
  type TrackEntity,
} from '../../views/learning/learningShared';
import { resolveCourseAudience, resolveTrackAudience } from '../../learningAudience';
import type { FirestoreEntity } from '../../services/firebase/data';
import type { LearningAudienceConfig, UserRecord } from '../../services/firebase/models';

type LessonEditorTab = 'data' | 'blocks' | 'quiz' | 'audience';

export interface LessonEditorSubmit {
  lessonId?: string;
  trackId: string;
  courseId: string;
  title: string;
  description?: string;
  order: number;
  status: ContentStatus;
  passingScore: number;
  audience: LearningAudienceConfig;
  blocks: EditorBlockDraft[];
  quizEnabled: boolean;
  quizQuestions: QuizQuestionDraft[];
}

interface LessonEditorModalProps {
  open: boolean;
  /** `null` cria um módulo novo dentro de `course`. */
  lesson: LessonEntity | null;
  course: CourseEntity | null;
  track: TrackEntity | null;
  lessonBlocks: LessonBlockEntity[];
  quiz: QuizEntity | null;
  nextOrder: number;
  audienceUsers?: Array<FirestoreEntity<UserRecord>>;
  busy?: boolean;
  busyLabel?: string;
  error?: string;
  onClose: () => void;
  onSubmit: (payload: LessonEditorSubmit) => void;
}

const TABS: Array<{ id: LessonEditorTab; label: string; icon: React.ReactNode }> = [
  { id: 'data', label: 'Dados', icon: <Sliders size={14} /> },
  { id: 'blocks', label: 'Blocos', icon: <Layers size={14} /> },
  { id: 'quiz', label: 'Quiz', icon: <ClipboardCheck size={14} /> },
  { id: 'audience', label: 'Público', icon: <Users size={14} /> },
];

const LessonEditorModal: React.FC<LessonEditorModalProps> = ({
  open,
  lesson,
  course,
  track,
  lessonBlocks,
  quiz,
  nextOrder,
  audienceUsers = [],
  busy = false,
  busyLabel,
  error,
  onClose,
  onSubmit,
}) => {
  const [tab, setTab] = useState<LessonEditorTab>('data');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [order, setOrder] = useState(1);
  const [status, setStatus] = useState<ContentStatus>('draft');
  const [passingScore, setPassingScore] = useState(80);
  const [audience, setAudience] = useState<LearningAudienceConfig>(DEFAULT_INHERIT_AUDIENCE);
  const [blocks, setBlocks] = useState<EditorBlockDraft[]>([]);
  const [quizEnabled, setQuizEnabled] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionDraft[]>([]);
  const [titleError, setTitleError] = useState('');
  const [blockErrors, setBlockErrors] = useState<Record<string, string>>({});
  const [quizErrors, setQuizErrors] = useState<Record<number, string>>({});
  const [validationSummary, setValidationSummary] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    setTab('data');
    setTitle(lesson?.title ?? '');
    setDescription(lesson?.description ?? '');
    setOrder(lesson?.order ?? nextOrder);
    setStatus(lesson?.status ?? 'draft');
    setPassingScore(lesson?.passingScore ?? 80);
    setAudience(lesson?.audience ?? DEFAULT_INHERIT_AUDIENCE);
    setBlocks(lesson ? getEffectiveLessonBlocks(lesson, lessonBlocks).map(toEditorBlock) : []);
    setQuizEnabled(Boolean(quiz?.questions?.length));
    setQuizQuestions(normalizeQuizDrafts(quiz ?? undefined));
    setTitleError('');
    setBlockErrors({});
    setQuizErrors({});
    setValidationSummary('');
  }, [lesson, lessonBlocks, nextOrder, open, quiz]);

  const parentAudiences = useMemo(() => {
    if (!track) {
      return [];
    }

    return course
      ? [resolveTrackAudience(track), resolveCourseAudience(course, track)]
      : [resolveTrackAudience(track)];
  }, [course, track]);

  function isYouTubeUrl(value: string): boolean {
    try {
      const host = new URL(value).hostname.replace(/^www\./, '');
      return host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com';
    } catch {
      return false;
    }
  }

  function validate(): boolean {
    const trimmedTitle = title.trim();
    const nextBlockErrors: Record<string, string> = {};
    const nextQuizErrors: Record<number, string> = {};
    let firstInvalidTab: LessonEditorTab | null = null;

    if (!trimmedTitle) {
      setTitleError('Informe o título do módulo.');
      firstInvalidTab = 'data';
    } else {
      setTitleError('');
    }

    blocks.forEach((block) => {
      if (!block.title.trim()) {
        nextBlockErrors[block.tempId] = 'Informe o título deste bloco.';
        return;
      }

      if (block.type === 'youtube') {
        if (!block.sourceUrl.trim()) {
          nextBlockErrors[block.tempId] = 'Informe a URL do YouTube.';
        } else if (!isYouTubeUrl(block.sourceUrl.trim())) {
          nextBlockErrors[block.tempId] = 'Informe uma URL válida do YouTube.';
        }
        return;
      }

      if (!block.file && !block.sourceUrl) {
        nextBlockErrors[block.tempId] = 'Envie um arquivo para este bloco.';
      }
    });

    if (Object.keys(nextBlockErrors).length > 0 && !firstInvalidTab) {
      firstInvalidTab = 'blocks';
    }

    // O backend recusa publicar um módulo sem nenhum bloco.
    if (status === 'published' && blocks.length === 0) {
      setValidationSummary('Adicione ao menos um bloco de conteúdo antes de publicar o módulo.');
      setBlockErrors(nextBlockErrors);
      setQuizErrors({});
      setTab('blocks');
      return false;
    }

    if (quizEnabled) {
      quizQuestions.forEach((question, index) => {
        const filledOptions = question.options.map((option) => option.trim()).filter(Boolean);
        if (!question.prompt.trim()) {
          nextQuizErrors[index] = 'Informe o enunciado da pergunta.';
        } else if (filledOptions.length < 2) {
          nextQuizErrors[index] = 'Preencha ao menos duas alternativas.';
        } else if (!question.options[question.correctOptionIndex]?.trim()) {
          nextQuizErrors[index] = 'A alternativa marcada como correta está vazia.';
        }
      });

      if (quizQuestions.length === 0) {
        nextQuizErrors[0] = 'Cadastre uma pergunta ou desative o quiz.';
      }

      if (Object.keys(nextQuizErrors).length > 0 && !firstInvalidTab) {
        firstInvalidTab = 'quiz';
      }
    }

    setBlockErrors(nextBlockErrors);
    setQuizErrors(nextQuizErrors);

    if (firstInvalidTab) {
      setValidationSummary('Revise os campos destacados antes de salvar.');
      setTab(firstInvalidTab);
      return false;
    }

    setValidationSummary('');
    return true;
  }

  function handleSubmit() {
    if (!track || !course) {
      return;
    }

    if (!validate()) {
      return;
    }

    onSubmit({
      lessonId: lesson?.id,
      trackId: track.id,
      courseId: course.id,
      title: title.trim(),
      description: description.trim() || undefined,
      order: Number(order) || 1,
      status,
      passingScore: Number(passingScore) || 80,
      audience,
      blocks: normalizeBlocksForSave(blocks),
      quizEnabled,
      quizQuestions: quizQuestions.map((question) => ({
        prompt: question.prompt.trim(),
        options: question.options.map((option) => option.trim()).filter(Boolean),
        correctOptionIndex: question.correctOptionIndex,
      })),
    });
  }

  const tabCounts: Record<LessonEditorTab, string> = {
    data: '',
    blocks: blocks.length > 0 ? String(blocks.length) : '',
    quiz: quizEnabled ? String(quizQuestions.length) : '',
    audience: '',
  };

  return (
    <LearningEditorModal
      open={open}
      title={lesson ? 'Editar módulo' : 'Novo módulo'}
      subtitle={course && track ? `${track.title} › ${course.title}` : 'Selecione um curso antes de criar o módulo.'}
      icon={<Layers size={20} />}
      busy={busy}
      error={error || validationSummary}
      submitLabel={busyLabel || (lesson ? 'Salvar módulo' : 'Criar módulo')}
      onClose={onClose}
      onSubmit={handleSubmit}
      tabs={TABS.map((entry) => (
        <button
          type="button"
          key={entry.id}
          onClick={() => setTab(entry.id)}
          className={`learning-modal__tab ${tab === entry.id ? 'is-active' : ''}`}
        >
          {entry.icon}
          {entry.label}
          {tabCounts[entry.id] ? <span className="learning-modal__tab-count">{tabCounts[entry.id]}</span> : null}
        </button>
      ))}
    >
      {tab === 'data' ? (
        <div className="learning-form-grid">
          <label className="app-field learning-form-grid__full">
            <span className="app-field__label">Título</span>
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (titleError) {
                  setTitleError('');
                }
              }}
              className="app-input"
              placeholder="Ex.: Raspagem da meia-guarda"
              autoFocus
            />
            {titleError ? <span className="app-field__error">{titleError}</span> : null}
          </label>

          <label className="app-field learning-form-grid__full">
            <span className="app-field__label">Descrição</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="app-input min-h-[6rem]"
            />
          </label>

          <label className="app-field">
            <span className="app-field__label">Ordem</span>
            <input
              type="number"
              min={1}
              value={order}
              onChange={(event) => setOrder(Number(event.target.value))}
              className="app-input"
            />
          </label>

          <label className="app-field">
            <span className="app-field__label">Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ContentStatus)}
              className="app-select"
            >
              <option value="draft">Rascunho</option>
              <option value="published">Publicado</option>
            </select>
          </label>
        </div>
      ) : null}

      {tab === 'blocks' ? (
        <LessonBlockEditor blocks={blocks} onChange={setBlocks} errors={blockErrors} />
      ) : null}

      {tab === 'quiz' ? (
        <QuizEditor
          enabled={quizEnabled}
          onToggle={setQuizEnabled}
          questions={quizQuestions}
          onChange={setQuizQuestions}
          passingScore={passingScore}
          onPassingScoreChange={setPassingScore}
          errors={quizErrors}
        />
      ) : null}

      {tab === 'audience' ? (
        <LearningAudienceField
          value={audience}
          onChange={setAudience}
          parentAudiences={parentAudiences}
          parent="curso"
          audienceUsers={audienceUsers}
        />
      ) : null}
    </LearningEditorModal>
  );
};

export default LessonEditorModal;
