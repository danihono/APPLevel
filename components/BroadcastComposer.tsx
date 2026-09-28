import React, { useMemo, useState } from 'react';
import { CalendarClock, Search, Send, Users, X } from 'lucide-react';
import { beltLabel } from '../beltCatalog';
import {
  DEFAULT_BROADCAST_FILTERS,
  matchesBroadcastFilters,
  toDatetimeLocalValue,
} from '../broadcastFilters';
import { getLocale, t } from '../i18n';
import type { FirestoreEntity } from '../services/firebase/data';
import type { SendBroadcastResult } from '../services/firebase/functions';
import type {
  AcademyRecord,
  AppRole,
  BroadcastAudience,
  BroadcastFilters,
  NotificationChannel,
  UserRecord,
} from '../services/firebase/models';

type RecipientMode = 'group' | 'people';

export interface BroadcastComposerSubmit {
  title: string;
  body: string;
  channel: NotificationChannel;
  filters: BroadcastFilters;
  scheduledAt?: number;
}

interface BroadcastComposerProps {
  className: string;
  heading: string;
  description?: string;
  academyUsers: Array<FirestoreEntity<UserRecord>>;
  currentUserId: string;
  isSuperAdmin?: boolean;
  academies?: Array<FirestoreEntity<AcademyRecord>>;
  selectedAcademyId?: string;
  onSelectAcademy?: (academyId: string) => void;
  onSend: (payload: BroadcastComposerSubmit) => Promise<SendBroadcastResult>;
}

const PEOPLE_RESULTS_LIMIT = 8;

function normalize(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function userName(user: UserRecord) {
  return user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ');
}

function describeResult(result: SendBroadcastResult): string {
  if (result.status === 'scheduled' && result.scheduledAt) {
    return t('Comunicado agendado para {date}.', {
      date: new Date(result.scheduledAt).toLocaleString(getLocale(), {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      }),
    });
  }

  const parts = [result.recipients === 1
    ? t('Enviado para 1 pessoa.')
    : t('Enviado para {count} pessoas.', { count: result.recipients })];

  if (result.recipients > 0 && result.tokens === 0) {
    parts.push(t('Ninguém desse grupo ativou as notificações no celular ainda: o aviso fica só na lista do app.'));
  } else if (result.sent > 0) {
    parts.push(result.sent === 1
      ? t('Notificação enviada para 1 aparelho.')
      : t('Notificação enviada para {count} aparelhos.', { count: result.sent }));
  }
  if (result.failed > 0) {
    parts.push(result.failed === 1
      ? t('1 aparelho não recebeu.')
      : t('{count} aparelhos não receberam.', { count: result.failed }));
  }
  return parts.join(' ');
}

const BroadcastComposer: React.FC<BroadcastComposerProps> = ({
  className,
  heading,
  description,
  academyUsers,
  currentUserId,
  isSuperAdmin = false,
  academies = [],
  selectedAcademyId = '',
  onSelectAcademy,
  onSend,
}) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<NotificationChannel>('academy');
  const [mode, setMode] = useState<RecipientMode>('group');
  const [roles, setRoles] = useState<AppRole[]>(DEFAULT_BROADCAST_FILTERS.roles ?? []);
  const [audience, setAudience] = useState<BroadcastAudience>('all');
  const [belts, setBelts] = useState<string[]>([]);
  const [onlyActive, setOnlyActive] = useState(true);
  const [onlyCompetitors, setOnlyCompetitors] = useState(false);
  const [people, setPeople] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const candidates = useMemo(
    () => academyUsers.filter((user) => user.id !== currentUserId),
    [academyUsers, currentUserId],
  );
  const usersById = useMemo(() => new Map(candidates.map((user) => [user.id, user])), [candidates]);

  const filters: BroadcastFilters = useMemo(
    () => (mode === 'people'
      ? { ...DEFAULT_BROADCAST_FILTERS, roles: [], userIds: people }
      : { roles, belts, userIds: [], audience, onlyActive, onlyCompetitors }),
    [mode, people, roles, belts, audience, onlyActive, onlyCompetitors],
  );

  const recipients = useMemo(
    () => (mode === 'people' && people.length === 0
      ? []
      : candidates.filter((user) => matchesBroadcastFilters(user.id, user, filters))),
    [candidates, filters, mode, people.length],
  );
  const recipientsWithPush = recipients.filter((user) => (user.fcmTokens?.length ?? 0) > 0).length;

  // Faixas oferecidas = as que existem no grupo atual (sem o filtro de faixa), com a contagem.
  const beltOptions = useMemo(() => {
    const groupWithoutBelts: BroadcastFilters = { roles, belts: [], userIds: [], audience, onlyActive, onlyCompetitors };
    const counts = new Map<string, number>();
    for (const user of candidates) {
      if (user.belt && matchesBroadcastFilters(user.id, user, groupWithoutBelts)) {
        counts.set(user.belt, (counts.get(user.belt) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [candidates, roles, audience, onlyActive, onlyCompetitors]);

  const peopleResults = useMemo(() => {
    const term = normalize(search.trim());
    if (!term) {
      return [];
    }
    return candidates
      .filter((user) => !people.includes(user.id) && normalize(userName(user)).includes(term))
      .slice(0, PEOPLE_RESULTS_LIMIT);
  }, [candidates, people, search]);

  const toggleIn = <T,>(list: T[], value: T) => (list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value]);

  const resetForm = () => {
    setTitle('');
    setBody('');
    setPeople([]);
    setSearch('');
    setBelts([]);
    setScheduleEnabled(false);
    setScheduleValue('');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setFeedback('');

    if (isSuperAdmin && !selectedAcademyId) {
      setError(t('Escolha a unidade que vai receber o comunicado.'));
      return;
    }
    if (recipients.length === 0) {
      setError(t('Nenhuma pessoa corresponde aos filtros escolhidos.'));
      return;
    }

    let scheduledAt: number | undefined;
    if (scheduleEnabled) {
      const parsed = scheduleValue ? new Date(scheduleValue).getTime() : Number.NaN;
      if (!Number.isFinite(parsed) || parsed <= Date.now() + 60 * 1000) {
        setError(t('Escolha um horário de envio no futuro.'));
        return;
      }
      scheduledAt = parsed;
    }

    setBusy(true);
    try {
      const result = await onSend({ title: title.trim(), body: body.trim(), channel, filters, scheduledAt });
      setFeedback(describeResult(result));
      resetForm();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t('Não foi possível enviar o comunicado.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`${className} broadcast-composer`}>
      <div className="broadcast-composer__head">
        <div className="app-icon-shell" style={{ flexShrink: 0 }}>
          <Send size={18} />
        </div>
        <div>
          <p className="app-section-label">{t('Comunicação')}</p>
          <h2 className="broadcast-composer__title">{heading}</h2>
          {description ? <p className="broadcast-composer__copy">{description}</p> : null}
        </div>
      </div>

      {feedback ? <div className="app-alert app-alert--success">{feedback}</div> : null}
      {error ? <div className="app-alert app-alert--error">{error}</div> : null}

      {isSuperAdmin ? (
        <label className="app-field">
          <span className="app-field__label">{t('Unidade')}</span>
          <select
            value={selectedAcademyId}
            onChange={(event) => onSelectAcademy?.(event.target.value)}
            className="app-select"
          >
            <option value="">{t('Escolha a unidade')}</option>
            {academies.map((academyOption) => (
              <option key={academyOption.id} value={academyOption.id}>{academyOption.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="app-field">
        <span className="app-field__label">{t('Título')}</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="app-input" maxLength={120} required />
      </label>

      <label className="app-field">
        <span className="app-field__label">{t('Mensagem')}</span>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} className="app-textarea" maxLength={1000} required />
      </label>

      <label className="app-field">
        <span className="app-field__label">{t('Canal')}</span>
        <select value={channel} onChange={(event) => setChannel(event.target.value as NotificationChannel)} className="app-select">
          <option value="academy">{t('Academia')}</option>
          <option value="team">{t('Equipe')}</option>
        </select>
      </label>

      <div className="app-field">
        <span className="app-field__label">{t('Para quem')}</span>
        <div className="broadcast-composer__chips">
          <button type="button" className={`app-chip ${mode === 'group' ? 'is-active' : ''}`} onClick={() => setMode('group')}>
            {t('Por grupo')}
          </button>
          <button type="button" className={`app-chip ${mode === 'people' ? 'is-active' : ''}`} onClick={() => setMode('people')}>
            {t('Pessoas específicas')}
          </button>
        </div>
      </div>

      {mode === 'group' ? (
        <>
          <div className="app-field">
            <span className="app-field__label">{t('Perfil')}</span>
            <div className="broadcast-composer__chips">
              <button type="button" className={`app-chip ${roles.length === 0 ? 'is-active' : ''}`} onClick={() => setRoles([])}>
                {t('Todos')}
              </button>
              <button type="button" className={`app-chip ${roles.includes('student') ? 'is-active' : ''}`} onClick={() => setRoles(toggleIn(roles, 'student'))}>
                {t('Alunos')}
              </button>
              <button type="button" className={`app-chip ${roles.includes('professor') ? 'is-active' : ''}`} onClick={() => setRoles(toggleIn(roles, 'professor'))}>
                {t('Professores')}
              </button>
            </div>
          </div>

          <div className="app-field">
            <span className="app-field__label">{t('Público')}</span>
            <div className="broadcast-composer__chips">
              {(['all', 'adult', 'kids'] as BroadcastAudience[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`app-chip ${audience === option ? 'is-active' : ''}`}
                  onClick={() => setAudience(option)}
                >
                  {option === 'all' ? t('Todos') : option === 'adult' ? t('Adulto') : t('Kids')}
                </button>
              ))}
            </div>
          </div>

          <div className="app-field">
            <span className="app-field__label">{t('Faixas')}</span>
            <div className="broadcast-composer__chips">
              <button type="button" className={`app-chip ${belts.length === 0 ? 'is-active' : ''}`} onClick={() => setBelts([])}>
                {t('Todas as faixas')}
              </button>
              {beltOptions.map(([belt, count]) => (
                <button
                  key={belt}
                  type="button"
                  className={`app-chip ${belts.includes(belt) ? 'is-active' : ''}`}
                  onClick={() => setBelts(toggleIn(belts, belt))}
                >
                  {beltLabel(belt)} ({count})
                </button>
              ))}
            </div>
          </div>

          <div className="broadcast-composer__checks">
            <label className="broadcast-composer__check">
              <input type="checkbox" checked={onlyActive} onChange={(event) => setOnlyActive(event.target.checked)} />
              <span>{t('Só alunos ativos')}</span>
            </label>
            <label className="broadcast-composer__check">
              <input type="checkbox" checked={onlyCompetitors} onChange={(event) => setOnlyCompetitors(event.target.checked)} />
              <span>{t('Só competidores')}</span>
            </label>
          </div>
        </>
      ) : (
        <div className="app-field">
          <span className="app-field__label">{t('Buscar pessoas')}</span>
          <div className="broadcast-composer__search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="app-input"
              placeholder={t('Digite o nome')}
            />
          </div>
          {peopleResults.length > 0 ? (
            <div className="broadcast-composer__results">
              {peopleResults.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="broadcast-composer__result"
                  onClick={() => {
                    setPeople([...people, user.id]);
                    setSearch('');
                  }}
                >
                  <span>{userName(user)}</span>
                  <span className="broadcast-composer__result-meta">{beltLabel(user.belt)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {people.length > 0 ? (
            <div className="broadcast-composer__chips">
              {people.map((userId) => (
                <button
                  key={userId}
                  type="button"
                  className="app-chip is-active"
                  onClick={() => setPeople(people.filter((entry) => entry !== userId))}
                  aria-label={t('Remover')}
                >
                  {usersById.get(userId) ? userName(usersById.get(userId) as UserRecord) : userId}
                  <X size={14} style={{ marginLeft: '0.35rem' }} />
                </button>
              ))}
            </div>
          ) : (
            <p className="broadcast-composer__hint">{t('Busque e toque no nome para adicionar.')}</p>
          )}
        </div>
      )}

      <div className="broadcast-composer__preview">
        <Users size={16} />
        <span>
          {recipients.length === 1
            ? t('Vai para 1 pessoa')
            : t('Vai para {count} pessoas', { count: recipients.length })}
          {' · '}
          {recipientsWithPush === 1
            ? t('1 com notificação no celular')
            : t('{count} com notificação no celular', { count: recipientsWithPush })}
        </span>
      </div>

      <div className="broadcast-composer__checks">
        <label className="broadcast-composer__check">
          <input
            type="checkbox"
            checked={scheduleEnabled}
            onChange={(event) => {
              setScheduleEnabled(event.target.checked);
              if (event.target.checked && !scheduleValue) {
                setScheduleValue(toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
              }
            }}
          />
          <span>{t('Agendar envio')}</span>
        </label>
      </div>

      {scheduleEnabled ? (
        <label className="app-field">
          <span className="app-field__label">{t('Enviar em')}</span>
          <input
            type="datetime-local"
            value={scheduleValue}
            min={toDatetimeLocalValue(new Date())}
            onChange={(event) => setScheduleValue(event.target.value)}
            className="app-input"
            required
          />
        </label>
      ) : null}

      <button type="submit" disabled={busy} className="app-button app-button--gold">
        {scheduleEnabled ? <CalendarClock size={16} /> : <Send size={16} />}
        {busy
          ? t('Enviando...')
          : scheduleEnabled ? t('Agendar comunicado') : t('Enviar comunicado')}
      </button>
    </form>
  );
};

export default BroadcastComposer;
