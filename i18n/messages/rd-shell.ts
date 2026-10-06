import type { MessageCatalog } from './types';

// Textos do redesign (shell). Chave = texto em pt-BR. Antes de criar, procure a chave nos
// outros arquivos do catalogo: chave duplicada entre arquivos quebra o npm run i18n:check.
export const rdShellMessages: MessageCatalog = {
  "Evolução": { en: "Progress", es: "Evolución" },
};
