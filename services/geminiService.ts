import { GoogleGenAI } from "@google/genai";
import { Message } from "../types";

export const generateSmartReply = async (
  history: Message[],
  contactName: string,
  apiKey?: string
): Promise<string> => {
  // Se não tiver API key, retorna mensagem de erro
  if (!apiKey || apiKey.trim() === '') {
    console.warn("[GeminiService] API Key não configurada. Configure em Configurações > Google Gemini API Key.");
    return "Recurso de IA indisponível (Chave de API não configurada). Configure em Configurações.";
  }

  // Cria instância do Gemini com a API key fornecida
  let ai: GoogleGenAI;
  try {
    ai = new GoogleGenAI({ apiKey });
  } catch (error) {
    console.error("[GeminiService] Erro ao inicializar Gemini:", error);
    return "Erro ao conectar com a IA. Verifique se a chave de API está correta.";
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