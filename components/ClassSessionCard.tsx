import React from 'react';
import { Clock3, MapPin, Shield, Users, UserRound } from 'lucide-react';
import { formatDateLabel, formatTimeLabel } from '../services/firebase/adapters';
import type { FirestoreEntity } from '../services/firebase/data';
import type { ClassRecord } from '../services/firebase/models';

interface ClassSessionCardProps {
  lesson: FirestoreEntity<ClassRecord>;
  className?: string;
  footer?: React.ReactNode;
  showDate?: boolean;
  showStatus?: boolean;
}

const INFANTIL_TYPES = new Set(['kids-01', 'kids-02', 'kids-03']);
const PERFORMANCE_TYPES = new Set(['competicao', 'nogi']);
const DESENVOLVIMENTO_TYPES = new Set(['iniciante', 'vida', 'sport', 'feminino']);
const ALL_TYPE_CODES = new Set([...INFANTIL_TYPES, ...PERFORMANCE_TYPES, ...DESENVOLVIMENTO_TYPES, 'kids', 'advanced', 'no-gi']);

function toCategory(lesson: FirestoreEntity<ClassRecord>) {
  const desc = lesson.description ?? '';
  if (INFANTIL_TYPES.has(desc))       return 'Infantil';
  if (PERFORMANCE_TYPES.has(desc))    return 'Performance';
  if (DESENVOLVIMENTO_TYPES.has(desc)) return 'Desenvolvimento';

  const source = `${lesson.title} ${desc}`.toLowerCase();
  if (source.includes('kids'))                                 return 'Kids';
  if (source.includes('advanced') || source.includes('avanc')) return 'Advanced';
  if (source.includes('no-gi') || source.includes('nogi'))     return 'No-Gi';
  return 'Adulto';
}

function toRules(lesson: FirestoreEntity<ClassRecord>) {
  const source = `${lesson.title} ${lesson.description ?? ''}`.toLowerCase();
  const sex = source.includes('femin') ? 'Feminino' : source.includes('masc') ? 'Masculino' : 'Misto';
  const belt = source.includes('advanced') || source.includes('avanc')
    ? 'Azul+'
    : source.includes('kids')
      ? 'Kids'
      : source.includes('iniciante')
        ? 'Branca'
        : 'Livre';
  const grade = source.includes('advanced') || source.includes('avanc')
    ? 'Intermediário/Avançado'
    : source.includes('iniciante')
      ? 'até 2° grau'
      : 'Todos os graus';

  return { sex, belt, grade };
}

function getStatusClass(status: ClassRecord['status']) {
  switch (status) {
    case 'active':
      return 'app-badge app-badge--success';
    case 'finished':
      return 'app-badge app-badge--muted';
    default:
      return 'app-badge app-badge--gold';
  }
}

function getInitials(name?: string) {
  const safeName = name?.trim() || 'Equipe';
  const parts = safeName.split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

const ClassSessionCard: React.FC<ClassSessionCardProps> = ({
  lesson,
  className = '',
  footer,
  showDate = true,
  showStatus = true,
}) => {
  const rules = toRules(lesson);
  const capacityLabel = lesson.capacity ? `${lesson.currentAttendanceCount}/${lesson.capacity}` : `${lesson.currentAttendanceCount}/--`;

  return (
    <article className={`app-panel app-panel-pad ${className}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold">{lesson.title}</h2>
            <span className="app-badge app-badge--muted">{toCategory(lesson)}</span>
            {showStatus ? <span className={getStatusClass(lesson.status)}>{lesson.status}</span> : null}
          </div>

          {lesson.description && !ALL_TYPE_CODES.has(lesson.description) ? (
            <p className="app-section-copy mt-3">{lesson.description}</p>
          ) : null}
        </div>

        <div className="app-orb">
          <Clock3 size={14} />
          {showDate ? `${formatDateLabel(lesson.scheduledStart)} • ${formatTimeLabel(lesson.scheduledStart)}` : formatTimeLabel(lesson.scheduledStart)}
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="app-list-card">
          <div className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
            <MapPin size={16} />
            <span>{lesson.tatame || 'Tatame principal'}</span>
          </div>
        </div>

        <div className="app-list-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(232,175,72,0.22)] bg-white/10 text-xs font-bold text-[color:var(--gold-mid)]">
              {getInitials(lesson.professorName)}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-soft)]">Instrutor</p>
              <p className="text-sm font-bold">{lesson.professorName || 'Equipe técnica'}</p>
            </div>
          </div>
        </div>

        <div className="app-list-card">
          <div className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
            <Users size={16} />
            <span>Capacidade {capacityLabel}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-[color:var(--gold-mid)]" />
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">Regras</p>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="app-list-card">
            <div className="flex items-center gap-2">
              <UserRound size={15} className="text-[color:var(--gold-mid)]" />
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Sexo</p>
                <p className="text-sm font-bold">{rules.sex}</p>
              </div>
            </div>
          </div>

          <div className="app-list-card">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Faixa</p>
            <p className="mt-1 text-sm font-bold">{rules.belt}</p>
          </div>

          <div className="app-list-card">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Grau</p>
            <p className="mt-1 text-sm font-bold">{rules.grade}</p>
          </div>
        </div>
      </div>

      {footer ? <div className="mt-5">{footer}</div> : null}
    </article>
  );
};

export default ClassSessionCard;
