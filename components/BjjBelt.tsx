import React from 'react';
import {
  getBeltMeta,
  getBlackBeltStyle,
  getBlackBeltVisual,
  isBlackBelt,
  type BlackBeltProgress,
} from '../beltCatalog';
import type { BeltColor } from '../types';

interface BjjBeltProps {
  color: BeltColor;
  stripes: number;
  // Quando informado, a faixa preta é renderizada com grau/estilo por tempo
  // (preta → coral → vermelha), conforme o padrão IBJJF.
  blackBelt?: BlackBeltProgress | null;
}

const BjjBelt: React.FC<BjjBeltProps> = ({ color, stripes, blackBelt }) => {
  const meta = getBeltMeta(color);
  const black = isBlackBelt(color) || Boolean(blackBelt);

  if (black) {
    const degree = blackBelt?.degree ?? Math.max(0, Math.min(6, stripes));
    const style = blackBelt?.style ?? getBlackBeltStyle(degree);
    const visual = getBlackBeltVisual(degree);
    const isPreta = style === 'preta';

    return (
      <div
        className="relative h-14 w-full overflow-hidden rounded-[1.35rem] border shadow-[0_22px_44px_rgba(17,17,24,0.14)]"
        style={{ borderColor: 'rgba(255,255,255,0.14)', background: visual.body }}
      >
        {/* brilho superior + sombra inferior */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.16), transparent 28%, transparent 72%, rgba(0,0,0,0.22) 100%)',
            opacity: 0.9,
          }}
        />

        {isPreta ? (
          // Barra vermelha à direita carregando as marcas de grau (brancas).
          <div className="absolute inset-y-0 right-0 flex w-28 items-center justify-center" style={{ background: visual.barColor }}>
            <div className="flex h-[62%] items-center gap-[0.3rem]">
              {Array.from({ length: visual.stripes }).map((_, index) => (
                <span
                  key={index}
                  className="h-full w-[0.28rem] rounded-[1px]"
                  style={{ background: visual.stripeColor, boxShadow: '0 0 3px rgba(0,0,0,0.35)' }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Selo com o grau atual */}
        <div
          className="absolute inset-y-[0.4rem] right-8 flex items-center justify-center rounded-full border px-3"
          style={{ borderColor: 'rgba(255,255,255,0.18)', background: 'rgba(0,0,0,0.28)' }}
        >
          <span className="text-sm font-bold text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
            {degree}°
          </span>
        </div>

        {/* reflexo lateral */}
        <div
          className="absolute inset-y-0 left-8 w-24 opacity-50"
          style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.28), transparent)', filter: 'blur(10px)' }}
        />
      </div>
    );
  }

  return (
    <div
      className="relative h-14 w-full overflow-hidden rounded-[1.35rem] border shadow-[0_22px_44px_rgba(17,17,24,0.14)]"
      style={{
        borderColor: meta.outline,
        background: meta.main,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${meta.sheen}, transparent 28%, transparent 72%, rgba(0, 0, 0, 0.22) 100%)`,
          opacity: 0.9,
        }}
      />
      <div className="absolute inset-y-0 right-0 w-28" style={{ background: meta.strapColor }} />
      <div
        className="absolute inset-y-[0.4rem] right-8 flex items-center justify-center rounded-full border px-3"
        style={{
          borderColor: 'rgba(255, 255, 255, 0.14)',
          background: 'rgba(255, 255, 255, 0.08)',
        }}
      >
        <span className="text-sm font-bold text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
          {stripes}°
        </span>
      </div>
      <div
        className="absolute inset-y-0 left-8 w-24 opacity-65"
        style={{
          background: 'linear-gradient(90deg, rgba(255,255,255,0.32), transparent)',
          filter: 'blur(10px)',
        }}
      />
    </div>
  );
};

export default BjjBelt;
