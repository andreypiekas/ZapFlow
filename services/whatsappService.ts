
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
        
        // Normaliza a resposta da API
        let instances: any[] = [];
        if (Array.isArray(data)) {
            instances = data;
        } else if (data && Array.isArray(data.instances)) {
            instances = data.instances;
        } else if (data && typeof data === 'object') {
            // Caso retorne um único objeto de instância sem estar em array
            // Verifica se é um objeto de instância válido antes de adicionar
            if (data.instance || data.instanceName) {
                instances = [data];
            }
        }
        
        if (instances.length === 0) return null;

        // Helper seguro para pegar dados, independente da estrutura (v1 vs v2)
        const getStatus = (item: any) => {
            if (!item) return 'unknown';
            return item.instance?.status || item.status || 'unknown';
        };
        const getName = (item: any) => {
            if (!item) return null;
            return item.instance?.instanceName || item.instanceName || item.name;
        };

        // 1. Tenta achar uma CONECTADA ('open')
        const connected = instances.find((i: any) => i && getStatus(i) === 'open');
        if (connected) return { instanceName: getName(connected), status: 'open' };

        // 2. Tenta achar uma CONECTANDO ('connecting')
        const connecting = instances.find((i: any) => i && getStatus(i) === 'connecting');
        if (connecting) return { instanceName: getName(connecting), status: 'connecting' };

        // 3. Retorna a primeira que achar (fallback), se tiver nome
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
    // Primeiro tenta descobrir a instância correta
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

    // Fallback se a connectionState falhar mas o AutoDiscovery achou algo
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
    if (data.id && typeof data.id === 'string' && (Array.isArray(data.messages) || data.unreadCount !== undefined)) {
        const jid = normalizeJid(data.id);
        if (jid.includes('@')) {
            if (!collectedChats.has(jid)) {
                collectedChats.set(jid, { id: jid, raw: data, messages: [] });
            }
            const chat = collectedChats.get(jid);
            
            // Merge metadata
            if (data.pushName) chat.raw.pushName = data.pushName;
            if (data.name) chat.raw.name = data.name;
            if (data.unreadCount !== undefined) chat.raw.unreadCount = data.unreadCount;
            if (data.profilePictureUrl) chat.raw.profilePictureUrl = data.profilePictureUrl;

            if (data.messages && Array.isArray(data.messages)) {
                // Se tiver mensagens aninhadas, processa
                extractChatsRecursively(data.messages, collectedChats);
            }
        }
    }

    // Identifica Mensagem Solta (pode estar dentro de um chat ou solta na lista)
    if (data.key && data.key.remoteJid) {
        const jid = normalizeJid(data.key.remoteJid);
        if (jid.includes('@') && !jid.includes('status@broadcast')) {
            if (!collectedChats.has(jid)) {
                // Cria chat placeholder se não existir
                collectedChats.set(jid, { id: jid, raw: {}, messages: [] });
            }
            const chat = collectedChats.get(jid);
            
            // Evita duplicatas pelo ID da mensagem
            const msgId = data.key.id;
            const exists = chat.messages.some((m: any) => (m.key?.id === msgId));
            if (!exists) {
                chat.messages.push(data);
                // Tenta extrair nome do remetente se disponível na mensagem
                if (data.pushName && !chat.raw.pushName) chat.raw.pushName = data.pushName;
            }
        }
    }

    // Continua descendo na árvore (exceto se já processamos msg ou chat para evitar loop infinito em estruturas circulares, mas JSON padrão não tem isso)
    // Para segurança, iteramos chaves
    Object.keys(data).forEach(key => {
        // Evita processar string como objeto
        if (typeof data[key] === 'object' && data[key] !== null) {
             extractChatsRecursively(data[key], collectedChats);
        }
    });
};

export const fetchChats = async (config: ApiConfig): Promise<Chat[]> => {
    if (config.isDemo || !config.baseUrl || !config.apiKey) return [];

    try {
        let instanceName = config.instanceName;
        // Usa o nome descoberto para garantir que a URL esteja certa
        const active = await findActiveInstance(config);
        if (active && active.instanceName) instanceName = active.instanceName;

        // Se mesmo assim não tiver nome, aborta para evitar 404
        if (!instanceName) {
            console.warn('[ZapFlow Sync] Nenhuma instância ativa encontrada.');
            return [];
        }

        const response = await fetch(`${config.baseUrl}/chat/findChats/${instanceName}`, {
            method: 'GET',
            headers: { 'apikey': config.apiKey }
        });

        if (!response.ok) {
            console.error(`[ZapFlow Sync] Erro ${response.status} ao buscar chats.`);
            return [];
        }

        const rawData = await response.json();
        
        console.log('[ZapFlow Raw Data]', rawData); 

        const chatsMap = new Map<string, any>();
        extractChatsRecursively(rawData, chatsMap);
        const chatsArray = Array.from(chatsMap.values());

        console.log(`[ZapFlow Parser] Encontrados ${chatsArray.length} chats únicos.`);

        const mappedChats: Chat[] = chatsArray.map((item: any) => {
            const remoteJid = item.id;
            
            let messages: Message[] = [];
            // As mensagens já foram agrupadas no `extractChatsRecursively`
            if (item.messages && Array.isArray(item.messages)) {
                messages = item.messages
                    .map((m: any) => mapApiMessageToInternal(m))
                    .filter((m: Message | null): m is Message => m !== null);
            }

            // Ordena mensagens por timestamp
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
    
    // Tenta extrair conteúdo de todos os lugares possíveis do Baileys
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
    
    // Se não tem conteúdo de texto nem mídia conhecida, ignora (ex: protocolMessage)
    if (!content && !msgObj.imageMessage && !msgObj.stickerMessage && !msgObj.audioMessage && !msgObj.videoMessage && !msgObj.documentMessage) {
        return null;
    }

    const key = apiMsg.key || {};
    const isFromMe = key.fromMe === true;
    const id = key.id || apiMsg.id || `msg_${Date.now()}_${Math.random()}`;
    
    let ts = apiMsg.messageTimestamp || apiMsg.timestamp;
    if (!ts) ts = Date.now();
    
    // Tratamento de timestamp (Seconds vs Milliseconds)
    const tsNum = Number(ts);
    // Se for menor que 2030 (em segundos), multiplica por 1000. Se for gigante (ms), usa direto.
    // 2000000000 segundos é ano 2033.
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
