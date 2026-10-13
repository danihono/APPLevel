import React from 'react';

export type EmptyArt = 'rest' | 'whistle' | 'belt';

interface EmptyStateProps {
  art: EmptyArt;
  title: string;
  text?: string;
  /** Botão ou link opcional embaixo do texto. */
  action?: React.ReactNode;
  className?: string;
}

/** Tatame vazio com garrafinha e lua: dia sem aula. */
const RestArt = () => (
  <svg className="lv-empty__art" viewBox="0 0 200 150" aria-hidden="true">
    <ellipse cx="100" cy="134" rx="74" ry="8" fill="var(--lv-art-fill)" />
    <path d="M28 92 100 56l72 36-72 36z" fill="var(--lv-art-paper)" />
    <path d="M28 92v8l72 36v-8z" fill="var(--lv-art-fill)" />
    <path d="M100 128v8l72-36v-8z" fill="var(--lv-art-line)" />
    <path d="M64 74l72 36M136 74l-72 36" stroke="var(--lv-art-line)" strokeWidth="1.5" />
    <rect x="118" y="52" width="16" height="36" rx="6" fill="var(--lv-art-paper)" stroke="var(--lv-art-line)" />
    <rect x="120" y="45" width="12" height="9" rx="3" fill="var(--lv-yellow)" />
    <path d="M70 84c8-4 18-4 26 0l-10 5c-6-2-11-2-16-5z" fill="var(--lv-art-paper)" stroke="var(--lv-art-line)" />
    <path d="M74 84c6-2 13-2 19 0" stroke="var(--lv-art-ink)" strokeWidth="3" strokeLinecap="round" />
    <circle cx="152" cy="34" r="12" fill="var(--lv-yellow)" opacity="0.85" />
    <circle cx="158" cy="30" r="10" fill="var(--lv-canvas)" />
  </svg>
);

/** Apito dormindo: sem avisos. */
const WhistleArt = () => (
  <svg className="lv-empty__art" viewBox="0 0 200 150" aria-hidden="true">
    <ellipse cx="100" cy="134" rx="62" ry="7" fill="var(--lv-art-fill)" />
    <path d="M58 50c-10-22 6-38 22-34" fill="none" stroke="var(--lv-art-soft)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 6" />
    <circle cx="62" cy="56" r="7" fill="none" stroke="var(--lv-art-ink)" strokeWidth="3" />
    <circle cx="92" cy="92" r="32" fill="var(--lv-yellow)" />
    <rect x="96" y="62" width="62" height="22" rx="8" fill="var(--lv-yellow)" />
    <circle cx="92" cy="92" r="32" fill="none" stroke="#121218" strokeWidth="3" />
    <path d="M96 62h54a8 8 0 0 1 8 8v6a8 8 0 0 1-8 8h-31" fill="none" stroke="#121218" strokeWidth="3" strokeLinejoin="round" />
    <circle cx="92" cy="92" r="10" fill="#121218" opacity="0.85" />
    <text className="lv-empty__zz" x="150" y="48" fontSize="18" fontWeight="800" fill="var(--lv-art-soft)">z</text>
    <text className="lv-empty__zz lv-empty__zz--late" x="164" y="34" fontSize="13" fontWeight="800" fill="var(--lv-art-soft)">z</text>
  </svg>
);

/** Faixa enrolada com o check amarelo: ninguém marcou presença ainda. */
const BeltArt = () => (
  <svg className="lv-empty__art" viewBox="0 0 200 150" aria-hidden="true">
    <ellipse cx="96" cy="134" rx="70" ry="7" fill="var(--lv-art-fill)" />
    <rect x="88" y="100" width="92" height="22" rx="5" fill="var(--lv-art-paper)" stroke="var(--lv-art-line)" />
    <rect x="146" y="100" width="28" height="22" fill="#121218" />
    <rect x="152" y="100" width="4" height="22" fill="#ffffff" />
    <rect x="161" y="100" width="4" height="22" fill="#ffffff" />
    <circle cx="72" cy="88" r="40" fill="var(--lv-art-paper)" stroke="var(--lv-art-line)" />
    <circle cx="72" cy="88" r="30" fill="none" stroke="var(--lv-art-line)" strokeWidth="7" />
    <circle cx="72" cy="88" r="18" fill="none" stroke="var(--lv-art-line)" strokeWidth="7" />
    <circle cx="72" cy="88" r="6" fill="var(--lv-art-line)" />
    <circle cx="150" cy="44" r="16" fill="var(--lv-yellow)" />
    <path d="m143 44 5 5 9-10" fill="none" stroke="#1a1300" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ART: Record<EmptyArt, React.FC> = { rest: RestArt, whistle: WhistleArt, belt: BeltArt };

const EmptyState: React.FC<EmptyStateProps> = ({ art, title, text, action, className }) => {
  const Art = ART[art];
  return (
    <div className={`lv-card lv-empty${className ? ` ${className}` : ''}`} role="status">
      <Art />
      <p className="lv-empty__title">{title}</p>
      {text ? <p className="lv-empty__text">{text}</p> : null}
      {action ? <div className="lv-empty__action">{action}</div> : null}
    </div>
  );
};

export default EmptyState;
