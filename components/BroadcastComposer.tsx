import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp, Search, Send, Users, X } from 'lucide-react';
import { beltLabel } from '../beltCatalog';
import {
  DEFAULT_BROADCAST_FILTERS,
  describeBroadcastFilters,
  matchesBroadcastFilters,
  toDatetimeLocalValue,
} from '../broadcastFilters';
import BeltImage from './BeltImage';
import '../views/redesign/notifications.css';
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
  /** Botao fechar (X) no topo, quando o compositor abre em tela cheia. */
  onClose?: () => void;
  /** Chamado depois de um envio bem-sucedido, com o resumo do resultado. */
  onSent?: (summary: string, channel: NotificationChannel) => void;
  /** Canal sugerido ao abrir (segue a aba Academia/Equipe da lista). */
  defaultChannel?: NotificationChannel;
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
  onClose,
  onSent,
  defaultChannel,
}) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<NotificationChannel>(defaultChannel ?? 'academy');
  const [mode, setMode] = useState<RecipientMode>('group');
  const [roles, setRoles] = useState<AppRole[]>(DEFAULT_BROADCAST_FILTERS.roles ?? []);
  const [audience, setAudience] = useState<BroadcastAudience>('all');
  const [belts, setBelts] = useState<string[]>([]);
  const [beltPicker, setBeltPicker] = useState(false);
  const [onlyActive, setOnlyActive] = useState(true);
  const [onlyCompetitors, setOnlyCompetitors] = useState(false);
  const [people, setPeople] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (defaultChannel) {
      setChannel(defaultChannel);
    }
  }, [defaultChannel]);

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

  // "Publico" do design: Todos (sem filtro de faixa), Por faixa ou Pessoas especificas.
  const audienceTab: 'all' | 'belts' | 'people' = mode === 'people'
    ? 'people'
    : (beltPicker || belts.length > 0 ? 'belts' : 'all');

  // Resumo das opcoes recolhidas em "Mais opcoes".
  const moreSummary = [
    ...(mode === 'group' ? describeBroadcastFilters({ ...filters, belts: [] }) : []),
    ...(scheduleEnabled ? [t('Agendar envio')] : []),
  ].join(' · ');

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
        setMoreOpen(true);
        return;
      }
      scheduledAt = parsed;
    }

    setBusy(true);
    try {
      const result = await onSend({ title: title.trim(), body: body.trim(), channel, filters, scheduledAt });
      const summary = describeResult(result);
      setFeedback(summary);
      resetForm();
      onSent?.(summary, channel);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t('Não foi possível enviar o comunicado.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`rd-compose ${className}`.trim()}>
      <div className="rd-compose__bar">
        {onClose ? (
          <button type="button" className="lv-icon-btn" onClick={onClose} aria-label={t('Fechar')}>
            <X size={22} strokeWidth={2} />
          </button>
        ) : <span />}
        <span className="lv-eyebrow">{t('Comunicação')}</span>
      </div>

      <div className="rd-compose__head">
        <h2 className="lv-display">{heading}</h2>
        {description ? <p className="rd-compose__subtitle">{description}</p> : null}
      </div>

      {feedback ? <div className="lv-alert rd-compose__alert--success" role="status">{feedback}</div> : null}
      {error ? <div className="lv-alert lv-alert--danger" role="alert">{error}</div> : null}

      {isSuperAdmin ? (
        <label className="lv-field">
          <span>{t('Unidade')}</span>
          <select
            value={selectedAcademyId}
            onChange={(event) => onSelectAcademy?.(event.target.value)}
            className="lv-select"
          >
            <option value="">{t('Escolha a unidade')}</option>
            {academies.map((academyOption) => (
              <option key={academyOption.id} value={academyOption.id}>{academyOption.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="lv-field">
        <span>{t('Título')}</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="lv-input"
          maxLength={120}
          placeholder={t('Ex.: Treino especial no sábado')}
          required
        />
      </label>

      <label className="lv-field">
        <span>{t('Mensagem')}</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="lv-textarea"
          maxLength={1000}
          placeholder={t('Escreva o aviso para o tatame.')}
          required
        />
      </label>

      <div className="lv-field">
        <span>{t('Canal')}</span>
        <div className="lv-segmented" role="radiogroup" aria-label={t('Canal')}>
          <button
            type="button"
            role="radio"
            aria-checked={channel === 'academy'}
            className={channel === 'academy' ? 'is-active' : ''}
            onClick={() => setChannel('academy')}
          >
            {t('Academia')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={channel === 'team'}
            className={channel === 'team' ? 'is-active' : ''}
            onClick={() => setChannel('team')}
          >
            {t('Equipe')}
          </button>
        </div>
      </div>

      <div className="lv-field">
        <span>{t('Público')}</span>
        <div className="lv-segmented" role="radiogroup" aria-label={t('Para quem')}>
          <button
            type="button"
            role="radio"
            aria-checked={audienceTab === 'all'}
            className={audienceTab === 'all' ? 'is-active' : ''}
            onClick={() => {
              setMode('group');
              setBeltPicker(false);
              setBelts([]);
            }}
          >
            {t('Todos')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={audienceTab === 'belts'}
            className={audienceTab === 'belts' ? 'is-active' : ''}
            onClick={() => {
              setMode('group');
              setBeltPicker(true);
            }}
          >
            {t('Por faixa')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={audienceTab === 'people'}
            className={audienceTab === 'people' ? 'is-active' : ''}
            onClick={() => setMode('people')}
          >
            {t('Pessoas')}
          </button>
        </div>
      </div>

      {audienceTab === 'belts' ? (
        <div className="lv-field">
          <div className="rd-compose__belts" role="group" aria-label={t('Faixas')}>
            <button
              type="button"
              className={`rd-compose__belt ${belts.length === 0 ? 'is-active' : ''}`}
              aria-pressed={belts.length === 0}
              onClick={() => setBelts([])}
            >
              {t('Todas as faixas')}
            </button>
            {beltOptions.map(([belt, count]) => (
              <button
                key={belt}
                type="button"
                className={`rd-compose__belt ${belts.includes(belt) ? 'is-active' : ''}`}
                aria-pressed={belts.includes(belt)}
                onClick={() => setBelts(toggleIn(belts, belt))}
              >
                <BeltImage belt={belt} stripes={0} hideEmptyStripes className="rd-compose__belt-mini" />
                {beltLabel(belt)}
                <span className="rd-compose__belt-count">({count})</span>
              </button>
            ))}
          </div>
          {belts.length > 0 ? (
            <p className="rd-compose__hint">
              {belts.length === 1
                ? t('Vai para alunos de 1 faixa selecionada.')
                : t('Vai para alunos de {count} faixas selecionadas.', { count: belts.length })}
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === 'people' ? (
        <div className="lv-field">
          <span>{t('Buscar pessoas')}</span>
          <div className="lv-search">
            <Search size={18} strokeWidth={2} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('Digite o nome')}
              aria-label={t('Buscar pessoas')}
            />
          </div>
          {peopleResults.length > 0 ? (
            <div className="lv-list rd-compose__results">
              {peopleResults.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="lv-row lv-row--button"
                  onClick={() => {
                    setPeople([...people, user.id]);
                    setSearch('');
                  }}
                >
                  <span className="lv-row__main">
                    <span className="lv-row__title">{userName(user)}</span>
                    <span className="lv-row__meta">{beltLabel(user.belt)}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {people.length > 0 ? (
            <div className="rd-compose__people">
              {people.map((userId) => (
                <button
                  key={userId}
                  type="button"
                  className="lv-chip-btn is-active"
                  onClick={() => setPeople(people.filter((entry) => entry !== userId))}
                  aria-label={t('Remover')}
                >
                  {usersById.get(userId) ? userName(usersById.get(userId) as UserRecord) : userId}
                  <X size={14} strokeWidth={2.2} />
                </button>
              ))}
            </div>
          ) : (
            <p className="rd-compose__hint">{t('Busque e toque no nome para adicionar.')}</p>
          )}
        </div>
      ) : null}

      <p className="rd-compose__preview">
        <Users size={16} strokeWidth={2} />
        <span>
          {recipients.length === 1
            ? t('Vai para 1 pessoa')
            : t('Vai para {count} pessoas', { count: recipients.length })}
          {' · '}
          {recipientsWithPush === 1
            ? t('1 com notificação no celular')
            : t('{count} com notificação no celular', { count: recipientsWithPush })}
        </span>
      </p>

      <div className="rd-compose__more">
        <button
          type="button"
          className="rd-compose__more-toggle"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((current) => !current)}
        >
          <span className="rd-compose__more-copy">
            <span className="rd-compose__more-title">{t('Mais opções')}</span>
            {moreSummary ? <span className="rd-compose__more-summary">{moreSummary}</span> : null}
          </span>
          {moreOpen ? <ChevronUp size={20} strokeWidth={2} /> : <ChevronDown size={20} strokeWidth={2} />}
        </button>

        {moreOpen ? (
          <div className="rd-compose__more-body">
            {mode === 'group' ? (
              <>
                <div className="lv-field">
                  <span>{t('Perfil')}</span>
                  <div className="lv-chip-row">
                    <button type="button" className={`lv-chip-btn ${roles.length === 0 ? 'is-active' : ''}`} onClick={() => setRoles([])}>
                      {t('Todos')}
                    </button>
                    <button type="button" className={`lv-chip-btn ${roles.includes('student') ? 'is-active' : ''}`} onClick={() => setRoles(toggleIn(roles, 'student'))}>
                      {t('Alunos')}
                    </button>
                    <button type="button" className={`lv-chip-btn ${roles.includes('professor') ? 'is-active' : ''}`} onClick={() => setRoles(toggleIn(roles, 'professor'))}>
                      {t('Professores')}
                    </button>
                  </div>
                </div>

                <div className="lv-field">
                  <span>{t('Categoria')}</span>
                  <div className="lv-chip-row">
                    {(['all', 'adult', 'kids'] as BroadcastAudience[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`lv-chip-btn ${audience === option ? 'is-active' : ''}`}
                        onClick={() => setAudience(option)}
                      >
                        {option === 'all' ? t('Todos') : option === 'adult' ? t('Adulto') : t('Kids')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rd-compose__checks">
                  <label className="rd-compose__check">
                    <input type="checkbox" checked={onlyActive} onChange={(event) => setOnlyActive(event.target.checked)} />
                    <span>{t('Só alunos ativos')}</span>
                  </label>
                  <label className="rd-compose__check">
                    <input type="checkbox" checked={onlyCompetitors} onChange={(event) => setOnlyCompetitors(event.target.checked)} />
                    <span>{t('Só competidores')}</span>
                  </label>
                </div>
              </>
            ) : null}

            <div className="rd-compose__checks">
              <label className="rd-compose__check">
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
              <label className="lv-field">
                <span>{t('Enviar em')}</span>
                <input
                  type="datetime-local"
                  value={scheduleValue}
                  min={toDatetimeLocalValue(new Date())}
                  onChange={(event) => setScheduleValue(event.target.value)}
                  className="lv-input"
                  required
                />
              </label>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rd-compose__footer">
        <button type="submit" disabled={busy} className="lv-btn lv-btn--primary lv-btn--block">
          {scheduleEnabled ? <CalendarClock size={18} strokeWidth={2} /> : <Send size={18} strokeWidth={2} />}
          {busy
            ? t('Enviando...')
            : scheduleEnabled ? t('Agendar aviso') : t('Enviar aviso')}
        </button>
      </div>
    </form>
  );
};

export default BroadcastComposer;
