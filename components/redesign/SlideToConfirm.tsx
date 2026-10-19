import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { hapticConfirm } from '../../services/haptics';
import { prefersReducedMotion } from './motion';
import './slide-to-confirm.css';

interface SlideToConfirmProps {
  /** Texto no trilho ("Deslize para encerrar"). */
  label: string;
  /** Nome acessivel do controle ("Encerrar aula"). */
  ariaLabel: string;
  /** Texto enquanto `busy` ("Encerrando..."). */
  busyLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  disabled?: boolean;
}

/** Fracao do trilho que confirma ao soltar. */
const CONFIRM_AT = 0.9;

/**
 * Deslizar para confirmar (acao que nao tem volta, ex.: encerrar a aula).
 * Arrastar o botao ate o fim confirma; soltar antes volta com mola. No teclado/leitor de tela o
 * botao e um slider: Enter, espaco ou seta para a direita ate o fim confirmam.
 */
const SlideToConfirm: React.FC<SlideToConfirmProps> = ({ label, ariaLabel, busyLabel, onConfirm, busy = false, disabled = false }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startOffset: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [keyboardStep, setKeyboardStep] = useState(0);

  const maxOffset = () => {
    const track = trackRef.current;
    const knob = knobRef.current;
    if (!track || !knob) return 0;
    const styles = window.getComputedStyle(track);
    const padding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    return Math.max(0, track.clientWidth - padding - knob.offsetWidth);
  };

  // Se a acao falhar (busy volta a false sem desmontar), o botao volta ao inicio.
  useEffect(() => {
    if (!busy && confirmed) {
      const id = window.setTimeout(() => {
        setConfirmed(false);
        setOffset(0);
        setKeyboardStep(0);
      }, 400);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [busy, confirmed]);

  const confirm = () => {
    if (confirmed || busy || disabled) return;
    setConfirmed(true);
    setOffset(maxOffset());
    hapticConfirm();
    onConfirm();
  };

  const locked = disabled || busy || confirmed;

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startOffset: offset };
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = Math.min(maxOffset(), Math.max(0, drag.startOffset + event.clientX - drag.startX));
    setOffset(next);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    const max = maxOffset();
    if (max > 0 && offset >= max * CONFIRM_AT) {
      confirm();
    } else {
      setOffset(0);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (locked) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      confirm();
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = Math.min(10, keyboardStep + 1);
      setKeyboardStep(step);
      setOffset((maxOffset() * step) / 10);
      if (step >= 10) confirm();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      const step = Math.max(0, keyboardStep - 1);
      setKeyboardStep(step);
      setOffset((maxOffset() * step) / 10);
    }
  };

  const max = maxOffset();
  const progress = max > 0 ? Math.min(1, offset / max) : 0;
  const reduce = prefersReducedMotion();

  return (
    <div
      ref={trackRef}
      className={`rd-slide${dragging ? ' is-dragging' : ''}${confirmed || busy ? ' is-done' : ''}${disabled ? ' is-disabled' : ''}${reduce ? ' is-still' : ''}`}
      style={{ '--rd-slide-progress': progress } as React.CSSProperties}
    >
      <span className="rd-slide__fill" aria-hidden="true" />
      <span className="rd-slide__label" aria-hidden="true">{confirmed || busy ? busyLabel : label}</span>
      <button
        ref={knobRef}
        type="button"
        role="slider"
        className="rd-slide__knob"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={confirmed || busy ? busyLabel : label}
        aria-disabled={locked || undefined}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
      >
        {busy ? <span className="rd-slide__spinner" aria-hidden="true" /> : <ArrowRight size={22} strokeWidth={2.4} aria-hidden="true" />}
      </button>
    </div>
  );
};

export default SlideToConfirm;
