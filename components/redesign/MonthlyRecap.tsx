import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flame, RotateCcw, Share, X } from 'lucide-react';
import BeltImage from '../BeltImage';
import { getBeltImage } from '../../beltImages';
import { createDateFormatter, t } from '../../i18n';
import type { MonthRecap } from '../../trainingStats';
import { hapticTap } from '../../services/haptics';
import { shareImage } from '../../services/shareImage';
import { beltGlow, renderRecapCard } from '../../services/storyCards';
import { CountUp, prefersReducedMotion } from './motion';
import './recap.css';

export interface MonthlyRecapProps {
  recap: MonthRecap;
  /** Semanas seguidas com treino (mesmo número do Início). */
  streak: number;
  name: string;
  unitLabel?: string | null;
  belt: string;
  stripes: number;
  maxStripes?: number;
  /** Graduação recebida no mês (ex.: "2º grau na faixa branca"), quando houver. */
  achievement?: { title: string; detail?: string } | null;
  onClose: () => void;
}

type SlideKind = 'intro' | 'count' | 'habit' | 'streak' | 'achievement' | 'summary';

const SLIDE_MS = 4500;
const monthFormatter = createDateFormatter({ month: 'long' });
const weekdayFormatter = createDateFormatter({ weekday: 'long' });
const weekdayNarrow = createDateFormatter({ weekday: 'narrow' });

const capitalize = (value: string) => (value ? value.charAt(0).toLocaleUpperCase() + value.slice(1) : value);
const monthName = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  return monthFormatter.format(new Date(year, month - 1, 15));
};

/** Retrospectiva do mês no formato dos Stories: toque à direita avança, à esquerda volta. */
const MonthlyRecap: React.FC<MonthlyRecapProps> = ({
  recap,
  streak,
  name,
  unitLabel,
  belt,
  stripes,
  maxStripes,
  achievement,
  onClose,
}) => {
  const month = monthName(recap.monthKey);
  const previousMonth = monthName(recap.previousMonthKey);
  const year = recap.monthKey.slice(0, 4);
  const firstName = name.trim().split(/\s+/)[0] || name;

  const slides = useMemo<SlideKind[]>(() => {
    const list: SlideKind[] = ['intro', 'count'];
    if (recap.favoriteWeekday !== null) list.push('habit');
    if (streak >= 2) list.push('streak');
    if (achievement) list.push('achievement');
    list.push('summary');
    return list;
  }, [achievement, recap.favoriteWeekday, streak]);

  const [index, setIndex] = useState(0);
  const [shareState, setShareState] = useState<'idle' | 'busy'>('idle');
  const [shareMessage, setShareMessage] = useState('');
  const timerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = prefersReducedMotion();
  const kind = slides[index];
  const isLast = index === slides.length - 1;

  const go = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(slides.length - 1, next)));
  }, [slides.length]);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (!isLast && !reduced) {
      timerRef.current = window.setTimeout(() => go(index + 1), SLIDE_MS);
    }
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [go, index, isLast, reduced]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    rootRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') go(index + 1);
      if (event.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [go, index, onClose]);

  const handleTap = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    hapticTap();
    go(event.clientX - rect.left < rect.width * 0.35 ? index - 1 : index + 1);
  };

  const comparison = (() => {
    if (recap.previousCount === 0) return null;
    const diff = recap.count - recap.previousCount;
    if (diff > 0) return diff === 1 ? t('1 a mais que {month}', { month: previousMonth }) : t('{count} a mais que {month}', { count: diff, month: previousMonth });
    if (diff === 0) return t('Mesmo ritmo de {month}', { month: previousMonth });
    return null;
  })();

  const favoriteDay = recap.favoriteWeekday !== null
    ? capitalize(weekdayFormatter.format(new Date(2024, 0, 1 + recap.favoriteWeekday)))
    : '';
  const maxWeekday = Math.max(1, ...recap.weekdayCounts);
  const hoursLabel = t('{count}h', { count: recap.hours });

  const handleShare = async () => {
    if (shareState === 'busy') return;
    setShareState('busy');
    setShareMessage('');
    try {
      const blob = await renderRecapCard({
        kicker: t('Retrospectiva · {month} {year}', { month: capitalize(month), year }),
        title: t('Meu {month} na LEVEL.', { month }),
        name: unitLabel ? `${name} · ${unitLabel}` : name,
        stats: [
          { label: t('Treinos'), value: String(recap.count) },
          { label: t('Horas'), value: hoursLabel },
          { label: t('Sequência'), value: t('{count} sem', { count: streak }) },
          { label: t('Semanas ativas'), value: String(recap.activeWeeks) },
        ],
        beltSrc: getBeltImage(belt, 'amarrada')?.src ?? null,
        glow: beltGlow(belt),
      });
      const result = await shareImage({
        blob,
        fileName: `level-retrospectiva-${recap.monthKey}.png`,
        title: t('Retrospectiva'),
        text: t('Meu {month} na LEVEL: {count} treinos.', { month, count: recap.count }),
      });
      if (result === 'downloaded') setShareMessage(t('Imagem salva.'));
      if (result === 'unavailable') setShareMessage(t('Não foi possível compartilhar agora.'));
    } catch {
      setShareMessage(t('Não foi possível compartilhar agora.'));
    } finally {
      setShareState('idle');
    }
  };

  const tone = kind === 'intro' || kind === 'achievement' ? 'yellow' : kind === 'count' || kind === 'streak' ? 'ink' : 'glass';

  const renderSlide = () => {
    switch (kind) {
      case 'intro':
        return (
          <>
            <span className="rd-recap__kicker">{t('Retrospectiva · {month} {year}', { month: capitalize(month), year })}</span>
            <h2 className="rd-recap__title">{t('Seu {month} na LEVEL.', { month })}</h2>
            <p className="rd-recap__text">{unitLabel ? `${firstName} · ${unitLabel}` : firstName}</p>
            <div className="rd-recap__belt">
              <BeltImage belt={belt} stripes={stripes} maxStripes={maxStripes} variant="amarrada" />
            </div>
          </>
        );
      case 'count':
        return (
          <>
            <span className="rd-recap__kicker">{t('Você treinou')}</span>
            <span className="rd-recap__giant"><CountUp value={recap.count} durationMs={1100} /></span>
            <p className="rd-recap__text">{recap.count === 1 ? t('vez em {month}.', { month }) : t('vezes em {month}.', { month })}</p>
            {comparison ? <span className="rd-recap__badge">{comparison}</span> : null}
            <p className="rd-recap__text rd-recap__text--soft">
              {t('{hours} no tatame em {weeks} semanas.', { hours: hoursLabel, weeks: recap.activeWeeks })}
            </p>
          </>
        );
      case 'habit':
        return (
          <>
            <span className="rd-recap__kicker">{t('Seu dia é')}</span>
            <h2 className="rd-recap__title">
              {recap.favoriteTime ? t('{day}, {time}.', { day: favoriteDay, time: recap.favoriteTime }) : `${favoriteDay}.`}
            </h2>
            <p className="rd-recap__text">{t('É quando você mais aparece no tatame.')}</p>
            <div className="rd-recap__days" aria-hidden="true">
              {recap.weekdayCounts.map((value, day) => (
                <div key={day} className={day === recap.favoriteWeekday ? 'is-top' : undefined} style={{ ['--k' as string]: day }}>
                  <span style={{ height: `${Math.max(6, Math.round((value / maxWeekday) * 120))}px` }} />
                  {weekdayNarrow.format(new Date(2024, 0, 1 + day))}
                </div>
              ))}
            </div>
          </>
        );
      case 'streak':
        return (
          <>
            <Flame className="rd-recap__flame" size={84} strokeWidth={1.6} aria-hidden="true" />
            <h2 className="rd-recap__title">{t('{count} semanas seguidas.', { count: streak })}</h2>
            <p className="rd-recap__text">{t('Sem pular nenhuma semana. Bora manter?')}</p>
            <div className="rd-recap__weeks" aria-hidden="true">
              {Array.from({ length: Math.min(streak, 12) }, (_, week) => <i key={week} />)}
            </div>
          </>
        );
      case 'achievement':
        return (
          <>
            <span className="rd-recap__kicker">{t('Conquista do mês')}</span>
            <h2 className="rd-recap__title">{achievement?.title}</h2>
            {achievement?.detail ? <p className="rd-recap__text">{achievement.detail}</p> : null}
            <div className="rd-recap__belt rd-recap__belt--straight">
              <BeltImage belt={belt} stripes={stripes} maxStripes={maxStripes} />
            </div>
          </>
        );
      default:
        return (
          <>
            <span className="rd-recap__kicker">{t('{month} na LEVEL', { month: capitalize(month) })}</span>
            <div className="rd-recap__summary">
              <div><span>{t('Treinos')}</span><strong>{recap.count}</strong></div>
              <div><span>{t('Horas')}</span><strong>{hoursLabel}</strong></div>
              <div><span>{t('Sequência')}</span><strong>{t('{count} sem', { count: streak })}</strong></div>
              <div><span>{t('Semanas ativas')}</span><strong>{recap.activeWeeks}</strong></div>
              <p className="rd-recap__mark">LEVEL<i>.</i></p>
            </div>
            <div className="rd-recap__actions">
              <button type="button" className="lv-btn lv-btn--primary lv-btn--block" onClick={() => { void handleShare(); }} disabled={shareState === 'busy'}>
                <Share size={18} strokeWidth={2} aria-hidden="true" />
                {shareState === 'busy' ? t('Gerando imagem...') : t('Compartilhar')}
              </button>
              <button type="button" className="lv-btn lv-btn--block rd-recap__ghost" onClick={() => go(0)}>
                <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />
                {t('Ver de novo')}
              </button>
              {shareMessage ? <p className="rd-recap__note" role="status">{shareMessage}</p> : null}
            </div>
          </>
        );
    }
  };

  return createPortal(
    <div
      ref={rootRef}
      className={`rd-recap rd-recap--${tone}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('Retrospectiva de {month}', { month })}
      tabIndex={-1}
      onClick={handleTap}
    >
      <div className="rd-recap__bars" aria-hidden="true">
        {slides.map((slide, position) => (
          <span key={slide} className={position < index ? 'is-done' : position === index ? (isLast ? 'is-done' : 'is-run') : undefined}>
            <i key={position === index ? `run-${index}` : 'idle'} style={{ animationDuration: `${SLIDE_MS}ms` }} />
          </span>
        ))}
      </div>
      <div className="rd-recap__head">
        <span className="rd-recap__who">{t('Retrospectiva')}</span>
        <button type="button" className="rd-recap__close" onClick={onClose} aria-label={t('Fechar')}>
          <X size={22} strokeWidth={2} />
        </button>
      </div>
      <section key={kind} className="rd-recap__slide" aria-live="polite">
        {renderSlide()}
      </section>
      <p className="lv-sr-only">{t('Toque à direita para avançar e à esquerda para voltar.')}</p>
    </div>,
    document.body,
  );
};

export default MonthlyRecap;
