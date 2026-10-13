/**
 * Cartões 1080x1920 (formato dos Stories) desenhados em canvas para compartilhar:
 * graduação e retrospectiva do mês. Só usa imagens do próprio app (mesma origem).
 */

const WIDTH = 1080;
const HEIGHT = 1920;
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", Roboto, Arial, sans-serif';
const YELLOW = '#f0b429';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.'))), 'image/png');
  });
}

function setupCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível.');
  return { canvas, ctx };
}

/** Fundo escuro com dois brilhos: a cor da faixa no alto e o amarelo LEVEL embaixo. */
function paintBackground(ctx: CanvasRenderingContext2D, glow: string) {
  ctx.fillStyle = '#0e0e13';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const top = ctx.createRadialGradient(WIDTH * 0.92, 0, 0, WIDTH * 0.92, 0, WIDTH * 1.05);
  top.addColorStop(0, glow);
  top.addColorStop(1, 'rgba(14,14,19,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const bottom = ctx.createRadialGradient(0, HEIGHT, 0, 0, HEIGHT, WIDTH * 0.95);
  bottom.addColorStop(0, 'rgba(240,180,41,0.42)');
  bottom.addColorStop(1, 'rgba(14,14,19,0)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function paintWordmark(ctx: CanvasRenderingContext2D, x: number, y: number, size = 40) {
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  const letters = 'LEVEL';
  let cursor = x;
  for (const letter of letters) {
    ctx.fillText(letter, cursor, y);
    cursor += ctx.measureText(letter).width + size * 0.28;
  }
  ctx.fillStyle = YELLOW;
  ctx.fillText('.', cursor - size * 0.2, y);
}

/** Quebra o texto em até `maxLines` linhas que cabem em `maxWidth`. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (ctx.measureText(attempt).width <= maxWidth || !line) {
      line = attempt;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

function drawBelt(ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, centerX: number, top: number, maxW: number, maxH: number) {
  if (!image) return;
  const scale = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 34;
  ctx.drawImage(image, centerX - width / 2, top + (maxH - height) / 2, width, height);
  ctx.restore();
}

export interface GraduationCardInput {
  /** "Faixa azul" ou "2º grau". */
  title: string;
  kicker: string;
  name: string;
  /** Linhas pequenas embaixo do nome (data · unidade, tempo de tatame...). */
  details: string[];
  beltSrc: string | null;
  glow: string;
}

export async function renderGraduationCard(input: GraduationCardInput): Promise<Blob> {
  const { canvas, ctx } = setupCanvas();
  paintBackground(ctx, input.glow);
  paintWordmark(ctx, 90, 150);

  const belt = input.beltSrc ? await loadImage(input.beltSrc) : null;
  drawBelt(ctx, belt, WIDTH / 2, 230, 820, 820);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = YELLOW;
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(input.kicker.toLocaleUpperCase(), 90, 1240);

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 132px ${FONT}`;
  ctx.fillText(input.title, 86, 1390);

  ctx.font = `700 76px ${FONT}`;
  const nameLines = wrapLines(ctx, input.name, WIDTH - 180, 2);
  nameLines.forEach((line, index) => ctx.fillText(line, 90, 1510 + index * 86));

  ctx.font = `600 38px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  const detailsTop = 1510 + nameLines.length * 86 + 40;
  input.details.slice(0, 3).forEach((line, index) => ctx.fillText(line, 90, detailsTop + index * 54));

  return canvasToBlob(canvas);
}

export interface RecapCardInput {
  kicker: string;
  title: string;
  name: string;
  stats: Array<{ label: string; value: string }>;
  beltSrc: string | null;
  glow: string;
}

export async function renderRecapCard(input: RecapCardInput): Promise<Blob> {
  const { canvas, ctx } = setupCanvas();
  paintBackground(ctx, input.glow);
  paintWordmark(ctx, 90, 150);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = YELLOW;
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(input.kicker.toLocaleUpperCase(), 90, 330);

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 112px ${FONT}`;
  const titleLines = wrapLines(ctx, input.title, WIDTH - 180, 3);
  titleLines.forEach((line, index) => ctx.fillText(line, 86, 460 + index * 118));

  // Grade 2x2 de números em "vidro".
  const gridTop = 460 + titleLines.length * 118 + 40;
  const cellW = (WIDTH - 180 - 30) / 2;
  const cellH = 230;
  input.stats.slice(0, 4).forEach((stat, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 90 + col * (cellW + 30);
    const y = gridTop + row * (cellH + 30);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, cellW, cellH, 44);
    else ctx.rect(x, y, cellW, cellH);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `600 36px ${FONT}`;
    ctx.fillText(stat.label, x + 40, y + 76);
    ctx.fillStyle = index === 0 ? YELLOW : '#ffffff';
    ctx.font = `800 96px ${FONT}`;
    ctx.fillText(stat.value, x + 36, y + 186);
  });

  const belt = input.beltSrc ? await loadImage(input.beltSrc) : null;
  const beltTop = gridTop + 2 * (cellH + 30) + 10;
  drawBelt(ctx, belt, WIDTH / 2, beltTop, 760, Math.max(200, HEIGHT - beltTop - 200));

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(input.name, 90, HEIGHT - 110);

  return canvasToBlob(canvas);
}

/** Cor do brilho do cartão por faixa (mesma ideia do fundo do app). */
export function beltGlow(belt: string): string {
  switch (belt) {
    case 'blue': return 'rgba(47,111,224,0.9)';
    case 'purple': return 'rgba(123,63,196,0.9)';
    case 'brown': return 'rgba(138,90,52,0.95)';
    case 'black': return 'rgba(200,50,59,0.7)';
    default: return 'rgba(240,180,41,0.55)';
  }
}
