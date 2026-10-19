import React from 'react';
import { getBeltMeta, isBlackBelt } from '../../beltCatalog';
import './woven-belt.css';

export interface WovenBeltSegment {
  /** Faixa (id do catalogo, ex.: 'white', 'azul'). */
  belt: string;
  count: number;
  /** Rotulo ja traduzido para o leitor de tela ("Azul: 3"). */
  label: string;
}

interface WovenBeltProps {
  segments: WovenBeltSegment[];
  /** 'lg' = faixa da academia (com ponteira); 'sm' = faixa fina da turma. */
  size?: 'lg' | 'sm';
  /** Faixa em destaque (as outras ficam apagadas). */
  selected?: string | null;
  /** Toque num pedaco (sem ele a faixa nao e clicavel). */
  onSelect?: (belt: string) => void;
  ariaLabel: string;
}

/**
 * "Faixa tecida": uma faixa so, feita de pedacos proporcionais as faixas das pessoas
 * (cores do beltCatalog). Pedaco minimo de 6px para ninguem sumir.
 */
const WovenBelt: React.FC<WovenBeltProps> = ({ segments, size = 'lg', selected = null, onSelect, ariaLabel }) => {
  const visible = segments.filter((segment) => segment.count > 0);
  if (visible.length === 0) return null;
  const hasBlack = visible.some((segment) => isBlackBelt(segment.belt));

  return (
    <div
      className={`rd-woven rd-woven--${size}${selected ? ' is-focus' : ''}`}
      role={onSelect ? 'group' : 'img'}
      aria-label={ariaLabel}
    >
      {visible.map((segment) => {
        const meta = getBeltMeta(segment.belt);
        const style = { flexGrow: segment.count, '--rd-woven-color': meta.main } as React.CSSProperties;
        const className = `rd-woven__seg${meta.id === getBeltMeta('white').id ? ' is-white' : ''}${selected === segment.belt ? ' is-on' : ''}`;
        return onSelect ? (
          <button
            key={segment.belt}
            type="button"
            className={className}
            style={style}
            onClick={() => onSelect(segment.belt)}
            aria-pressed={selected === segment.belt}
            aria-label={segment.label}
          />
        ) : (
          <span key={segment.belt} className={className} style={style} />
        );
      })}
      {size === 'lg' ? (
        <span className={`rd-woven__tip${hasBlack ? ' is-red' : ''}`} aria-hidden="true"><i /></span>
      ) : null}
    </div>
  );
};

export default WovenBelt;
