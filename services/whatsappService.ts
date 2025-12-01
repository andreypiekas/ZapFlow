
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
            // Caso retorne um único objeto de instância sem estar em array
            // Alguns endpoints retornam { instance: { ... } } ou direto { instanceName: ... }
            if (data.instance || data.instanceName) {
                instances = [data];
            }
        }
        
        if (!instances || instances.length === 0) return null;

        // Helper seguro para pegar dados, independente da estrutura (v1 vs v2)
        const getStatus = (item: any) => {
            if (!item) return 'unknown';
            // Tenta ler status em vários níveis com segurança
            if (item.instance && item.instance.status) return item.instance.status;
            if (item.status) return item.status;
            return 'unknown';
        };
        
        const getName = (item: any) => {
            if (!item) return null;
            // Tenta ler nome em vários níveis
            if (item.instance && item.instance.instanceName) return item.instance.instanceName;
            if (item.instanceName) return item.instanceName;
            if (item.name) return item.name;
            return null;
        };

        // 1. Tenta achar uma CONECTADA ('open')
        const connected = instances.find((i: any) => i && getStatus(i) === 'open');
        if (connected) {
            const name = getName(connected);
            if (name) return { instanceName: name, status: 'open' };
        }

        // 2. Tenta achar uma CONECTANDO ('connecting')
        const connecting = instances.find((i: any) => i && getStatus(i) === 'connecting');
        if (connecting) {
            const name = getName(connecting);
            if (name) return { instanceName: name, status: 'connecting' };
        }

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
    // Remove :11, :12 etc
    const parts = jid.split(':');
    let user = parts[0];
    // Garante @s.whatsapp.net
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

    // Identifica Objeto de Chat (Metadata)
    if (data.id && typeof data.id === 'string' && (Array.isArray(data.messages) || data.unreadCount !== undefined || data.pushName)) {
        const jid = normalizeJid(data.id);
        if (jid.includes('@') && !jid.includes('status@broadcast')) {
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

    // Identifica Mensagem Solta (Message Object)
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

    // Continua descendo na árvore (exceto se já processamos msg ou chat para evitar loop)
    Object.keys(data).forEach(key => {
        // Evita recursão infinita em propriedades que já são conhecidas
        if (key === 'messages' || key === 'key') return; 
        
        if (typeof data[key] === 'object' && data[key] !== null) {
             extractChatsRecursively(data[key], collectedChats);
        }
    });
};

export const fetchChats = async (config: ApiConfig): Promise<Chat[]> => {
    if (config.isDemo || !config.baseUrl || !config.apiKey) {
        console.log('[fetchChats] Modo demo ou config inválida, retornando vazio');
        return [];
    }

    try {
        let instanceName = config.instanceName;
        // Usa o nome descoberto para garantir que a URL esteja certa
        const active = await findActiveInstance(config);
        if (active && active.instanceName) instanceName = active.instanceName;

        // Se mesmo assim não tiver nome, aborta para evitar 404
        if (!instanceName) {
            console.warn('[fetchChats] Nenhuma instância ativa encontrada.');
            return [];
        }

        console.log(`[fetchChats] Buscando chats da instância: ${instanceName}`);
        
        let rawData: any = null;
        let response: Response | null = null;
        
        // Tenta primeiro com POST (método correto para Evolution API v2.2.3)
        try {
            response = await fetch(`${config.baseUrl}/chat/findChats/${instanceName}`, {
                method: 'POST',
                headers: { 
                    'apikey': config.apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            if (response.ok) {
                rawData = await response.json();
                console.log('[fetchChats] POST funcionou!');
            } else if (response.status === 404) {
                // Se 404, tenta com GET (algumas versões podem usar GET)
                console.log('[fetchChats] POST retornou 404, tentando GET...');
                response = await fetch(`${config.baseUrl}/chat/findChats/${instanceName}`, {
                    method: 'GET',
                    headers: { 'apikey': config.apiKey }
                });
                
                if (response.ok) {
                    rawData = await response.json();
                    console.log('[fetchChats] GET funcionou!');
                } else {
                    // Tenta endpoint alternativo
                    console.log('[fetchChats] GET também falhou, tentando fetchAllChats...');
                    response = await fetch(`${config.baseUrl}/chat/fetchAllChats/${instanceName}`, {
                        method: 'GET',
                        headers: { 'apikey': config.apiKey }
                    });
                    
                    if (response.ok) {
                        rawData = await response.json();
                        console.log('[fetchChats] fetchAllChats funcionou!');
                    } else {
                        console.error(`[fetchChats] Todos os endpoints falharam. Último erro: ${response.status} ${response.statusText}`);
                        const errorText = await response.text();
                        console.error(`[fetchChats] Resposta de erro:`, errorText);
                        return [];
                    }
                }
            } else {
                console.error(`[fetchChats] Erro HTTP ${response.status}: ${response.statusText}`);
                const errorText = await response.text();
                console.error(`[fetchChats] Resposta de erro:`, errorText);
                return [];
            }
        } catch (error) {
            console.error('[fetchChats] Erro na requisição:', error);
            return [];
        }

        if (!rawData) {
            console.error('[fetchChats] Nenhum dado retornado da API');
            return [];
        }

        console.log(`[fetchChats] Resposta bruta da API (primeiros 1000 chars):`, JSON.stringify(rawData).substring(0, 1000));
        console.log(`[fetchChats] Tipo da resposta:`, Array.isArray(rawData) ? 'Array' : typeof rawData);

        const chatsMap = new Map<string, any>();
        
        // CORREÇÃO: Processa diretamente o array retornado pela Evolution API v2.2.3
        // A API retorna array de objetos com { id, remoteJid, pushName, profilePicUrl, ... }
        if (Array.isArray(rawData)) {
            console.log(`[fetchChats] Processando ${rawData.length} chats do formato direto da API`);
            rawData.forEach((chat: any) => {
                // CORREÇÃO: Usa remoteJid ao invés do ID interno do banco
                const jid = chat.remoteJid;
                if (jid && typeof jid === 'string' && jid.includes('@')) {
                    const normalized = normalizeJid(jid);
                    if (!normalized.includes('status@broadcast')) {
                        chatsMap.set(normalized, {
                            id: normalized,
                            raw: chat,
                            messages: [] // Mensagens serão buscadas separadamente
                        });
                    }
                }
            });
        } else {
            // Se não for array, tenta o parser recursivo
            extractChatsRecursively(rawData, chatsMap);
            
            // Se ainda não encontrou nada, tenta formato alternativo
            if (chatsMap.size === 0) {
                console.log('[fetchChats] Nenhum chat encontrado no scan recursivo, tentando formato alternativo...');

                // Tenta formato com wrapper: { chats: [...] }
                if (rawData.chats && Array.isArray(rawData.chats)) {
                    rawData.chats.forEach((chat: any) => {
                        const jid = chat.id || chat.remoteJid || chat.jid;
                        if (jid && typeof jid === 'string' && jid.includes('@')) {
                            const normalized = normalizeJid(jid);
                            if (!normalized.includes('status@broadcast')) {
                                chatsMap.set(normalized, {
                                    id: normalized,
                                    raw: chat,
                                    messages: chat.messages || []
                                });
                            }
                        }
                    });
                }
                // Tenta formato com data: { data: [...] }
                else if (rawData.data && Array.isArray(rawData.data)) {
                    rawData.data.forEach((chat: any) => {
                        const jid = chat.id || chat.remoteJid || chat.jid;
                        if (jid && typeof jid === 'string' && jid.includes('@')) {
                            const normalized = normalizeJid(jid);
                            if (!normalized.includes('status@broadcast')) {
                                chatsMap.set(normalized, {
                                    id: normalized,
                                    raw: chat,
                                    messages: chat.messages || []
                                });
                            }
                        }
                    });
                }
            }
        }
        
        const chatsArray = Array.from(chatsMap.values());

        console.log(`[ZapFlow Parser] Encontrados ${chatsArray.length} chats únicos na resposta da API.`);

        const mappedChats: Chat[] = chatsArray.map((item: any) => {
            // CORREÇÃO: Usa remoteJid do objeto raw (que vem da API) ao invés do ID interno
            const remoteJid = item.raw?.remoteJid || item.id;
            // Se o ID ainda for o interno do banco, tenta extrair do raw
            if (remoteJid && !remoteJid.includes('@')) {
                // Procura no rawData original pelo ID e pega o remoteJid
                const originalChat = Array.isArray(rawData) 
                    ? rawData.find((c: any) => c.id === remoteJid || c.remoteJid === remoteJid)
                    : null;
                if (originalChat && originalChat.remoteJid) {
                    const normalizedJid = normalizeJid(originalChat.remoteJid);
                    return {
                        id: normalizedJid,
                        contactName: originalChat.pushName || originalChat.name || normalizedJid.split('@')[0],
                        contactNumber: normalizedJid.split('@')[0],
                        contactAvatar: originalChat.profilePicUrl || `https://ui-avatars.com/api/?background=random&color=fff&name=${originalChat.pushName || 'U'}`,
                        departmentId: null,
                        unreadCount: 0,
                        lastMessage: '',
                        lastMessageTime: originalChat.updatedAt ? new Date(originalChat.updatedAt) : new Date(),
                        status: 'open' as const,
                        messages: [],
                        assignedTo: undefined
                    };
                }
            }
            
            const normalizedJid = normalizeJid(remoteJid);
            
            let messages: Message[] = [];
            // As mensagens já foram agrupadas no `extractChatsRecursively`
            if (item.messages && Array.isArray(item.messages)) {
                console.log(`[fetchChats] Chat ${normalizedJid}: ${item.messages.length} mensagens brutas encontradas`);
                messages = item.messages
                    .map((m: any) => mapApiMessageToInternal(m))
                    .filter((m: Message | null): m is Message => m !== null);
                console.log(`[fetchChats] Chat ${normalizedJid}: ${messages.length} mensagens mapeadas com sucesso`);
            } else {
                console.log(`[fetchChats] Chat ${normalizedJid}: Nenhuma mensagem encontrada (item.messages não é array ou está vazio)`);
            }

            // Ordena mensagens por timestamp
            messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
            
            // Busca dados do chat original na resposta da API
            const originalChat = Array.isArray(rawData) 
                ? rawData.find((c: any) => {
                    const cJid = normalizeJid(c.remoteJid || c.id);
                    return cJid === normalizedJid || c.id === item.id;
                })
                : null;
            
            const name = originalChat?.pushName || item.raw?.pushName || item.raw?.name || item.raw?.verifiedName || normalizedJid.split('@')[0];
            const avatarUrl = originalChat?.profilePicUrl || item.raw?.profilePictureUrl || item.raw?.ppUrl || item.raw?.profilePicUrl;

            return {
                id: normalizedJid,
                contactName: name || 'Desconhecido',
                contactNumber: normalizedJid.split('@')[0],
                contactAvatar: avatarUrl || `https://ui-avatars.com/api/?background=random&color=fff&name=${name || 'U'}`,
                departmentId: null,
                unreadCount: originalChat?.unreadCount || item.raw?.unreadCount || 0,
                lastMessage: lastMsg ? (lastMsg.type === 'text' ? lastMsg.content : `[${lastMsg.type}]`) : '',
                lastMessageTime: lastMsg ? lastMsg.timestamp : (originalChat?.updatedAt ? new Date(originalChat.updatedAt) : new Date()),
                status: 'open' as const,
                messages: messages,
                assignedTo: undefined
            };
        }).filter((c: Chat | null): c is Chat => c !== null);

        console.log(`[fetchChats] Total de ${mappedChats.length} chats mapeados e retornados`);
        mappedChats.forEach(chat => {
            console.log(`[fetchChats] Chat: ${chat.contactName} (${chat.id}) - ${chat.messages.length} mensagens`);
        });

        // Se os chats não têm mensagens, tenta buscar mensagens individualmente
        if (mappedChats.length > 0 && mappedChats.every(c => c.messages.length === 0)) {
            console.log('[fetchChats] Nenhum chat tem mensagens, tentando buscar mensagens individualmente...');
            for (const chat of mappedChats) {
                try {
                    // Tenta diferentes endpoints para buscar mensagens
                    const endpoints = [
                        `/message/fetchMessages/${instanceName}/${encodeURIComponent(chat.id)}`,
                        `/chat/fetchMessages/${instanceName}/${encodeURIComponent(chat.id)}`,
                        `/message/fetchMessages/${instanceName}?remoteJid=${encodeURIComponent(chat.id)}`,
                    ];
                    
                    let messagesData: any = null;
                    for (const endpoint of endpoints) {
                        try {
                            const messagesResponse = await fetch(`${config.baseUrl}${endpoint}`, {
                                method: 'GET',
                                headers: { 'apikey': config.apiKey }
                            });
                            
                            if (messagesResponse.ok) {
                                messagesData = await messagesResponse.json();
                                console.log(`[fetchChats] Endpoint ${endpoint} funcionou para ${chat.id}`);
                                break;
                            }
                        } catch (e) {
                            // Continua tentando próximo endpoint
                        }
                    }
                    
                    if (messagesData) {
                        console.log(`[fetchChats] Mensagens encontradas para ${chat.id}:`, messagesData);
                        
                        // Processa mensagens se encontradas
                        let messagesArray: any[] = [];
                        if (Array.isArray(messagesData)) {
                            messagesArray = messagesData;
                        } else if (messagesData.messages && Array.isArray(messagesData.messages)) {
                            messagesArray = messagesData.messages;
                        } else if (messagesData.data && Array.isArray(messagesData.data)) {
                            messagesArray = messagesData.data;
                        }
                        
                        if (messagesArray.length > 0) {
                            const mappedMessages = messagesArray
                                .map((m: any) => mapApiMessageToInternal(m))
                                .filter((m: Message | null): m is Message => m !== null);
                            chat.messages = mappedMessages;
                            chat.messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                            console.log(`[fetchChats] ${mappedMessages.length} mensagens adicionadas ao chat ${chat.id}`);
                        }
                    } else {
                        console.log(`[fetchChats] Nenhum endpoint de mensagens funcionou para ${chat.id}`);
                    }
                } catch (err) {
                    console.warn(`[fetchChats] Erro ao buscar mensagens do chat ${chat.id}:`, err);
                }
            }
        }

        return mappedChats;

    } catch (error) {
        console.error("[fetchChats] Erro ao sincronizar chats:", error);
        if (error instanceof Error) {
            console.error("[fetchChats] Stack trace:", error.stack);
        }
        return [];
    }
};

const mapApiMessageToInternal = (apiMsg: any): Message | null => {
    if (!apiMsg) {
        console.warn('[mapApiMessageToInternal] Mensagem nula ou indefinida');
        return null;
    }

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
        console.warn('[mapApiMessageToInternal] Mensagem ignorada (sem conteúdo ou mídia):', JSON.stringify(apiMsg).substring(0, 200));
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
