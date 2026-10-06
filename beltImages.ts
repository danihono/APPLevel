import { BeltColor } from './types';
import { publicAsset } from './publicAsset';

// Imagens 3D das faixas adultas (public/illustrations/belts). Cada imagem vem recortada no
// contorno da faixa, com a ponteira LISA: os graus sao desenhados por cima em BeltImage.
// `tip` e a posicao da ponteira em % da imagem (x, y, largura, altura), medida nos arquivos.
// Faixas kids e combinadas nao tem imagem ainda e caem no desenho SVG (BjjBelt).

export type BeltImageVariant = 'reta' | 'amarrada';

export interface BeltImageTip {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BeltImageAsset {
  src: string;
  /** Proporcao largura/altura da imagem, para reservar o espaco antes de carregar. */
  aspect: number;
  tip: BeltImageTip;
}

type BeltImageEntry = Record<BeltImageVariant, BeltImageAsset>;

const asset = (file: string, width: number, height: number, tip: BeltImageTip): BeltImageAsset => ({
  src: publicAsset(`illustrations/belts/${file}`),
  aspect: width / height,
  tip,
});

const BELT_IMAGES: Partial<Record<BeltColor, BeltImageEntry>> = {
  [BeltColor.BRANCA]: {
    reta: asset('faixa-branca-reta.webp', 1969, 294, { x: 75.9, y: 6.1, w: 14.4, h: 89.5 }),
    amarrada: asset('faixa-branca-amarrada.webp', 1042, 1170, { x: 63.2, y: 70.9, w: 18.5, h: 17.1 }),
  },
  [BeltColor.AZUL]: {
    reta: asset('faixa-azul-reta.webp', 1977, 324, { x: 72.6, y: 9.3, w: 17.6, h: 87.0 }),
    amarrada: asset('faixa-azul-amarrada.webp', 1041, 1171, { x: 63.5, y: 70.9, w: 19.1, h: 16.6 }),
  },
  [BeltColor.ROXA]: {
    reta: asset('faixa-roxa-reta.webp', 1932, 333, { x: 77.3, y: 17.4, w: 12.0, h: 77.5 }),
    amarrada: asset('faixa-roxa-amarrada.webp', 1039, 1312, { x: 65.3, y: 73.6, w: 21.4, h: 14.6 }),
  },
  [BeltColor.MARROM]: {
    reta: asset('faixa-marrom-reta.webp', 1938, 296, { x: 76.9, y: 9.5, w: 14.0, h: 86.5 }),
    amarrada: asset('faixa-marrom-amarrada.webp', 1064, 1241, { x: 65.7, y: 73.4, w: 20.3, h: 17.2 }),
  },
  [BeltColor.PRETA]: {
    reta: asset('faixa-preta-reta.webp', 1968, 304, { x: 71.4, y: 5.6, w: 16.2, h: 90.8 }),
    amarrada: asset('faixa-preta-amarrada.webp', 1066, 1253, { x: 65.1, y: 76.1, w: 20.3, h: 13.7 }),
  },
};

export function getBeltImage(belt: BeltColor | string | undefined | null, variant: BeltImageVariant): BeltImageAsset | null {
  if (!belt) return null;
  return BELT_IMAGES[belt as BeltColor]?.[variant] ?? null;
}

export function hasBeltImage(belt: BeltColor | string | undefined | null): boolean {
  return Boolean(belt && BELT_IMAGES[belt as BeltColor]);
}
