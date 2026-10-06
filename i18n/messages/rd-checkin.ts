import type { MessageCatalog } from './types';

// Textos do redesign (checkin). Chave = texto em pt-BR. Antes de criar, procure a chave nos
// outros arquivos do catalogo: chave duplicada entre arquivos quebra o npm run i18n:check.
export const rdCheckinMessages: MessageCatalog = {
  "Check-in": { en: "Check-in", es: "Check-in" },
  "Hora do treino.": { en: "Time to train.", es: "Hora de entrenar." },
  "Aponte para o QR do professor": { en: "Point at your instructor's QR", es: "Apunta al QR del profesor" },
  "Colar código": { en: "Paste code", es: "Pegar código" },
  "Ler outro QR": { en: "Scan another QR", es: "Escanear otro QR" },
  "Não foi possível abrir a câmera.": { en: "Couldn't open the camera.", es: "No fue posible abrir la cámara." },
  "Libere o acesso à câmera nas configurações ou cole o código abaixo.": { en: "Allow camera access in settings or paste the code below.", es: "Permite el acceso a la cámara en la configuración o pega el código abajo." },
  "Não encontramos a aula deste código. Leia o QR que o professor mostra.": { en: "We couldn't find the class for this code. Scan the QR your instructor shows.", es: "No encontramos la clase de este código. Escanea el QR que muestra el profesor." },
  "Sem QR? Peça para o professor aprovar sua presença.": { en: "No QR? Ask your instructor to approve your attendance.", es: "¿Sin QR? Pide al profesor que apruebe tu asistencia." },
  "Solicitação enviada. Aguarde a aprovação do professor.": { en: "Request sent. Wait for your instructor's approval.", es: "Solicitud enviada. Espera la aprobación del profesor." },
  "Já registrada": { en: "Already registered", es: "Ya registrada" },
  "Sua presença nesta aula já foi registrada.": { en: "Your attendance for this class is already registered.", es: "Tu asistencia en esta clase ya fue registrada." },
  "Oss!": { en: "Oss!", es: "¡Oss!" },
  "Presença registrada.": { en: "Attendance registered.", es: "Asistencia registrada." },
  "Falta": { en: "Left", es: "Falta" },
  "Faltam": { en: "Left", es: "Faltan" },
  "para o {grade}º grau.": { en: "to stripe {grade}.", es: "para el {grade}º grado." },
  "para a faixa {belt}.": { en: "to {belt} belt.", es: "para el cinturón {belt}." },
  "Grau novo a caminho!": { en: "New stripe on the way!", es: "¡Nuevo grado en camino!" },
  "Faixa nova a caminho!": { en: "New belt on the way!", es: "¡Nuevo cinturón en camino!" },
  "Ciclo fechado! Seu professor vai avaliar o {grade}º grau.": { en: "Cycle complete! Your instructor will evaluate stripe {grade}.", es: "¡Ciclo cerrado! Tu profesor va a evaluar el {grade}º grado." },
  "Ciclo fechado! Seu professor vai avaliar a faixa {belt}.": { en: "Cycle complete! Your instructor will evaluate the {belt} belt.", es: "¡Ciclo cerrado! Tu profesor va a evaluar el cinturón {belt}." },
  "Falta 1 aula pro {grade}º grau": { en: "1 class left to stripe {grade}", es: "Falta 1 clase para el {grade}º grado" },
  "Faltam {count} aulas pro {grade}º grau": { en: "{count} classes left to stripe {grade}", es: "Faltan {count} clases para el {grade}º grado" },
  "Falta 1 aula pra faixa {belt}": { en: "1 class left to {belt} belt", es: "Falta 1 clase para el cinturón {belt}" },
  "Faltam {count} aulas pra faixa {belt}": { en: "{count} classes left to {belt} belt", es: "Faltan {count} clases para el cinturón {belt}" },
  "+1 fita": { en: "+1 stripe", es: "+1 grado" },
  "Bora pro tatame": { en: "Let's hit the mat", es: "Vamos al tatami" },
};
