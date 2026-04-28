import { GoogleGenAI } from '@google/genai';
import { beltLabel, getUserProgressionSummary } from '../beltCatalog';
import type { User } from '../types';

const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

export async function getTrainingAdvice(user: User) {
  const progression = getUserProgressionSummary(user);

  if (!ai) {
    return 'Mantenha a constância nos treinos. O segredo está na repetição!';
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `O aluno ${user.name} é faixa ${beltLabel(user.belt)} com ${user.stripes} graus. Progresso do próximo grau: ${progression.stripeProgress} de ${progression.stripeTotal} aulas concluídas. Progresso da próxima faixa: ${progression.beltProgress} de ${progression.beltTotal} aulas concluídas. Dê uma dica curta e motivacional de Jiu-Jitsu para o dia de hoje focada no nível dele.`,
      config: {
        temperature: 0.7,
        maxOutputTokens: 150,
      },
    });

    return response.text;
  } catch (error) {
    console.error('Gemini Error:', error);
    return 'Mantenha a constância nos treinos. O segredo está na repetição!';
  }
}
