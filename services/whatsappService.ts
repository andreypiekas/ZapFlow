import { ApiConfig, Chat, Message, MessageStatus } from "../types";

// Serviço compatível com Evolution API v1.x/v2.x
// Documentação base: https://doc.evolution-api.com/

// --- UTILS ---

export const normalizeJid = (jid: string | null | undefined): string => {
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
// Brasil: DDI (2) + DDD (2) + Número (8 fixo ou 9 celular) = 12 ou 13 dígitos
const formatPhoneForApi = (phone: string): string => {
    let clean = phone.replace(/\D/g, '');
    
    // Regra específica para Brasil (DDI 55)
    // Se tiver 10 (Fixo com DDD) ou 11 (Celular com DDD) dígitos, assume BR e adiciona 55
    if (clean.length === 10 || clean.length === 11) {
        clean = '55' + clean;
    }
    // Se já tiver 12 ou 13 dígitos e começar com 55, já está formatado
    // Se tiver 12 ou 13 dígitos mas não começar com 55, mantém como está (pode ser outro país)
    
    return clean;
};

// --- CORE SERVICE ---

// Helper interno para encontrar instância ativa de forma blindada
export const findActiveInstance = async (config: ApiConfig) => {
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
const extractChatsRecursively = (data: any, collectedChats = new Map<string, any>(), depth = 0) => {
    if (!data || typeof data !== 'object') return;
    
    // Limita profundidade para evitar loops infinitos
    if (depth > 10) return;

    if (Array.isArray(data)) {
        if (depth === 0) {
            console.log(`[ExtractChats] Array recebido com ${data.length} itens`);
            if (data.length > 0) {
                console.log(`[ExtractChats] Primeiro item:`, {
                    keys: Object.keys(data[0]).slice(0, 15),
                    hasKey: !!data[0].key,
                    keyRemoteJid: data[0].key?.remoteJid,
                    hasId: !!data[0].id,
                    id: data[0].id
                });
            }
        }
        data.forEach(item => extractChatsRecursively(item, collectedChats, depth + 1));
        return;
    }

    // Caso 1: Objeto de Chat (Metadata)
    // Ajusta condição: aceita qualquer objeto com id (não só com unreadCount ou pushName)
    if (data.id && typeof data.id === 'string') {
        const jid = normalizeJid(data.id);
        if (jid.includes('@') && !jid.includes('status@broadcast')) {
            if (!collectedChats.has(jid)) {
                collectedChats.set(jid, { id: jid, raw: data, messages: [] });
                console.log(`[ExtractChats] Chat criado: ${jid}, messages no raw: ${data.messages?.length || 0}, keys: ${Object.keys(data).join(', ')}`);
            }
            const chat = collectedChats.get(jid);
            // Atualiza metadata
            if (data.pushName) chat.raw.pushName = data.pushName;
            if (data.profilePictureUrl) chat.raw.profilePictureUrl = data.profilePictureUrl;
            if (data.unreadCount !== undefined) chat.raw.unreadCount = data.unreadCount;
            
            // Se tiver mensagens dentro do chat
            if (data.messages && Array.isArray(data.messages)) {
                console.log(`[ExtractChats] Processando ${data.messages.length} mensagens do chat ${jid}`);
                extractChatsRecursively(data.messages, collectedChats, depth + 1);
            }
            
            // TAMBÉM procura mensagens em outros campos possíveis
            const possibleMessageFields = ['message', 'lastMessage', 'messages', 'conversation'];
            for (const field of possibleMessageFields) {
                if (data[field] && Array.isArray(data[field]) && data[field].length > 0) {
                    console.log(`[ExtractChats] Encontrado campo ${field} com ${data[field].length} itens no chat ${jid}`);
                    extractChatsRecursively(data[field], collectedChats, depth + 1);
                } else if (data[field] && typeof data[field] === 'object' && !Array.isArray(data[field])) {
                    // Pode ser uma única mensagem
                    console.log(`[ExtractChats] Encontrado campo ${field} como objeto único no chat ${jid}`);
                    extractChatsRecursively(data[field], collectedChats, depth + 1);
                }
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
                console.log(`[ExtractChats] Criado chat para JID: ${jid}`);
            }
            const chat = collectedChats.get(jid);
            
            // Verifica duplicidade
            const msgId = data.key.id;
            const exists = chat.messages.some((m: any) => m.key?.id === msgId);
            if (!exists) {
                chat.messages.push(data);
                // Tenta pescar o nome do contato da mensagem se não tivermos
                if (data.pushName && !chat.raw.pushName) chat.raw.pushName = data.pushName;
                console.log(`[ExtractChats] Mensagem adicionada ao chat ${jid}:`, {
                    msgId: msgId,
                    remoteJid: data.key.remoteJid,
                    fromMe: data.key.fromMe,
                    hasMessage: !!data.message
                });
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

export const mapApiMessageToInternal = (apiMsg: any): Message | null => {
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
    // Sempre normaliza o JID para garantir formato correto
    let author: string | undefined = undefined;
    
    // Tenta múltiplas formas de obter o remoteJid
    const remoteJid = key?.remoteJid || 
                     key?.participant || 
                     apiMsg?.remoteJid ||
                     apiMsg?.key?.remoteJid ||
                     apiMsg?.jid ||
                     apiMsg?.chatId;
    
    if (remoteJid) {
        author = normalizeJid(remoteJid);
        // Log apenas para debug (pode remover depois)
        if (!author.includes('@')) {
            console.warn('[MessageAuthor] JID não normalizado corretamente:', remoteJid, '->', author);
        }
    } else {
        // Debug: Log estrutura completa se não encontrar
        console.warn('[MessageAuthor] Mensagem sem remoteJid:', { 
            hasKey: !!key, 
            keyRemoteJid: key?.remoteJid,
            keyParticipant: key?.participant,
            apiMsgRemoteJid: apiMsg?.remoteJid,
            apiMsgJid: apiMsg?.jid,
            keyKeys: key ? Object.keys(key) : [],
            apiMsgKeys: Object.keys(apiMsg).slice(0, 15)
        });
    }

    return {
        id: key.id || `msg_${Math.random()}`,
        content,
        sender: key.fromMe ? 'agent' : 'user',
        timestamp,
        status: mapStatus(apiMsg.status),
        type,
        author: author // Salva o JID real para correção automática (sempre normalizado)
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
            // Tenta POST findChats (V2 padrão) - busca com mensagens
            const res = await fetch(`${config.baseUrl}/chat/findChats/${instanceName}`, {
                method: 'POST',
                headers: { 'apikey': config.apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    where: {}, 
                    include: ['messages'],
                    limit: 100 // Limite de mensagens por chat
                })
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

        // Debug: Log estrutura dos dados recebidos
        console.log('[FetchChats] Dados brutos recebidos:', {
            isArray: Array.isArray(rawData),
            type: typeof rawData,
            keys: rawData && typeof rawData === 'object' ? Object.keys(rawData).slice(0, 20) : [],
            firstLevel: Array.isArray(rawData) && rawData.length > 0 ? {
                firstItemKeys: Object.keys(rawData[0]),
                firstItemType: typeof rawData[0],
                firstItem: rawData[0] // Log completo do primeiro item
            } : rawData && typeof rawData === 'object' ? {
                sampleKeys: Object.keys(rawData).slice(0, 10)
            } : null
        });

        // 3. Processa os dados usando o Parser Recursivo Universal
        const chatsMap = new Map<string, any>();
        extractChatsRecursively(rawData, chatsMap);
        
        console.log(`[ExtractChats] Total de chats após extração: ${chatsMap.size}`);
        
        const chatsArray = Array.from(chatsMap.values());
        console.log(`[FetchChats] Total de chats extraídos: ${chatsArray.length}`);
        chatsArray.forEach((chat: any, idx: number) => {
            const msgCount = chat.messages?.length || 0;
            const hasValidId = !chat.id?.includes('cmin') && !chat.id?.includes('cmid');
            console.log(`[FetchChats] Chat ${idx + 1}: ID=${chat.id}, Messages=${msgCount}, ValidID=${hasValidId}`);
            if (msgCount > 0) {
                const firstMsg = chat.messages[0];
                console.log(`[FetchChats] Primeira mensagem:`, {
                    hasKey: !!firstMsg?.key,
                    keyRemoteJid: firstMsg?.key?.remoteJid,
                    remoteJid: firstMsg?.remoteJid,
                    jid: firstMsg?.jid,
                    keys: firstMsg ? Object.keys(firstMsg).slice(0, 10) : []
                });
            }
        });

        // 4. Mapeia para o formato interno do Frontend
        return chatsArray.map((item: any) => {
            console.log(`[MapChat] Processando chat: ID=${item.id}, Messages=${item.messages?.length || 0}`);
            console.log(`[MapChat] Processando chat: ID=${item.id}, Messages=${item.messages?.length || 0}`);
            
            // Detecta se o ID é gerado
            const idIsGenerated = item.id.includes('cmin') || 
                                  item.id.includes('cmid') || 
                                  !/^\d+@/.test(item.id) ||
                                  (item.id.split('@')[0].replace(/\D/g, '').length < 10 && !item.id.includes('@g.us'));
            
            console.log(`[MapChat] ID gerado: ${idIsGenerated}, ID: ${item.id}`);
            
            // SOLUÇÃO DIRETA: Procura número válido PRIMEIRO no remoteJid do objeto raw
            let validJid: string | null = null;
            let validNumber: string | null = null;
            
            // PRIMEIRO: Tenta usar o remoteJid diretamente do objeto raw (se disponível)
            if (item.raw?.remoteJid) {
                const rawRemoteJid = normalizeJid(item.raw.remoteJid);
                if (rawRemoteJid.includes('@') && !rawRemoteJid.includes('@g.us') && !rawRemoteJid.includes('@lid')) {
                    const jidNum = rawRemoteJid.split('@')[0];
                    const digits = jidNum.replace(/\D/g, '');
                    
                    console.log(`[MapChat] remoteJid do raw: ${rawRemoteJid}, número: ${jidNum}, dígitos: ${digits.length}`);
                    
                    // Se é um número válido (>=10 dígitos)
                    if (/^\d+$/.test(digits) && digits.length >= 10) {
                        validJid = rawRemoteJid;
                        validNumber = jidNum;
                        console.log(`[MapChat] ✅ Número válido encontrado no remoteJid do raw: ${validNumber} (${validJid})`);
                    }
                }
            }
            
            // SEGUNDO: Procura em TODAS as mensagens brutas pelo remoteJid válido
            if (!validNumber && item.messages && Array.isArray(item.messages)) {
                console.log(`[MapChat] Procurando número válido em ${item.messages.length} mensagens brutas`);
                for (let i = 0; i < item.messages.length; i++) {
                    const rawMsg = item.messages[i];
                    // Tenta múltiplas formas de acessar o remoteJid
                    const remoteJid = rawMsg?.key?.remoteJid || 
                                     rawMsg?.remoteJid || 
                                     rawMsg?.jid ||
                                     rawMsg?.key?.participant;
                    
                    console.log(`[MapChat] Mensagem ${i + 1}:`, {
                        hasKey: !!rawMsg?.key,
                        keyRemoteJid: rawMsg?.key?.remoteJid,
                        remoteJid: rawMsg?.remoteJid,
                        jid: rawMsg?.jid,
                        participant: rawMsg?.key?.participant,
                        foundRemoteJid: remoteJid
                    });
                    
                    if (remoteJid) {
                        const normalized = normalizeJid(remoteJid);
                        if (normalized.includes('@') && !normalized.includes('@g.us') && !normalized.includes('@lid')) {
                            const jidNum = normalized.split('@')[0];
                            const digits = jidNum.replace(/\D/g, '');
                            
                            console.log(`[MapChat] JID normalizado: ${normalized}, número: ${jidNum}, dígitos: ${digits.length}`);
                            
                            // Se é um número válido (>=10 dígitos)
                            // Aceita números com 10+ dígitos (formatPhoneForApi adiciona DDI 55 se necessário)
                            if (/^\d+$/.test(digits) && digits.length >= 10) {
                                validJid = normalized;
                                validNumber = jidNum;
                                console.log(`[MapChat] ✅ Número válido encontrado: ${validNumber} (${validJid})`);
                                break; // Usa o primeiro número válido encontrado
                            } else {
                                console.log(`[MapChat] ⚠️ Número inválido: ${jidNum} (${digits.length} dígitos, só números: ${/^\d+$/.test(digits)})`);
                            }
                        }
                    }
                }
            } else {
                console.log(`[MapChat] ⚠️ Sem mensagens brutas para processar`);
            }
            
            // Se não encontrou nas mensagens, verifica se o ID original é válido
            if (!validNumber && !idIsGenerated && !item.id.includes('@g.us')) {
                const idNum = item.id.split('@')[0];
                const idDigits = idNum.replace(/\D/g, '');
                // Aceita números com 10+ dígitos (formatPhoneForApi adiciona DDI 55 se necessário)
                if (/^\d+$/.test(idDigits) && idDigits.length >= 10) {
                    validJid = item.id;
                    validNumber = idNum;
                }
            }
            
            // Mapeia mensagens garantindo que author seja sempre preenchido
            const messages: Message[] = item.messages
                .map((m: any) => {
                    const mapped = mapApiMessageToInternal(m);
                    if (!mapped) return null;
                    
                    // GARANTE author: se não tem, tenta extrair do remoteJid de múltiplas formas
                    if (!mapped.author) {
                        // Tenta todas as formas possíveis de obter remoteJid
                        const msgRemoteJid = m?.key?.remoteJid || 
                                           m?.key?.participant ||
                                           m?.remoteJid || 
                                           m?.jid ||
                                           m?.chatId ||
                                           item.id; // Fallback: usa o ID do chat
                        
                        if (msgRemoteJid) {
                            mapped.author = normalizeJid(msgRemoteJid);
                            console.log(`[MessageAuthorFix] Author adicionado: ${mapped.author} de ${msgRemoteJid}`);
                        } else if (validJid) {
                            // Se não tem na mensagem, usa o JID válido encontrado nas mensagens
                            mapped.author = validJid;
                            console.log(`[MessageAuthorFix] Author adicionado do validJid: ${mapped.author}`);
                        } else {
                            // Último recurso: usa o ID do chat se for válido
                            if (!item.id.includes('cmin') && !item.id.includes('@g.us')) {
                                mapped.author = item.id;
                                console.log(`[MessageAuthorFix] Author adicionado do chat ID: ${mapped.author}`);
                            }
                        }
                    }
                    
                    return mapped;
                })
                .filter((m: any) => m !== null)
                .sort((a: any, b: any) => a.timestamp.getTime() - b.timestamp.getTime());

            const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
            const name = item.raw.pushName || item.raw.name || (validNumber || item.id.split('@')[0]);
            
            // Define ID e contactNumber: SEMPRE usa número válido se encontrou
            let chatId: string;
            let contactNumber: string;
            
            if (item.id.includes('@g.us')) {
                // Grupo: mantém ID original
                chatId = item.id;
                contactNumber = item.id;
            } else if (validNumber && validJid) {
                // Encontrou número válido: USA ELE para ID e contactNumber
                chatId = validJid;
                contactNumber = validNumber;
                if (idIsGenerated) {
                    console.log(`[ChatFix] Chat corrigido: ${item.id} -> ${chatId} (número: ${validNumber})`);
                }
            } else {
                // Não encontrou número válido: mantém original (mesmo que gerado)
                chatId = item.id;
                contactNumber = item.id.split('@')[0];
            }

            return {
                id: chatId,
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

// Busca mensagens de um chat específico
export const fetchChatMessages = async (config: ApiConfig, chatId: string, limit: number = 100): Promise<Message[]> => {
    // FORÇA EXECUÇÃO DO CÓDIGO NOVO - Log único para identificar versão do código
    const VERSION_MARKER = `🚀🚀🚀 VERSÃO NOVA ${Date.now()} 🚀🚀🚀`;
    console.error(VERSION_MARKER); // Usa console.error para garantir que aparece
    console.log(`[fetchChatMessages] 🚀 VERSÃO NOVA - ${new Date().toISOString()}`);
    console.log(`[fetchChatMessages] ========== INÍCIO ==========`);
    console.log(`[fetchChatMessages] chatId: ${chatId}`);
    console.log(`[fetchChatMessages] isDemo: ${config.isDemo}`);
    console.log(`[fetchChatMessages] baseUrl: ${config.baseUrl}`);
    console.log(`[fetchChatMessages] apiKey: ${!!config.apiKey}`);
    
    if (config.isDemo || !config.baseUrl || !config.apiKey) {
        console.log(`[fetchChatMessages] ❌ Retornando vazio: isDemo=${config.isDemo}, baseUrl=${!!config.baseUrl}, apiKey=${!!config.apiKey}`);
        return [];
    }

    try {
        console.log(`[fetchChatMessages] 🔍 PASSO 1: Buscando instância ativa...`);
        let active;
        try {
            active = await findActiveInstance(config);
            console.log(`[fetchChatMessages] ✅ findActiveInstance retornou:`, active ? { instanceName: active.instanceName } : 'null');
        } catch (err) {
            console.error(`[fetchChatMessages] ❌ Erro ao buscar instância:`, err);
            active = null;
        }
        
        const instanceName = active?.instanceName || config.instanceName;
        console.log(`[fetchChatMessages] 🔍 PASSO 2: Instância encontrada: ${instanceName}`);
        console.log(`[fetchChatMessages] - De active: ${active?.instanceName || 'null'}`);
        console.log(`[fetchChatMessages] - De config: ${config.instanceName || 'null'}`);
        
        if (!instanceName) {
            console.log(`[fetchChatMessages] ❌ Retornando vazio: instância não encontrada`);
            return [];
        }

        // Extrai o número do JID (remove @s.whatsapp.net)
        const phoneNumber = chatId.split('@')[0];
        console.log(`[fetchChatMessages] 🔍 PASSO 3: Buscando mensagens para ${chatId} (número: ${phoneNumber})`);
        
        const messages: Message[] = [];
        
        // Função para processar mensagens recursivamente
        const processMessages = (items: any[]) => {
            if (!Array.isArray(items)) {
                console.log(`[fetchChatMessages] processMessages recebeu não-array:`, typeof items);
                return;
            }
            console.log(`[fetchChatMessages] processMessages processando ${items.length} itens`);
            items.forEach((item, index) => {
                if (item && item.key && item.key.remoteJid) {
                    const normalizedJid = normalizeJid(item.key.remoteJid);
                    // Aceita mensagens que correspondem ao JID completo ou contém o número
                    if (normalizedJid === chatId || normalizedJid.includes(phoneNumber)) {
                        const mapped = mapApiMessageToInternal(item);
                        if (mapped) {
                            messages.push(mapped);
                            console.log(`[fetchChatMessages] ✅ Mensagem encontrada [${index}]: ${mapped.content?.substring(0, 30)} (${mapped.sender})`);
                        } else {
                            console.log(`[fetchChatMessages] ⚠️ Mensagem não mapeada [${index}]:`, item.key?.remoteJid);
                        }
                    } else {
                        console.log(`[fetchChatMessages] Mensagem ignorada [${index}]: JID ${normalizedJid} não corresponde a ${chatId}`);
                    }
                } else {
                    console.log(`[fetchChatMessages] Item [${index}] sem key.remoteJid:`, item ? Object.keys(item).slice(0, 5) : 'null');
                }
                // Recursão em arrays aninhados
                if (Array.isArray(item)) {
                    processMessages(item);
                } else if (item && typeof item === 'object') {
                    Object.values(item).forEach(val => {
                        if (Array.isArray(val)) processMessages(val);
                    });
                }
            });
        };
        
        // Tenta múltiplos endpoints e formatos de query
        const endpoints = [
            // Endpoint 1: fetchMessages com remoteJid exato
            {
                url: `${config.baseUrl}/message/fetchMessages/${instanceName}`,
                body: { where: { remoteJid: chatId }, limit: limit }
            },
            // Endpoint 1b: fetchMessages com remoteJid sem @s.whatsapp.net
            {
                url: `${config.baseUrl}/message/fetchMessages/${instanceName}`,
                body: { where: { remoteJid: phoneNumber }, limit: limit }
            },
            // Endpoint 2: fetchMessages com like
            {
                url: `${config.baseUrl}/message/fetchMessages/${instanceName}`,
                body: { where: { remoteJid: { $like: `%${phoneNumber}%` } }, limit: limit }
            },
            // Endpoint 3: fetchAllMessages (sem filtro, busca todas e filtra depois)
            {
                url: `${config.baseUrl}/message/fetchAllMessages/${instanceName}`,
                body: null
            },
            // Endpoint 4: fetchMessages sem where (busca recentes)
            {
                url: `${config.baseUrl}/message/fetchMessages/${instanceName}`,
                body: { limit: limit }
            },
            // Endpoint 5: Tentar buscar via chat/findChats com include messages
            {
                url: `${config.baseUrl}/chat/findChats/${instanceName}`,
                body: { where: { id: chatId }, include: ['messages'], limit: 1 }
            }
        ];
        
        console.log(`[fetchChatMessages] Iniciando loop de ${endpoints.length} endpoints...`);
        
        for (let i = 0; i < endpoints.length; i++) {
            const endpoint = endpoints[i];
            try {
                console.log(`[fetchChatMessages] [${i+1}/${endpoints.length}] Tentando endpoint: ${endpoint.url}`, endpoint.body || 'GET');
                const res = await fetch(endpoint.url, {
                    method: endpoint.body ? 'POST' : 'GET',
                    headers: { 
                        'apikey': config.apiKey, 
                        'Content-Type': 'application/json' 
                    },
                    body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
                });
                
                console.log(`[fetchChatMessages] [${i+1}/${endpoints.length}] Resposta de ${endpoint.url}: status=${res.status}, ok=${res.ok}`);
                
                if (res.ok) {
                    const data = await res.json();
                    console.log(`[fetchChatMessages] [${i+1}/${endpoints.length}] 📦 Resposta do ${endpoint.url}:`, {
                        isArray: Array.isArray(data),
                        keys: data && typeof data === 'object' ? Object.keys(data).slice(0, 10) : [],
                        length: Array.isArray(data) ? data.length : (data?.messages?.length || 0),
                        firstItem: Array.isArray(data) && data.length > 0 ? {
                            keys: Object.keys(data[0]).slice(0, 10),
                            hasKey: !!data[0].key,
                            keyRemoteJid: data[0].key?.remoteJid,
                            sample: JSON.stringify(data[0]).substring(0, 200)
                        } : undefined,
                        fullResponse: JSON.stringify(data).substring(0, 500)
                    });
                    
                    if (Array.isArray(data)) {
                        console.log(`[fetchChatMessages] Processando array com ${data.length} itens`);
                        processMessages(data);
                    } else if (data.messages && Array.isArray(data.messages)) {
                        console.log(`[fetchChatMessages] Processando data.messages com ${data.messages.length} itens`);
                        processMessages(data.messages);
                    } else if (data && typeof data === 'object') {
                        console.log(`[fetchChatMessages] Processando objeto, procurando arrays em valores`);
                        // Tenta encontrar mensagens em qualquer campo do objeto
                        Object.values(data).forEach(val => {
                            if (Array.isArray(val)) {
                                console.log(`[fetchChatMessages] Encontrado array com ${val.length} itens`);
                                processMessages(val);
                            }
                        });
                    }
                    
                    // Se encontrou mensagens, para de tentar outros endpoints
                    if (messages.length > 0) {
                        console.log(`[fetchChatMessages] ✅ Encontradas ${messages.length} mensagens via ${endpoint.url}`);
                        break;
                    } else {
                        console.log(`[fetchChatMessages] ⚠️ Nenhuma mensagem encontrada em ${endpoint.url}`);
                    }
                } else {
                    const errorText = await res.text().catch(() => '');
                    console.log(`[fetchChatMessages] Endpoint ${endpoint.url} retornou ${res.status}:`, errorText.substring(0, 200));
                }
            } catch (err) {
                console.error(`[fetchChatMessages] Erro ao tentar ${endpoint.url}:`, err);
            }
        }
        
        const sortedMessages = messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        console.log(`[fetchChatMessages] ✅ Total de mensagens encontradas para ${chatId}: ${sortedMessages.length}`);
        return sortedMessages;
    } catch (error) {
        console.error(`[fetchChatMessages] ❌ Erro ao buscar mensagens para ${chatId}:`, error);
        console.error(`[fetchChatMessages] Stack trace:`, error instanceof Error ? error.stack : 'N/A');
        return [];
    }
};