// Links de contato (telefone / WhatsApp) a partir do telefone digitado livremente no cadastro,
// ex.: '(19) 99999-0000' ou '19999990000'. Numeros brasileiros (10 ou 11 digitos) ganham o DDI 55.

function onlyDigits(value?: string | null): string {
  return (value ?? '').replace(/\D/g, '');
}

export function toInternationalDigits(phone?: string | null): string {
  const digits = onlyDigits(phone);
  if (digits.length < 10) {
    return '';
  }
  return digits.length <= 11 ? `55${digits}` : digits;
}

export function buildTelLink(phone?: string | null): string {
  const digits = toInternationalDigits(phone);
  return digits ? `tel:+${digits}` : '';
}

/** Link do WhatsApp; `text` (opcional) já vem preenchido na conversa. */
export function buildWhatsAppLink(phone?: string | null, text?: string): string {
  const digits = toInternationalDigits(phone);
  if (!digits) return '';
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}
