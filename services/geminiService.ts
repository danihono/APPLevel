
import { GoogleGenAI, Type } from "@google/genai";
import { User } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getTrainingAdvice = async (user: User) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `O aluno ${user.name} é faixa ${user.belt} com ${user.stripes} graus. Ele já fez ${user.currentStripeProgress} aulas para o próximo grau (faltam ${user.classesToNextStripe}) e ${user.currentBeltProgress} aulas para a próxima faixa. Dê uma dica curta e motivacional de Jiu-Jitsu para o dia de hoje focada no nível dele.`,
      config: {
        temperature: 0.7,
        maxOutputTokens: 150,
      }
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Mantenha a constância nos treinos. O segredo está na repetição!";
  }
};
