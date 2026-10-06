import React from 'react';
import {
  getBeltMeta,
  getBlackBeltStyle,
  getBlackBeltVisual,
  isBlackBelt,
  normalizeBeltId,
  type BlackBeltProgress,
} from '../beltCatalog';
import { getBeltImage, type BeltImageVariant } from '../beltImages';
import type { BeltColor } from '../types';

interface BeltImageProps {
  belt: BeltColor | string | null | undefined;
  /** Graus conquistados (na faixa preta, o grau por tempo). */
  stripes: number;
  /** Quantas posicoes de grau desenhar (as que faltam aparecem apagadas). Padrao: 4, preta 6. */
  maxStripes?: number;
  variant?: BeltImageVariant;
  /** Faixa preta com grau/estilo por tempo (coral/vermelha nao tem imagem: cai no desenho). */
  blackBelt?: BlackBeltProgress | null;
  /** Esconde as posicoes de grau que faltam. */
  hideEmptyStripes?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Texto para leitor de tela. Sem ele a faixa e decorativa. */
  alt?: string;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Faixa do aluno: imagem 3D (reta ou amarrada) com os graus desenhados sobre a ponteira.
 * Ocupa a largura do container; a altura sai da proporcao da imagem.
 * Faixas sem imagem (kids, combinadas, coral/vermelha) viram uma barra desenhada em CSS.
 */
const BeltImage: React.FC<BeltImageProps> = ({
  belt,
  stripes,
  maxStripes,
  variant = 'reta',
  blackBelt,
  hideEmptyStripes = false,
  className = '',
  style,
  alt,
}) => {
  const beltId = normalizeBeltId(belt ?? undefined);
  const black = isBlackBelt(beltId);
  const degree = black ? (blackBelt?.degree ?? clamp(Math.round(stripes || 0), 0, 6)) : clamp(Math.round(stripes || 0), 0, 12);
  const blackStyle = black ? (blackBelt?.style ?? getBlackBeltStyle(degree)) : null;
  const image = !black || blackStyle === 'preta' ? getBeltImage(beltId, variant) : null;
  const slots = Math.max(maxStripes ?? (black ? 6 : 4), 0);
  const lit = clamp(degree, 0, slots);
  const stripeCount = hideEmptyStripes ? lit : slots;

  const a11y = alt
    ? { role: 'img' as const, 'aria-label': alt }
    : { 'aria-hidden': true as const };

  const renderStripes = () => (
    Array.from({ length: stripeCount }).map((_, index) => (
      <i key={index} className={index < lit ? 'is-on' : undefined} />
    ))
  );

  if (image) {
    const { tip } = image;
    return (
      <span
        className={`lv-belt-image lv-belt-image--${variant} ${className}`.trim()}
        style={{ aspectRatio: String(image.aspect), ...style }}
        {...a11y}
      >
        <img src={image.src} alt="" draggable={false} decoding="async" />
        {stripeCount > 0 ? (
          <span
            className="lv-belt-image__tip"
            style={{ left: `${tip.x}%`, top: `${tip.y}%`, width: `${tip.w}%`, height: `${tip.h}%` }}
          >
            {renderStripes()}
          </span>
        ) : null}
      </span>
    );
  }

  // Sem imagem: barra desenhada com as cores do catalogo.
  const meta = getBeltMeta(beltId);
  const blackVisual = black ? getBlackBeltVisual(degree) : null;
  const body = blackVisual?.body ?? meta.main;
  const tipColor = blackVisual ? blackVisual.barColor : meta.strapColor;
  const showTip = !blackVisual || blackVisual.style === 'preta';

  return (
    <span
      className={`lv-belt-bar lv-belt-bar--${variant} ${className}`.trim()}
      style={{ background: body, borderColor: meta.outline, ...style }}
      {...a11y}
    >
      {showTip ? (
        <span className="lv-belt-bar__tip" style={{ background: tipColor }}>
          {stripeCount > 0 ? <span className="lv-belt-image__tip lv-belt-bar__stripes">{renderStripes()}</span> : null}
        </span>
      ) : null}
    </span>
  );
};

export default BeltImage;
