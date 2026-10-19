import { useMemo } from 'react';
import logoUrl from '../assets/loading-logo.webp';

interface LoadingScreenProps {
  message?: string;
  /**
   * Dentro do Layout (bootstrap da sessao, Suspense das telas): ocupa a area de conteudo em vez
   * da tela toda, para o menu e avisos (ex.: erro de sessao) continuarem visiveis.
   */
  inline?: boolean;
}

/** Duracao da volta da linha (igual ao `lv-loading-run` do redesign.css). */
const LOADING_CYCLE_MS = 1400;

/**
 * Tela de carregamento: fundo escuro, a logo da Level no centro (versao leve de logo3.png, com o
 * "JIU JITSU" clareado para aparecer no escuro) e uma linha amarela fina que corre. O mesmo visual
 * existe em HTML estatico no `index.html` (antes do React montar); o atraso negativo da animacao
 * mantem a linha no mesmo ponto quando uma etapa de carregamento troca pela seguinte.
 * CSS em redesign.css (bloco "Carregamento").
 */
export function LoadingScreen({ message, inline = false }: LoadingScreenProps) {
  const phaseStyle = useMemo(
    () => ({ animationDelay: `-${Math.round(performance.now() % LOADING_CYCLE_MS)}ms` }),
    [],
  );

  return (
    <div className={`lv-loading${inline ? ' lv-loading--inline' : ''}`} role="status" aria-live="polite">
      <div className="lv-loading__center">
        <span className="lv-loading__glow" aria-hidden="true" />
        <img className="lv-loading__logo" src={logoUrl} alt="Level Jiu Jitsu" width={360} height={376} decoding="async" />
        <span className="lv-loading__track" aria-hidden="true">
          <span className="lv-loading__run" style={phaseStyle} />
        </span>
        {message ? <p className="lv-loading__message">{message}</p> : null}
      </div>
    </div>
  );
}
