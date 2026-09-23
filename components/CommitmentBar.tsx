import React from 'react';
import type { CommitmentResult } from '../commitmentScale';

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
  return classes === 1 ? '1 treino' : `${classes} treinos`;
}

// O comprometimento conta participacao; presenca segue a regra da faixa. Quando os dois numeros
// diferem (aula iniciante fora da faixa, 3a aula do dia) a linha explica a diferenca — senao o
// aluno ve 6 aqui e 5 em "Total de treinos no mes" e acha que o app errou.
function commitmentNote(commitment: CommitmentResult): string {
  const base = `${classesLabel(commitment.classes)} em ${commitment.monthLabel}`;
  return commitment.countedClasses < commitment.classes
    ? `${base} · ${commitment.countedClasses} contam para graduação`
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
  title = 'Comprometimento',
  showNote = true,
}) => {
  const toneClass = LEVEL_CLASS[commitment.level];

  return (
    <div className={`commitment ${toneClass}`}>
      <div className="commitment__head">
        <p className="commitment__title">{title}</p>
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
        aria-label={`Comprometimento: ${commitment.score} de 100, ${commitment.label.toLocaleLowerCase('pt-BR')}`}
      >
        {commitment.score > 0 ? (
          <div className="commitment__fill" style={{ width: `${commitment.score}%` }} />
        ) : null}
      </div>

      <div className="commitment__foot">
        <span className="commitment__level">{commitment.label}</span>
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
    title={`${commitment.label} — ${commitmentNote(commitment)}`}
  >
    <span className="commitment-badge__dot" aria-hidden="true" />
    {commitment.score}
    <span className="commitment-badge__unit">/100</span>
    {showLabel ? <span className="commitment-badge__label">{commitment.label}</span> : null}
  </span>
);

export default CommitmentBar;
