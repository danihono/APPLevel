import React, { useEffect, useMemo, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, ExternalLink, ScrollText, X, ZoomIn, ZoomOut } from 'lucide-react';
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
  const [pdfOpenError, setPdfOpenError] = useState('');
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);

  const activeDoc = EXAM_RULE_DOCS.find((doc) => doc.belt === selectedBelt) ?? EXAM_RULE_DOCS[0];
  const zoom = ZOOM_STEPS[zoomIndex];

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (pdfViewerOpen) {
          setPdfViewerOpen(false);
        } else {
          onClose();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pdfViewerOpen]);

  function selectBelt(belt: BeltColor) {
    setSelectedBelt(belt);
    setZoomIndex(initialZoomIndex());
    setImageFailed(false);
    setPdfOpenError('');
  }

  // Toque/clique na página avança o zoom e volta ao início depois do máximo.
  function cycleZoom() {
    setZoomIndex((index) => (index + 1) % ZOOM_STEPS.length);
  }

  async function openPdf() {
    setPdfOpenError('');

    const isNativeApp = Capacitor.isNativePlatform();
    const firebaseProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();

    if (!isNativeApp) {
      setPdfViewerOpen(true);
      return;
    }

    if (!firebaseProjectId) {
      setPdfOpenError('Não foi possível localizar o PDF. Tente novamente mais tarde.');
      return;
    }

    const baseUrl = `https://${firebaseProjectId}.web.app`;

    try {
      await Browser.open({
        url: new URL(activeDoc.pdfUrl, baseUrl).href,
        windowName: '_blank',
        presentationStyle: 'fullscreen',
        toolbarColor: '#0a0a0a',
      });
    } catch (error) {
      console.error('Não foi possível abrir o PDF das regras de exame.', error);
      setPdfOpenError('Não foi possível abrir o PDF. Tente novamente.');
    }
  }

  if (pdfViewerOpen) {
    return (
      <div
        className="exam-rules__pdf-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={`Visualização do PDF: ${activeDoc.title}`}
      >
        <header className="exam-rules__pdf-viewer-head">
          <button
            type="button"
            onClick={() => setPdfViewerOpen(false)}
            className="app-button app-button--ghost app-button--small"
            aria-label="Voltar para as regras de exame"
          >
            <ArrowLeft size={17} />
            Voltar
          </button>

          <h2 className="exam-rules__pdf-viewer-title">{activeDoc.title}</h2>

          <button
            type="button"
            onClick={() => setPdfViewerOpen(false)}
            className="app-button app-button--ghost app-button--icon"
            aria-label="Fechar PDF e voltar para as regras de exame"
          >
            <X size={18} />
          </button>
        </header>

        <iframe
          src={activeDoc.pdfUrl}
          title={activeDoc.title}
          className="exam-rules__pdf-frame"
        />
      </div>
    );
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
          {pdfOpenError ? (
            <div className="app-alert app-alert--error exam-rules__pdf-error" role="alert">
              {pdfOpenError}
            </div>
          ) : null}

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

          <button
            type="button"
            onClick={() => void openPdf()}
            className="app-button app-button--gold app-button--small exam-rules__pdf-link"
          >
            <ExternalLink size={16} />
            Abrir PDF
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExamRulesModal;
