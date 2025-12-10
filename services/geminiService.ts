import { GoogleGenAI } from "@google/genai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Message } from "../types";
import { isGeminiQuotaExceeded, setGeminiQuotaExceeded } from "./apiService";

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
 * Busca feriados municipais usando IA com Google Search
 * Usa a SDK oficial @google/generative-ai com ferramenta de busca ativada
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

  // Verifica se a cota foi excedida hoje
  if (await isGeminiQuotaExceeded()) {
    console.warn(`[GeminiService] ⚠️ Cota do Gemini excedida hoje. Pulando busca para ${cityName}/${stateName}. Tentará novamente amanhã.`);
    return [];
  }

  try {
    // Inicializa a SDK oficial do Google
    const genAI = new GoogleGenerativeAI(apiKey);

    // Configura o modelo com a ferramenta de busca (Google Search)
    // Usando gemini-2.5-flash que suporta googleSearch
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: [
        {
          googleSearch: {}, // Ativa o acesso à web
        },
      ],
    });

    const today = new Date().toLocaleDateString('pt-BR');
    const prompt = `
Hoje é ${today}.

Pesquise feriados municipais para a cidade de ${cityName}, estado de ${stateName}, para o ano de ${year}.

IMPORTANTE:
1. Busque em sites oficiais da prefeitura, câmaras municipais, ou portais governamentais
2. Liste APENAS feriados municipais (não inclua feriados nacionais ou estaduais)
3. Retorne estritamente um JSON Array válido

Formato esperado:
[
  {
    "date": "YYYY-MM-DD",
    "name": "Nome do Feriado",
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

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text()?.trim() || '';
    
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
        
        // Converte data de DD/MM para YYYY-MM-DD se necessário
        let dateStr = h.date;
        if (dateStr.includes('/')) {
          const [day, month] = dateStr.split('/');
          dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        // Valida formato de data
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateStr)) return false;
        
        // Valida se a data é do ano solicitado
        const holidayYear = parseInt(dateStr.substring(0, 4));
        if (holidayYear !== year) return false;
        
        return true;
      })
      .map((h: any) => {
        // Converte data se necessário
        let dateStr = h.date;
        if (dateStr.includes('/')) {
          const [day, month] = dateStr.split('/');
          dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        return {
          date: dateStr,
          name: h.name.trim(),
          city: h.city || cityName,
          state: h.state || stateName
        };
      });
    
    console.log(`[GeminiService] ✅ Encontrados ${validHolidays.length} feriados municipais para ${cityName}/${stateName} em ${year}`);
    
    return validHolidays;
  } catch (error: any) {
    // Detecta erro 429 (quota excedida)
    const errorMessage = error?.message || error?.toString() || '';
    const errorCode = error?.status || error?.code || '';
    
    if (errorCode === 429 || errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
      console.error(`[GeminiService] ❌ Cota do Gemini excedida (429). Parando buscas até o próximo dia.`);
      await setGeminiQuotaExceeded();
      // Retorna array vazio e para a busca
      return [];
    }
    
    console.error(`[GeminiService] Erro ao buscar feriados municipais para ${cityName}/${stateName}:`, error);
    return [];
  }
};

/**
 * Busca feriados municipais para múltiplos estados usando IA com Google Search
 * Versão otimizada para buscar vários estados de uma vez
 */
export const searchMunicipalHolidaysForStates = async (
  states: string[],
  days: number = 15,
  apiKey?: string
): Promise<MunicipalHoliday[]> => {
  // Se não tiver API key, retorna array vazio
  if (!apiKey || apiKey.trim() === '') {
    console.warn("[GeminiService] API Key não configurada para busca de feriados municipais.");
    return [];
  }

  if (!states || states.length === 0) {
    return [];
  }

  // Verifica se a cota foi excedida hoje
  if (await isGeminiQuotaExceeded()) {
    console.warn(`[GeminiService] ⚠️ Cota do Gemini excedida hoje. Pulando busca para estados ${states.join(', ')}. Tentará novamente amanhã.`);
    return [];
  }

  try {
    // Inicializa a SDK oficial do Google
    const genAI = new GoogleGenerativeAI(apiKey);

    // Configura o modelo com a ferramenta de busca (Google Search)
    // Usando gemini-2.5-flash que suporta googleSearch
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: [
        {
          googleSearch: {}, // Ativa o acesso à web
        },
      ],
    });

    const today = new Date().toLocaleDateString('pt-BR');
    const statesList = states.join(', ');
    const currentYear = new Date().getFullYear();
    
    const prompt = `
Hoje é ${today}.

Pesquise feriados municipais para os próximos ${days} dias nos estados: ${statesList}.

IMPORTANTE:
1. Busque em sites oficiais das prefeituras, câmaras municipais, ou portais governamentais
2. Liste APENAS feriados municipais (não inclua feriados nacionais ou estaduais)
3. Retorne estritamente um JSON Array válido

Formato esperado:
[
  {
    "date": "YYYY-MM-DD",
    "name": "Nome do Feriado",
    "city": "Nome da Cidade",
    "state": "Sigla do Estado"
  }
]

REGRAS:
- Use o formato de data YYYY-MM-DD
- O campo "name" deve conter o nome oficial do feriado
- O campo "city" deve conter o nome da cidade
- O campo "state" deve conter a sigla do estado (ex: SC, PR, RS)
- Inclua apenas feriados dos próximos ${days} dias
- Se não encontrar feriados municipais, retorne um array vazio: []
- Retorne APENAS o JSON, sem texto adicional antes ou depois

Responda APENAS com o JSON, sem explicações ou texto adicional.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text()?.trim() || '';
    
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
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const endDate = new Date(todayDate);
    endDate.setDate(todayDate.getDate() + days);
    
    const validHolidays: MunicipalHoliday[] = holidays
      .filter((h: any) => {
        // Valida se tem os campos obrigatórios
        if (!h.date || !h.name || !h.city || !h.state) return false;
        
        // Converte data de DD/MM para YYYY-MM-DD se necessário
        let dateStr = h.date;
        if (dateStr.includes('/') && !dateStr.includes('-')) {
          const parts = dateStr.split('/');
          if (parts.length === 2) {
            const [day, month] = parts;
            const year = currentYear;
            dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
        }
        
        // Valida formato de data
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateStr)) return false;
        
        // Valida se está dentro do período
        const holidayDate = new Date(dateStr);
        holidayDate.setHours(0, 0, 0, 0);
        if (holidayDate < todayDate || holidayDate > endDate) return false;
        
        return true;
      })
      .map((h: any) => {
        // Converte data se necessário
        let dateStr = h.date;
        if (dateStr.includes('/') && !dateStr.includes('-')) {
          const parts = dateStr.split('/');
          if (parts.length === 2) {
            const [day, month] = parts;
            const year = currentYear;
            dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
        }
        
        return {
          date: dateStr,
          name: h.name.trim(),
          city: h.city.trim(),
          state: h.state.trim().toUpperCase()
        };
      });
    
    console.log(`[GeminiService] ✅ Encontrados ${validHolidays.length} feriados municipais para estados ${statesList}`);
    
    return validHolidays;
  } catch (error: any) {
    // Detecta erro 429 (quota excedida)
    const errorMessage = error?.message || error?.toString() || '';
    const errorCode = error?.status || error?.code || '';
    
    if (errorCode === 429 || errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
      console.error(`[GeminiService] ❌ Cota do Gemini excedida (429). Parando buscas até o próximo dia.`);
      await setGeminiQuotaExceeded();
      // Retorna array vazio e para a busca
      return [];
    }
    
    console.error(`[GeminiService] Erro ao buscar feriados municipais para estados ${states.join(', ')}:`, error);
    return [];
  }
};