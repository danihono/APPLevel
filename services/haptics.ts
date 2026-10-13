import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Vibração leve do iPhone (Taptic Engine). No navegador cai no navigator.vibrate
 * (Android) ou não faz nada. Nunca lança erro: vibrar é sempre opcional.
 */
const isNative = Capacitor.isNativePlatform();

function webVibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    // sem suporte: ignora
  }
}

/** Toque leve: trocar de aba, selecionar algo. */
export function hapticTap(): void {
  if (isNative) {
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    return;
  }
  webVibrate(8);
}

/** Toque médio: confirmar uma ação (RSVP, marcar presença). */
export function hapticConfirm(): void {
  if (isNative) {
    void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
    return;
  }
  webVibrate(14);
}

/** Sucesso: check-in registrado, graduação. */
export function hapticSuccess(): void {
  if (isNative) {
    void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
    return;
  }
  webVibrate([12, 60, 18]);
}

/** Erro: QR inválido, falha ao registrar. */
export function hapticError(): void {
  if (isNative) {
    void Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
    return;
  }
  webVibrate([20, 50, 20]);
}
