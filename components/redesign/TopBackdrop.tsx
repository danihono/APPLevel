import React, { useEffect, useRef, useState } from 'react';

interface TopBackdropProps {
  /** Elemento onde o fundo termina (o cartao principal da tela). */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Quanto o fundo passa do fim do cartao, em px. */
  extend?: number;
}

/**
 * Fundo amarelo de ponta a ponta atras do topo da tela (cabecalho + cartao principal).
 * Fica atras do conteudo e acompanha a altura do cartao; a tela pai precisa da classe
 * `has-top-backdrop` (ver redesign.css).
 */
const TopBackdrop: React.FC<TopBackdropProps> = ({ anchorRef, extend = 14 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  // useEffect (e nao layout): o cartao vem depois deste elemento na arvore, entao a ref dele
  // so esta preenchida quando todos os efeitos de layout ja rodaram.
  useEffect(() => {
    const backdrop = ref.current;
    const anchor = anchorRef.current;
    const parent = backdrop?.parentElement;
    if (!backdrop || !anchor || !parent) {
      return undefined;
    }
    const update = () => {
      // No computador as colunas ficam lado a lado: o fundo cobre so o cabecalho, para nao
      // cortar os cartoes da coluna da direita.
      const wide = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 980px)').matches;
      const header = wide ? parent.querySelector<HTMLElement>(':scope > .lv-header') : null;
      const target = header ?? anchor;
      const next = Math.round(target.getBoundingClientRect().bottom - parent.getBoundingClientRect().top + extend);
      setHeight((current) => (current === next ? current : next));
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [anchorRef, extend]);

  return (
    <div
      ref={ref}
      className="lv-top-backdrop"
      style={height ? { height } : undefined}
      aria-hidden="true"
    />
  );
};

export default TopBackdrop;
