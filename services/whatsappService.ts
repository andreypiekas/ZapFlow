import { ApiConfig, Chat, Message, MessageStatus } from "../types";

// Serviço compatível com Evolution API v1.x/v2.x
// Documentação base: https://doc.evolution-api.com/

// --- UTILS ---

const normalizeJid = (jid: string | null | undefined): string => {
    if (!jid) return '';
    // Remove caracteres inválidos e sufixos de dispositivo (:11, :12)
    const parts = jid.split(':');
    let user = parts[0];
    
    // Se já tem domínio, retorna
    if (user.includes('@')) return user; 
    
    // Se é apenas números, adiciona sufixo padrão
    return user + '@s.whatsapp.net';
};

// Formata telefone para o padrão internacional (DDI + DDD + Num)
const formatPhoneForApi = (phone: string): string => {
    let clean = phone.replace(/\D/g, '');
    
    // Regra específica para Brasil (DDI 55)
    // Se tiver 10 (Fixo com DDD) ou 11 (Celular com DDD) dígitos, assume BR e adiciona 55
    if (clean.length === 10 || clean.length === 11) {
        clean = '55' + clean;
    }
    
    return clean;
};

// --- CORE SERVICE ---

// Helper interno para encontrar instância ativa de forma blindada
const findActiveInstance = async (config: ApiConfig) => {
    try {
        const response = await fetch(`${config.baseUrl}/instance/fetchInstances`, {
            method: 'GET',
            headers: { 'apikey': config.apiKey }
        });
        
        if (!response.ok) return null;
        
        const rawData = await response.json();
        
        // Normalização agressiva da resposta para garantir que seja um array
        let instances: any[] = [];
        
        if (Array.isArray(rawData)) {
            instances = rawData;
        } else if (rawData && typeof rawData === 'object') {
            // Suporte a diferentes formatos de retorno (v1/v2)
            if (Array.isArray(rawData.instances)) instances = rawData.instances;
            else if (rawData.instance) instances = [rawData.instance];
            else if (rawData.instanceName) instances = [rawData];
            else if (Object.keys(rawData).length > 0) {
                // Tenta converter objeto em array se parecer uma lista de instâncias
                instances = Object.values(rawData).filter((i: any) => i && (i.instanceName || i?.instance?.instanceName));
            }
        }
        
        if (!instances || instances.length === 0) return null;

        // Helper seguro para evitar crash por undefined (Usa Optional Chaining ?.)
        const getSafeStatus = (item: any) => {
            if (!item) return 'unknown';
            // Verifica profundamente sem quebrar
            return item?.instance?.status || item?.status || 'unknown';
        };
        
        const getSafeName = (item: any) => {
            if (!item) return null;
            return item?.instance?.instanceName || item?.instanceName || item?.name;
        };

        // 1. Prioridade: Instância CONECTADA ('open')
        const connected = instances.find((i: any) => i && getSafeStatus(i) === 'open');
        if (connected) {
            return { instanceName: getSafeName(connected), status: 'open' };
        }

        // 2. Prioridade: Instância CONECTANDO ('connecting')
        const connecting = instances.find((i: any) => i && getSafeStatus(i) === 'connecting');
        if (connecting) {
            return { instanceName: getSafeName(connecting), status: 'connecting' };
        }

        // 3. Fallback: Qualquer instância válida que tenha nome
        const first = instances.find((i: any) => i && getSafeName(i));
        if (first) {
            return { instanceName: getSafeName(first), status: getSafeStatus(first) };
        }

        return null;

    } catch (error) {
        console.error("[AutoDiscovery] Erro crítico ao buscar instâncias (Ignorado para não travar):", error);
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
        const active = await findActiveInstance(config);
        
        if (active && active.instanceName) {
            // Verifica se o nome bate com a config
            const isMismatch = active.instanceName !== config.instanceName;
            return {
                state: active.status,
                name: active.instanceName,
                isMismatch
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
  
  // Tenta descobrir o nome real para evitar 404
  const active = await findActiveInstance(config);
  if (active && active.instanceName) targetInstance = active.instanceName;

  try {
    let response = await fetch(`${config.baseUrl}/instance/connect/${targetInstance}`, {
      method: 'GET',
      headers: { 'apikey': config.apiKey }
    });

    // Auto-create se não existir
    if (response.status === 404 || response.status === 400) {
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
    
    // Se count for numero (ex: 0), ainda não tem QR
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

export const logoutInstance = async (config: ApiConfig) => {
  if (config.isDemo) return true;
  
  const active = await findActiveInstance(config);
  const target = active?.instanceName || config.instanceName;

  try {
    await fetch(`${config.baseUrl}/instance/logout/${target}`, {
      method: 'DELETE',
      headers: { 'apikey': config.apiKey }
    });
    return true;
  } catch (error) {
    return false;
  }
};

// --- MESSAGING ---

export const sendRealMessage = async (config: ApiConfig, phone: string, text: string) => {
  if (config.isDemo) {
    await new Promise(resolve => setTimeout(resolve, 800));
    return true;
  }

  const active = await findActiveInstance(config);
  const target = active?.instanceName || config.instanceName;
  
  // Formata o número (Adiciona 55 se faltar e tiver 10/11 dígitos)
  const cleanPhone = formatPhoneForApi(phone);

  try {
    // Payload simplificado para máxima compatibilidade com v2.x
    const payload = {
        number: cleanPhone,
        text: text,
        delay: 1200,
        linkPreview: false
    };

    const response = await fetch(`${config.baseUrl}/message/sendText/${target}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.apiKey
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[sendRealMessage] Falha API: ${response.status} para ${cleanPhone}`, errorText);
        return false;
    }
    
    return true;
  } catch (error) {
    console.error("[sendRealMessage] Erro de rede:", error);
    return false;
  }
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
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
  if (config.isDemo) return true;

  const active = await findActiveInstance(config);
  const target = active?.instanceName || config.instanceName;
  
  // Formata o número
  const cleanPhone = formatPhoneForApi(phone);

  const base64 = await blobToBase64(mediaBlob);
    
  let endpoint = 'sendMedia';
  if (mediaType === 'audio') endpoint = 'sendWhatsAppAudio'; 

  const body = {
      number: cleanPhone,
      delay: 1200,
      mediaMessage: {
        mediatype: mediaType,
        caption: caption,
        media: base64, 
        fileName: fileName
      }
  };

  try {
    const response = await fetch(`${config.baseUrl}/message/${endpoint}/${target}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.apiKey
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
        console.error(`[sendRealMediaMessage] Falha API: ${response.status}`, await response.text());
        return false;
    }

    return response.ok;
  } catch (error) {
    console.error("[sendRealMediaMessage] Erro de rede:", error);
    return false;
  }
};

// --- CHAT SYNC & PARSING ---

// Função recursiva para encontrar mensagens onde quer que elas estejam aninhadas
const extractChatsRecursively = (data: any, collectedChats = new Map<string, any>()) => {
    if (!data || typeof data !== 'object') return;

    if (Array.isArray(data)) {
        data.forEach(item => extractChatsRecursively(item, collectedChats));
        return;
    }

    // Caso 1: Objeto de Chat (Metadata)
    if (data.id && typeof data.id === 'string' && (data.unreadCount !== undefined || data.pushName)) {
        const jid = normalizeJid(data.id);
        if (jid.includes('@') && !jid.includes('status@broadcast')) {
            if (!collectedChats.has(jid)) {
                collectedChats.set(jid, { id: jid, raw: data, messages: [] });
            }
            const chat = collectedChats.get(jid);
            // Atualiza metadata
            if (data.pushName) chat.raw.pushName = data.pushName;
            if (data.profilePictureUrl) chat.raw.profilePictureUrl = data.profilePictureUrl;
            if (data.unreadCount) chat.raw.unreadCount = data.unreadCount;
            
            // Se tiver mensagens dentro do chat
            if (data.messages && Array.isArray(data.messages)) {
                extractChatsRecursively(data.messages, collectedChats);
            }
        }
    }

    // Caso 2: Objeto de Mensagem (Message Key)
    if (data.key && data.key.remoteJid) {
        const jid = normalizeJid(data.key.remoteJid);
        if (jid.includes('@') && !jid.includes('status@broadcast')) {
            if (!collectedChats.has(jid)) {
                // Cria chat placeholder se encontrarmos uma mensagem solta
                collectedChats.set(jid, { id: jid, raw: {}, messages: [] });
            }
            const chat = collectedChats.get(jid);
            
            // Verifica duplicidade
            const msgId = data.key.id;
            const exists = chat.messages.some((m: any) => m.key?.id === msgId);
            if (!exists) {
                chat.messages.push(data);
                // Tenta pescar o nome do contato da mensagem se não tivermos
                if (data.pushName && !chat.raw.pushName) chat.raw.pushName = data.pushName;
            }
        }
    }

    // Recursão profunda em chaves (exceto as já processadas)
    Object.keys(data).forEach(key => {
        if (key === 'key' || key === 'message') return; // Otimização
        if (typeof data[key] === 'object' && data[key] !== null) {
             extractChatsRecursively(data[key], collectedChats);
        }
    });
};

const mapStatus = (status: any): MessageStatus => {
    // Mapping Evolution API statuses to Internal
    // 1=PENDING, 2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ, 5=PLAYED
    // Also supports string values
    
    if (status === 'READ' || status === 'PLAYED' || status === 4 || status === 5) return MessageStatus.READ;
    if (status === 'DELIVERY_ACK' || status === 3) return MessageStatus.DELIVERED;
    if (status === 'SERVER_ACK' || status === 2) return MessageStatus.SENT;
    if (status === 'PENDING' || status === 1) return MessageStatus.SENT;
    if (status === 'ERROR' || status === 0) return MessageStatus.ERROR;
    
    return MessageStatus.SENT; // Default
};

const mapApiMessageToInternal = (apiMsg: any): Message | null => {
    if (!apiMsg) return null;
    const msgObj = apiMsg.message || apiMsg;
    
    // Extração robusta de texto
    const content = 
        msgObj.conversation || 
        msgObj.extendedTextMessage?.text || 
        msgObj.imageMessage?.caption ||
        msgObj.videoMessage?.caption ||
        msgObj.documentMessage?.caption ||
        (msgObj.imageMessage ? 'Imagem' : '') ||
        (msgObj.audioMessage ? 'Áudio' : '') ||
        (msgObj.stickerMessage ? 'Sticker' : '') ||
        (typeof msgObj.text === 'string' ? msgObj.text : '') || 
        '';
    
    // Ignora mensagens de protocolo ou vazias
    if (!content && !msgObj.imageMessage && !msgObj.audioMessage && !msgObj.stickerMessage && !msgObj.videoMessage && !msgObj.documentMessage) return null;

    const key = apiMsg.key || {};
    const ts = apiMsg.messageTimestamp || apiMsg.timestamp || Date.now();
    const tsNum = Number(ts);
    // Corrige timestamp em segundos para milissegundos se necessário
    const timestamp = new Date(tsNum * (tsNum < 2000000000 ? 1000 : 1));

    let type: any = 'text';
    if (msgObj.imageMessage) type = 'image';
    else if (msgObj.audioMessage) type = 'audio';
    else if (msgObj.videoMessage) type = 'video';
    else if (msgObj.stickerMessage) type = 'sticker';
    else if (msgObj.documentMessage) type = 'document';

    // Determina o autor real (importante para grupos ou chats com ID errado)
    const author = key.participant || key.remoteJid;

    return {
        id: key.id || `msg_${Math.random()}`,
        content,
        sender: key.fromMe ? 'agent' : 'user',
        timestamp,
        status: mapStatus(apiMsg.status),
        type,
        author: author // Salva o JID real para correção automática
    };
};

export const fetchChats = async (config: ApiConfig): Promise<Chat[]> => {
    if (config.isDemo || !config.baseUrl || !config.apiKey) return [];

    try {
        // 1. Descobre a instância correta para evitar 404
        const active = await findActiveInstance(config);
        const instanceName = active?.instanceName || config.instanceName;

        if (!instanceName) {
            // Silencioso para não poluir logs se desconectado
            return [];
        }

        let rawData: any = null;
        
        // 2. Tenta buscar os dados com FALLBACK ROBUSTO
        try {
            // Tenta POST findChats (V2 padrão)
            const res = await fetch(`${config.baseUrl}/chat/findChats/${instanceName}`, {
                method: 'POST',
                headers: { 'apikey': config.apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ where: {}, include: ['messages'] })
            });
            
            if (res.ok) {
                rawData = await res.json();
            } else {
                // Fallback: Se findChats falhar, busca mensagens diretamente via fetchMessages
                // console.log(`[fetchChats] findChats falhou (${res.status}), tentando fetchMessages...`);
                const resMsg = await fetch(`${config.baseUrl}/message/fetchMessages/${instanceName}`, {
                    method: 'POST',
                    headers: { 'apikey': config.apiKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ limit: 50 }) 
                });
                
                if (resMsg.ok) {
                    rawData = await resMsg.json();
                } else {
                    // Fallback Final: fetchAllMessages (V2 antigo)
                    const resAll = await fetch(`${config.baseUrl}/message/fetchAllMessages/${instanceName}`, {
                        method: 'GET',
                        headers: { 'apikey': config.apiKey }
                    });
                    if (resAll.ok) rawData = await resAll.json();
                }
            }
        } catch (e) {
            console.error('[fetchChats] Falha na requisição:', e);
            return [];
        }

        if (!rawData) return [];

        // console.log('[ZapFlow Parser] Dados recebidos. Processando...');

        // 3. Processa os dados usando o Parser Recursivo Universal
        const chatsMap = new Map<string, any>();
        extractChatsRecursively(rawData, chatsMap);
        
        const chatsArray = Array.from(chatsMap.values());
        // console.log(`[ZapFlow Parser] ${chatsArray.length} chats extraídos.`);

        // 4. Mapeia para o formato interno do Frontend
        return chatsArray.map((item: any) => {
            const messages: Message[] = item.messages
                .map((m: any) => mapApiMessageToInternal(m))
                .filter((m: any) => m !== null)
                .sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime());

            const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
            const name = item.raw.pushName || item.raw.name || item.id.split('@')[0];
            
            // Tratamento de ID para evitar números quebrados
            let contactNumber = item.id.split('@')[0];
            // Se for ID de grupo, mantém o ID original
            if (item.id.includes('@g.us')) contactNumber = item.id;

            return {
                id: item.id,
                contactName: name,
                contactNumber: contactNumber,
                contactAvatar: item.raw.profilePictureUrl || `https://ui-avatars.com/api/?name=${name}`,
                departmentId: null,
                unreadCount: item.raw.unreadCount || 0,
                lastMessage: lastMsg ? (lastMsg.type === 'text' ? lastMsg.content : `[${lastMsg.type}]`) : '',
                lastMessageTime: lastMsg ? lastMsg.timestamp : new Date(),
                status: 'open',
                messages: messages
            } as Chat;
        });

    } catch (error) {
        console.error("[fetchChats] Erro fatal:", error);
        return [];
    }
};