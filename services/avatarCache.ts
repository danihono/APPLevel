/**
 * Cache local de fotos de perfil.
 *
 * As fotos vivem no Firebase Storage; baixa-las do zero a cada abertura do app
 * deixa o avatar "piscando" em branco por alguns segundos. Aqui guardamos uma
 * copia ja comprimida (data URL) no localStorage para que o avatar apareca
 * instantaneamente, sem esperar a rede.
 */

const STORAGE_KEY = 'level:avatar-cache:v1';
const MAX_ENTRIES = 12;

type CacheEntry = { url: string; data: string };

function readCache(): CacheEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CacheEntry[]) : [];
  } catch {
    return [];
  }
}

function writeCache(entries: CacheEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // localStorage cheio ou indisponivel — seguimos sem cache.
  }
}

/** Retorna a foto cacheada (data URL) para a URL informada, ou null. */
export function getCachedAvatar(url: string | undefined): string | null {
  if (!url) return null;
  return readCache().find((entry) => entry.url === url)?.data ?? null;
}

/** Guarda a foto no cache local, mantendo as entradas mais recentes (LRU). */
export function cacheAvatar(url: string | undefined, data: string | undefined): void {
  if (!url || !data || !data.startsWith('data:')) return;
  const others = readCache().filter((entry) => entry.url !== url);
  writeCache([{ url, data }, ...others]);
}

export type CompressedImage = { blob: Blob; dataUrl: string; contentType: string };

/**
 * Reduz uma foto de perfil para um JPEG pequeno (max `maxSize`px no maior lado).
 * Retorna null quando nao for possivel processar — o chamador deve usar o
 * arquivo original nesse caso.
 */
export async function compressAvatarImage(
  file: File,
  maxSize = 512,
  quality = 0.82,
): Promise<CompressedImage | null> {
  if (typeof document === 'undefined' || !file.type.startsWith('image/')) {
    return null;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (!blob) return null;

    return {
      blob,
      dataUrl: canvas.toDataURL('image/jpeg', quality),
      contentType: 'image/jpeg',
    };
  } catch {
    return null;
  }
}
