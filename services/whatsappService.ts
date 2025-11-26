
import { ApiConfig, Chat, Message, MessageStatus } from "../types";

// Serviço compatível com Evolution API v1.x/v2.x
// Documentação base: https://doc.evolution-api.com/

// Helper interno para encontrar instância ativa se a configurada falhar
const findActiveInstance = async (config: ApiConfig) => {
    try {
        // console.log("[AutoDiscovery] Buscando instâncias disponíveis...");
        const response = await fetch(`${config.baseUrl}/instance/fetchInstances`, {
            method: 'GET',
            headers: { 'apikey': config.apiKey }
        });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        // Evolution v2 retorna array direto ou objeto com chave instances
        const instances = Array.isArray(data) ? data : (data.instances || []);
        
        if (instances.length === 0) return null;

        // console.log(`[AutoDiscovery] Encontradas ${instances.length} instâncias.`);

        // 1. Tenta achar uma CONECTADA ('open')
        const connected = instances.find((i: any) => i.instance.status === 'open');
        if (connected) {
            // console.log(`[AutoDiscovery] Usando instância ativa: ${connected.instance.instanceName}`);
            return connected.instance;
        }

        // 2. Tenta achar uma CONECTANDO ('connecting')
        const connecting = instances.find((i: any) => i.instance.status === 'connecting');
        if (connecting) {
            // console.log(`[AutoDiscovery] Usando instância conectando: ${connecting.instance.instanceName}`);
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
    
    // Se der erro 500/502 (Stream Error/Bad Gateway), assumimos que está tentando conectar
    if (response.status >= 500) {
        return { status: 'connecting' };
    }
    
    if (response.ok) {
        const data = await response.json();
        // Evolution v2 pode retornar state dentro de instance ou na raiz
        const state = data?.instance?.state || data?.state;
        
        if (state === 'open') return { status: 'connected' };
        if (state === 'connecting') return { status: 'connecting' };
        return { status: 'disconnected' };
    }

    // Se falhou (404), tenta Auto-Discovery
    // Isso resolve o problema de 'zapflow' vs 'zaptflow'
    const foundInstance = await findActiveInstance(config);
    if (foundInstance) {
        if (foundInstance.status === 'open') return { status: 'connected', realName: foundInstance.instanceName };
        if (foundInstance.status === 'connecting') return { status: 'connecting', realName: foundInstance.instanceName };
    }

    return null;
  } catch (error) {
    console.error("Erro ao verificar status do sistema:", error);
    return { status: 'connecting' }; // Em caso de erro de rede, assume tentando reconectar
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
        
        if (response.status >= 500) return { state: 'connecting' }; // Server busy/restarting
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
    
    // PAYLOAD CORRIGIDO PARA EVOLUTION API V2
    // Algumas versões validam a presença de 'text' na raiz ou dentro de textMessage
    const payload = {
        number: cleanPhone,
        options: { delay: 1200, presence: "composing", linkPreview: false },
        textMessage: { text: text },
        text: text // Redundância para passar na validação "instance requires property text"
    };

    const response = await fetch(`${config.baseUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.apiKey
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        console.error("Falha no envio:", await response.text());
    }

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

// --- NOVA FUNÇÃO: BUSCAR CHATS REAIS DA API (SYNC) ---
export const fetchChats = async (config: ApiConfig): Promise<Chat[]> => {
    if (config.isDemo) return [];
    if (!config.baseUrl || !config.apiKey) return [];

    try {
        let instanceName = config.instanceName;
        const active = await findActiveInstance(config);
        if (active) instanceName = active.instanceName;

        // Busca chats do banco de dados da Evolution
        const response = await fetch(`${config.baseUrl}/chat/findChats/${instanceName}`, {
            method: 'GET',
            headers: { 'apikey': config.apiKey }
        });

        if (!response.ok) return [];

        const data = await response.json();
        // O retorno geralmente é um array de chats
        if (!Array.isArray(data)) return [];

        // Mapeia os dados da Evolution para o formato do ZapFlow
        const mappedChats: Chat[] = data.map((item: any) => {
            const remoteJid = item.id || item.remoteJid;
            
            // Processa mensagens (pode vir como array ou objeto único)
            let messages: Message[] = [];
            
            // Se a API retornar um array de mensagens
            if (item.messages && Array.isArray(item.messages)) {
               messages = item.messages.map((m: any) => mapApiMessageToInternal(m));
            } 
            // Se tiver apenas a última mensagem
            else if (item.lastMessage) {
               messages = [mapApiMessageToInternal(item.lastMessage)];
            }

            // Ordena mensagens por data
            messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;

            return {
                id: remoteJid,
                contactName: item.pushName || item.name || remoteJid.split('@')[0],
                contactNumber: remoteJid.split('@')[0],
                contactAvatar: item.profilePictureUrl || 'https://ui-avatars.com/api/?background=random&color=fff&name=' + (item.pushName || 'User'),
                departmentId: null, // API não tem essa info, será mesclada no App.tsx
                unreadCount: item.unreadCount || 0,
                lastMessage: lastMsg ? (lastMsg.type === 'text' ? lastMsg.content : `[${lastMsg.type}]`) : '',
                lastMessageTime: lastMsg ? lastMsg.timestamp : new Date(),
                status: 'open',
                messages: messages,
                assignedTo: undefined // API não tem essa info
            };
        });

        return mappedChats;

    } catch (error) {
        console.error("Erro ao buscar chats:", error);
        return [];
    }
};

// Helper para converter mensagem da API para formato interno
const mapApiMessageToInternal = (apiMsg: any): Message => {
    const content = apiMsg.message?.conversation || 
                    apiMsg.message?.extendedTextMessage?.text || 
                    apiMsg.message?.imageMessage?.caption ||
                    (apiMsg.message?.imageMessage ? 'Imagem' : '') ||
                    '';
    
    const isFromMe = apiMsg.key?.fromMe === true;
    const timestamp = apiMsg.messageTimestamp ? new Date(Number(apiMsg.messageTimestamp) * 1000) : new Date();

    let type: any = 'text';
    if (apiMsg.message?.imageMessage) type = 'image';
    if (apiMsg.message?.audioMessage) type = 'audio';
    if (apiMsg.message?.stickerMessage) type = 'sticker';

    return {
        id: apiMsg.key?.id || `msg_${Date.now()}_${Math.random()}`,
        content: content,
        sender: isFromMe ? 'agent' : 'user',
        timestamp: timestamp,
        status: MessageStatus.READ, // Assume lido se veio do histórico
        type: type
    };
};
