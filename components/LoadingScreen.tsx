import { useMemo } from 'react';

interface LoadingScreenProps {
  message?: string;
}

/** Duracao da volta da linha (igual ao `lv-loading-run` do redesign.css). */
const LOADING_CYCLE_MS = 1400;

/**
 * Tela de carregamento: fundo liso na cor do app, marca LEVEL no centro e uma linha amarela
 * fina que corre. Sem imagem (aparece na hora). O mesmo visual existe em HTML estatico no
 * `index.html` (antes do React montar); o atraso negativo da animacao mantem a linha no mesmo
 * ponto quando uma etapa de carregamento troca pela seguinte, entao nada "pisca".
 * CSS em redesign.css (bloco "Carregamento").
 */
export function LoadingScreen({ message }: LoadingScreenProps) {
  const phaseStyle = useMemo(
    () => ({ animationDelay: `-${Math.round(performance.now() % LOADING_CYCLE_MS)}ms` }),
    [],
  );

  return (
    <div className="lv-loading" role="status" aria-live="polite">
      <div className="lv-loading__center">
        <span className="lv-loading__mark" aria-hidden="true">
          <span className="lv-loading__stripes"><i /><i /><i /><i /></span>
          <span className="lv-loading__word">LEVEL</span>
        </span>
        <span className="lv-loading__track" aria-hidden="true">
          <span className="lv-loading__run" style={phaseStyle} />
        </span>
        {message ? <p className="lv-loading__message">{message}</p> : <span className="lv-sr-only">LEVEL</span>}
      </div>
    </div>
  );
}
