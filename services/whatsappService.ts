
import { ApiConfig } from "../types";

// Serviço compatível com Evolution API v1.x/v2.x
// Documentação base: https://doc.evolution-api.com/

// Helper interno para encontrar instância ativa se a configurada falhar
const findActiveInstance = async (config: ApiConfig) => {
    try {
        console.log("[AutoDiscovery] Buscando instâncias disponíveis...");
        const response = await fetch(`${config.baseUrl}/instance/fetchInstances`, {
            method: 'GET',
            headers: { 'apikey': config.apiKey }
        });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        // Evolution v2 retorna array direto ou objeto com chave instances
        const instances = Array.isArray(data) ? data : (data.instances || []);
        
        if (instances.length === 0) return null;

        console.log(`[AutoDiscovery] Encontradas ${instances.length} instâncias.`);

        // 1. Tenta achar uma CONECTADA ('open')
        const connected = instances.find((i: any) => i.instance.status === 'open');
        if (connected) {
            console.log(`[AutoDiscovery] Usando instância ativa: ${connected.instance.instanceName}`);
            return connected.instance;
        }

        // 2. Tenta achar uma CONECTANDO ('connecting')
        const connecting = instances.find((i: any) => i.instance.status === 'connecting');
        if (connecting) {
            console.log(`[AutoDiscovery] Usando instância conectando: ${connecting.instance.instanceName}`);
            return connecting.instance;
        }

        // 3. Retorna a primeira que achar (fallback)
        return instances[0].instance;

    } catch (error) {
        console.error("[AutoDiscovery] Erro ao buscar instâncias:", error);
        return null;
    }
};

export const getSystemStatus = async (config: ApiConfig) => {
  if (config.isDemo) return { status: 'connected' };
  
  if (!config.baseUrl || !config.apiKey) return null;

  try {
    // Tenta conexão direta com o nome configurado
    const response = await fetch(`${config.baseUrl}/instance/connectionState/${config.instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': config.apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
        const data = await response.json();
        // Evolution v2 pode retornar state dentro de instance ou na raiz
        const state = data?.instance?.state || data?.state;
        return { status: state === 'open' ? 'connected' : 'disconnected' };
    }

    // Se falhou (404/500), tenta Auto-Discovery
    // Isso resolve o problema de 'zapflow' vs 'zaptflow'
    const foundInstance = await findActiveInstance(config);
    if (foundInstance && foundInstance.status === 'open') {
        return { status: 'connected', realName: foundInstance.instanceName };
    }

    return null;
  } catch (error) {
    console.error("Erro ao verificar status do sistema:", error);
    return null;
  }
};

// Nova função para buscar status detalhado para debug na tela de Conexão
export const getDetailedInstanceStatus = async (config: ApiConfig) => {
    if (config.isDemo || !config.baseUrl || !config.apiKey) return null;

    try {
        const response = await fetch(`${config.baseUrl}/instance/fetchInstances`, {
            method: 'GET',
            headers: {
                'apikey': config.apiKey
            }
        });
        
        if (!response.ok) return { state: 'error_network' };
        
        const data = await response.json();
        const instances = Array.isArray(data) ? data : (data.instances || []);
        
        // Procura EXATAMENTE a configurada
        const myInstance = instances.find((i: any) => i.instance.instanceName === config.instanceName);
        
        if (myInstance) {
            return {
                state: myInstance.instance.status || 'unknown',
                name: myInstance.instance.instanceName
            };
        }

        // Se não achou a configurada, vê se tem OUTRA instância rodando (Erro de nome)
        if (instances.length > 0) {
            const other = instances[0].instance;
            return {
                state: other.status || 'unknown',
                name: other.instanceName,
                isMismatch: true // Flag para avisar a UI que o nome está errado
            };
        }

        return { state: 'not_found' };

    } catch (e) {
        console.error("Erro ao buscar status detalhado:", e);
        return { state: 'error' };
    }
};

export const fetchRealQRCode = async (config: ApiConfig): Promise<string | null> => {
  if (config.isDemo) return null;
  if (!config.baseUrl || !config.apiKey) return null;

  // Lógica inteligente: Usa o nome configurado OU tenta descobrir o real
  let targetInstance = config.instanceName;

  // Tenta encontrar o nome real antes de pedir o QR Code
  const activeInstance = await findActiveInstance(config);
  if (activeInstance) {
      targetInstance = activeInstance.instanceName;
      if (targetInstance !== config.instanceName) {
          console.log(`[QR] Redirecionando solicitação para instância real: ${targetInstance}`);
      }
  }

  try {
    // 1. Tenta conectar na instância alvo
    let response = await fetch(`${config.baseUrl}/instance/connect/${targetInstance}`, {
      method: 'GET',
      headers: { 'apikey': config.apiKey, 'Content-Type': 'application/json' }
    });

    // 2. AUTO-FIX: Se 404 (Não encontrada), cria a instância
    if (response.status === 404) {
        console.warn(`[ZapFlow] Instância '${targetInstance}' não existe. Criando...`);
        const createRes = await fetch(`${config.baseUrl}/instance/create`, {
            method: 'POST',
            headers: { 'apikey': config.apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instanceName: targetInstance,
                qrcode: true,
                integration: "WHATSAPP-BAILEYS"
            })
        });

        if (createRes.ok) {
             // Aguarda um pouco para o navegador iniciar
             await new Promise(resolve => setTimeout(resolve, 3000));
             // Tenta conectar novamente
             response = await fetch(`${config.baseUrl}/instance/connect/${targetInstance}`, {
                method: 'GET',
                headers: { 'apikey': config.apiKey, 'Content-Type': 'application/json' }
            });
        } else {
            return null;
        }
    }

    if (!response.ok) return null;

    const data = await response.json();
    
    // Tratamento para "count: 0" (Ainda carregando o navegador)
    if (data && typeof data.count === 'number') {
        return null; // Retorna null para tentar novamente no próximo ciclo
    }

    // Suporte a diferentes formatos de resposta da API
    let base64 = data.base64 || data.code || data.qrcode;
    
    if (!base64) return null;
    
    // Adiciona prefixo se faltar
    if (!base64.startsWith('data:image')) {
        base64 = `data:image/png;base64,${base64}`;
    }

    return base64;
  } catch (error) {
    console.error("[ZapFlow] Erro ao buscar QR:", error);
    return null;
  }
};

export const sendRealMessage = async (config: ApiConfig, phone: string, text: string) => {
  if (config.isDemo) {
    await new Promise(resolve => setTimeout(resolve, 800));
    return true;
  }

  try {
    // Garante que estamos usando a instância correta
    let instanceName = config.instanceName;
    const active = await findActiveInstance(config);
    if (active) instanceName = active.instanceName;

    const cleanPhone = phone.replace(/\D/g, '');
    
    const response = await fetch(`${config.baseUrl}/message/sendText/${instanceName}`, {
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
    await new Promise(resolve => setTimeout(resolve, 1500));
    return true;
  }

  try {
    // Garante instância correta
    let instanceName = config.instanceName;
    const active = await findActiveInstance(config);
    if (active) instanceName = active.instanceName;

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

    const response = await fetch(`${config.baseUrl}/message/${endpoint}/${instanceName}`, {
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
    // Tenta logout na instância ativa
    let instanceName = config.instanceName;
    const active = await findActiveInstance(config);
    if (active) instanceName = active.instanceName;

    const response = await fetch(`${config.baseUrl}/instance/logout/${instanceName}`, {
      method: 'DELETE',
      headers: { 'apikey': config.apiKey }
    });
    return response.ok;
  } catch (error) {
    return false;
  }
};
