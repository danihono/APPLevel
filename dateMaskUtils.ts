// Conversao e mascara para os campos de data/hora digitaveis (DateField / TimeField).
// Formato interno (estado, Firestore, props): 'yyyy-mm-dd' e 'HH:mm'.
// Formato exibido ao usuario: 'dd/mm/aaaa' e 'hh:mm'.
// Tudo aqui usa getters locais - nunca toISOString() - para nao virar o dia por fuso.

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
// Estrito de proposito: aceitar ano de 2 digitos aqui faria '01/01/20' virar uma data
// valida no meio da digitacao de '01/01/2030'. O atalho de 2 digitos e resolvido no blur.
const BR_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{1,2})$/;

const onlyDigits = (value: string): string => value.replace(/\D/g, '');

const pad2 = (value: number): string => String(value).padStart(2, '0');

// Rejeita datas impossiveis como 31/02 - o construtor do Date "rola" para marco.
const isRealDate = (year: number, month: number, day: number): boolean => {
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
};

// Ano de 2 digitos -> seculo: 00-49 vira 20xx, 50-99 vira 19xx.
export const expandShortYear = (year: number): number => {
  if (year >= 100) return year;
  return year < 50 ? 2000 + year : 1900 + year;
};

// 'yyyy-mm-dd' -> 'dd/mm/aaaa'; '' se vazio ou invalido.
export const isoToBr = (value?: string | null): string => {
  if (!value) return '';
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) return '';
  const [, year, month, day] = match;
  if (!isRealDate(Number(year), Number(month), Number(day))) return '';
  return `${day}/${month}/${year}`;
};

// 'dd/mm/aaaa' -> 'yyyy-mm-dd'; '' se incompleto ou impossivel (ex.: 31/02).
export const brToIso = (value?: string | null): string => {
  if (!value) return '';
  const match = BR_DATE_PATTERN.exec(value.trim());
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!isRealDate(year, month, day)) return '';
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

// Aplica a mascara progressiva de data: '7' -> '7', '73' -> '07/3'... ate 'dd/mm/aaaa'.
export const maskDateDigits = (raw: string): string => {
  const digits = onlyDigits(raw).slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

// Aplica a mascara progressiva de hora: '930' -> '09:3', '0930' -> '09:30'.
export const maskTimeDigits = (raw: string): string => {
  const digits = onlyDigits(raw).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

// 'HH:mm' valido (hora 0-23, minuto 0-59) normalizado com zero a esquerda; '' se invalido.
export const normalizeTime = (value?: string | null): string => {
  if (!value) return '';
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return '';
  return `${pad2(hours)}:${pad2(minutes)}`;
};

// Fecha o horario no blur aceitando atalhos comuns de digitacao:
// '9' e '09' -> 09:00, '930' -> 09:30, '0930' -> 09:30. '' se nao der para entender.
export const coerceTimeDraft = (draft: string): string => {
  const direct = normalizeTime(draft);
  if (direct) return direct;

  const digits = onlyDigits(draft);
  if (digits.length === 1) return normalizeTime(`0${digits}:00`);
  if (digits.length === 2) return normalizeTime(`${digits}:00`);
  if (digits.length === 3) return normalizeTime(`0${digits.slice(0, 1)}:${digits.slice(1)}`);
  if (digits.length === 4) return normalizeTime(`${digits.slice(0, 2)}:${digits.slice(2)}`);
  return '';
};

// Limita uma data ISO ao intervalo [min, max], como o <input type="date"> nativo faz.
export const clampIso = (value: string, min?: string, max?: string): string => {
  if (!value) return '';
  if (min && ISO_DATE_PATTERN.test(min) && value < min) return min;
  if (max && ISO_DATE_PATTERN.test(max) && value > max) return max;
  return value;
};

// Data local de hoje em 'yyyy-mm-dd' - util como fallback de valor inicial.
export const todayIso = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};
