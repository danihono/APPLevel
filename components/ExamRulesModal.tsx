import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ScrollText, X, ZoomIn, ZoomOut } from 'lucide-react';
import { getBeltMeta } from '../beltCatalog';
import { EXAM_RULE_DOCS, suggestedExamBelt } from '../examRules';
import type { BeltColor } from '../types';

const ZOOM_STEPS = [1, 1.5, 2, 3];

/** Em telas estreitas a página cabe inteira, mas fica pequena demais para ler. */
function initialZoomIndex(): number {
  if (typeof window === 'undefined') return 0;
  return window.innerWidth < 640 ? 2 : 0;
}

interface ExamRulesModalProps {
  /** Faixa usada para pré-selecionar o exame mais relevante. */
  currentBelt?: string | null;
  onClose: () => void;
}

const ExamRulesModal: React.FC<ExamRulesModalProps> = ({ currentBelt, onClose }) => {
  const initialBelt = useMemo(() => {
    const suggested = suggestedExamBelt(currentBelt);
    return EXAM_RULE_DOCS.some((doc) => doc.belt === suggested) ? suggested : EXAM_RULE_DOCS[0].belt;
  }, [currentBelt]);

  const [selectedBelt, setSelectedBelt] = useState<BeltColor>(initialBelt);
  const [zoomIndex, setZoomIndex] = useState(initialZoomIndex);
  const [imageFailed, setImageFailed] = useState(false);

  const activeDoc = EXAM_RULE_DOCS.find((doc) => doc.belt === selectedBelt) ?? EXAM_RULE_DOCS[0];
  const zoom = ZOOM_STEPS[zoomIndex];

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function selectBelt(belt: BeltColor) {
    setSelectedBelt(belt);
    setZoomIndex(initialZoomIndex());
    setImageFailed(false);
  }

  // Toque/clique na página avança o zoom e volta ao início depois do máximo.
  function cycleZoom() {
    setZoomIndex((index) => (index + 1) % ZOOM_STEPS.length);
  }

  return (
    <div className="exam-rules" role="dialog" aria-modal="true" aria-label="Regras de exame" onClick={onClose}>
      <div className="app-panel exam-rules__panel" onClick={(event) => event.stopPropagation()}>
        <div className="exam-rules__head">
          <div className="exam-rules__head-main">
            <div className="app-icon-shell"><ScrollText size={18} /></div>
            <div className="min-w-0">
              <h2 className="exam-rules__title">Regras de exame</h2>
              <p className="exam-rules__subtitle">Roteiro oficial de graduação da LEVEL Jiu-Jitsu.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="app-button app-button--ghost app-button--icon" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="exam-rules__tabs" role="tablist" aria-label="Faixa do exame">
          {EXAM_RULE_DOCS.map((doc) => {
            const isActive = doc.belt === selectedBelt;
            const meta = getBeltMeta(doc.belt);
            return (
              <button
                key={doc.belt}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectBelt(doc.belt)}
                className={`exam-rules__tab${isActive ? ' is-active' : ''}`}
                style={isActive ? { borderColor: meta.breakdownColor } : undefined}
              >
                <span className="exam-rules__tab-belt" style={{ background: meta.main }} aria-hidden="true" />
                {doc.label}
              </button>
            );
          })}
        </div>

        <div className="exam-rules__body">
          {imageFailed ? (
            <div className="app-empty">
              Não foi possível carregar o roteiro do exame. Abra o PDF pelo botão abaixo.
            </div>
          ) : (
            <img
              src={activeDoc.imageUrl}
              alt={activeDoc.title}
              className="exam-rules__page"
              style={{ width: `${zoom * 100}%` }}
              onClick={cycleZoom}
              onError={() => setImageFailed(true)}
            />
          )}
        </div>

        <div className="exam-rules__footer">
          <div className="exam-rules__zoom">
            <button
              type="button"
              onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
              disabled={zoomIndex === 0}
              className="app-button app-button--ghost app-button--icon"
              aria-label="Diminuir zoom"
            >
              <ZoomOut size={16} />
            </button>
            <span className="exam-rules__zoom-value">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              className="app-button app-button--ghost app-button--icon"
              aria-label="Aumentar zoom"
            >
              <ZoomIn size={16} />
            </button>
          </div>

          <a
            href={activeDoc.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="app-button app-button--gold app-button--small exam-rules__pdf-link"
          >
            <ExternalLink size={16} />
            Abrir PDF
          </a>
        </div>
      </div>
    </div>
  );
};

export default ExamRulesModal;
