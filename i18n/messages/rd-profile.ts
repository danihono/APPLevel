import type { MessageCatalog } from './types';

// Textos do redesign (Perfil). Chave = texto em pt-BR. Antes de criar, procure a chave nos
// outros arquivos do catalogo: chave duplicada entre arquivos quebra o npm run i18n:check.
export const rdProfileMessages: MessageCatalog = {
  "Carteirinha": { en: "Member card", es: "Credencial" },
  "Carteirinha de atleta": { en: "Athlete card", es: "Credencial de atleta" },
  "Atleta desde {year}": { en: "Athlete since {year}", es: "Atleta desde {year}" },
  "No tatame desde {year}": { en: "On the mats since {year}", es: "En el tatami desde {year}" },
  "LEVEL · Atleta": { en: "LEVEL · Athlete", es: "LEVEL · Atleta" },
  "Conta": { en: "Account", es: "Cuenta" },
  "Presenças recentes e graduações": { en: "Recent attendance and promotions", es: "Asistencias recientes y graduaciones" },
};
