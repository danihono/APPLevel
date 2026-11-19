import { useEffect, useState } from 'react';
import { t } from '../i18n';

/** Espera antes de mostrar qualquer coisa: carregamento rapido nao pisca nada na tela. */
const SHOW_AFTER_MS = 300;

/**
 * Espera de uma tela que ainda esta baixando (troca de aba). Em vez da tela de carregamento com a
 * logo, so uma linha amarela fina no topo — e so se demorar. A tela de carregamento grande fica
 * para a abertura do app. CSS em redesign.css (bloco "Espera de tela").
 */
export default function ScreenFallback() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="lv-screen-wait" role="status" aria-live="polite" aria-label={t('Carregando...')}>
      {visible ? <span className="lv-screen-wait__bar" aria-hidden="true" /> : null}
    </div>
  );
}
