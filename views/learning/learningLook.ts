import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  CircleDot,
  Lightbulb,
  Lock,
  RefreshCw,
  Shield,
  Swords,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { getYouTubeVideoId } from '../../utils';
import type { EffectiveLessonBlock, OrderedLesson } from './learningShared';

/*
 * Cara de cada trilha, igual no Estudio (superadmin) e na tela do aluno/professor. A trilha ainda
 * nao guarda icone nem cor no banco (fase 2), entao o icone sai do nome e a cor da ordem — sempre
 * a mesma para a mesma trilha.
 */
export const TRACK_COLORS = ['#f0b429', '#1f4fd1', '#d6453d', '#1f9f6e', '#6b2fa3', '#0e8fa3', '#8a5a2b', '#16161e'];
export const LIGHT_TRACK_COLORS = new Set(['#f0b429']);

export function trackIcon(title: string): LucideIcon {
  const name = title.toLocaleLowerCase('pt-BR');
  if (name.includes('rasp')) return RefreshCw;
  if (name.includes('passag')) return ArrowUpRight;
  if (name.includes('finaliz') || name.includes('chave') || name.includes('estrang')) return Lock;
  if (name.includes('queda')) return ArrowDownToLine;
  if (name.includes('defes') || name.includes('saída') || name.includes('saida') || name.includes('vida')) return Shield;
  if (name.includes('guarda')) return CircleDot;
  if (name.includes('conceit') || name.includes('fundament') || name.includes('base')) return Lightbulb;
  if (name.includes('compet') || name.includes('esporte') || name.includes('faixa') || name.includes('exame')) return Trophy;
  if (name.includes('luta') || name.includes('sparr')) return Swords;
  return BookOpen;
}

export function trackColor(trackId: string, orderedIds: string[]): string {
  const index = Math.max(0, orderedIds.indexOf(trackId));
  return TRACK_COLORS[index % TRACK_COLORS.length];
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Cor da trilha: a escolhida no Estudio, ou a automatica pela ordem. */
export function resolveTrackColor(track: { id: string; color?: string }, orderedIds: string[]): string {
  return track.color && HEX_COLOR.test(track.color) ? track.color : trackColor(track.id, orderedIds);
}

/** Cor clara (amarelo, bege...) pede icone escuro por cima. */
export function isLightColor(hex: string): boolean {
  if (!HEX_COLOR.test(hex)) return false;
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

type CoverBlock = Pick<EffectiveLessonBlock, 'type' | 'sourceUrl' | 'thumbnailUrl'>;

/** Imagem de capa de um bloco: miniatura enviada, a propria imagem ou a do YouTube. */
export function blockCover(block: CoverBlock | undefined): string {
  if (!block) return '';
  if (block.thumbnailUrl) return block.thumbnailUrl;
  if (block.type === 'image' && block.sourceUrl) return block.sourceUrl;
  if (block.type === 'youtube' && block.sourceUrl) {
    const id = getYouTubeVideoId(block.sourceUrl);
    if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  return '';
}

export function lessonCover(entry: Pick<OrderedLesson, 'blocks'> | undefined): string {
  if (!entry) return '';
  for (const block of entry.blocks) {
    const cover = blockCover(block);
    if (cover) return cover;
  }
  return '';
}
