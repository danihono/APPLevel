import type { MessageCatalog } from './types';

// Textos do redesign (notifications). Chave = texto em pt-BR. Antes de criar, procure a chave nos
// outros arquivos do catalogo: chave duplicada entre arquivos quebra o npm run i18n:check.
export const rdNotificationsMessages: MessageCatalog = {
  'Novo aviso': { en: 'New notice', es: 'Nuevo aviso' },
  'Tudo em dia.': { en: 'All caught up.', es: 'Todo al día.' },
  'Nada de novo no mural.': { en: 'Nothing new on the board.', es: 'Nada nuevo en el mural.' },
  'Lida': { en: 'Read', es: 'Leída' },
  'Para: {audience}': { en: 'To: {audience}', es: 'Para: {audience}' },
  'Ex.: Treino especial no sábado': { en: 'E.g.: Special training on Saturday', es: 'Ej.: Entrenamiento especial el sábado' },
  'Escreva o aviso para o tatame.': { en: 'Write the notice for the mat.', es: 'Escribe el aviso para el tatami.' },
  'Por faixa': { en: 'By belt', es: 'Por cinturón' },
  'Pessoas': { en: 'People', es: 'Personas' },
  'Vai para alunos de 1 faixa selecionada.': {
    en: 'Goes to students of 1 selected belt.',
    es: 'Va para alumnos de 1 cinturón seleccionado.',
  },
  'Vai para alunos de {count} faixas selecionadas.': {
    en: 'Goes to students of {count} selected belts.',
    es: 'Va para alumnos de {count} cinturones seleccionados.',
  },
  'Mais opções': { en: 'More options', es: 'Más opciones' },
  'Agendar aviso': { en: 'Schedule notice', es: 'Programar aviso' },
};
