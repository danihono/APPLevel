import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Image as ImageIcon,
  Trash2,
  Upload,
  Video,
  Youtube,
} from 'lucide-react';
import {
  blockTypeLabel,
  createEditorBlock,
  type EditorBlockDraft,
} from '../../views/learning/learningShared';
import type { LearningLessonBlockType } from '../../services/firebase/models';

const BLOCK_TYPE_OPTIONS: Array<{
  type: LearningLessonBlockType;
  label: string;
  icon: React.ReactNode;
}> = [
  { type: 'youtube', label: 'YouTube', icon: <Youtube size={14} /> },
  { type: 'uploaded_video', label: 'Vídeo', icon: <Video size={14} /> },
  { type: 'pdf', label: 'PDF', icon: <FileText size={14} /> },
  { type: 'image', label: 'Imagem', icon: <ImageIcon size={14} /> },
];

const ACCEPT_BY_TYPE: Partial<Record<LearningLessonBlockType, string>> = {
  uploaded_video: 'video/*',
  pdf: 'application/pdf',
  image: 'image/*',
};

interface LessonBlockEditorProps {
  blocks: EditorBlockDraft[];
  onChange: (blocks: EditorBlockDraft[]) => void;
  /** Erros por `tempId`, preenchidos na validação do submit. */
  errors?: Record<string, string>;
}

/**
 * Monta a lista ordenada de blocos do módulo. O upload em si acontece no submit
 * do modal (precisa do `lessonId`), então aqui só guardamos o `File`.
 */
const LessonBlockEditor: React.FC<LessonBlockEditorProps> = ({ blocks, onChange, errors = {} }) => {
  function updateBlock(tempId: string, patch: Partial<EditorBlockDraft>) {
    onChange(blocks.map((block) => (block.tempId === tempId ? { ...block, ...patch } : block)));
  }

  function addBlock(type: LearningLessonBlockType) {
    onChange([...blocks, createEditorBlock(type, blocks.length + 1)]);
  }

  function removeBlock(tempId: string) {
    onChange(
      blocks
        .filter((block) => block.tempId !== tempId)
        .map((block, index) => ({ ...block, order: index + 1 })),
    );
  }

  function moveBlock(tempId: string, direction: -1 | 1) {
    const index = blocks.findIndex((block) => block.tempId === tempId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= blocks.length) {
      return;
    }

    const reordered = [...blocks];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    onChange(reordered.map((block, position) => ({ ...block, order: position + 1 })));
  }

  return (
    <div className="learning-blocks">
      <div className="learning-blocks__toolbar">
        <p className="app-field__label">Blocos de conteúdo</p>
        <div className="learning-blocks__add">
          {BLOCK_TYPE_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.type}
              onClick={() => addBlock(option.type)}
              className="learning-chip learning-chip--preset"
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="app-empty">
          Nenhum bloco ainda. Adicione um vídeo do YouTube, um upload, um PDF ou uma imagem —
          um módulo publicado precisa de pelo menos um bloco.
        </div>
      ) : (
        <ol className="learning-blocks__list">
          {blocks.map((block, index) => {
            const blockError = errors[block.tempId];
            const isUpload = block.type !== 'youtube';

            return (
              <li key={block.tempId} className={`learning-block-card ${blockError ? 'is-invalid' : ''}`}>
                <div className="learning-block-card__head">
                  <span className="learning-block-card__index">{index + 1}</span>
                  <div className="learning-block-card__head-main">
                    <select
                      value={block.type}
                      onChange={(event) => updateBlock(block.tempId, {
                        type: event.target.value as LearningLessonBlockType,
                        sourceUrl: '',
                        storagePath: '',
                        mimeType: '',
                        fileName: '',
                        file: null,
                      })}
                      className="app-select learning-block-card__type"
                      aria-label={`Tipo do bloco ${index + 1}`}
                    >
                      {BLOCK_TYPE_OPTIONS.map((option) => (
                        <option key={option.type} value={option.type}>{option.label}</option>
                      ))}
                    </select>
                    <input
                      value={block.title}
                      onChange={(event) => updateBlock(block.tempId, { title: event.target.value })}
                      className="app-input"
                      placeholder={`Título do bloco (${blockTypeLabel(block.type)})`}
                      aria-label={`Título do bloco ${index + 1}`}
                    />
                  </div>
                  <div className="learning-block-card__actions">
                    <button
                      type="button"
                      onClick={() => moveBlock(block.tempId, -1)}
                      disabled={index === 0}
                      className="learning-icon-button"
                      aria-label="Mover bloco para cima"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBlock(block.tempId, 1)}
                      disabled={index === blocks.length - 1}
                      className="learning-icon-button"
                      aria-label="Mover bloco para baixo"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlock(block.tempId)}
                      className="learning-icon-button learning-icon-button--danger"
                      aria-label="Remover bloco"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="learning-block-card__body">
                  {block.type === 'youtube' ? (
                    <label className="app-field">
                      <span className="app-field__label">URL do YouTube</span>
                      <input
                        value={block.sourceUrl}
                        onChange={(event) => updateBlock(block.tempId, { sourceUrl: event.target.value })}
                        className="app-input"
                        placeholder="https://www.youtube.com/watch?v=..."
                      />
                    </label>
                  ) : null}

                  {isUpload ? (
                    <label className="app-field">
                      <span className="app-field__label">Arquivo</span>
                      <input
                        type="file"
                        accept={ACCEPT_BY_TYPE[block.type]}
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          updateBlock(block.tempId, {
                            file,
                            fileName: file?.name ?? block.fileName,
                            mimeType: file?.type ?? block.mimeType,
                          });
                        }}
                        className="app-input"
                      />
                      <span className="app-field__hint">
                        {block.file
                          ? `Novo arquivo: ${block.file.name}`
                          : (block.fileName
                            ? `Arquivo atual: ${block.fileName}`
                            : 'Nenhum arquivo enviado ainda.')}
                      </span>
                    </label>
                  ) : null}

                  {block.sourceUrl && isUpload ? (
                    <a
                      href={block.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="app-button app-button--dark app-button--small"
                    >
                      <Upload size={14} />
                      Ver arquivo atual
                    </a>
                  ) : null}

                  {blockError ? <p className="app-field__error">{blockError}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

export default LessonBlockEditor;
