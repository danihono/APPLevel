import type { MessageCatalog } from './types';

// Textos do redesign (home). Chave = texto em pt-BR. Antes de criar, procure a chave nos
// outros arquivos do catalogo: chave duplicada entre arquivos quebra o npm run i18n:check.
export const rdHomeMessages: MessageCatalog = {
  "Sua semana até aqui.": { en: "Your week so far.", es: "Tu semana hasta ahora." },
  "1 semana": { en: "1 week", es: "1 semana" },
  "{count} semanas": { en: "{count} weeks", es: "{count} semanas" },
  "1 semana seguida com treino": { en: "1 week in a row with training", es: "1 semana seguida con entrenamiento" },
  "{count} semanas seguidas com treino": { en: "{count} weeks in a row with training", es: "{count} semanas seguidas con entrenamiento" },
  "treino costurado": { en: "training stitched in", es: "entrenamiento cosido" },
  "treinos costurados": { en: "trainings stitched in", es: "entrenamientos cosidos" },
  "Sem grau": { en: "No stripes", es: "Sin grado" },
  "Fecha o ciclo e a fita vira grau.": { en: "Close the cycle and the tape becomes a stripe.", es: "Cierra el ciclo y la cinta se vuelve grado." },
  "Ciclo fechado: aguarde a avaliação do professor.": { en: "Cycle complete: wait for your coach's evaluation.", es: "Ciclo cerrado: espera la evaluación del profesor." },
  "Progressão manual: seu professor define os graus.": { en: "Manual progression: your coach sets your stripes.", es: "Progresión manual: tu profesor define los grados." },
  "Graus completos. Falta 1 aula para a faixa {belt}.": { en: "All stripes earned. 1 class left until the {belt} belt.", es: "Grados completos. Falta 1 clase para el cinturón {belt}." },
  "Graus completos. Faltam {count} aulas para a faixa {belt}.": { en: "All stripes earned. {count} classes left until the {belt} belt.", es: "Grados completos. Faltan {count} clases para el cinturón {belt}." },
  "Ver evolução": { en: "See progress", es: "Ver evolución" },
  "Próxima aula": { en: "Next class", es: "Próxima clase" },
  "Nenhuma aula marcada por enquanto.": { en: "No classes scheduled for now.", es: "Ninguna clase programada por ahora." },
  "Hoje de manhã": { en: "This morning", es: "Hoy por la mañana" },
  "Hoje à tarde": { en: "This afternoon", es: "Hoy por la tarde" },
  "Hoje à noite": { en: "Tonight", es: "Hoy por la noche" },
  "Amanhã": { en: "Tomorrow", es: "Mañana" },
  "até {time}": { en: "until {time}", es: "hasta las {time}" },
  "Fazer check-in": { en: "Check in", es: "Hacer check-in" },
  "Seu mês": { en: "Your month", es: "Tu mes" },
  "Treinou": { en: "Trained", es: "Entrenó" },
};
