
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
    const state = data?.instance?.state || data?.state;
    
    return { status: state === 'open' ? 'connected' : 'disconnected' };
  } catch (error) {
    // Silently fail logging to avoid spam, unless needed
    return null;
  }
};

export const fetchRealQRCode = async (config: ApiConfig): Promise<string | null> => {
  if (config.isDemo) {
    return null; 
  }

  if (!config.baseUrl || !config.apiKey) {
      console.warn("Configuração incompleta para buscar QR Code");
      return null;
  }

  console.log(`[ZapFlow] Iniciando busca de QR Code para instância: ${config.instanceName}`);
  
  try {
    // 1. Tenta conectar para pegar o QR Code
    let response = await fetch(`${config.baseUrl}/instance/connect/${config.instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': config.apiKey,
        'Content-Type': 'application/json'
      }
    });

    // 2. AUTO-FIX: Se a instância não existir (404), tenta criar automaticamente
    if (response.status === 404) {
        console.warn(`[ZapFlow] Instância '${config.instanceName}' não encontrada (404). Tentando criar...`);
        
        const createRes = await fetch(`${config.baseUrl}/instance/create`, {
            method: 'POST',
            headers: {
                'apikey': config.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                instanceName: config.instanceName,
                qrcode: true,
                integration: "WHATSAPP-BAILEYS"
            })
        });

        if (createRes.ok) {
             console.log("[ZapFlow] Instância criada com sucesso. Aguardando inicialização...");
             await new Promise(resolve => setTimeout(resolve, 3000));
             
             // Tenta buscar o QR novamente
             response = await fetch(`${config.baseUrl}/instance/connect/${config.instanceName}`, {
                method: 'GET',
                headers: {
                    'apikey': config.apiKey,
                    'Content-Type': 'application/json'
                }
            });
        } else {
            console.error("[ZapFlow] Falha ao criar instância automaticamente:", await createRes.text());
            return null;
        }
    }

    if (!response.ok) {
        console.error(`[ZapFlow] Erro HTTP ao buscar QR: ${response.status} ${response.statusText}`);
        return null;
    }

    const data = await response.json();
    
    // TRATAMENTO ESPECÍFICO PARA RESPOSTA "count: 0"
    // Isso acontece quando a Evolution recebeu o comando mas o navegador ainda não gerou a imagem.
    if (data && typeof data.count === 'number') {
        console.log("[ZapFlow] Instância conectando... QR Code sendo gerado (Count: " + data.count + ")");
        // Retornamos null mas sem erro, para que o Connection.tsx continue tentando (polling)
        return null; 
    }

    // Evolution API geralmente retorna { base64: "..." } ou { code: "..." } ou { qrcode: "..." }
    let base64 = data.base64 || data.code || data.qrcode;
    
    if (!base64) {
        // Se veio vazio e não é count, algo está estranho, mas não é erro fatal.
        return null;
    }

    // Garante que o prefixo data:image exista
    if (!base64.startsWith('data:image')) {
        base64 = `data:image/png;base64,${base64}`;
    }

    console.log("[ZapFlow] QR Code recebido com sucesso!");
    return base64;
  } catch (error) {
    console.error("[ZapFlow] ERRO DE CONEXÃO AO BUSCAR QR:", error);
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

// Helper para converter Blob/File para Base64
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
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
    
    let mimeType = mediaBlob.type;
    if (mediaType === 'audio') mimeType = 'audio/mp4'; 

    const body = {
      number: cleanPhone,
      options: { delay: 1200, presence: "recording" },
      mediaMessage: {
        mediatype: mediaType,
        caption: caption,
        media: base64, 
        fileName: fileName
      }
    };

    let endpoint = 'sendMedia';
    if (mediaType === 'audio') {
        endpoint = 'sendWhatsAppAudio'; 
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
