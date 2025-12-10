import { GoogleGenAI } from "@google/genai";
import { Message } from "../types";

export interface MunicipalHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  city: string;
  state: string;
}

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

/**
 * Busca feriados municipais de uma cidade usando IA
 * A IA faz uma busca web para encontrar feriados municipais específicos da cidade
 */
export const searchMunicipalHolidaysWithAI = async (
  cityName: string,
  stateName: string,
  year: number,
  apiKey?: string
): Promise<MunicipalHoliday[]> => {
  // Se não tiver API key, retorna array vazio
  if (!apiKey || apiKey.trim() === '') {
    console.warn("[GeminiService] API Key não configurada para busca de feriados municipais.");
    return [];
  }

  // Cria instância do Gemini com a API key fornecida
  let ai: GoogleGenAI;
  try {
    ai = new GoogleGenAI({ apiKey });
  } catch (error) {
    console.error("[GeminiService] Erro ao inicializar Gemini para busca de feriados:", error);
    return [];
  }

  const prompt = `
Você é um assistente especializado em buscar informações sobre feriados municipais do Brasil.

Por favor, busque informações sobre os feriados municipais da cidade de ${cityName}, estado de ${stateName}, para o ano de ${year}.

IMPORTANTE:
1. Busque em sites oficiais da prefeitura, câmaras municipais, ou portais governamentais
2. Liste APENAS feriados municipais (não inclua feriados nacionais ou estaduais)
3. Retorne os dados em formato JSON válido, seguindo este exemplo exato:

[
  {
    "date": "2024-06-24",
    "name": "Dia do Padroeiro",
    "city": "${cityName}",
    "state": "${stateName}"
  },
  {
    "date": "2024-08-15",
    "name": "Aniversário da Cidade",
    "city": "${cityName}",
    "state": "${stateName}"
  }
]

REGRAS:
- Use o formato de data YYYY-MM-DD
- O campo "name" deve conter o nome oficial do feriado
- Se não encontrar feriados municipais específicos, retorne um array vazio: []
- Retorne APENAS o JSON, sem texto adicional antes ou depois
- Se a cidade não tiver feriados municipais conhecidos, retorne []

Responda APENAS com o JSON, sem explicações ou texto adicional.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt,
    });
    
    const responseText = response.text?.trim() || '';
    
    // Tenta extrair JSON da resposta (pode ter markdown code blocks)
    let jsonText = responseText;
    
    // Remove markdown code blocks se existirem
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }
    
    // Tenta encontrar JSON no texto
    const jsonStart = jsonText.indexOf('[');
    const jsonEnd = jsonText.lastIndexOf(']') + 1;
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      jsonText = jsonText.substring(jsonStart, jsonEnd);
    }
    
    // Parse do JSON
    const holidays = JSON.parse(jsonText);
    
    if (!Array.isArray(holidays)) {
      console.warn("[GeminiService] Resposta da IA não é um array:", holidays);
      return [];
    }
    
    // Valida e formata os feriados
    const validHolidays: MunicipalHoliday[] = holidays
      .filter((h: any) => {
        // Valida se tem os campos obrigatórios
        if (!h.date || !h.name) return false;
        
        // Valida formato de data
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(h.date)) return false;
        
        // Valida se a data é do ano solicitado
        const holidayYear = parseInt(h.date.substring(0, 4));
        if (holidayYear !== year) return false;
        
        return true;
      })
      .map((h: any) => ({
        date: h.date,
        name: h.name.trim(),
        city: h.city || cityName,
        state: h.state || stateName
      }));
    
    console.log(`[GeminiService] ✅ Encontrados ${validHolidays.length} feriados municipais para ${cityName}/${stateName} em ${year}`);
    
    return validHolidays;
  } catch (error) {
    console.error(`[GeminiService] Erro ao buscar feriados municipais para ${cityName}/${stateName}:`, error);
    return [];
  }
};