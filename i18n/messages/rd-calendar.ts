import type { MessageCatalog } from './types';

// Textos do redesign (calendar). Chave = texto em pt-BR. Antes de criar, procure a chave nos
// outros arquivos do catalogo: chave duplicada entre arquivos quebra o npm run i18n:check.
export const rdCalendarMessages: MessageCatalog = {
  "Bora pro tatame.": { en: "Let's hit the mats.", es: "¡Vamos al tatami!" },
  "Mostrar QR em tela cheia": { en: "Show QR full screen", es: "Mostrar QR en pantalla completa" },
  "Aponta e entra.": { en: "Point and you're in.", es: "Apunta y entra." },
  "de {total} confirmados já marcaram presença": { en: "of {total} confirmed have checked in", es: "de {total} confirmados ya marcaron asistencia" },
  "presenças registradas": { en: "check-ins recorded", es: "asistencias registradas" },
  "Lista de presença": { en: "Attendance list", es: "Lista de asistencia" },
};
