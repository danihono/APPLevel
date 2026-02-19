
import React from 'react';
import { BeltColor } from '../types';

interface BjjBeltProps {
  color: BeltColor;
  stripes: number;
}

const BjjBelt: React.FC<BjjBeltProps> = ({ color, stripes }) => {
  const getBeltHex = () => {
    switch(color) {
      case BeltColor.BRANCA: return 'bg-white border border-gray-200';
      case BeltColor.AZUL: return 'bg-blue-700';
      case BeltColor.ROXA: return 'bg-purple-800';
      case BeltColor.MARROM: return 'bg-[#5D4037]';
      case BeltColor.PRETA: return 'bg-black';
      default: return 'bg-white';
    }
  };

  return (
    <div className={`relative h-12 w-full rounded-md shadow-lg flex items-center justify-end pr-8 overflow-hidden ${getBeltHex()}`}>
      {/* The black bar for stripes (except for black belts which usually have red bar) */}
      <div className={`absolute right-0 h-full w-24 ${color === BeltColor.PRETA ? 'bg-red-600' : 'bg-black'}`}></div>
      
      {/* Stripes */}
      <div className="flex gap-1.5 z-10">
        {Array.from({ length: stripes }).map((_, i) => (
          <div key={i} className="h-8 w-1.5 bg-white rounded-sm shadow-sm"></div>
        ))}
      </div>
    </div>
  );
};

export default BjjBelt;
