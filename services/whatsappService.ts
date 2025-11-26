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
        const instances = Array.isArray(data) ? data : (data.instances || []);
        
        if (instances.length === 0) return null;

        // 1. Tenta achar uma CONECTADA ('open')
        const connected = instances.find((i: any) => i.instance.status === 'open');
        if (connected) return connected.instance;

        // 2. Tenta achar uma CONECTANDO ('connecting')
        const connecting = instances.find((i: any) => i.instance.status === 'connecting');
        if (connecting) return connecting.instance;

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
        const instances = Array.isArray(data) ? data : (data.instances || []);
        
        const myInstance = instances.find((i: any) => i.instance.instanceName === config.instanceName);
        
        if (myInstance) {
            return {
                state: myInstance.instance.status || 'unknown',
                name: myInstance.instance.instanceName
            };
        }

        if (instances.length > 0) {
            const other = instances[0].instance;
            return {
                state: other.status || 'unknown',
                name: other.instanceName,
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
  if (activeInstance) targetInstance = activeInstance.instanceName;

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
    if (active) instanceName = active.instanceName;

    const cleanPhone = phone.replace(/\D/g, '');
    
    // PAYLOAD SIMPLIFICADO E CORRIGIDO
    // Apenas os campos essenciais para evitar erro de validação
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
    if (active) instanceName = active.instanceName;

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

// --- UTILS PARA SYNC ---

// Normaliza IDs do WhatsApp removendo sufixos de dispositivo
const normalizeJid = (jid: string | null | undefined): string => {
    if (!jid) return '';
    // Remove :11, :12, etc e mantem apenas o user@server
    const parts = jid.split(':');
    let user = parts[0];
    
    // Se já tem @, ótimo. Se não, adiciona @s.whatsapp.net se for numérico
    if (user.includes('@')) {
        return user.split('@')[0] + '@' + user.split('@')[1];
    }
    return user + '@s.whatsapp.net';
};

// Parser Recursivo Profundo para encontrar mensagens/chats em qualquer estrutura
const extractChatsRecursively = (data: any, collected = new Map<string, any>()) => {
    if (!data || typeof data !== 'object') return;

    // Se for array, percorre
    if (Array.isArray(data)) {
        data.forEach(item => extractChatsRecursively(item, collected));
        return;
    }

    // Verifica se o objeto atual parece ser um chat ou mensagem válida
    // Evolution v2 usa 'id', 'remoteJid', 'key.remoteJid' ou 'jid'
    let jid = data.id || data.remoteJid || data.key?.remoteJid || data.jid;
    
    if (jid && typeof jid === 'string' && jid.includes('@')) {
        const normalized = normalizeJid(jid);
        if (!normalized.includes('status@broadcast')) {
            // Se encontrarmos um objeto com 'messages' ou 'lastMessage', é um chat
            // Se encontrarmos um objeto com 'key' e 'message', é uma mensagem solta
            
            if (!collected.has(normalized)) {
                // Cria estrutura base se não existir
                collected.set(normalized, {
                    id: normalized,
                    raw: data,
                    messages: []
                });
            }

            const chatEntry = collected.get(normalized);

            // Se o objeto atual for uma mensagem individual (tem key e message)
            if (data.key && (data.message || data.messageTimestamp)) {
                chatEntry.messages.push(data);
            } 
            // Se o objeto for um chat completo (tem array messages)
            else if (Array.isArray(data.messages)) {
                chatEntry.messages = [...chatEntry.messages, ...data.messages];
                // Atualiza metadados se disponível
                if (data.pushName) chatEntry.raw.pushName = data.pushName;
                if (data.name) chatEntry.raw.name = data.name;
                if (data.unreadCount) chatEntry.raw.unreadCount = data.unreadCount;
                if (data.profilePictureUrl) chatEntry.raw.profilePictureUrl = data.profilePictureUrl;
            }
        }
    }

    // Continua a recursão em todas as propriedades (para achar aninhados)
    Object.values(data).forEach(val => extractChatsRecursively(val, collected));
};

export const fetchChats = async (config: ApiConfig): Promise<Chat[]> => {
    if (config.isDemo || !config.baseUrl || !config.apiKey) return [];

    try {
        let instanceName = config.instanceName;
        const active = await findActiveInstance(config);
        if (active) instanceName = active.instanceName;

        const response = await fetch(`${config.baseUrl}/chat/findChats/${instanceName}`, {
            method: 'GET',
            headers: { 'apikey': config.apiKey }
        });

        if (!response.ok) return [];

        const rawData = await response.json();
        
        // Mapa para agrupar chats únicos pelo ID normalizado
        const chatsMap = new Map<string, any>();
        
        // Scan profundo para encontrar tudo que parece chat ou mensagem
        extractChatsRecursively(rawData, chatsMap);
        
        const chatsArray = Array.from(chatsMap.values());

        console.log(`[ZapFlow Parser] Encontrados ${chatsArray.length} chats únicos na resposta da API.`);

        const mappedChats: Chat[] = chatsArray.map((item: any) => {
            const remoteJid = item.id; // Já normalizado no extrator
            
            // Processa e mapeia as mensagens encontradas
            let messages: Message[] = [];
            if (item.messages && Array.isArray(item.messages)) {
                messages = item.messages
                    .map((m: any) => mapApiMessageToInternal(m))
                    .filter((m: Message | null): m is Message => m !== null);
            }

            // Ordena mensagens por timestamp
            messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
            
            // Tenta pegar nome e foto do objeto raw ou fallback
            const name = item.raw.pushName || item.raw.name || item.raw.verifiedName || remoteJid.split('@')[0];
            const avatarUrl = item.raw.profilePictureUrl || item.raw.ppUrl || item.raw.profilePicUrl;

            return {
                id: remoteJid,
                contactName: name,
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

    // Normaliza o objeto de mensagem
    const msgObj = apiMsg.message || apiMsg;
    
    // Tenta extrair texto de todas as variações possíveis do Baileys
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
    
    // Se não tiver conteúdo textual nem mídia conhecida, ignora
    if (!content && !msgObj.imageMessage && !msgObj.stickerMessage && !msgObj.audioMessage) {
        return null;
    }

    const key = apiMsg.key || {};
    const isFromMe = key.fromMe === true;
    const id = key.id || apiMsg.id || `msg_${Date.now()}_${Math.random()}`;
    
    // Correção do Timestamp (Segundos -> Milissegundos)
    let ts = apiMsg.messageTimestamp || apiMsg.timestamp;
    if (!ts) ts = Date.now();
    
    // Se for string numérica, converte. Se for timestamp em segundos (10 digitos), multiplica por 1000
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