import React from 'react';
import { BeltColor } from '../types';

interface AvatarWithBeltProps {
  avatar?: string;
  name: string;
  belt: BeltColor;
  stripes: number;
  size?: 'sm' | 'md' | 'lg';
}

const AvatarWithBelt: React.FC<AvatarWithBeltProps> = ({ avatar, name, belt, stripes, size = 'md' }) => {
  const getBeltColorHex = () => {
    switch(belt) {
      case BeltColor.BRANCA: return '#FFFFFF';
      case BeltColor.AZUL: return '#1D4ED8'; // blue-700
      case BeltColor.ROXA: return '#6B21A8'; // purple-800
      case BeltColor.MARROM: return '#5D4037';
      case BeltColor.PRETA: return '#262626'; // neutral-800
      default: return '#FFFFFF';
    }
  };

  const beltColorHex = getBeltColorHex();
  const isWhite = belt === BeltColor.BRANCA;
  const strokeColor = isWhite ? '#D1D5DB' : 'rgba(0,0,0,0.2)'; // gray-300 for white belt
  const barColor = belt === BeltColor.PRETA ? '#DC2626' : '#171717'; // Red bar for black belt, black for others

  const sizeClasses = {
    sm: 'w-12 h-12 text-sm',
    md: 'w-16 h-16 text-xl',
    lg: 'w-24 h-24 text-3xl'
  };

  return (
    <div className={`relative ${sizeClasses[size]} flex-shrink-0 mb-2`}>
      {/* Avatar Circle */}
      <div className="w-full h-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden border-2 border-white dark:border-dark-card shadow-sm relative z-0">
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500 font-bold uppercase">
            {name.charAt(0)}
          </div>
        )}
      </div>
      
      {/* Belt Overlay */}
      <svg 
        viewBox="0 0 100 100" 
        className="absolute inset-0 w-full h-full drop-shadow-md pointer-events-none overflow-visible z-10"
      >
        {/* Left Tail */}
        <path d="M 25 85 Q 10 95 0 105 L 15 110 Q 30 100 40 90 Z" fill={beltColorHex} stroke={strokeColor} strokeWidth="1" />
        
        {/* Black Bar on Left Tail */}
        <path d="M 7 100 Q 3 103 1 104 L 13 108 Q 15 106 19 103 Z" fill={barColor} />
        
        {/* Stripes */}
        {stripes >= 1 && <line x1="5" y1="101" x2="17" y2="105" stroke="#FFF" strokeWidth="1.5" />}
        {stripes >= 2 && <line x1="4" y1="102.5" x2="16" y2="106.5" stroke="#FFF" strokeWidth="1.5" />}
        {stripes >= 3 && <line x1="3" y1="104" x2="15" y2="108" stroke="#FFF" strokeWidth="1.5" />}
        {stripes >= 4 && <line x1="2" y1="105.5" x2="14" y2="109.5" stroke="#FFF" strokeWidth="1.5" />}

        {/* Right Tail */}
        <path d="M 75 85 Q 90 95 100 105 L 85 110 Q 70 100 60 90 Z" fill={beltColorHex} stroke={strokeColor} strokeWidth="1" />
        
        {/* Main Wrap (curves along the bottom edge of the circle) */}
        <path d="M 8 75 A 46 46 0 0 0 92 75 L 98 85 A 56 56 0 0 1 2 85 Z" fill={beltColorHex} stroke={strokeColor} strokeWidth="1" />
        
        {/* Knot */}
        <rect x="40" y="80" width="20" height="12" rx="3" fill={beltColorHex} stroke={strokeColor} strokeWidth="1" />
        <path d="M 45 80 L 45 92 M 55 80 L 55 92" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
      </svg>
    </div>
  );
};

export default AvatarWithBelt;
