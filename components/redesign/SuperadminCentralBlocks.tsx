import React, { useEffect, useRef } from 'react';
import { Award, Building2, CalendarDays, Check, FileDown, Flame, MessageCircle, Plus, Send, Sparkles, Trophy, Users, X } from 'lucide-react';
import { t, getLocale } from '../../i18n';
import './superadmin-central.css';

// Blocos novos da Central do superadmin (visao da rede). Cada um so desenha: os numeros vem
// da propria view, calculados com os dados reais que ela ja carrega.

export const formatCount = (value: number) => value.toLocaleString(getLocale());

/** Troca {chaves} de um texto ja traduzido por valores em negrito (a frase inteira e traduzida de uma vez). */
export function richText(template: string, values: Record<string, React.ReactNode>): React.ReactNode {
  return template.split(/(\{\w+\})/g).map((part, index) => {
    const match = /^\{(\w+)\}$/.exec(part);
    return match && match[1] in values ? <b key={index}>{values[match[1]]}</b> : <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

// ─── Resumo da rede ─────────────────────────────────────────────────────────
export const SaInsight: React.FC<{ children: React.ReactNode; onRadar?: () => void }> = ({ children, onRadar }) => (
  <section className="sa-x-card sa-x-insight">
    <span className="sa-x-insight__spark"><Sparkles size={26} aria-hidden="true" /></span>
    <div>
      <p className="sa-x-eyebrow">{t('Resumo da rede')}</p>
      <p className="sa-x-insight__text">{children}</p>
      {onRadar ? (
        <div className="sa-x-insight__actions">
          <button type="button" className="sa-x-btn sa-x-btn--ink" onClick={onRadar}>{t('Ver o radar')}</button>
        </div>
      ) : null}
    </div>
  </section>
);

// ─── Radar de atencao ───────────────────────────────────────────────────────
export interface RadarRow { id: string; name: string; reasons: string[]; severity: 'high' | 'mid' }

export const SaRadar: React.FC<{ rows: RadarRow[]; sectionId?: string; onOpen: (academyId: string) => void }> = ({ rows, sectionId, onOpen }) => (
  <section className="sa-x-card" id={sectionId}>
    <header className="sa-x-head">
      <div>
        <h3 className="sa-x-title">{t('Radar de atenção')}</h3>
        <p className="sa-x-sub">{t('Unidades que pedem uma ação sua agora')}</p>
      </div>
      <span className={`sa-x-pill ${rows.length ? 'is-warn' : 'is-good'}`}>
        {rows.length === 1 ? t('1 unidade') : t('{count} unidades', { count: rows.length })}
      </span>
    </header>
    {rows.length ? (
      <div className="sa-x-radar">
        {rows.map((row) => (
          <article key={row.id} className={`sa-x-radar__card is-${row.severity}`}>
            <h4><span className="sa-x-dot" />{row.name}</h4>
            <ul>{row.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            <button type="button" className="sa-x-btn sa-x-btn--ink sa-x-btn--sm" onClick={() => onOpen(row.id)}>{t('Ver academia')}</button>
          </article>
        ))}
      </div>
    ) : (
      <div className="sa-x-empty"><Check size={28} aria-hidden="true" /><strong>{t('Rede tranquila hoje')}</strong><span>{t('Nenhuma academia pede atenção.')}</span></div>
    )}
  </section>
);

// ─── Academia em foco (destaque) ────────────────────────────────────────────
export interface SpotlightAcademy { id: string; name: string; initials: string; subtitle: string; stats: Array<{ label: string; value: string }> }

export const SaFocusSpotlight: React.FC<{
  focus: SpotlightAcademy | null;
  choices: Array<{ id: string; name: string; students: number }>;
  onPick: (academyId: string) => void;
  onClear: () => void;
}> = ({ focus, choices, onPick, onClear }) => (
  <section className="sa-x-card sa-x-focus">
    <div className="sa-x-focus__hero">
      <span className="sa-x-focus__ini">{focus ? focus.initials : <Building2 size={22} aria-hidden="true" />}</span>
      <div>
        <small>{t('Academia em foco')}</small>
        <h3>{focus ? focus.name : t('Toda a rede')}</h3>
        <small>{focus ? focus.subtitle : t('Escolha uma academia para ver os detalhes')}</small>
      </div>
    </div>
    {focus ? (
      <>
        <dl className="sa-x-focus__stats">
          {focus.stats.map((stat) => (
            <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>
          ))}
        </dl>
        <button type="button" className="sa-x-btn sa-x-btn--ink" onClick={onClear}>{t('Ver rede inteira')}</button>
      </>
    ) : (
      <ul className="sa-x-focus__choices">
        {choices.slice(0, 6).map((choice) => (
          <li key={choice.id}>
            <button type="button" onClick={() => onPick(choice.id)}>
              <span>{choice.name}</span>
              <small>{t('{count} alunos', { count: formatCount(choice.students) })}</small>
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);

// ─── Saude dos alunos (quem treina, quem esfriou, quem sumiu) ───────────────
export interface HealthPerson { id: string; name: string; academyName: string; days: number; whatsappHref?: string }

export const SaStudentHealth: React.FC<{ active: number; risk: number; inactive: number; people: HealthPerson[] }> = ({ active, risk, inactive, people }) => {
  const total = Math.max(1, active + risk + inactive);
  return (
    <section className="sa-x-card">
      <header className="sa-x-head">
        <div>
          <h3 className="sa-x-title">{t('Saúde dos alunos')}</h3>
          <p className="sa-x-sub">{t('Quem está treinando, esfriando ou sumiu')}</p>
        </div>
      </header>
      <div className="sa-x-seg" role="img" aria-label={t('Ativos {a}, em risco {r}, inativos {i}', { a: active, r: risk, i: inactive })}>
        <i style={{ width: `${(active / total) * 100}%`, background: '#22c55e' }} />
        <i style={{ width: `${(risk / total) * 100}%`, background: '#f5a524' }} />
        <i style={{ width: `${(inactive / total) * 100}%`, background: '#ef4444' }} />
      </div>
      <div className="sa-x-tri">
        <div><span><i style={{ background: '#22c55e' }} />{t('Ativos')}</span><b>{formatCount(active)}</b></div>
        <div><span><i style={{ background: '#f5a524' }} />{t('Em risco')}</span><b>{formatCount(risk)}</b></div>
        <div><span><i style={{ background: '#ef4444' }} />{t('Inativos')}</span><b>{formatCount(inactive)}</b></div>
      </div>
      <p className="sa-x-sub sa-x-sub--tight">{t('Quem mais sumiu (14+ dias sem treinar)')}</p>
      {people.length ? (
        <ul className="sa-x-people">
          {people.map((person) => (
            <li key={person.id}>
              <span className="sa-x-avatar">{person.name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
              <div><strong>{person.name}</strong><small>{person.academyName} · {t('há {count} dias', { count: person.days })}</small></div>
              {person.whatsappHref ? (
                <a className="sa-x-wa" href={person.whatsappHref} target="_blank" rel="noreferrer"><MessageCircle size={14} aria-hidden="true" />{t('Chamar')}</a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="sa-x-sub">{t('Ninguém sumido por mais de 14 dias.')}</p>}
    </section>
  );
};

// ─── Conquistas da rede ─────────────────────────────────────────────────────
export interface Achievement { key: string; label: string; icon: 'users' | 'building' | 'award' | 'flame' | 'trophy'; cur: number; goal: number }

const ACHIEVEMENT_ICON = { users: Users, building: Building2, award: Award, flame: Flame, trophy: Trophy } as const;

export const SaAchievements: React.FC<{ items: Achievement[] }> = ({ items }) => {
  const unlocked = items.filter((item) => item.cur >= item.goal).length;
  const burst = (target: HTMLElement) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = target.getBoundingClientRect();
    const colors = ['#f0b429', '#8b5cf6', '#22c55e', '#3b82f6', '#ec4899'];
    for (let i = 0; i < 28; i += 1) {
      const piece = document.createElement('span');
      piece.className = 'sa-x-confetti';
      piece.style.left = `${rect.left + rect.width / 2}px`;
      piece.style.top = `${rect.top + rect.height / 2}px`;
      piece.style.background = colors[i % colors.length];
      const angle = Math.random() * Math.PI * 2;
      const distance = 60 + Math.random() * 120;
      piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--dy', `${Math.sin(angle) * distance - 40}px`);
      piece.style.setProperty('--rot', `${Math.random() * 720}deg`);
      document.body.appendChild(piece);
      window.setTimeout(() => piece.remove(), 1300);
    }
  };
  return (
    <section className="sa-x-card">
      <header className="sa-x-head">
        <div>
          <h3 className="sa-x-title">{t('Conquistas da rede')}</h3>
          <p className="sa-x-sub">{t('{done} de {total} marcos alcançados', { done: unlocked, total: items.length })}</p>
        </div>
      </header>
      <div className="sa-x-badges">
        {items.map((item) => {
          const Icon = ACHIEVEMENT_ICON[item.icon];
          const done = item.cur >= item.goal;
          const share = Math.min(100, Math.round((item.cur / item.goal) * 100));
          return (
            <button
              key={item.key}
              type="button"
              className={`sa-x-badge ${done ? 'is-done' : 'is-locked'}`}
              onClick={(event) => { if (done) burst(event.currentTarget); }}
              aria-label={done ? `${item.label}, ${t('alcançado')}` : `${item.label}, ${share}%`}
              tabIndex={done ? 0 : -1}
            >
              <span className="sa-x-badge__medal"><Icon size={22} aria-hidden="true" /></span>
              <b>{item.label}</b>
              {done ? <small>{t('Alcançado')} ✓</small> : (
                <>
                  <span className="sa-x-bar"><i style={{ width: `${share}%` }} /></span>
                  <small>{share}%</small>
                </>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};

// ─── Painel lateral: acoes rapidas e proximos eventos ───────────────────────
export interface EventRow { id: string; name: string; academyName: string; date: Date }

export const SaSidePanel: React.FC<{
  userName?: string;
  onNewAcademy: () => void;
  onNewNotice: () => void;
  onReport: () => void;
  events: EventRow[];
}> = ({ userName, onNewAcademy, onNewNotice, onReport, events }) => {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const eventDays = new Set(events.filter((event) => event.date.getMonth() === today.getMonth() && event.date.getFullYear() === today.getFullYear()).map((event) => event.date.getDate()));
  const cells: Array<number | null> = [...Array.from({ length: first.getDay() }, () => null), ...Array.from({ length: days }, (_, index) => index + 1)];
  const monthLabel = today.toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' });
  const monthTitle = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const weekdayLetters = Array.from({ length: 7 }, (_, index) => new Date(2023, 0, 1 + index).toLocaleDateString(getLocale(), { weekday: 'narrow' }));
  return (
    <aside className="sa-x-side">
      <section className="sa-x-card">
        <div className="sa-x-profile">
          <span className="sa-x-avatar sa-x-avatar--lg">{(userName || 'SA').slice(0, 1).toUpperCase()}</span>
          <div><strong>{userName || t('Superadmin')}</strong><small>{t('Superadmin · Rede LEVEL JJ')}</small></div>
        </div>
        <div className="sa-x-actions">
          <button type="button" className="sa-x-btn sa-x-btn--yellow" onClick={onNewAcademy}><Plus size={16} aria-hidden="true" />{t('Nova academia')}</button>
          <button type="button" className="sa-x-btn sa-x-btn--ghost" onClick={onNewNotice}><Send size={16} aria-hidden="true" />{t('Novo aviso')}</button>
          <button type="button" className="sa-x-btn sa-x-btn--ghost" onClick={onReport}><FileDown size={16} aria-hidden="true" />{t('Gerar relatório')}</button>
        </div>
      </section>
      <section className="sa-x-card">
        <header className="sa-x-head">
          <h3 className="sa-x-title">{monthTitle}</h3>
          <CalendarDays size={18} aria-hidden="true" />
        </header>
        <div className="sa-x-cal" role="grid">
          {weekdayLetters.map((letter, index) => <span key={`w${index}`} className="sa-x-cal__w">{letter}</span>)}
          {cells.map((day, index) => (
            <span key={index} className={`sa-x-cal__d ${day === today.getDate() ? 'is-today' : ''}`}>
              {day ?? ''}{day && eventDays.has(day) ? <i /> : null}
            </span>
          ))}
        </div>
        {events.length ? (
          <ul className="sa-x-events" aria-label={t('Próximos eventos')}>
            {events.map((event) => (
              <li key={event.id}>
                <span className="sa-x-events__date"><b>{event.date.getDate()}</b><small>{event.date.toLocaleDateString(getLocale(), { weekday: 'short' })}</small></span>
                <div><strong>{event.name}</strong><small>{event.academyName}</small></div>
              </li>
            ))}
          </ul>
        ) : <p className="sa-x-sub">{t('Nenhuma competição marcada.')}</p>}
      </section>
    </aside>
  );
};

// ─── Personalizar (liga e desliga blocos) ───────────────────────────────────
export interface CustomizeBlock { key: string; label: string; hint: string }

export const SaCustomizeDrawer: React.FC<{
  open: boolean;
  blocks: CustomizeBlock[];
  visible: Record<string, boolean>;
  onToggle: (key: string) => void;
  onAll: (on: boolean) => void;
  onClose: () => void;
}> = ({ open, blocks, visible, onToggle, onAll, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sa-x-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="sa-x-drawer" role="dialog" aria-modal="true" aria-label={t('Personalizar painel')} tabIndex={-1} ref={ref}>
        <header className="sa-x-drawer__head">
          <h2>{t('Personalizar')}</h2>
          <button type="button" className="sa-x-iconbtn" onClick={onClose} aria-label={t('Fechar')}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="sa-x-drawer__body">
          <p className="sa-x-sub">{t('Ligue só o que você quer ver. Os números principais e o gráfico sempre ficam.')}</p>
          {blocks.map((block) => (
            <div key={block.key} className="sa-x-switchrow">
              <div><strong>{block.label}</strong><small>{block.hint}</small></div>
              <button
                type="button"
                role="switch"
                aria-checked={visible[block.key] !== false}
                aria-label={block.label}
                className="sa-x-switch"
                onClick={() => onToggle(block.key)}
              />
            </div>
          ))}
        </div>
        <footer className="sa-x-drawer__foot">
          <button type="button" className="sa-x-btn sa-x-btn--ghost" onClick={() => onAll(false)}>{t('Só o essencial')}</button>
          <button type="button" className="sa-x-btn sa-x-btn--yellow" onClick={() => onAll(true)}>{t('Mostrar tudo')}</button>
        </footer>
      </aside>
    </div>
  );
};
