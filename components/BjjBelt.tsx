import React from 'react';
import { getBeltMeta } from '../beltCatalog';
import type { BeltColor } from '../types';

interface BjjBeltProps {
  color: BeltColor;
  stripes: number;
}

const BjjBelt: React.FC<BjjBeltProps> = ({ color, stripes }) => {
  const meta = getBeltMeta(color);

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
