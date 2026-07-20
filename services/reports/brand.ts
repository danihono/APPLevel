// Identidade visual da Level usada nos relatorios exportados (Excel/PDF).
// Cores extraidas dos tokens de index.css (dourado sobre fundo escuro).

export const LEVEL_BRAND = {
  gold: '#c49746',
  goldGlow: '#e8af48',
  goldLight: '#feeaa5',
  goldDark: '#533517',
  onGold: '#241507',
  dark: '#0a0a0c',
  light: '#f7f4ee',
  success: '#29a675',
  danger: '#d74b4b',
  textStrong: '#10131a',
  muted: '#606a7f',
  zebra: '#f4f1ea',
} as const;

// Converte '#rrggbb' -> [r, g, b] para o jsPDF (setFillColor/setTextColor).
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

// Converte '#rrggbb' -> 'FFRRGGBB' (ARGB) para o ExcelJS.
export function argb(hex: string): string {
  return `FF${hex.replace('#', '').toUpperCase()}`;
}

// Carrega o logo da Level (/logo3.png) como dataURL, para embutir no Excel e no
// PDF. Vite serve o arquivo de /public, mas as libs precisam de base64/dataURI,
// nao de uma URL. Resultado cacheado por sessao.
let logoCache: string | null | undefined;

export async function loadLogoDataUrl(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const response = await fetch('/logo3.png');
    if (!response.ok) {
      logoCache = null;
      return null;
    }
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('logo read error'));
      reader.readAsDataURL(blob);
    });
    logoCache = dataUrl;
    return dataUrl;
  } catch {
    logoCache = null;
    return null;
  }
}
