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
  "Ninguém confirmou ainda": { en: "No one has confirmed yet", es: "Nadie ha confirmado todavía" },
  "contou pro grau": { en: "counted toward your stripe", es: "contó para el grado" },
  "não conta como aula": { en: "doesn't count as a class", es: "no cuenta como clase" },
  "Aula cancelada": { en: "Class cancelled", es: "Clase cancelada" },
  "{rate}% no mês": { en: "{rate}% this month", es: "{rate}% en el mes" },
  "{count} de {capacity} vagas": { en: "{count} of {capacity} spots", es: "{count} de {capacity} cupos" },
  "últimas vagas": { en: "last spots", es: "últimos cupos" },
  "Problemas com o QR?": { en: "Trouble with the QR?", es: "¿Problemas con el QR?" },
  "Solicitar presença fica disponível quando a aula começar.": { en: "Requesting attendance opens when the class starts.", es: "Solicitar asistencia se habilita cuando empiece la clase." },
  "Detalhes da aula": { en: "Class details", es: "Detalles de la clase" },
  "Encerrar {title}?": { en: "End {title}?", es: "¿Finalizar {title}?" },
  "Esqueceu alguém?": { en: "Forgot someone?", es: "¿Olvidaste a alguien?" },
  "Confirmaram ida e ainda não têm presença. Toque para marcar.": { en: "They said they'd come but have no attendance yet. Tap to mark.", es: "Confirmaron asistencia y aún no tienen presencia. Toca para marcar." },
  "Marcar presença de {name}": { en: "Mark {name} present", es: "Marcar asistencia de {name}" },
  "Deslize para encerrar": { en: "Slide to end class", es: "Desliza para finalizar" },
  "Encerrar aula": { en: "End class", es: "Finalizar clase" },
  "Encerrar sem deslizar": { en: "End without sliding", es: "Finalizar sin deslizar" },
};
