import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export type ShareImageResult = 'shared' | 'downloaded' | 'cancelled' | 'unavailable';

interface ShareImageOptions {
  blob: Blob;
  fileName: string;
  title: string;
  text?: string;
  /** true: só salva (Fotos/arquivo), sem abrir o menu de compartilhar quando houver escolha. */
  saveOnly?: boolean;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function isCancel(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /cancel|abort/i.test(message) || (error instanceof DOMException && error.name === 'AbortError');
}

function download(blob: Blob, fileName: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compartilha uma imagem gerada no app.
 * - iPhone (app nativo): grava no cache e abre o menu de compartilhar (Instagram, WhatsApp, Salvar imagem).
 * - Navegador com Web Share de arquivos: abre o compartilhar do sistema.
 * - Senão: baixa o arquivo.
 */
export async function shareImage({ blob, fileName, title, text, saveOnly }: ShareImageOptions): Promise<ShareImageResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      const written = await Filesystem.writeFile({
        path: fileName,
        data: await blobToBase64(blob),
        directory: Directory.Cache,
      });
      // No iPhone, "Salvar imagem" fica dentro do próprio menu de compartilhar.
      await Share.share({ title, text: saveOnly ? undefined : text, files: [written.uri], dialogTitle: title });
      return 'shared';
    } catch (error) {
      return isCancel(error) ? 'cancelled' : 'unavailable';
    }
  }

  if (!saveOnly) {
    try {
      const file = new File([blob], fileName, { type: blob.type || 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title, text });
        return 'shared';
      }
    } catch (error) {
      if (isCancel(error)) return 'cancelled';
    }
  }

  return download(blob, fileName) ? 'downloaded' : 'unavailable';
}
