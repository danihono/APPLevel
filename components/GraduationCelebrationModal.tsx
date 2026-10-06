import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Award, Share, X } from 'lucide-react';
import {
  beltLabel,
  getBeltMeta,
  normalizeBeltId,
} from '../beltCatalog';
import { hasBeltImage } from '../beltImages';
import type { FirestoreEntity } from '../services/firebase/data';
import type { GraduationRecord } from '../services/firebase/models';
import BeltImage from './BeltImage';
import { t, getLocale } from '../i18n';
import '../views/redesign/evolution.css';

interface GraduationCelebrationModalProps {
  graduation: FirestoreEntity<GraduationRecord>;
  studentName: string;
  onClose: () => void;
  onOpenGraduation: () => void;
}

type ImageFormat = 'webp' | 'png' | 'none';

// Confete so em CSS: posicoes fixas (deterministicas) para nao "pular" a cada render.
const CONFETTI = Array.from({ length: 26 }, (_, index) => {
  const seed = (index * 37 + 11) % 100;
  return {
    left: (index * 61 + 7) % 100,
    top: (index * 29 + 13) % 70,
    delay: (seed % 24) / 10,
    duration: 3.2 + ((index * 13) % 20) / 10,
    rotate: (index * 47) % 180,
    light: index % 3 === 0,
    wide: index % 4 === 1,
  };
});

const GraduationCelebrationModal: React.FC<GraduationCelebrationModalProps> = ({
  graduation,
  studentName,
  onClose,
  onOpenGraduation,
}) => {
  const previousBelt = normalizeBeltId(graduation.previousBelt);
  const newBelt = normalizeBeltId(graduation.newBelt);
  const beltChanged = previousBelt !== newBelt;
  const targetMeta = getBeltMeta(newBelt);
  const firstName = studentName.trim().split(/\s+/)[0] || t('atleta');
  const imageBasePath = `/graduation-celebrations/${previousBelt}-to-${newBelt}`;
  const [imageFormat, setImageFormat] = useState<ImageFormat>('webp');
  // Faixa adulta tem a imagem 3D amarrada; kids/combinadas usam a ilustracao da promocao.
  const hasTiedBelt = hasBeltImage(newBelt);
  const newBeltName = beltLabel(newBelt);
  const previousBeltName = beltLabel(previousBelt);
  const promotionAlt = t('Promoção de {from} para {to}', { from: previousBeltName, to: newBeltName });

  const promotedAtLabel = useMemo(() => (
    graduation.promotedAt
      ? graduation.promotedAt.toDate().toLocaleDateString(getLocale())
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
  const handleImageError = () => setImageFormat((current) => (current === 'webp' ? 'png' : 'none'));

  const title = beltChanged || graduation.newStripes <= 0
    ? `${t('Faixa {belt}', { belt: newBeltName })}.`
    : `${t('{degree}º Grau', { degree: graduation.newStripes })}.`;

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const handleShare = async () => {
    const text = beltChanged || graduation.newStripes <= 0
      ? t('Oss! Conquistei a faixa {belt} no Jiu-Jitsu.', { belt: newBeltName })
      : t('Oss! Conquistei o {degree}º grau na faixa {belt}.', { degree: graduation.newStripes, belt: newBeltName });
    try {
      await navigator.share({ title: t('OSS! Nova graduação'), text });
    } catch {
      // Compartilhamento cancelado ou indisponivel: nada a fazer.
    }
  };

  return (
    <div
      className="lv-fullscreen lv-fullscreen--dark rd-celebrate"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      style={{
        '--rd-celebrate-glow': targetMeta.breakdownColor,
      } as React.CSSProperties}
    >
      <div className="rd-celebrate__confetti" aria-hidden="true">
        {CONFETTI.map((piece, index) => (
          <i
            key={index}
            className={`${piece.light ? 'is-light' : ''} ${piece.wide ? 'is-wide' : ''}`.trim() || undefined}
            style={{
              left: `${piece.left}%`,
              '--rd-confetti-top': `${piece.top}%`,
              '--rd-confetti-rotate': `${piece.rotate}deg`,
              animationDelay: `${piece.delay}s`,
              animationDuration: `${piece.duration}s`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <section
        className="lv-fullscreen__inner rd-celebrate__inner"
        role="dialog"
        aria-modal="true"
        aria-labelledby="graduation-celebration-title"
      >
        <div className="rd-celebrate__top">
          <button
            type="button"
            className="lv-icon-btn lv-icon-btn--on-dark"
            onClick={onClose}
            aria-label={t('Fechar celebração')}
            title={t('Fechar')}
          >
            <X size={20} strokeWidth={2} />
          </button>
          {canShare ? (
            <button type="button" className="lv-btn lv-btn--sm rd-celebrate__share" onClick={() => { void handleShare(); }}>
              <Share size={16} strokeWidth={2} />
              {t('Compartilhar')}
            </button>
          ) : null}
        </div>

        <div className="rd-celebrate__media">
          {hasTiedBelt ? (
            <BeltImage
              belt={newBelt}
              stripes={graduation.newStripes}
              variant="amarrada"
              className="rd-celebrate__belt"
              alt={promotionAlt}
            />
          ) : imageFormat !== 'none' ? (
            <img
              src={imageSrc}
              alt={promotionAlt}
              className="rd-celebrate__image"
              onError={handleImageError}
            />
          ) : (
            <div className="rd-celebrate__fallback" role="img" aria-label={promotionAlt}>
              <BeltImage belt={previousBelt} stripes={graduation.previousStripes} hideEmptyStripes />
              <ArrowRight size={22} strokeWidth={2} aria-hidden="true" />
              <BeltImage belt={newBelt} stripes={graduation.newStripes} hideEmptyStripes />
            </div>
          )}
        </div>

        <div className="rd-celebrate__body">
          <span className="rd-celebrate__eyebrow">{t('OSS! Nova graduação')}</span>
          <h2 id="graduation-celebration-title" className="rd-celebrate__title">{title}</h2>
          <p className="rd-celebrate__lead">{t('Você mereceu cada treino.')}</p>

          <div className="rd-celebrate__details">
            <p className="rd-celebrate__congrats">{t('Parabéns, {name}', { name: firstName })}</p>
            <p className="rd-celebrate__copy">
              {t('Você foi promovido para a faixa {belt}', { belt: newBeltName })}.
              {' '}
              {t('Seu professor registrou a evolução de {from} para {to}.', { from: previousBeltName, to: newBeltName })}
              {promotedAtLabel ? ` ${t('Graduação aprovada em {date}.', { date: promotedAtLabel })}` : ''}
            </p>

            <div className="rd-celebrate__route">
              <span className="rd-celebrate__route-belt">
                <BeltImage belt={previousBelt} stripes={graduation.previousStripes} hideEmptyStripes className="rd-celebrate__route-mini" />
                <span>{previousBeltName}</span>
              </span>
              <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
              <span className="rd-celebrate__route-belt">
                <BeltImage belt={newBelt} stripes={graduation.newStripes} hideEmptyStripes className="rd-celebrate__route-mini" />
                <strong>{newBeltName}</strong>
              </span>
              <span className="lv-chip lv-chip--yellow rd-celebrate__badge">
                <Award size={12} strokeWidth={2.4} aria-hidden="true" />
                {t('Nova faixa')}
              </span>
            </div>

            {hasTiedBelt && imageFormat !== 'none' ? (
              <img
                src={imageSrc}
                alt={promotionAlt}
                className="rd-celebrate__thumb"
                loading="lazy"
                onError={handleImageError}
              />
            ) : null}
          </div>
        </div>

        <div className="lv-fullscreen__footer rd-celebrate__footer">
          <button
            type="button"
            className="lv-btn lv-btn--primary lv-btn--block"
            onClick={onOpenGraduation}
            autoFocus
          >
            {t('Ver minha evolução')}
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </button>
          <button type="button" className="lv-btn lv-btn--block rd-celebrate__ghost" onClick={onClose}>
            {t('Continuar')}
          </button>
        </div>
      </section>
    </div>
  );
};

export default GraduationCelebrationModal;
