import { GoogleGenAI } from "@google/genai";
import { Message } from "../types";

// NOTE: In a real production environment, this key should be proxied through a backend.
// Since this is a frontend-only demo, we rely on the env var being present.
const apiKey = process.env.API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateSmartReply = async (
  history: Message[],
  contactName: string
): Promise<string> => {
  if (!ai) {
    console.warn("API Key not found for Gemini");
    return "Erro: API Key não configurada.";
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