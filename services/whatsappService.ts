
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
        
        // Normaliza a resposta da API (pode ser array direto ou objeto com propriedade instances)
        let instances: any[] = [];
        if (Array.isArray(data)) {
            instances = data;
        } else if (data && Array.isArray(data.instances)) {
            instances = data.instances;
        } else if (data && typeof data === 'object') {
            // Caso retorne um único objeto de instância
            instances = [data];
        }
        
        if (instances.length === 0) return null;

        // Helper seguro para pegar dados, independente da estrutura (v1 vs v2)
        const getStatus = (item: any) => item?.instance?.status || item?.status;
        const getName = (item: any) => item?.instance?.instanceName || item?.instanceName || item?.name;

        // 1. Tenta achar uma CONECTADA ('open')
        const connected = instances.find((i: any) => getStatus(i) === 'open');
        if (connected) return { instanceName: getName(connected), status: 'open' };

        // 2. Tenta achar uma CONECTANDO ('connecting')
        const connecting = instances.find((i: any) => getStatus(i) === 'connecting');
        if (connecting) return { instanceName: getName(connecting), status: 'connecting' };

        // 3. Retorna a primeira que achar (fallback), se tiver nome
        const first = instances[0];
        const name = getName(first);
        if (name) return { instanceName: name, status: getStatus(first) };

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
    const response = await fetch(`${config.baseUrl}/instance/connectionState/${config.instanceName}`, {
      method: 'GET',
      headers: { 'apikey': config.apiKey }
    });
    
    // Tolerância a erros 500/502 durante sync
    if (response.status >= 500) return { status: 'connecting' };
    
    if (response.ok) {
        const data = await response.json();
        const state = data?.instance?.state || data?.state;
        if (state === 'open') return { status: 'connected' };
        if (state === 'connecting') return { status: 'connecting' };
        return { status: 'disconnected' };
    }

    const foundInstance = await findActiveInstance(config);
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
        // Normalização
        let instances: any[] = [];
        if (Array.isArray(data)) instances = data;
        else if (data && Array.isArray(data.instances)) instances = data.instances;
        
        // Helper
        const getStatus = (item: any) => item?.instance?.status || item?.status || 'unknown';
        const getName = (item: any) => item?.instance?.instanceName || item?.instanceName;

        const myInstance = instances.find((i: any) => getName(i) === config.instanceName);
        
        if (myInstance) {
            return {
                state: getStatus(myInstance),
                name: getName(myInstance)
            };
        }

        if (instances.length > 0) {
            const other = instances[0];
            return {
                state: getStatus(other),
                name: getName(other),
                isMismatch: true
            };
        }

        return { state: 'not_found' };

    } catch (e) {
        return { state: 'connecting' }; // Assume connecting on error to avoid red flash
    }
};

export const fetchRealQRCode = async (config: ApiConfig): Promise<string | null> => {
  if (config.isDemo) return null;
  if (!config.baseUrl || !config.apiKey) return null;

  let targetInstance = config.instanceName;
  const activeInstance = await findActiveInstance(config);
  // Usa o nome descoberto se for uma string válida (activeInstance agora retorna objeto)
  if (activeInstance && activeInstance.instanceName) targetInstance = activeInstance.instanceName;

  try {
    let response = await fetch(`${config.baseUrl}/instance/connect/${targetInstance}`, {
      method: 'GET',
      headers: { 'apikey': config.apiKey }
    });

    if (response.status === 404) {
        // Auto-create logic
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
    
    // PAYLOAD SIMPLIFICADO
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
    
    if (!response.ok) {
        console.error("Falha envio:", await response.text());
    }

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

// --- UTILS PARA SYNC ---

const normalizeJid = (jid: string | null | undefined): string => {
    if (!jid) return '';
    const parts = jid.split(':');
    let user = parts[0];
    if (user.includes('@')) {
        return user; 
    }
    return user + '@s.whatsapp.net';
};

const extractChatsRecursively = (data: any, collectedChats = new Map<string, any>()) => {
    if (!data || typeof data !== 'object') return;

    if (Array.isArray(data)) {
        data.forEach(item => extractChatsRecursively(item, collectedChats));
        return;
    }

    // Identifica Objeto de Chat
    if (data.id && typeof data.id === 'string' && Array.isArray(data.messages)) {
        const jid = normalizeJid(data.id);
        if (jid.includes('@')) {
            if (!collectedChats.has(jid)) {
                collectedChats.set(jid, { id: jid, raw: data, messages: [] });
            }
            const chat = collectedChats.get(jid);
            if (data.messages.length > 0) {
                const validMsgs = data.messages.filter((m: any) => m && (m.key || m.message));
                chat.messages = [...chat.messages, ...validMsgs];
            }
            if (data.pushName) chat.raw.pushName = data.pushName;
            if (data.name) chat.raw.name = data.name;
            if (data.unreadCount) chat.raw.unreadCount = data.unreadCount;
            if (data.profilePictureUrl) chat.raw.profilePictureUrl = data.profilePictureUrl;
        }
    }

    // Identifica Mensagem Solta
    if (data.key && data.key.remoteJid) {
        const jid = normalizeJid(data.key.remoteJid);
        if (jid.includes('@') && !jid.includes('status@broadcast')) {
            if (!collectedChats.has(jid)) {
                collectedChats.set(jid, { id: jid, raw: {}, messages: [] });
            }
            const chat = collectedChats.get(jid);
            // Evita duplicatas
            const exists = chat.messages.some((m: any) => (m.key?.id === data.key.id));
            if (!exists) {
                chat.messages.push(data);
                if (data.pushName && !chat.raw.pushName) chat.raw.pushName = data.pushName;
            }
        }
    }

    Object.values(data).forEach(val => extractChatsRecursively(val, collectedChats));
};

export const fetchChats = async (config: ApiConfig): Promise<Chat[]> => {
    if (config.isDemo || !config.baseUrl || !config.apiKey) return [];

    try {
        let instanceName = config.instanceName;
        // Usa o nome descoberto para garantir que a URL esteja certa
        const active = await findActiveInstance(config);
        if (active && active.instanceName) instanceName = active.instanceName;

        // Se mesmo assim não tiver nome, aborta para evitar 404
        if (!instanceName) return [];

        const response = await fetch(`${config.baseUrl}/chat/findChats/${instanceName}`, {
            method: 'GET',
            headers: { 'apikey': config.apiKey }
        });

        if (!response.ok) return [];

        const rawData = await response.json();
        
        console.log('[ZapFlow Raw Data]', rawData); 

        const chatsMap = new Map<string, any>();
        extractChatsRecursively(rawData, chatsMap);
        const chatsArray = Array.from(chatsMap.values());

        console.log(`[ZapFlow Parser] Encontrados ${chatsArray.length} chats únicos.`);

        const mappedChats: Chat[] = chatsArray.map((item: any) => {
            const remoteJid = item.id;
            
            let messages: Message[] = [];
            if (item.messages && Array.isArray(item.messages)) {
                messages = item.messages
                    .map((m: any) => mapApiMessageToInternal(m))
                    .filter((m: Message | null): m is Message => m !== null);
            }

            messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
            
            const name = item.raw.pushName || item.raw.name || item.raw.verifiedName || remoteJid.split('@')[0];
            const avatarUrl = item.raw.profilePictureUrl || item.raw.ppUrl || item.raw.profilePicUrl;

            return {
                id: remoteJid,
                contactName: name || 'Desconhecido',
                contactNumber: remoteJid.split('@')[0],
                contactAvatar: avatarUrl || `https://ui-avatars.com/api/?background=random&color=fff&name=${name || 'U'}`,
                departmentId: null,
                unreadCount: item.raw.unreadCount || 0,
                lastMessage: lastMsg ? (lastMsg.type === 'text' ? lastMsg.content : `[${lastMsg.type}]`) : '',
                lastMessageTime: lastMsg ? lastMsg.timestamp : new Date(),
                status: 'open' as const,
                messages: messages,
                assignedTo: undefined
            };
        }).filter((c: Chat | null): c is Chat => c !== null);

        return mappedChats;

    } catch (error) {
        console.error("Erro sync chats:", error);
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
        msgObj.videoMessage?.caption ||
        msgObj.documentMessage?.caption ||
        (msgObj.imageMessage ? 'Imagem' : '') ||
        (msgObj.videoMessage ? 'Vídeo' : '') ||
        (msgObj.audioMessage ? 'Áudio' : '') ||
        (msgObj.stickerMessage ? 'Sticker' : '') ||
        (msgObj.documentMessage ? 'Arquivo' : '') ||
        (typeof msgObj.text === 'string' ? msgObj.text : '') || 
        '';
    
    if (!content && !msgObj.imageMessage && !msgObj.stickerMessage && !msgObj.audioMessage) {
        return null;
    }

    const key = apiMsg.key || {};
    const isFromMe = key.fromMe === true;
    const id = key.id || apiMsg.id || `msg_${Date.now()}_${Math.random()}`;
    
    let ts = apiMsg.messageTimestamp || apiMsg.timestamp;
    if (!ts) ts = Date.now();
    
    const tsNum = Number(ts);
    const timestamp = new Date(tsNum * (String(tsNum).length > 11 ? 1 : 1000));

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
