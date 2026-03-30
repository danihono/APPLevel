import React from 'react';
import { BeltColor } from '../types';

interface BjjBeltProps {
  color: BeltColor;
  stripes: number;
}

function getBeltStyles(color: BeltColor) {
  switch (color) {
    case BeltColor.BRANCA:
      return {
        main: 'linear-gradient(180deg, #ffffff 0%, #edf1f7 100%)',
        outline: 'rgba(148, 163, 184, 0.35)',
        sheen: 'rgba(255, 255, 255, 0.82)',
      };
    case BeltColor.AZUL:
      return {
        main: 'linear-gradient(180deg, #1d4ed8 0%, #132c74 100%)',
        outline: 'rgba(96, 165, 250, 0.28)',
        sheen: 'rgba(147, 197, 253, 0.42)',
      };
    case BeltColor.ROXA:
      return {
        main: 'linear-gradient(180deg, #7e22ce 0%, #4c1d95 100%)',
        outline: 'rgba(192, 132, 252, 0.28)',
        sheen: 'rgba(216, 180, 254, 0.34)',
      };
    case BeltColor.MARROM:
      return {
        main: 'linear-gradient(180deg, #7c4a2d 0%, #4a2a1c 100%)',
        outline: 'rgba(217, 119, 6, 0.26)',
        sheen: 'rgba(251, 191, 36, 0.2)',
      };
    case BeltColor.PRETA:
      return {
        main: 'linear-gradient(180deg, #232329 0%, #050507 100%)',
        outline: 'rgba(255, 255, 255, 0.14)',
        sheen: 'rgba(255, 255, 255, 0.16)',
      };
    default:
      return {
        main: 'linear-gradient(180deg, #ffffff 0%, #edf1f7 100%)',
        outline: 'rgba(148, 163, 184, 0.35)',
        sheen: 'rgba(255, 255, 255, 0.82)',
      };
  }
}

const BjjBelt: React.FC<BjjBeltProps> = ({ color, stripes }) => {
  const styles = getBeltStyles(color);
  const strapColor = color === BeltColor.PRETA ? '#9f1d1d' : '#09090b';

  return (
    <div
      className="relative h-14 w-full overflow-hidden rounded-[1.35rem] border shadow-[0_22px_44px_rgba(17,17,24,0.14)]"
      style={{
        borderColor: styles.outline,
        background: styles.main,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${styles.sheen}, transparent 28%, transparent 72%, rgba(0, 0, 0, 0.22) 100%)`,
          opacity: 0.9,
        }}
      />
      <div className="absolute inset-y-0 right-0 w-28" style={{ background: strapColor }} />
      <div
        className="absolute inset-y-[0.4rem] right-8 flex items-center gap-1 rounded-full border px-2"
        style={{
          borderColor: 'rgba(255, 255, 255, 0.14)',
          background: 'rgba(255, 255, 255, 0.08)',
        }}
      >
        {Array.from({ length: stripes }).map((_, index) => (
          <span key={index} className="h-8 w-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.35)]" />
        ))}
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
