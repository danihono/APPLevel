import type { MessageCatalog } from './types';

// Textos do redesign (class-modals). Chave = texto em pt-BR. Antes de criar, procure a chave nos
// outros arquivos do catalogo: chave duplicada entre arquivos quebra o npm run i18n:check.
export const rdClassModalsMessages: MessageCatalog = {
  "Datas e horário": { en: "Dates and time", es: "Fechas y horario" },
  "Data e horário": { en: "Date and time", es: "Fecha y horario" },
  "Onde e com quem": { en: "Where and with whom", es: "Dónde y con quién" },
  "Diminuir capacidade": { en: "Decrease capacity", es: "Reducir capacidad" },
  "Aumentar capacidade": { en: "Increase capacity", es: "Aumentar capacidad" },
};
