import { GoogleGenAI } from "@google/genai";
import { Message } from "../types";

// Função segura para acessar variáveis de ambiente sem quebrar o app no navegador
const getApiKey = () => {
  try {
    // Verifica se process existe (Node.js/Webpack)
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }
    // Verifica import.meta (Vite)
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
      // @ts-ignore
      return import.meta.env.VITE_API_KEY;
    }
  } catch (error) {
    // Silently fail
  }
  return '';
};

const apiKey = getApiKey();
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateSmartReply = async (
  history: Message[],
  contactName: string
): Promise<string> => {
  if (!ai) {
    console.warn("API Key not found for Gemini. AI features disabled.");
    return "Recurso de IA indisponível (Chave de API não configurada).";
  }

  // Format history for context
  const conversationContext = history.map(msg => 
    `${msg.sender === 'user' ? contactName : 'Atendente'}: ${msg.content}`
  ).join('\n');

  const prompt = `
    Você é um assistente de suporte profissional e empático em uma plataforma de WhatsApp.
    Analise o histórico da conversa abaixo e sugira uma resposta curta, direta e profissional para o atendente enviar agora.
    
    Contexto da conversa:
    ${conversationContext}
    
    Responda APENAS com o texto da sugestão de resposta. Não use aspas.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    return response.text?.trim() || "Não foi possível gerar uma sugestão.";
  } catch (error) {
    console.error("Error generating smart reply:", error);
    return "Erro ao conectar com a IA.";
  }
};