
import { ApiConfig, Chat, Message, MessageStatus } from "../types";

// Serviço compatível com Evolution API v1.x/v2.x
// Documentação base: https://doc.evolution-api.com/

// Helper interno para encontrar instância ativa se a configurada falhar
const findActiveInstance = async (config: ApiConfig) => {
    try {
        const response = await fetch(`${config.baseUrl}/instance/fetchInstances`, {
            method: 'GET',
            headers: { 'apikey': config.apiKey }
        });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        // Normaliza a resposta da API para sempre ser um array
        let instances: any[] = [];
        if (Array.isArray(data)) {
            instances = data;
        } else if (data && Array.isArray(data.instances)) {
            instances = data.instances;
        } else if (data && typeof data === 'object') {
            // Caso retorne um único objeto de instância
            // Verifica se tem a propriedade 'instance' ou se é o próprio objeto
            if (data.instance) {
                instances = [data];
            } else if (data.instanceName) {
                // Formato simplificado
                instances = [{ instance: data }];
            }
        }
        
        if (!instances || instances.length === 0) return null;

        // Helper seguro para pegar dados
        const getStatus = (item: any) => {
            if (!item) return 'unknown';
            return item.instance?.status || item.status || 'unknown';
        };
        
        const getName = (item: any) => {
            if (!item) return null;
            return item.instance?.instanceName || item.instanceName || item.name || null;
        };

        // 1. Tenta achar uma CONECTADA ('open')
        const connected = instances.find((i: any) => getStatus(i) === 'open');
        if (connected) {
            const name = getName(connected);
            if (name) return { instanceName: name, status: 'open' };
        }

        // 2. Tenta achar uma CONECTANDO ('connecting')
        const connecting = instances.find((i: any) => getStatus(i) === 'connecting');
        if (connecting) {
            const name = getName(connecting);
            if (name) return { instanceName: name, status: 'connecting' };
        }

        // 3. Retorna a primeira que achar (fallback)
        const first = instances[0];
        if (first) {
            const name = getName(first);
            if (name) return { instanceName: name, status: getStatus(first) };
        }

        return null;

    } catch (error) {
        console.error("[AutoDiscovery] Erro ao buscar instâncias:", error);
        return null;
    }
};

export const getSystemStatus = async (config: ApiConfig) => {
  if (config.isDemo) return { status: 'connected' };
  if (!config.baseUrl || !config.apiKey) return null;

  try {
    const foundInstance = await findActiveInstance(config);
    const targetInstance = foundInstance?.instanceName || config.instanceName;

    const response = await fetch(`${config.baseUrl}/instance/connectionState/${targetInstance}`, {
      method: 'GET',
      headers: { 'apikey': config.apiKey }
    });
    
    // Tolerância a erros 500/502 durante sync
    if (response.status >= 500) return { status: 'connecting' };
    
    if (response.ok) {
        const data = await response.json();
        const state = data?.instance?.state || data?.state;
        if (state === 'open') return { status: 'connected', realName: targetInstance };
        if (state === 'connecting') return { status: 'connecting', realName: targetInstance };
        return { status: 'disconnected' };
    }

    if (foundInstance) {
        if (foundInstance.status === 'open') return { status: 'connected', realName: foundInstance.instanceName };
        if (foundInstance.status === 'connecting') return { status: 'connecting', realName: foundInstance.instanceName };
    }

    return null;
  } catch (error) {
    console.error("Erro status:", error);
    return { status: 'connecting' };
  }
};

export const getDetailedInstanceStatus = async (config: ApiConfig) => {
    if (config.isDemo || !config.baseUrl || !config.apiKey) return null;

    try {
        const response = await fetch(`${config.baseUrl}/instance/fetchInstances`, {
            method: 'GET',
            headers: { 'apikey': config.apiKey }
        });
        
        if (response.status >= 500) return { state: 'connecting' };
        if (!response.ok) return { state: 'error_network' };
        
        const data = await response.json();
        let instances: any[] = [];
        if (Array.isArray(data)) instances = data;
        else if (data && Array.isArray(data.instances)) instances = data.instances;
        
        const getStatus = (item: any) => item?.instance?.status || item?.status || 'unknown';
        const getName = (item: any) => item?.instance?.instanceName || item?.instanceName;

        const myInstance = instances.find((i: any) => i && getName(i) === config.instanceName);
        
        if (myInstance) {
            return {
                state: getStatus(myInstance),
                name: getName(myInstance)
            };
        }

        if (instances.length > 0 && instances[0]) {
            const other = instances[0];
            return {
                state: getStatus(other),
                name: getName(other),
                isMismatch: true
            };
        }

        return { state: 'not_found' };

    } catch (e) {
        return { state: 'connecting' };
    }
};

export const fetchRealQRCode = async (config: ApiConfig): Promise<string | null> => {
  if (config.isDemo) return null;
  if (!config.baseUrl || !config.apiKey) return null;

  let targetInstance = config.instanceName;
  const activeInstance = await findActiveInstance(config);
  if (activeInstance && activeInstance.instanceName) targetInstance = activeInstance.instanceName;

  try {
    let response = await fetch(`${config.baseUrl}/instance/connect/${targetInstance}`, {
      method: 'GET',
      headers: { 'apikey': config.apiKey }
    });

    if (response.status === 404) {
        await fetch(`${config.baseUrl}/instance/create`, {
            method: 'POST',
            headers: { 'apikey': config.apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instanceName: targetInstance,
                qrcode: true,
                integration: "WHATSAPP-BAILEYS"
            })
        });
        await new Promise(resolve => setTimeout(resolve, 3000));
        response = await fetch(`${config.baseUrl}/instance/connect/${targetInstance}`, {
            method: 'GET',
            headers: { 'apikey': config.apiKey }
        });
    }

    if (!response.ok) return null;
    const data = await response.json();
    
    if (data && typeof data.count === 'number') return null;

    let base64 = data.base64 || data.code || data.qrcode;
    if (!base64) return null;
    
    if (!base64.startsWith('data:image')) {
        base64 = `data:image/png;base64,${base64}`;
    }

    return base64;
  } catch (error) {
    console.error("Erro QR:", error);
    return null;
  }
};

export const sendRealMessage = async (config: ApiConfig, phone: string, text: string) => {
  if (config.isDemo) {
    await new Promise(resolve => setTimeout(resolve, 800));
    return true;
  }

  try {
    let instanceName = config.instanceName;
    const active = await findActiveInstance(config);
    if (active && active.instanceName) instanceName = active.instanceName;

    const cleanPhone = phone.replace(/\D/g, '');
    
    const payload = {
        number: cleanPhone,
        options: { delay: 1200, presence: "composing" },
        text: text
    };

    const response = await fetch(`${config.baseUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.apiKey
      },
      body: JSON.stringify(payload)
    });
    
    return response.ok;
  } catch (error) {
    console.error("Erro envio:", error);
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
    let instanceName = config.instanceName;
    const active = await findActiveInstance(config);
    if (active && active.instanceName) instanceName = active.instanceName;

    const cleanPhone = phone.replace(/\D/g, '');
    const base64 = await blobToBase64(mediaBlob);
    
    let endpoint = 'sendMedia';
    if (mediaType === 'audio') endpoint = 'sendWhatsAppAudio'; 

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
    console.error("Erro media:", error);
    return false;
  }
};

export const logoutInstance = async (config: ApiConfig) => {
  if (config.isDemo) return true;
  if (!config.baseUrl || !config.apiKey) return false;

  try {
    let instanceName = config.instanceName;
    const active = await findActiveInstance(config);
    if (active && active.instanceName) instanceName = active.instanceName;

    const response = await fetch(`${config.baseUrl}/instance/logout/${instanceName}`, {
      method: 'DELETE',
      headers: { 'apikey': config.apiKey }
    });
    return response.ok;
  } catch (error) {
    return false;
  }
};

// --- SYNC ENGINE ---

const normalizeJid = (jid: string | null | undefined): string => {
    if (!jid) return '';
    const parts = jid.split(':');
    let user = parts[0];
    if (user.includes('@')) {
        return user; 
    }
    return user + '@s.whatsapp.net';
};

// Deep scan para encontrar qualquer objeto que pareça uma mensagem ou chat
const extractDataRecursively = (data: any, collectedChats = new Map<string, any>()) => {
    if (!data || typeof data !== 'object') return;

    if (Array.isArray(data)) {
        data.forEach(item => extractDataRecursively(item, collectedChats));
        return;
    }

    // 1. Tenta identificar um Chat Completo
    const possibleJid = data.id || data.remoteJid || data.jid || (data.key ? data.key.remoteJid : null);
    
    if (possibleJid && typeof possibleJid === 'string' && possibleJid.includes('@') && !possibleJid.includes('status@broadcast')) {
        const jid = normalizeJid(possibleJid);
        
        if (!collectedChats.has(jid)) {
            collectedChats.set(jid, { id: jid, messages: [] });
        }
        const chat = collectedChats.get(jid);

        // Se o objeto atual TEM metadata de chat (nome, foto), salva
        if (data.pushName || data.name || data.unreadCount !== undefined || data.profilePictureUrl) {
            chat.raw = { ...chat.raw, ...data };
        }

        // Se o objeto atual É uma mensagem (tem key e timestamp)
        if (data.key && data.messageTimestamp) {
            // Evita duplicatas de mensagem
            const msgId = data.key.id;
            const exists = chat.messages.some((m: any) => m.key?.id === msgId);
            if (!exists) {
                chat.messages.push(data);
            }
        }
    }

    // Continua descendo, exceto se já extraiu tudo
    Object.keys(data).forEach(key => {
        if (typeof data[key] === 'object' && data[key] !== null) {
             extractDataRecursively(data[key], collectedChats);
        }
    });
};

export const fetchChats = async (config: ApiConfig): Promise<Chat[]> => {
    if (config.isDemo || !config.baseUrl || !config.apiKey) return [];

    try {
        let instanceName = config.instanceName;
        const active = await findActiveInstance(config);
        if (active && active.instanceName) instanceName = active.instanceName;

        if (!instanceName) return [];

        let rawData: any = null;
        
        // Estratégia de Endpoints (Fallback)
        const endpoints = [
            // 1. Tenta buscar CHATS (com mensagens)
            { url: `/chat/findChats/${instanceName}`, method: 'POST', body: { where: {}, include: ['messages'] } },
            { url: `/chat/findChats/${instanceName}`, method: 'GET' },
            // 2. Tenta buscar MENSAGENS diretas (se chats falhar)
            { url: `/chat/findMessages/${instanceName}`, method: 'POST', body: { where: {}, limit: 50 } },
            { url: `/message/fetchMessages/${instanceName}`, method: 'GET' } // query param pode ser necessario
        ];

        for (const ep of endpoints) {
            try {
                const opts: RequestInit = {
                    method: ep.method,
                    headers: { 'apikey': config.apiKey, 'Content-Type': 'application/json' }
                };
                if (ep.body) opts.body = JSON.stringify(ep.body);

                const res = await fetch(`${config.baseUrl}${ep.url}`, opts);
                if (res.ok) {
                    rawData = await res.json();
                    if (rawData) {
                        console.log(`[ZapFlow Sync] Sucesso via ${ep.url}`);
                        break; 
                    }
                }
            } catch (e) {
                console.warn(`[ZapFlow Sync] Falha em ${ep.url}`, e);
            }
        }

        if (!rawData) return [];

        // Processamento
        const chatsMap = new Map<string, any>();
        extractDataRecursively(rawData, chatsMap);
        
        const chatsArray = Array.from(chatsMap.values());
        
        const mappedChats: Chat[] = chatsArray.map((item: any) => {
            const normalizedJid = item.id;
            
            // Mapeia mensagens
            let messages: Message[] = [];
            if (item.messages && Array.isArray(item.messages)) {
                messages = item.messages
                    .map((m: any) => mapApiMessageToInternal(m))
                    .filter((m: Message | null): m is Message => m !== null);
            }
            
            messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
            
            const raw = item.raw || {};
            const name = raw.pushName || raw.name || raw.verifiedName || normalizedJid.split('@')[0];
            const avatarUrl = raw.profilePicUrl || raw.profilePictureUrl || raw.ppUrl;

            return {
                id: normalizedJid,
                contactName: name || 'Desconhecido',
                contactNumber: normalizedJid.split('@')[0],
                contactAvatar: avatarUrl || `https://ui-avatars.com/api/?background=random&color=fff&name=${name || 'U'}`,
                departmentId: null,
                unreadCount: raw.unreadCount || 0,
                lastMessage: lastMsg ? (lastMsg.type === 'text' ? lastMsg.content : `[${lastMsg.type}]`) : '',
                lastMessageTime: lastMsg ? lastMsg.timestamp : new Date(),
                status: 'open' as const,
                messages: messages,
                assignedTo: undefined
            };
        });

        // Filtra chats vazios se necessário, mas aqui vamos retornar tudo que achou
        return mappedChats;

    } catch (error) {
        console.error("[ZapFlow Sync] Erro fatal:", error);
        return [];
    }
};

const mapApiMessageToInternal = (apiMsg: any): Message | null => {
    if (!apiMsg) return null;

    const msgObj = apiMsg.message || apiMsg;
    
    const content = 
        msgObj.conversation || 
        msgObj.extendedTextMessage?.text || 
        msgObj.imageMessage?.caption ||
        (msgObj.imageMessage ? 'Imagem' : '') ||
        (msgObj.audioMessage ? 'Áudio' : '') ||
        (typeof msgObj.text === 'string' ? msgObj.text : '') || 
        '';
    
    if (!content && !msgObj.imageMessage && !msgObj.audioMessage && !msgObj.stickerMessage && !msgObj.documentMessage && !msgObj.videoMessage) {
        return null; 
    }

    const key = apiMsg.key || {};
    const isFromMe = key.fromMe === true;
    const id = key.id || apiMsg.id || `msg_${Date.now()}_${Math.random()}`;
    
    let ts = apiMsg.messageTimestamp || apiMsg.timestamp || Date.now();
    const tsNum = Number(ts);
    const timestamp = new Date(tsNum * (tsNum < 2000000000 ? 1000 : 1));

    let type: any = 'text';
    if (msgObj.imageMessage) type = 'image';
    else if (msgObj.audioMessage) type = 'audio';
    else if (msgObj.videoMessage) type = 'video';
    else if (msgObj.stickerMessage) type = 'sticker';
    else if (msgObj.documentMessage) type = 'document';

    return {
        id: id,
        content: content,
        sender: isFromMe ? 'agent' : 'user',
        timestamp: timestamp,
        status: MessageStatus.READ, 
        type: type
    };
};
