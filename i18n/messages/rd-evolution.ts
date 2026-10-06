import type { MessageCatalog } from './types';

// Textos do redesign (evolution). Chave = texto em pt-BR. Antes de criar, procure a chave nos
// outros arquivos do catalogo: chave duplicada entre arquivos quebra o npm run i18n:check.
export const rdEvolutionMessages: MessageCatalog = {
  // Bloco amarelo
  "Mais 1 aula.": { en: "1 more class.", es: "1 clase más." },
  "Mais {count} aulas.": { en: "{count} more classes.", es: "{count} clases más." },
  "Você chega lá.": { en: "You'll get there.", es: "Vas a llegar." },
  "aula pro {grade}º grau": { en: "class to stripe {grade}", es: "clase para el {grade}º grado" },
  "aulas pro {grade}º grau": { en: "classes to stripe {grade}", es: "clases para el {grade}º grado" },
  "aula pra faixa {belt}": { en: "class to {belt} belt", es: "clase para el cinturón {belt}" },
  "aulas pra faixa {belt}": { en: "classes to {belt} belt", es: "clases para el cinturón {belt}" },
  "Faixa {belt} em {count}": { en: "{belt} belt in {count}", es: "Cinturón {belt} en {count}" },
  "Ciclo fechado.": { en: "Cycle complete.", es: "Ciclo cerrado." },
  "Agora é com o professor.": { en: "Now it's up to your instructor.", es: "Ahora depende del profesor." },
  "Seu professor define o próximo passo.": { en: "Your instructor sets the next step.", es: "Tu profesor define el próximo paso." },
  "Mais 1 ano.": { en: "1 more year.", es: "1 año más." },
  "Mais {count} anos.": { en: "{count} more years.", es: "{count} años más." },
  "ano pro {grade}º grau": { en: "year to degree {grade}", es: "año para el {grade}º grado" },
  "anos pro {grade}º grau": { en: "years to degree {grade}", es: "años para el {grade}º grado" },
  "Tempo cumprido para o {grade}º grau.": { en: "Time served for degree {grade}.", es: "Tiempo cumplido para el {grade}º grado." },

  // Calendario do mes
  "Presença": { en: "Attendance", es: "Asistencia" },
  "Faltou": { en: "Missed", es: "Faltó" },
  "Presença computada": { en: "Attendance counted", es: "Asistencia computada" },
  "Você confirmou ida e não registrou presença.": { en: "You confirmed you'd go but didn't check in.", es: "Confirmaste que ibas y no registraste asistencia." },
  "Aula programada": { en: "Scheduled class", es: "Clase programada" },
  "Nenhum treino neste dia.": { en: "No training on this day.", es: "Ningún entrenamiento este día." },
  "Presença: você treinou mas a aula não computou, ou a presença aguarda aprovação.": {
    en: "Attendance: you trained but the class didn't count, or the attendance is awaiting approval.",
    es: "Asistencia: entrenaste pero la clase no computó, o la asistencia espera aprobación.",
  },

  // Linha do tempo e detalhes
  "Atual": { en: "Current", es: "Actual" },
  "Detalhes da graduação": { en: "Graduation details", es: "Detalles de la graduación" },
  "Progressão automática": { en: "Automatic progression", es: "Progresión automática" },

  // Competicao
  "Encerrado": { en: "Finished", es: "Finalizado" },
  "Vitória": { en: "Win", es: "Victoria" },
  "Vitória por finalização": { en: "Win by submission", es: "Victoria por finalización" },
  "Vitória por pontos": { en: "Win by points", es: "Victoria por puntos" },
  "Derrota": { en: "Loss", es: "Derrota" },
  "Empate": { en: "Draw", es: "Empate" },
  "W.O.": { en: "Walkover", es: "W.O." },
  "Suas lutas registradas na academia": { en: "Your fights recorded at the academy", es: "Tus luchas registradas en la academia" },

  // Celebracao
  "OSS! Nova graduação": { en: "OSS! New rank", es: "¡OSS! Nueva graduación" },
  "Você mereceu cada treino.": { en: "You earned every session.", es: "Te ganaste cada entrenamiento." },
  "Compartilhar": { en: "Share", es: "Compartir" },
  "Ver minha evolução": { en: "See my progress", es: "Ver mi evolución" },
  "Oss! Conquistei a faixa {belt} no Jiu-Jitsu.": { en: "Oss! I earned my {belt} belt in Jiu-Jitsu.", es: "¡Oss! Conquisté el cinturón {belt} en Jiu-Jitsu." },
  "Oss! Conquistei o {degree}º grau na faixa {belt}.": { en: "Oss! I earned stripe {degree} on my {belt} belt.", es: "¡Oss! Conquisté el {degree}º grado en el cinturón {belt}." },
};
