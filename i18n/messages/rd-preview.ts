import type { MessageCatalog } from './types';

// Textos do redesign (preview). Chave = texto em pt-BR. Antes de criar, procure a chave nos
// outros arquivos do catalogo: chave duplicada entre arquivos quebra o npm run i18n:check.
export const rdPreviewMessages: MessageCatalog = {
  "Telas": { en: "Screens", es: "Pantallas" },
  "Demonstração do redesign": { en: "Redesign demo", es: "Demostración del rediseño" },
  "Dados fictícios. Nada é salvo.": { en: "Sample data. Nothing is saved.", es: "Datos ficticios. No se guarda nada." },
  "Trocar visão (aluno / professor)": { en: "Switch view (student / instructor)", es: "Cambiar vista (alumno / profesor)" },
  "Tema claro": { en: "Light theme", es: "Tema claro" },
  "Tema escuro": { en: "Dark theme", es: "Tema oscuro" },
  "Novo design · demonstração": { en: "New design · demo", es: "Nuevo diseño · demostración" },
  "Escolha uma visão.": { en: "Pick a view.", es: "Elige una vista." },
  "Navegue pelo app como aluno ou como professor. Toque nas abas, abra aulas, faça check-in — tudo funciona com dados fictícios e nada é salvo.": { en: "Browse the app as a student or as an instructor. Tap the tabs, open classes, check in — everything works with sample data and nothing is saved.", es: "Navega por la app como alumno o como profesor. Toca las pestañas, abre clases, haz check-in: todo funciona con datos ficticios y no se guarda nada." },
  "Ver como aluno": { en: "View as student", es: "Ver como alumno" },
  "Início, aulas, check-in, evolução, learning, perfil e avisos.": { en: "Home, classes, check-in, progress, learning, profile and notices.", es: "Inicio, clases, check-in, evolución, learning, perfil y avisos." },
  "Ver como professor": { en: "View as instructor", es: "Ver como profesor" },
  "Início, calendário com QR e presença, academia, avisos, learning e perfil.": { en: "Home, calendar with QR and attendance, academy, notices, learning and profile.", es: "Inicio, calendario con QR y asistencia, academia, avisos, learning y perfil." },
  "Dica: o botão “Telas” na lateral leva direto a qualquer tela e troca a visão a qualquer momento.": { en: "Tip: the “Screens” button on the side jumps to any screen and switches the view at any time.", es: "Consejo: el botón “Pantallas” al costado lleva a cualquier pantalla y cambia la vista en cualquier momento." },
};
