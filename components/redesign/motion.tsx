import React, { useEffect, useRef, useState } from 'react';

/** true quando o usuário pediu menos movimento no sistema. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Número que "conta" até o valor: do zero na primeira montagem e do valor
 * anterior quando ele muda. Com menos movimento, mostra o valor direto.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [value, setValue] = useState(() => (prefersReducedMotion() ? safeTarget : 0));
  const fromRef = useRef(value);

  useEffect(() => {
    if (prefersReducedMotion()) {
      fromRef.current = safeTarget;
      setValue(safeTarget);
      return undefined;
    }
    const from = fromRef.current;
    if (from === safeTarget) {
      setValue(safeTarget);
      return undefined;
    }
    let frame = 0;
    let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const progress = Math.min(1, (ts - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (safeTarget - from) * eased);
      setValue(next);
      fromRef.current = next;
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [safeTarget, durationMs]);

  return value;
}

interface CountUpProps {
  value: number;
  durationMs?: number;
  suffix?: string;
}

/** Texto numérico que conta até `value`; o leitor de tela recebe o valor final. */
export const CountUp: React.FC<CountUpProps> = ({ value, durationMs, suffix = '' }) => {
  const shown = useCountUp(value, durationMs);
  return (
    <>
      <span aria-hidden="true">{shown}{suffix}</span>
      <span className="lv-sr-only">{value}{suffix}</span>
    </>
  );
};
