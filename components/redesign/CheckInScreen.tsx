import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarDays, Camera, CameraOff, Check, ClipboardPaste, Hand, ScanLine, X } from 'lucide-react';
import type { Html5Qrcode } from 'html5-qrcode';
import {
  beltLabel,
  getBlackBeltProgressForUser,
  getUserProgressionSummary,
  isBlackBelt,
  type ProgressionRules,
  type UserProgressionSummary,
} from '../../beltCatalog';
import { classTypeLabel } from '../../calendarUtils';
import { nonCountingWarning, type AttendanceNonCountingReason } from '../../classRules';
import type { FirestoreEntity } from '../../services/firebase/data';
import type { ClassRecord } from '../../services/firebase/models';
import type { User } from '../../types';
import { getLocale, t } from '../../i18n';
import BeltImage from '../BeltImage';
import { hapticConfirm, hapticError, hapticSuccess, hapticTap } from '../../services/haptics';
import { classifyCheckinError, type CheckinErrorInfo } from '../../checkinErrors';
import { subscribeToClassRsvps } from '../../services/firebase/data';
import type { ClassRsvpRecord } from '../../services/firebase/models';
import { Odometer } from './motion';
import { useRedesignShell } from './ShellContext';
import './checkin.css';

export interface CheckInScreenProps {
  /** Aula alvo, quando conhecida (card do Inicio, lista de Aulas ou deep link). */
  lesson: FirestoreEntity<ClassRecord> | null;
  classId: string | null;
  /** Token vindo do deep link `?checkin=<token>&classId=<id>` (camera do celular). */
  initialToken?: string | null;
  user: User;
  progressionRules?: ProgressionRules;
  /** Previa de que a presenca NAO vai contar (aula iniciante / limite diario). */
  nonCountingReason: AttendanceNonCountingReason | null;
  alreadyCheckedIn: boolean;
  hasPendingRequest: boolean;
  /** Registra a presenca. Devolve o motivo quando ela nao conta como aula (null = conta). */
  onRegister: (classId: string, qrToken: string) => Promise<AttendanceNonCountingReason | null>;
  /** "Solicitar presenca" ao professor (sem QR). */
  onRequestAttendance: (classId: string) => Promise<void>;
  onClose: () => void;
  /** Depois do sucesso ("Bora pro tatame"). */
  onFinish: () => void;
  /**
   * Opcional: "Ver calendario" no sucesso (fecha e abre a aba Aulas). Sem ele o botao nao aparece.
   */
  onOpenCalendar?: () => void;
  /**
   * Opcional: o QR lido (ou o codigo colado) aponta para outra aula. O App pode atualizar o alvo
   * (lesson, nonCountingReason, alreadyCheckedIn...) para a tela mostrar os dados certos.
   */
  onTargetChange?: (target: { classId: string; token: string }) => void;
  /** Opcional: fuso IANA da academia, para o horario da aula. Sem ele usa o do aparelho. */
  timeZone?: string;
}

type Step = 'scan' | 'confirm' | 'success';

/** Treinos que viram comemoracao (tela preta + confete curto). */
const TRAINING_MILESTONES = new Set([10, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000]);

/** Confete curto dos marcos: posicoes fixas (sem aleatorio, mesmo desenho sempre). */
const MILESTONE_CONFETTI = Array.from({ length: 28 }, (_, index) => ({
  left: (index * 37) % 100,
  delay: ((index * 7) % 10) / 20,
  rotate: (index * 53) % 360,
  light: index % 3 === 0,
  wide: index % 4 === 1,
}));

interface QrPayload {
  token: string;
  classId: string | null;
}

/** O QR traz `<origin>?checkin=<token>&classId=<id>`; aceita tambem JSON {token} e o token cru. */
function parseQrPayload(text: string): QrPayload | null {
  const raw = text.trim();
  if (!raw) {
    return null;
  }

  const fromParams = (params: URLSearchParams): QrPayload | null => {
    const token = params.get('checkin')?.trim();
    return token ? { token, classId: params.get('classId')?.trim() || null } : null;
  };

  try {
    const fromUrl = fromParams(new URL(raw).searchParams);
    if (fromUrl) {
      return fromUrl;
    }
  } catch {
    // nao e URL absoluta
  }

  if (raw.includes('checkin=')) {
    const query = raw.slice(raw.indexOf('?') + 1);
    const fromQuery = fromParams(new URLSearchParams(query));
    if (fromQuery) {
      return fromQuery;
    }
  }

  try {
    const parsed = JSON.parse(raw) as { token?: unknown; classId?: unknown };
    if (parsed && typeof parsed.token === 'string' && parsed.token.trim()) {
      return {
        token: parsed.token.trim(),
        classId: typeof parsed.classId === 'string' && parsed.classId.trim() ? parsed.classId.trim() : null,
      };
    }
  } catch {
    // token cru
  }

  return { token: raw, classId: null };
}

function cameraErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : '';
}

function dayKeyIn(date: Date, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
}

function formatIn(date: Date, options: Intl.DateTimeFormatOptions, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat(getLocale(), { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(getLocale(), options).format(date);
  }
}

/** Rotulo do dia da aula: "Hoje", "Amanha" ou "qua., 8 de out." (no idioma ativo). */
function lessonDayLabel(start: Date, timeZone?: string): string {
  const now = new Date();
  const startKey = dayKeyIn(start, timeZone);
  const offset = startKey === dayKeyIn(now, timeZone)
    ? 0
    : startKey === dayKeyIn(new Date(now.getTime() + 24 * 60 * 60 * 1000), timeZone)
      ? 1
      : null;
  if (offset !== null) {
    // "hoje"/"amanha" no idioma do usuario, sem chave nova no catalogo.
    const relative = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' }).format(offset, 'day');
    return relative.charAt(0).toLocaleUpperCase(getLocale()) + relative.slice(1);
  }
  return formatIn(start, { weekday: 'short', day: 'numeric', month: 'short' }, timeZone);
}

interface ProgressTarget {
  kind: 'stripe' | 'belt';
  remaining: number;
  grade: number;
  belt: string;
}

/** O que falta no ciclo atual (grau, ou faixa quando nao ha mais grau). null = faixa preta/sem regra. */
function progressTarget(summary: UserProgressionSummary, counted: boolean): ProgressTarget | null {
  if (isBlackBelt(summary.currentBelt)) {
    return null;
  }
  const discount = counted ? 1 : 0;
  if (summary.stripeRemaining != null) {
    return {
      kind: 'stripe',
      remaining: Math.max(summary.stripeRemaining - discount, 0),
      grade: summary.currentStripes + 1,
      belt: '',
    };
  }
  if (summary.beltRemaining != null && summary.nextBelt) {
    return {
      kind: 'belt',
      remaining: Math.max(summary.beltRemaining - discount, 0),
      grade: 0,
      belt: beltLabel(summary.nextBelt),
    };
  }
  return null;
}

function progressSentence(target: ProgressTarget): string {
  if (target.remaining <= 0) {
    return target.kind === 'stripe'
      ? t('Ciclo fechado! Seu professor vai avaliar o {grade}º grau.', { grade: target.grade })
      : t('Ciclo fechado! Seu professor vai avaliar a faixa {belt}.', { belt: target.belt });
  }
  if (target.kind === 'stripe') {
    return target.remaining === 1
      ? t('Falta 1 aula pro {grade}º grau', { grade: target.grade })
      : t('Faltam {count} aulas pro {grade}º grau', { count: target.remaining, grade: target.grade });
  }
  return target.remaining === 1
    ? t('Falta 1 aula pra faixa {belt}', { belt: target.belt })
    : t('Faltam {count} aulas pra faixa {belt}', { count: target.remaining, belt: target.belt });
}

/* ─── Visor da camera (html5-qrcode) ─────────────────────────────────────── */

interface QrViewfinderProps {
  onDecoded: (text: string) => void;
  onError: (detail: string) => void;
}

const QrViewfinder: React.FC<QrViewfinderProps> = ({ onDecoded, onError }) => {
  const rawId = useId();
  const elementId = `rd-checkin-reader-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const decodedRef = useRef(onDecoded);
  const errorRef = useRef(onError);

  useEffect(() => {
    decodedRef.current = onDecoded;
    errorRef.current = onError;
  }, [onDecoded, onError]);

  useEffect(() => {
    let cancelled = false;
    let handled = false;
    let scanner: Html5Qrcode | null = null;
    let running: Promise<unknown> | null = null;

    import('html5-qrcode').then(({ Html5Qrcode: Scanner }) => {
      if (cancelled) {
        return;
      }
      scanner = new Scanner(elementId, { verbose: false });
      running = scanner.start(
        { facingMode: 'environment' },
        { fps: 10, aspectRatio: 1 },
        (decoded) => {
          if (handled || cancelled) {
            return;
          }
          handled = true;
          decodedRef.current(decoded);
        },
        () => {},
      );
      running.catch((error: unknown) => {
        if (!cancelled) {
          errorRef.current(cameraErrorDetail(error));
        }
      });
    }).catch((error: unknown) => {
      if (!cancelled) {
        errorRef.current(cameraErrorDetail(error));
      }
    });

    return () => {
      cancelled = true;
      const activeScanner = scanner;
      const started = running;
      if (activeScanner && started) {
        // Desliga a camera mesmo que o start ainda nao tenha terminado.
        started
          .then(() => activeScanner.stop())
          .then(() => activeScanner.clear())
          .catch(() => {});
      }
    };
  }, [elementId]);

  return (
    <div className="rd-checkin__viewfinder">
      <div id={elementId} className="rd-checkin__reader" />
      <div className="rd-checkin__frame" aria-hidden="true">
        <i /><i /><i /><i />
      </div>
      <div className="rd-checkin__scanline" aria-hidden="true" />
    </div>
  );
};

/* ─── Ilustracoes dos erros (linha em tinta, detalhe branco sobre o amarelo) ──── */

const QR_FRAME = (
  <>
    <rect x="10" y="10" width="40" height="40" rx="6" />
    <rect x="17" y="17" width="9" height="9" rx="1.5" />
    <rect x="34" y="17" width="9" height="9" rx="1.5" />
    <rect x="17" y="34" width="9" height="9" rx="1.5" />
    <path d="M34 34h4M42 34v4M34 42h9" />
  </>
);

const CheckinErrorArt: React.FC<{ kind: CheckinErrorInfo['kind'] }> = ({ kind }) => (
  <svg className="rd-checkin__art" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'expired' ? (
      <>
        {QR_FRAME}
        <circle cx="54" cy="54" r="12" className="rd-checkin__art-accent" />
        <path d="M54 48v6l4 3" />
      </>
    ) : kind === 'wrong-class' ? (
      <>
        {QR_FRAME}
        <circle cx="54" cy="54" r="12" className="rd-checkin__art-accent" />
        <path d="M50 50l8 8M58 50l-8 8" />
      </>
    ) : kind === 'closed' || kind === 'ended' ? (
      <>
        <path d="M18 62V14a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v48" />
        <path d="M10 62h52" />
        <rect x="24" y="18" width="24" height="44" rx="2" className="rd-checkin__art-accent" />
        <circle cx="42" cy="41" r="2" />
      </>
    ) : kind === 'already' ? (
      <>
        <circle cx="36" cy="36" r="24" className="rd-checkin__art-accent" />
        <path d="M25 37l8 8 15-17" />
      </>
    ) : (
      <>
        <path d="M6 32h22M44 32h22" />
        <rect x="26" y="24" width="20" height="16" rx="4" className="rd-checkin__art-accent" />
        <path d="M30 40l-8 20M42 40l8 20" />
      </>
    )}
  </svg>
);

/* ─── Tela ───────────────────────────────────────────────────────────────── */

/**
 * Check-in do aluno por QR (tela cheia amarela).
 * - aberto pelo link do QR (`initialToken`): vai direto para "Confirmar presenca";
 * - aberto pelo app ("Fazer check-in"): abre a camera; fallbacks "Colar codigo" e "Solicitar presenca".
 * Sucesso: "Oss!" + quanto falta para o proximo grau (calculado no cliente, com a progressao de
 * ANTES do check-in para nao descontar duas vezes quando o perfil atualizar).
 */
const CheckInScreen: React.FC<CheckInScreenProps> = ({
  lesson,
  classId,
  initialToken,
  user,
  progressionRules,
  nonCountingReason,
  alreadyCheckedIn,
  hasPendingRequest,
  onRegister,
  onRequestAttendance,
  onClose,
  onFinish,
  onOpenCalendar,
  onTargetChange,
  timeZone,
}) => {
  const startToken = initialToken?.trim() ?? '';
  const [step, setStep] = useState<Step>(startToken ? 'confirm' : 'scan');
  const [target, setTarget] = useState<QrPayload>({ token: startToken, classId });
  const [cameraKey, setCameraKey] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [scanError, setScanError] = useState('');
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');
  const [requestState, setRequestState] = useState<'idle' | 'loading' | 'sent'>('idle');
  const [requestError, setRequestError] = useState('');
  const [result, setResult] = useState<{
    reason: AttendanceNonCountingReason | null;
    summary: UserProgressionSummary;
    /** Numero do treino (presencas antes do check-in + 1), guardado na hora para nao mudar depois. */
    trainingNumber: number;
  } | null>(null);
  const [failure, setFailure] = useState<CheckinErrorInfo | null>(null);
  const [failureDetailsOpen, setFailureDetailsOpen] = useState(false);
  const [classmates, setClassmates] = useState<Array<FirestoreEntity<ClassRsvpRecord>>>([]);
  const shell = useRedesignShell();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pasteInputRef = useRef<HTMLInputElement>(null);

  const effectiveClassId = target.classId ?? classId;
  // Os dados vindos do App (aula, previa, ja registrada, pedido pendente) valem para `classId`.
  const sameClass = effectiveClassId === classId;
  const shownLesson = lesson && lesson.id === effectiveClassId ? lesson : null;
  const pendingReason = sameClass ? nonCountingReason : null;
  const isAlreadyCheckedIn = sameClass && alreadyCheckedIn;
  const requestPending = (sameClass && hasPendingRequest) || requestState === 'sent';

  // Foco no titulo a cada etapa e quando aparece um erro (leitor de tela anuncia a mudanca).
  useEffect(() => {
    titleRef.current?.focus();
  }, [step, failure?.kind]);

  // Esc fecha (so enquanto a tela esta montada; nao fecha no meio do registro).
  const closeRef = useRef(onClose);
  const busyRef = useRef(registering);
  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = registering;
  }, [onClose, registering]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (pasteOpen) {
      pasteInputRef.current?.focus();
    }
  }, [pasteOpen]);

  const baseSummary = useMemo(() => getUserProgressionSummary(user, progressionRules), [user, progressionRules]);

  // "Hoje com Ana, Felipe e mais 6": quem confirmou ida nesta aula (lista ja liberada para a academia).
  const classmatesAcademyId = lesson && lesson.id === (target.classId ?? classId) ? lesson.academyId : null;
  const classmatesClassId = step === 'success' ? (target.classId ?? classId) : null;
  useEffect(() => {
    if (!classmatesClassId || !classmatesAcademyId) {
      setClassmates([]);
      return undefined;
    }
    return subscribeToClassRsvps(classmatesClassId, classmatesAcademyId, setClassmates, () => setClassmates([]));
  }, [classmatesClassId, classmatesAcademyId]);
  const preTarget = useMemo(() => progressTarget(baseSummary, false), [baseSummary]);
  const blackBelt = useMemo(() => getBlackBeltProgressForUser(user), [user]);

  const lessonStart = shownLesson?.scheduledStart?.toDate() ?? null;
  const lessonEnd = shownLesson?.scheduledEnd?.toDate() ?? null;
  const lessonTypeLabel = shownLesson ? (classTypeLabel(shownLesson.description) ?? shownLesson.title) : null;
  const lessonTime = lessonStart ? formatIn(lessonStart, { hour: '2-digit', minute: '2-digit' }, timeZone) : null;
  const lessonEndTime = lessonEnd ? formatIn(lessonEnd, { hour: '2-digit', minute: '2-digit' }, timeZone) : null;
  const lessonMeta = shownLesson
    ? [lessonTypeLabel, shownLesson.professorName, shownLesson.tatame || t('Tatame principal')].filter(Boolean).join(' · ')
    : '';

  const goToConfirm = useCallback((payload: QrPayload) => {
    const nextClassId = payload.classId ?? classId;
    if (!nextClassId) {
      setScanError(t('Não encontramos a aula deste código. Leia o QR que o professor mostra.'));
      setPasteOpen(true);
      return;
    }
    setTarget({ token: payload.token, classId: nextClassId });
    setScanError('');
    setError('');
    setStep('confirm');
    if (nextClassId !== classId) {
      onTargetChange?.({ classId: nextClassId, token: payload.token });
    }
  }, [classId, onTargetChange]);

  const handleDecoded = useCallback((text: string) => {
    const payload = parseQrPayload(text);
    if (payload) {
      goToConfirm(payload);
    }
  }, [goToConfirm]);

  const handleCameraError = useCallback((detail: string) => {
    setCameraError(detail);
    setPasteOpen(true);
  }, []);

  const handlePasteSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = parseQrPayload(pasteValue);
    if (!payload) {
      setScanError(t('Informe o token do QR para registrar a presenca.'));
      return;
    }
    goToConfirm(payload);
  };

  const handleScanAgain = () => {
    setTarget({ token: '', classId });
    setError('');
    setFailure(null);
    setScanError('');
    setCameraError(null);
    setCameraKey((current) => current + 1);
    setStep('scan');
  };

  const handleConfirm = async () => {
    const token = target.token.trim();
    if (!effectiveClassId || !token || registering) {
      return;
    }
    // Progressao de ANTES do check-in: o perfil so atualiza depois do trigger no servidor.
    const summary = getUserProgressionSummary(user, progressionRules);
    const trainingNumber = Math.max(0, user.attendanceCount ?? 0) + 1;
    setRegistering(true);
    setError('');
    setFailure(null);
    setFailureDetailsOpen(false);
    try {
      const reason = await onRegister(effectiveClassId, token);
      setResult({ reason, summary, trainingNumber });
      setStep('success');
      hapticSuccess();
    } catch (err) {
      const info = classifyCheckinError(err);
      if (!info.detail) info.detail = t('Erro ao registrar presença.');
      setFailure(info);
      if (info.kind === 'already') hapticTap(); else hapticError();
    } finally {
      setRegistering(false);
    }
  };

  const handleRequest = async () => {
    if (!effectiveClassId || requestState === 'loading' || requestPending) {
      return;
    }
    setRequestState('loading');
    setRequestError('');
    try {
      await onRequestAttendance(effectiveClassId);
      setRequestState('sent');
      hapticConfirm();
    } catch (err) {
      setRequestState('idle');
      setRequestError(err instanceof Error && err.message ? err.message : t('Não foi possível enviar a solicitação.'));
    }
  };

  const renderTopBar = (successChip?: boolean) => (
    <div className="rd-checkin__bar">
      <button
        type="button"
        className="lv-icon-btn lv-icon-btn--on-yellow"
        onClick={onClose}
        disabled={registering}
        aria-label={t('Fechar')}
      >
        <X size={20} strokeWidth={2} />
      </button>
      {lessonTime && lessonStart ? (
        <span className="rd-checkin__chip">
          {successChip ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : null}
          {successChip && lessonTypeLabel
            ? `${lessonTypeLabel} · ${lessonTime}`
            : `${lessonDayLabel(lessonStart, timeZone)} · ${lessonTime}`}
        </span>
      ) : null}
    </div>
  );

  const renderRequestBlock = () => {
    if (!effectiveClassId || isAlreadyCheckedIn) {
      return null;
    }
    return (
      <div className="rd-checkin__request">
        <button
          type="button"
          className="lv-btn lv-btn--outline-dark lv-btn--block"
          onClick={() => void handleRequest()}
          disabled={requestPending || requestState === 'loading'}
        >
          <Hand size={18} strokeWidth={2} aria-hidden="true" />
          {requestPending
            ? t('Solicitação pendente')
            : requestState === 'loading'
              ? t('Enviando...')
              : t('Solicitar presença')}
        </button>
        {requestState === 'sent' ? (
          <p className="rd-checkin__hint" role="status">{t('Solicitação enviada. Aguarde a aprovação do professor.')}</p>
        ) : !requestPending ? (
          <p className="rd-checkin__hint">{t('Sem QR? Peça para o professor aprovar sua presença.')}</p>
        ) : null}
        {requestError ? <p className="rd-checkin__error" role="alert">{requestError}</p> : null}
      </div>
    );
  };

  const renderProgressPill = () => (preTarget ? (
    <div className="rd-checkin__pill">
      <span className="rd-checkin__pill-text">{progressSentence(preTarget)}</span>
      <BeltImage
        belt={user.belt}
        stripes={baseSummary.currentStripes}
        maxStripes={baseSummary.currentRule.maxStripes > 0 ? baseSummary.currentRule.maxStripes : undefined}
        className="lv-belt-mini rd-checkin__pill-belt"
      />
    </div>
  ) : null);

  const renderAlreadyNotice = () => (isAlreadyCheckedIn ? (
    <div className="rd-checkin__done" role="status">
      <span className="rd-checkin__done-icon" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
      <div>
        <strong>{t('Já registrada')}</strong>
        <p>{t('Sua presença nesta aula já foi registrada.')}</p>
      </div>
    </div>
  ) : null);

  /* ─── Erro sem susto: o que aconteceu + o que fazer ───────────────────── */
  const renderFailure = (info: CheckinErrorInfo) => {
    const copy: Record<CheckinErrorInfo['kind'], { title: string; text: string }> = {
      expired: { title: t('Esse QR já virou.'), text: t('O QR muda a cada poucos minutos. Peça ao professor para mostrar o novo.') },
      'wrong-class': { title: t('Esse código não é desta aula.'), text: t('Confira se o QR é o da aula em que você está e leia de novo.') },
      closed: { title: t('O professor ainda não abriu o check-in.'), text: t('Espere a aula começar ou peça para ele aprovar sua presença.') },
      ended: { title: t('Essa aula não aceita mais check-in.'), text: t('Ela já foi encerrada ou cancelada. Se você treinou, peça para o professor marcar sua presença.') },
      already: { title: t('Já registrada.'), text: t('Sua presença nesta aula já está lá. Até a próxima. Oss.') },
      generic: { title: t('Algo não deu certo agora.'), text: t('Sua presença não foi registrada. Tente de novo em alguns segundos.') },
    };
    const { title, text } = copy[info.kind];
    const retry = (
      <button
        type="button"
        className={info.kind === 'generic' ? 'lv-btn lv-btn--block rd-checkin__cta' : 'rd-checkin__link'}
        onClick={() => void handleConfirm()}
        disabled={registering}
        aria-busy={registering}
      >
        {registering ? t('Registrando...') : t('Tentar de novo')}
      </button>
    );

    return (
      <>
        <div className={`rd-checkin__fail rd-checkin__fail--${info.kind}`}>
          <CheckinErrorArt kind={info.kind} />
          <h1 id="rd-checkin-title" ref={titleRef} tabIndex={-1} className="rd-checkin__fail-title">{title}</h1>
          <p className="rd-checkin__fail-text" role="alert">{text}</p>
          {lessonMeta ? <p className="rd-checkin__meta">{lessonMeta}</p> : null}
        </div>

        {info.kind !== 'already' && info.detail ? (
          <div className="rd-checkin__details">
            <button
              type="button"
              className="rd-checkin__details-btn"
              onClick={() => setFailureDetailsOpen((open) => !open)}
              aria-expanded={failureDetailsOpen}
            >
              {t('Detalhes')}
            </button>
            {failureDetailsOpen ? <p className="rd-checkin__details-text">{info.detail}</p> : null}
          </div>
        ) : null}

        <div className="lv-fullscreen__footer">
          {info.kind === 'expired' || info.kind === 'wrong-class' ? (
            <button type="button" className="lv-btn lv-btn--block rd-checkin__cta" onClick={handleScanAgain}>
              <ScanLine size={18} strokeWidth={2} aria-hidden="true" />
              {info.kind === 'expired' ? t('Ler de novo') : t('Ler outro QR')}
            </button>
          ) : null}
          {info.kind === 'closed' ? (
            <>
              {renderRequestBlock()}
              {retry}
            </>
          ) : null}
          {info.kind === 'generic' ? (
            <>
              {retry}
              {renderRequestBlock()}
            </>
          ) : null}
          {info.kind === 'ended' ? (
            <button type="button" className="lv-btn lv-btn--block rd-checkin__cta" onClick={onFinish}>
              {t('Pronto')}
            </button>
          ) : null}
          {info.kind === 'already' ? (
            <>
              <button type="button" className="lv-btn lv-btn--block rd-checkin__cta" onClick={onFinish}>
                {t('Pronto')}
              </button>
              {onOpenCalendar ? (
                <button type="button" className="lv-btn lv-btn--outline-dark lv-btn--block" onClick={onOpenCalendar}>
                  <CalendarDays size={18} strokeWidth={2} aria-hidden="true" />
                  {t('Ver calendário')}
                </button>
              ) : null}
            </>
          ) : null}
          {info.kind !== 'expired' && info.kind !== 'wrong-class' && info.kind !== 'already' ? (
            <button type="button" className="rd-checkin__link" onClick={handleScanAgain} disabled={registering}>
              <ScanLine size={16} strokeWidth={2} aria-hidden="true" />
              {t('Ler outro QR')}
            </button>
          ) : null}
        </div>
      </>
    );
  };

  /* ─── Sucesso ("Oss!") ─────────────────────────────────────────────────── */
  if (step === 'success' && result) {
    const counted = result.reason === null;
    const after = progressTarget(result.summary, counted);
    const longNumber = after ? String(after.remaining).length >= 3 : false;
    const number = result.trainingNumber;
    const milestone = counted && TRAINING_MILESTONES.has(number);
    const firstName = (name: string) => (name || '').trim().split(/\s+/)[0] || t('Aluno');
    const mates = classmates.filter((entry) => entry.userId !== user.id);
    const matesText = mates.length === 0
      ? null
      : mates.length === 1
        ? t('Hoje com {a}', { a: firstName(mates[0].userDisplayName) })
        : mates.length === 2
          ? t('Hoje com {a} e {b}', { a: firstName(mates[0].userDisplayName), b: firstName(mates[1].userDisplayName) })
          : t('Hoje com {a}, {b} e mais {count}', {
            a: firstName(mates[0].userDisplayName),
            b: firstName(mates[1].userDisplayName),
            count: mates.length - 2,
          });

    return (
      <div
        className={`lv-fullscreen lv-fullscreen--yellow rd-checkin${milestone ? ' rd-checkin--milestone' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rd-checkin-title"
      >
        {milestone ? (
          <div className="rd-checkin__confetti" aria-hidden="true">
            {MILESTONE_CONFETTI.map((piece, index) => (
              <i
                key={index}
                className={`${piece.light ? 'is-light' : ''} ${piece.wide ? 'is-wide' : ''}`.trim() || undefined}
                style={{
                  left: `${piece.left}%`,
                  animationDelay: `${piece.delay}s`,
                  '--rd-confetti-rotate': `${piece.rotate}deg`,
                } as React.CSSProperties}
              />
            ))}
          </div>
        ) : null}
        <div className="lv-fullscreen__inner rd-checkin__inner">
          {renderTopBar(true)}

          <div className="rd-checkin__oss">
            <h1 id="rd-checkin-title" ref={titleRef} tabIndex={-1} className="rd-checkin__oss-title">
              {t('Oss!')}
            </h1>
            <span className="rd-checkin__seal" aria-hidden="true">
              <Check size={34} strokeWidth={3} />
            </span>
          </div>
          <p className="rd-checkin__oss-sub" role="status">
            {counted ? t('Presença registrada.') : t('Você está na lista!')}
          </p>
          {!counted ? (
            <p className="lv-alert lv-alert--on-yellow">{nonCountingWarning(result.reason)}</p>
          ) : null}

          {counted ? (
            <>
              <div className="rd-checkin__count">
                <span className="rd-checkin__eyebrow">{t('Treino nº')}</span>
                <Odometer value={number} from={number - 1} className="rd-checkin__count-number" />
                {milestone ? (
                  <p className="rd-checkin__milestone">
                    {t('{count} treinos. Isso é constância, {name}.', { count: number, name: firstName(user.name) })}
                  </p>
                ) : shell.unitLabel ? (
                  <span className="rd-checkin__count-caption">{t('seu treino na {academy}', { academy: shell.unitLabel })}</span>
                ) : null}
              </div>

              {matesText ? (
                <div className="rd-checkin__mates">
                  <span className="rd-checkin__mates-faces" aria-hidden="true">
                    {mates.slice(0, 4).map((entry) => (
                      <span key={entry.id}>{(entry.userDisplayName || '?').trim().charAt(0).toLocaleUpperCase()}</span>
                    ))}
                  </span>
                  <span>{matesText}</span>
                </div>
              ) : null}

              {after ? <p className="rd-checkin__next">{progressSentence(after)}</p> : null}
            </>
          ) : after ? (
            <>
              <div className="rd-checkin__divider" aria-hidden="true">
                <span className="lv-stripes"><i /><i /><i /><i /></span>
              </div>
              {after.remaining > 0 ? (
                <div className="rd-checkin__left">
                  <span className="rd-checkin__eyebrow">{after.remaining === 1 ? t('Falta') : t('Faltam')}</span>
                  <div className="rd-checkin__left-row">
                    <span className={`rd-checkin__big${longNumber ? ' rd-checkin__big--long' : ''}`}>
                      {after.remaining.toLocaleString(getLocale())}
                    </span>
                    <span className="rd-checkin__left-caption">
                      {after.kind === 'stripe'
                        ? t('para o {grade}º grau.', { grade: after.grade })
                        : t('para a faixa {belt}.', { belt: after.belt })}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rd-checkin__left">
                  <span className="rd-checkin__eyebrow">
                    {after.kind === 'stripe' ? t('Grau novo a caminho!') : t('Faixa nova a caminho!')}
                  </span>
                  <p className="rd-checkin__left-closed">{progressSentence(after)}</p>
                </div>
              )}
            </>
          ) : null}

          <div className="rd-checkin__belt">
            {counted && after ? <span className="rd-checkin__ribbon">{t('+1 fita')}</span> : null}
            <BeltImage
              belt={user.belt}
              stripes={result.summary.currentStripes}
              maxStripes={result.summary.currentRule.maxStripes > 0 ? result.summary.currentRule.maxStripes : undefined}
              blackBelt={blackBelt}
              alt={beltLabel(user.belt)}
            />
          </div>

          <div className="lv-fullscreen__footer">
            <button type="button" className="lv-btn lv-btn--block rd-checkin__cta" onClick={onFinish}>
              {t('Bora pro tatame')}
            </button>
            {onOpenCalendar ? (
              <button type="button" className="lv-btn lv-btn--outline-dark lv-btn--block" onClick={onOpenCalendar}>
                <CalendarDays size={18} strokeWidth={2} aria-hidden="true" />
                {t('Ver calendário')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  /* ─── Leitura do QR / confirmacao ──────────────────────────────────────── */
  return (
    <div
      className="lv-fullscreen lv-fullscreen--yellow rd-checkin"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rd-checkin-title"
    >
      <div className="lv-fullscreen__inner rd-checkin__inner">
        {renderTopBar()}

        {step === 'confirm' && failure ? null : (
          <header className="rd-checkin__head">
            <span className="rd-checkin__eyebrow">{t('Check-in')}</span>
            <h1 id="rd-checkin-title" ref={titleRef} tabIndex={-1} className="rd-checkin__title">
              {t('Hora do treino.')}
            </h1>
            {lessonMeta ? <p className="rd-checkin__meta">{lessonMeta}</p> : null}
          </header>
        )}

        {step === 'confirm' && failure ? null : renderAlreadyNotice()}

        {step === 'scan' ? (
          <>
            <div className="rd-checkin__scan">
              {cameraError === null ? (
                <QrViewfinder key={cameraKey} onDecoded={handleDecoded} onError={handleCameraError} />
              ) : (
                <div className="rd-checkin__viewfinder rd-checkin__viewfinder--off" role="alert">
                  <CameraOff size={36} strokeWidth={2} aria-hidden="true" />
                  <strong>{t('Não foi possível abrir a câmera.')}</strong>
                  <span>{t('Libere o acesso à câmera nas configurações ou cole o código abaixo.')}</span>
                  {cameraError ? <small>{`${t('Câmera')}: ${cameraError}`}</small> : null}
                  <button
                    type="button"
                    className="lv-btn lv-btn--sm rd-checkin__cta"
                    onClick={() => {
                      setCameraError(null);
                      setCameraKey((current) => current + 1);
                    }}
                  >
                    <Camera size={16} strokeWidth={2} aria-hidden="true" />
                    {t('Tentar novamente')}
                  </button>
                </div>
              )}
              <p className="rd-checkin__scan-label">
                <ScanLine size={18} strokeWidth={2} aria-hidden="true" />
                {t('Aponte para o QR do professor')}
              </p>
            </div>

            {pasteOpen ? (
              <form className="rd-checkin__paste" onSubmit={handlePasteSubmit}>
                <label className="rd-checkin__paste-label" htmlFor="rd-checkin-paste">{t('Cole aqui o token do QR')}</label>
                <div className="rd-checkin__paste-row">
                  <input
                    id="rd-checkin-paste"
                    ref={pasteInputRef}
                    className="rd-checkin__input"
                    value={pasteValue}
                    onChange={(event) => setPasteValue(event.target.value)}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="text"
                  />
                  <button type="submit" className="lv-btn rd-checkin__cta" disabled={!pasteValue.trim()}>
                    {t('Continuar')}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="lv-btn lv-btn--outline-dark lv-btn--block"
                onClick={() => setPasteOpen(true)}
              >
                <ClipboardPaste size={18} strokeWidth={2} aria-hidden="true" />
                {t('Colar código')}
              </button>
            )}
            {scanError ? <p className="rd-checkin__error" role="alert">{scanError}</p> : null}

            {renderRequestBlock()}

            <div className="lv-fullscreen__footer">{renderProgressPill()}</div>
          </>
        ) : failure ? (
          renderFailure(failure)
        ) : (
          <>
            <div className="rd-checkin__summary">
              <span className="rd-checkin__summary-label">{t('Aula')}</span>
              <strong className="rd-checkin__summary-title">{shownLesson?.title ?? t('Aula')}</strong>
              {shownLesson ? (
                <dl className="rd-checkin__facts">
                  {lessonStart && lessonTime ? (
                    <div>
                      <dt>{t('Horário')}</dt>
                      <dd>
                        {`${lessonDayLabel(lessonStart, timeZone)} · ${lessonTime}${lessonEndTime ? `–${lessonEndTime}` : ''}`}
                      </dd>
                    </div>
                  ) : null}
                  {lessonTypeLabel && lessonTypeLabel !== shownLesson.title ? (
                    <div><dt>{t('Tipo de aula')}</dt><dd>{lessonTypeLabel}</dd></div>
                  ) : null}
                  {shownLesson.professorName ? (
                    <div><dt>{t('Professor')}</dt><dd>{shownLesson.professorName}</dd></div>
                  ) : null}
                  <div><dt>{t('Tatame')}</dt><dd>{shownLesson.tatame || t('Tatame principal')}</dd></div>
                </dl>
              ) : null}
            </div>

            {!isAlreadyCheckedIn ? (
              <p className="rd-checkin__question">{t('Deseja registrar sua presença nesta aula?')}</p>
            ) : null}
            {pendingReason ? (
              <p className="lv-alert lv-alert--on-yellow">{nonCountingWarning(pendingReason)}</p>
            ) : null}
            {error ? <p className="rd-checkin__error" role="alert">{error}</p> : null}

            <div className="lv-fullscreen__footer">
              {renderProgressPill()}
              {!isAlreadyCheckedIn ? (
                <>
                  <p className="rd-checkin__consequence">
                    {pendingReason
                      ? t('Sua participação será registrada permanentemente, mas sem contar como aula.')
                      : t('Sua presença será registrada permanentemente.')}
                  </p>
                  <button
                    type="button"
                    className="lv-btn lv-btn--block rd-checkin__cta"
                    onClick={() => void handleConfirm()}
                    disabled={registering || !effectiveClassId || !target.token.trim()}
                    aria-busy={registering}
                  >
                    {registering ? t('Registrando...') : t('Confirmar presença')}
                  </button>
                </>
              ) : null}
              {error ? renderRequestBlock() : null}
              <button
                type="button"
                className="rd-checkin__link"
                onClick={handleScanAgain}
                disabled={registering}
              >
                <ScanLine size={16} strokeWidth={2} aria-hidden="true" />
                {t('Ler outro QR')}
              </button>
              {isAlreadyCheckedIn && onOpenCalendar ? (
                <button type="button" className="lv-btn lv-btn--outline-dark lv-btn--block" onClick={onOpenCalendar}>
                  <CalendarDays size={18} strokeWidth={2} aria-hidden="true" />
                  {t('Ver calendário')}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CheckInScreen;
