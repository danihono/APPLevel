
import React from 'react';

interface ProgressBarProps {
  label: string;
  current: number;
  total: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ label, current, total }) => {
  const percentage = Math.min((current / total) * 100, 100);

  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs mb-1.5 font-medium">
        <span className="text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</span>
        <span>{current} de {total} aulas</span>
      </div>
      <div className="h-2 w-full bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gold transition-all duration-1000 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
