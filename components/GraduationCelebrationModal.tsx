import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Award, X } from 'lucide-react';
import {
  beltLabel,
  getBeltMeta,
  normalizeBeltId,
} from '../beltCatalog';
import type { FirestoreEntity } from '../services/firebase/data';
import type { GraduationRecord } from '../services/firebase/models';
import BjjBelt from './BjjBelt';

interface GraduationCelebrationModalProps {
  graduation: FirestoreEntity<GraduationRecord>;
  studentName: string;
  onClose: () => void;
  onOpenGraduation: () => void;
}

type ImageFormat = 'webp' | 'png' | 'none';

const GraduationCelebrationModal: React.FC<GraduationCelebrationModalProps> = ({
  graduation,
  studentName,
  onClose,
  onOpenGraduation,
}) => {
  const previousBelt = normalizeBeltId(graduation.previousBelt);
  const newBelt = normalizeBeltId(graduation.newBelt);
  const targetMeta = getBeltMeta(newBelt);
  const firstName = studentName.trim().split(/\s+/)[0] || 'atleta';
  const imageBasePath = `/graduation-celebrations/${previousBelt}-to-${newBelt}`;
  const [imageFormat, setImageFormat] = useState<ImageFormat>('webp');

  const promotedAtLabel = useMemo(() => (
    graduation.promotedAt
      ? graduation.promotedAt.toDate().toLocaleDateString('pt-BR')
      : ''
  ), [graduation.promotedAt]);

  useEffect(() => {
    setImageFormat('webp');
  }, [imageBasePath]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const imageSrc = imageFormat === 'none' ? '' : `${imageBasePath}.${imageFormat}`;

  return (
    <div
      className="graduation-celebration"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="graduation-celebration__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="graduation-celebration-title"
        style={{
          '--graduation-target-color': targetMeta.breakdownColor,
          '--graduation-target-surface': targetMeta.main,
        } as React.CSSProperties}
      >
        <button
          type="button"
          className="app-button app-button--ghost app-button--icon graduation-celebration__close"
          onClick={onClose}
          aria-label="Fechar celebração"
          title="Fechar"
        >
          <X size={18} />
        </button>

        <div className="graduation-celebration__media">
          {imageFormat !== 'none' ? (
            <img
              src={imageSrc}
              alt={`Promoção de ${beltLabel(previousBelt)} para ${beltLabel(newBelt)}`}
              className="graduation-celebration__image"
              onError={() => setImageFormat((current) => (current === 'webp' ? 'png' : 'none'))}
            />
          ) : (
            <div className="graduation-celebration__fallback" aria-hidden="true">
              <div className="graduation-celebration__belt-card">
                <span>{beltLabel(previousBelt)}</span>
                <BjjBelt color={previousBelt} stripes={graduation.previousStripes} />
              </div>
              <div className="graduation-celebration__arrow">
                <ArrowRight size={22} />
              </div>
              <div className="graduation-celebration__belt-card graduation-celebration__belt-card--new">
                <span>{beltLabel(newBelt)}</span>
                <BjjBelt color={newBelt} stripes={graduation.newStripes} />
              </div>
            </div>
          )}
        </div>

        <div className="graduation-celebration__body">
          <div className="graduation-celebration__badge">
            <Award size={16} />
            Nova faixa
          </div>

          <div>
            <p className="app-section-label">Parabéns, {firstName}</p>
            <h2 id="graduation-celebration-title" className="graduation-celebration__title">
              Você foi promovido para a faixa {beltLabel(newBelt)}
            </h2>
            <p className="graduation-celebration__copy">
              Seu professor registrou a evolução de {beltLabel(previousBelt)} para {beltLabel(newBelt)}.
              {promotedAtLabel ? ` Graduação aprovada em ${promotedAtLabel}.` : ''}
            </p>
          </div>

          <div className="graduation-celebration__route">
            <span>{beltLabel(previousBelt)}</span>
            <ArrowRight size={16} />
            <strong>{beltLabel(newBelt)}</strong>
          </div>

          <div className="graduation-celebration__actions">
            <button type="button" className="app-button app-button--ghost" onClick={onClose}>
              Continuar
            </button>
            <button
              type="button"
              className="app-button app-button--gold"
              onClick={onOpenGraduation}
              autoFocus
            >
              <Award size={16} />
              Ver graduação
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default GraduationCelebrationModal;
