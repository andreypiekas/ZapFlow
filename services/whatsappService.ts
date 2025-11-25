import { ApiConfig } from "../types";

// Serviço compatível com Evolution API v1.x/v2.x ou similares
// Documentação base: https://doc.evolution-api.com/

export const getSystemStatus = async (config: ApiConfig) => {
  if (config.isDemo) return { status: 'connected' };
  
  if (!config.baseUrl || !config.apiKey) return null;

  try {
    const response = await fetch(`${config.baseUrl}/instance/connectionState/${config.instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': config.apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) throw new Error('Falha ao conectar na API');
    
    const data = await response.json();
    // Adaptação para diferentes versões da Evolution API
    // Pode retornar { instance: { state: 'open' } } ou apenas { state: 'open' }
    const state = data?.instance?.state || data?.state;
    
    return { status: state === 'open' ? 'connected' : 'disconnected' };
  } catch (error) {
    console.error("Erro ao verificar status:", error);
    return null;
  }
};

export const fetchRealQRCode = async (config: ApiConfig): Promise<string | null> => {
  if (config.isDemo) {
    return null; // Demo mode handles simulation differently in the UI now
  }

  if (!config.baseUrl || !config.apiKey) return null;

  try {
    // Tenta conectar/buscar QR code
    const response = await fetch(`${config.baseUrl}/instance/connect/${config.instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': config.apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
        console.error("Erro API:", response.statusText);
        return null;
    }

    const data = await response.json();
    
    // Evolution API geralmente retorna { base64: "..." } ou { code: "..." }
    let base64 = data.base64 || data.code || data.qrcode;
    
    if (!base64) return null;

    // Garante que o prefixo data:image exista
    if (!base64.startsWith('data:image')) {
        base64 = `data:image/png;base64,${base64}`;
    }

    return base64;
  } catch (error) {
    console.error("Erro ao buscar QR Code:", error);
    return null;
  }
};

export const sendRealMessage = async (config: ApiConfig, phone: string, text: string) => {
  if (config.isDemo) {
    console.log("DEMO MODE: Mensagem enviada:", text);
    await new Promise(resolve => setTimeout(resolve, 800));
    return true;
  }

  try {
    const cleanPhone = phone.replace(/\D/g, '');

    const response = await fetch(`${config.baseUrl}/message/sendText/${config.instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.apiKey
      },
      body: JSON.stringify({
        number: cleanPhone,
        options: { delay: 1200, presence: "composing", linkPreview: false },
        textMessage: { text: text }
      })
    });
    
    return response.ok;
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
    return false;
  }
};

// --- NOVAS FUNÇÕES DE MÍDIA ---

// Helper para converter Blob/File para Base64
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove o prefixo "data:image/png;base64," para enviar apenas o hash se a API exigir, 
      // mas a Evolution API aceita com prefixo no campo "media".
      resolve(base64String); 
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const sendRealMediaMessage = async (
  config: ApiConfig, 
  phone: string, 
  mediaBlob: Blob, 
  caption: string = '', 
  mediaType: 'image' | 'video' | 'audio' | 'document',
  fileName: string = 'file'
) => {
  if (config.isDemo) {
    console.log(`DEMO MODE: Enviando mídia (${mediaType})`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    return true;
  }

  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const base64 = await blobToBase64(mediaBlob);
    
    // Mime types comuns
    let mimeType = mediaBlob.type;
    if (mediaType === 'audio') mimeType = 'audio/mp4'; // Whatsapp geralmente prefere mp4/aac ou ogg

    // Estrutura genérica para Evolution API (sendMedia ou sendWhatsAppMedia)
    const body = {
      number: cleanPhone,
      options: { delay: 1200, presence: "recording" },
      mediaMessage: {
        mediatype: mediaType,
        caption: caption,
        media: base64, // Base64 completo com data:mime;base64,...
        fileName: fileName
      }
    };

    // Ajuste de rota dependendo do tipo (Evolution as vezes separa Audio)
    let endpoint = 'sendMedia';
    if (mediaType === 'audio') {
        endpoint = 'sendWhatsAppAudio'; // Algumas versões usam rota específica para áudio ptt
    }

    const response = await fetch(`${config.baseUrl}/message/${endpoint}/${config.instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.apiKey
      },
      body: JSON.stringify(body)
    });

    return response.ok;

  } catch (error) {
    console.error("Erro ao enviar mídia:", error);
    return false;
  }
};

export const logoutInstance = async (config: ApiConfig) => {
  if (config.isDemo) {
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  }

  if (!config.baseUrl || !config.apiKey) return false;

  try {
    const response = await fetch(`${config.baseUrl}/instance/logout/${config.instanceName}`, {
      method: 'DELETE',
      headers: {
        'apikey': config.apiKey
      }
    });
    return response.ok;
  } catch (error) {
    console.error("Erro ao desconectar:", error);
    return false;
  }
};