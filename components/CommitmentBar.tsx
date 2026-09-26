import React from 'react';
import type { CommitmentResult } from '../commitmentScale';
import { t, getLocale } from '../i18n';

// Barra de comprometimento do aluno. A cor vem pronta de `commitmentScale` — este componente
// nunca recalcula nivel a partir do score (80 pontos e verde no adulto e amarelo no kids).
//
// Quem chama decide nao renderizar: as duas exportacoes exigem um `commitment` de verdade. Uma
// tela que ainda nao carregou as presencas deve passar `null` e nao renderizar nada, em vez de
// mostrar 0% e acusar de faltoso quem esta em dia.

const LEVEL_CLASS: Record<CommitmentResult['level'], string> = {
  vermelho: 'commitment--red',
  laranja: 'commitment--orange',
  amarelo: 'commitment--yellow',
  verde: 'commitment--green',
};

function classesLabel(classes: number): string {
  return classes === 1 ? t('1 treino') : t('{count} treinos', { count: classes });
}

// O comprometimento conta participacao; presenca segue a regra da faixa. Quando os dois numeros
// diferem (aula iniciante fora da faixa, 3a aula do dia) a linha explica a diferenca — senao o
// aluno ve 6 aqui e 5 em "Total de treinos no mes" e acha que o app errou.
function commitmentNote(commitment: CommitmentResult): string {
  const base = t('{classes} em {month}', { classes: classesLabel(commitment.classes), month: commitment.monthLabel });
  return commitment.countedClasses < commitment.classes
    ? `${base} · ${t('{count} contam para graduação', { count: commitment.countedClasses })}`
    : base;
}

export interface CommitmentBarProps {
  commitment: CommitmentResult;
  title?: string;
  /** Linha de apoio com as aulas do mes. */
  showNote?: boolean;
}

export const CommitmentBar: React.FC<CommitmentBarProps> = ({
  commitment,
  title,
  showNote = true,
}) => {
  const toneClass = LEVEL_CLASS[commitment.level];

  return (
    <div className={`commitment ${toneClass}`}>
      <div className="commitment__head">
        <p className="commitment__title">{title ?? t('Comprometimento')}</p>
        <p className="commitment__score">
          {commitment.score}
          <small>/100</small>
        </p>
      </div>

      <div
        className="commitment__track"
        role="meter"
        aria-valuenow={commitment.score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('Comprometimento: {score} de 100, {level}', { score: commitment.score, level: t(commitment.label).toLocaleLowerCase(getLocale()) })}
      >
        {commitment.score > 0 ? (
          <div className="commitment__fill" style={{ width: `${commitment.score}%` }} />
        ) : null}
      </div>

      <div className="commitment__foot">
        <span className="commitment__level">{t(commitment.label)}</span>
        {showNote ? (
          <span className="commitment__note">{commitmentNote(commitment)}</span>
        ) : null}
      </div>
    </div>
  );
};

export interface CommitmentBadgeProps {
  commitment: CommitmentResult;
  /** Acrescenta o rotulo da cor ao lado da nota (cabe em card, nao cabe em linha apertada). */
  showLabel?: boolean;
}

// Selo compacto para listas. Classes proprias de proposito: `.app-badge` dentro de
// `.student-roster__ranking-row` vira faixa de largura total no celular (regra em index.css).
export const CommitmentBadge: React.FC<CommitmentBadgeProps> = ({ commitment, showLabel = false }) => (
  <span
    className={`commitment-badge ${LEVEL_CLASS[commitment.level]}`}
    title={`${t(commitment.label)} — ${commitmentNote(commitment)}`}
  >
    <span className="commitment-badge__dot" aria-hidden="true" />
    {commitment.score}
    <span className="commitment-badge__unit">/100</span>
    {showLabel ? <span className="commitment-badge__label">{t(commitment.label)}</span> : null}
  </span>
);

export default CommitmentBar;
