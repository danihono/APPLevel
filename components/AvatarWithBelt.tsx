import React, { useEffect, useState } from 'react';
import { getBeltMeta, type BlackBeltProgress } from '../beltCatalog';
import { cacheAvatar, getCachedAvatar } from '../services/avatarCache';
import type { BeltColor } from '../types';

interface AvatarWithBeltProps {
  avatar?: string;
  name: string;
  belt: BeltColor;
  stripes: number;
  size?: 'sm' | 'md' | 'lg';
  // Faixa preta por tempo (padrão IBJJF): quando informado, colore a faixa como
  // preta / coral / vermelha e usa o grau calculado no lugar dos graus manuais.
  blackBelt?: BlackBeltProgress | null;
}

const CORAL_RED = '#c1121f';

const AvatarWithBelt: React.FC<AvatarWithBeltProps> = ({ avatar, name, belt, stripes, size = 'md', blackBelt }) => {
  const beltMeta = getBeltMeta(belt);

  // Resolve a aparência da faixa. Para preta com grau por tempo, coral/vermelha
  // trocam a cor do corpo; graus 0–6 continuam pretos com marcas brancas.
  let beltFill = beltMeta.avatarFill;
  const beltStroke = beltMeta.avatarStroke;
  let beltBarColor = beltMeta.avatarBarColor;
  let drawnStripes = Math.min(Math.max(0, stripes), 4);

  if (blackBelt) {
    if (blackBelt.style === 'vermelha') {
      beltFill = '#dc2626';
      beltBarColor = '#7f1010';
      drawnStripes = 0;
    } else if (blackBelt.style === 'coral-branca') {
      beltFill = CORAL_RED;
      beltBarColor = '#f4f4f5';
      drawnStripes = 0;
    } else if (blackBelt.style === 'coral-preta') {
      beltFill = CORAL_RED;
      beltBarColor = '#0b0b0f';
      drawnStripes = 0;
    } else {
      drawnStripes = Math.min(blackBelt.degree, 4);
    }
  }

  const sizeClasses = {
    sm: 'w-12 h-12 text-sm',
    md: 'w-16 h-16 text-xl',
    lg: 'w-24 h-24 text-3xl'
  };

  // Usa a copia em cache (data URL) quando existir: aparece de imediato, sem rede.
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(() =>
    avatar ? (getCachedAvatar(avatar) ?? avatar) : undefined,
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const next = avatar ? (getCachedAvatar(avatar) ?? avatar) : undefined;
    setResolvedSrc(next);
    // Se veio do cache (data URL), ja esta pronta — sem flash de carregamento.
    setLoaded(Boolean(next && next.startsWith('data:')));
  }, [avatar]);

  // Para o avatar grande (perfil), guarda a foto remota no cache local em
  // segundo plano, para que abra instantaneamente nas proximas aberturas.
  useEffect(() => {
    if (size !== 'lg' || !avatar || avatar.startsWith('data:') || getCachedAvatar(avatar)) {
      return;
    }
    let active = true;
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => {
      if (!active) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = probe.naturalWidth;
        canvas.height = probe.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(probe, 0, 0);
        cacheAvatar(avatar, canvas.toDataURL('image/jpeg', 0.85));
      } catch {
        // Canvas sem CORS — ignora; a foto continua funcionando normalmente.
      }
    };
    probe.src = avatar;
    return () => {
      active = false;
    };
  }, [avatar, size]);

  return (
    <div className={`relative ${sizeClasses[size]} flex-shrink-0 mb-2`}>
      {/* Avatar Circle */}
      <div className="w-full h-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden border-2 border-white dark:border-dark-card shadow-sm relative z-0">
        {/* Inicial: placeholder sempre presente, evita circulo vazio enquanto a foto carrega */}
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-500 font-bold uppercase">
          {name.charAt(0)}
        </div>
        {resolvedSrc ? (
          <img
            src={resolvedSrc}
            alt={name}
            decoding="async"
            onLoad={() => setLoaded(true)}
            className={`relative w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          />
        ) : null}
      </div>
      
      {/* Belt Overlay */}
      <svg 
        viewBox="0 0 100 100" 
        className="absolute inset-0 w-full h-full drop-shadow-md pointer-events-none overflow-visible z-10"
      >
        {/* Left Tail */}
        <path d="M 25 85 Q 10 95 0 105 L 15 110 Q 30 100 40 90 Z" fill={beltFill} stroke={beltStroke} strokeWidth="1" />

        {/* Black Bar on Left Tail */}
        <path d="M 7 100 Q 3 103 1 104 L 13 108 Q 15 106 19 103 Z" fill={beltBarColor} />

        {/* Stripes */}
        {drawnStripes >= 1 && <line x1="5" y1="101" x2="17" y2="105" stroke="#FFF" strokeWidth="1.5" />}
        {drawnStripes >= 2 && <line x1="4" y1="102.5" x2="16" y2="106.5" stroke="#FFF" strokeWidth="1.5" />}
        {drawnStripes >= 3 && <line x1="3" y1="104" x2="15" y2="108" stroke="#FFF" strokeWidth="1.5" />}
        {drawnStripes >= 4 && <line x1="2" y1="105.5" x2="14" y2="109.5" stroke="#FFF" strokeWidth="1.5" />}

        {/* Right Tail */}
        <path d="M 75 85 Q 90 95 100 105 L 85 110 Q 70 100 60 90 Z" fill={beltFill} stroke={beltStroke} strokeWidth="1" />

        {/* Main Wrap (curves along the bottom edge of the circle) */}
        <path d="M 8 75 A 46 46 0 0 0 92 75 L 98 85 A 56 56 0 0 1 2 85 Z" fill={beltFill} stroke={beltStroke} strokeWidth="1" />

        {/* Knot */}
        <rect x="40" y="80" width="20" height="12" rx="3" fill={beltFill} stroke={beltStroke} strokeWidth="1" />
        <path d="M 45 80 L 45 92 M 55 80 L 55 92" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
      </svg>
    </div>
  );
};

export default AvatarWithBelt;
