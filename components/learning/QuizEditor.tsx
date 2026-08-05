import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { emptyQuestion, type QuizQuestionDraft } from '../../views/learning/learningShared';

interface QuizEditorProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  questions: QuizQuestionDraft[];
  onChange: (questions: QuizQuestionDraft[]) => void;
  passingScore: number;
  onPassingScoreChange: (value: number) => void;
  /** Erros por índice de pergunta, preenchidos na validação do submit. */
  errors?: Record<number, string>;
}

/**
 * Quiz opcional do módulo. Salvar com o quiz desativado envia `questions: []`,
 * o que remove o documento do quiz no backend.
 */
const QuizEditor: React.FC<QuizEditorProps> = ({
  enabled,
  onToggle,
  questions,
  onChange,
  passingScore,
  onPassingScoreChange,
  errors = {},
}) => {
  function updateQuestion(index: number, patch: Partial<QuizQuestionDraft>) {
    onChange(questions.map((question, position) => (position === index ? { ...question, ...patch } : question)));
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    onChange(questions.map((question, position) => (
      position === questionIndex
        ? { ...question, options: question.options.map((option, index) => (index === optionIndex ? value : option)) }
        : question
    )));
  }

  return (
    <div className="learning-quiz-editor">
      <div className="learning-quiz-editor__toolbar">
        <div className="learning-audience__mode" role="group" aria-label="Modo do quiz">
          <button
            type="button"
            onClick={() => onToggle(true)}
            className={`learning-chip ${enabled ? 'is-selected' : ''}`}
          >
            Com quiz
          </button>
          <button
            type="button"
            onClick={() => onToggle(false)}
            className={`learning-chip ${!enabled ? 'is-selected' : ''}`}
          >
            Sem quiz
          </button>
        </div>

        {enabled ? (
          <label className="app-field learning-quiz-editor__score">
            <span className="app-field__label">Nota mínima (%)</span>
            <input
              type="number"
              min={1}
              max={100}
              value={passingScore}
              onChange={(event) => onPassingScoreChange(Number(event.target.value))}
              className="app-input"
            />
          </label>
        ) : null}
      </div>

      {!enabled ? (
        <div className="app-empty">
          Sem quiz: o módulo é concluído automaticamente assim que todos os blocos forem
          assistidos ou marcados como concluídos.
        </div>
      ) : (
        <>
          <ol className="learning-quiz-editor__list">
            {questions.map((question, questionIndex) => (
              <li key={`question-${questionIndex}`} className={`learning-quiz-card ${errors[questionIndex] ? 'is-invalid' : ''}`}>
                <div className="learning-quiz-card__head">
                  <span className="learning-block-card__index">{questionIndex + 1}</span>
                  <input
                    value={question.prompt}
                    onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })}
                    className="app-input"
                    placeholder="Enunciado da pergunta"
                    aria-label={`Enunciado da pergunta ${questionIndex + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => onChange(questions.filter((_, position) => position !== questionIndex))}
                    disabled={questions.length <= 1}
                    className="learning-icon-button learning-icon-button--danger"
                    aria-label="Remover pergunta"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="learning-quiz-card__options">
                  {question.options.map((option, optionIndex) => (
                    <label key={`question-${questionIndex}-option-${optionIndex}`} className="learning-quiz-card__option">
                      <input
                        type="radio"
                        name={`correct-option-${questionIndex}`}
                        checked={question.correctOptionIndex === optionIndex}
                        onChange={() => updateQuestion(questionIndex, { correctOptionIndex: optionIndex })}
                        aria-label={`Marcar alternativa ${optionIndex + 1} como correta`}
                      />
                      <input
                        value={option}
                        onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)}
                        className="app-input"
                        placeholder={`Alternativa ${optionIndex + 1}`}
                      />
                    </label>
                  ))}
                </div>

                <p className="app-field__hint">Marque o círculo da alternativa correta.</p>
                {errors[questionIndex] ? <p className="app-field__error">{errors[questionIndex]}</p> : null}
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={() => onChange([...questions, emptyQuestion()])}
            className="app-button app-button--dark app-button--small"
          >
            <Plus size={14} />
            Adicionar pergunta
          </button>
        </>
      )}
    </div>
  );
};

export default QuizEditor;
