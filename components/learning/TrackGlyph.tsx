import React from 'react';
import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic';
import { trackIcon } from '../../views/learning/learningLook';

const ICON_NAME_SET = new Set<string>(iconNames);

export function isKnownIconName(name: string | undefined | null): name is IconName {
  return Boolean(name && ICON_NAME_SET.has(name));
}

interface TrackGlyphProps {
  /** Nome da trilha (usado no icone automatico). */
  title: string;
  /** Icone escolhido no Estudio (nome do lucide). */
  icon?: string;
  size?: number;
  strokeWidth?: number;
}

/**
 * Icone de uma trilha: o escolhido no Estudio (carregado sob demanda entre todos os icones do
 * lucide) ou o automatico pelo nome. Enquanto o escolhido baixa, mostra o automatico.
 */
const TrackGlyph: React.FC<TrackGlyphProps> = ({ title, icon, size = 20, strokeWidth = 2 }) => {
  const Fallback = trackIcon(title);
  if (isKnownIconName(icon)) {
    return (
      <DynamicIcon
        name={icon}
        size={size}
        strokeWidth={strokeWidth}
        fallback={() => <Fallback size={size} strokeWidth={strokeWidth} />}
      />
    );
  }
  return <Fallback size={size} strokeWidth={strokeWidth} />;
};

export default TrackGlyph;
