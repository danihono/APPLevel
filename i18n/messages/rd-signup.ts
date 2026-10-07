import type { MessageCatalog } from './types';

// Textos do redesign (cadastro do aluno em etapas). Chave = texto em pt-BR. Antes de criar, procure a
// chave nos outros arquivos do catalogo: chave duplicada entre arquivos quebra o npm run i18n:check.
export const rdSignupMessages: MessageCatalog = {
  "Qual é o seu nome?": { en: "What's your name?", es: "¿Cuál es tu nombre?" },
  "É assim que seu professor vai te encontrar na academia.": { en: "This is how your instructor will find you at the academy.", es: "Así te encontrará tu profesor en la academia." },
  "Quando você nasceu?": { en: "When were you born?", es: "¿Cuándo naciste?" },
  "A idade define sua trilha: Adulto ou Kids.": { en: "Your age sets your track: Adult or Kids.", es: "La edad define tu categoría: Adulto o Kids." },
  "Onde você treina?": { en: "Where do you train?", es: "¿Dónde entrenas?" },
  "Qual é a sua faixa?": { en: "What's your belt?", es: "¿Cuál es tu faja?" },
  "Escolha a faixa e o grau que você tem hoje. O professor confirma na aprovação.": { en: "Pick the belt and stripes you have today. Your instructor confirms on approval.", es: "Elige la faja y los grados que tienes hoy. El profesor los confirma al aprobar." },
  "Você compete?": { en: "Do you compete?", es: "¿Compites?" },
  "Crie seu acesso": { en: "Create your login", es: "Crea tu acceso" },
  "Você vai entrar no app com esse e-mail e senha.": { en: "You'll sign in to the app with this email and password.", es: "Entrarás a la app con este correo y contraseña." },
  "Tudo certo, {name}!": { en: "You're all set, {name}!", es: "¡Todo listo, {name}!" },
  "Confira seus dados. Seu cadastro fica pendente até aprovação do professor da unidade.": { en: "Check your details. Your sign-up stays pending until the academy instructor approves it.", es: "Revisa tus datos. Tu registro queda pendiente hasta que el profesor de la sede lo apruebe." },
  "Etapa {current} de {total}": { en: "Step {current} of {total}", es: "Paso {current} de {total}" },
  "{current} de {total}": { en: "{current} of {total}", es: "{current} de {total}" },
};
