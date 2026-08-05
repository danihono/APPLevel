import React from 'react';

interface ProgressBarProps {
  label?: string;
  current: number;
  total: number;
  color?: string;
  /** "classes" mostra "3 de 10 aulas"; "percent" mostra "45%". */
  unit?: 'classes' | 'percent';
}

function resolveTone(color?: string) {
  if (!color) {
    return 'progress-fill';
  }

  if (color.includes('green')) {
    return 'progress-fill progress-fill--emerald';
  }

  if (color.includes('zinc') || color.includes('dark')) {
    return 'progress-fill progress-fill--midnight';
  }

  if (color.includes('blue')) {
    return 'progress-fill progress-fill--azure';
  }

  return 'progress-fill';
}

const ProgressBar: React.FC<ProgressBarProps> = ({ label, current, total, color, unit = 'classes' }) => {
  const safeTotal = total <= 0 ? 1 : total;
  const percentage = Math.min((current / safeTotal) * 100, 100);

  return (
    <div className="progress-shell">
      {label ? (
        <div className="progress-shell__top">
          <span>{label}</span>
          <strong>{unit === 'percent' ? `${Math.round(percentage)}%` : `${current} de ${total} aulas`}</strong>
        </div>
      ) : null}
      <div className="progress-track">
        <div className={resolveTone(color)} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
};

export default ProgressBar;
