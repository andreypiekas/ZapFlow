import { ApiConfig, Chat, Message, MessageStatus, Department } from "../types";

// Serviço compatível com Evolution API v1.x/v2.x
// Compatível com versões: 2.3.4 (recomendada) e 2.3.6
// Documentação base: https://doc.evolution-api.com/
// 
// NOTA: A versão 2.3.6 apresenta alguns problemas conhecidos:
// - Problemas com QR Code (carregamento infinito)
// - Falhas no envio de mensagens para alguns números
// - Interrupção de webhooks (n8n, etc.)
// - imageMessage pode vir vazio ({}) ao buscar mensagens via REST API
// Recomendação: Use a versão 2.3.4 para maior estabilidade

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

// Função para limpar número de contato e garantir formato internacional
// WhatsApp precisa do número com código do país para reconhecer o contato
const cleanContactPhone = (phone: string): string => {
    let clean = phone.replace(/\D/g, '');
    
    // Se já tem código do país (12-13 dígitos), mantém como está
    if (clean.length >= 12) {
        return clean;
    }
    
    // Se tem 10-11 dígitos (número brasileiro sem código), adiciona 55
    // Isso garante formato internacional correto para o WhatsApp reconhecer
    if (clean.length === 10 || clean.length === 11) {
        return '55' + clean;
    }
    
    // Para outros casos, retorna como está
    return clean;
};

// --- CORE SERVICE ---

// Helper interno para encontrar instância ativa de forma blindada
export const findActiveInstance = async (config: ApiConfig) => {
    try {
        const response = await fetch(`${config.baseUrl}/instance/fetchInstances`, {
            method: 'GET',
            headers: { 'apikey': getAuthKey(config) }
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
    if (config.isDemo || !config.baseUrl || !getAuthKey(config)) return null;

    try {
        // Chama diretamente o endpoint de connectionState da Evolution API
        const response = await fetch(`${config.baseUrl}/instance/connectionState/${config.instanceName}`, {
            method: 'GET',
            headers: { 'apikey': getAuthKey(config) }
        });

        if (!response.ok) {
            // Se a instância não for encontrada, tenta buscar de fetchInstances
            if (response.status === 404) {
                const allInstances = await fetchAllInstances(config);
                const found = allInstances.find(i => i.instanceName === config.instanceName);
                if (found) {
                    return {
                        state: found.status,
                        name: found.instanceName,
                        isMismatch: false // Não há mismatch se achou na lista
                    };
                }
                return { state: 'not_found' };
            }
            return { state: 'error' };
        }

        const data = await response.json();
        const instanceState = data.instance?.state || data.state;
        const instanceName = data.instance?.instanceName || data.instanceName;

        // Verifica se o nome bate com a config
        const isMismatch = instanceName && instanceName !== config.instanceName;

        return {
            state: instanceState,
            name: instanceName,
            isMismatch
        };

    } catch (e) {
        console.error('[getDetailedInstanceStatus] Erro:', e);
        return { state: 'connecting' }; // Assume connecting on error to avoid red flash
    }
};

// Helper para obter a chave de autenticação correta
// Usa authenticationApiKey (AUTHENTICATION_API_KEY do servidor) para autenticar requisições HTTP
// Se não estiver configurada, usa apiKey como fallback (compatibilidade com versões antigas)
const getAuthKey = (config: ApiConfig): string => {
    return config.authenticationApiKey || config.apiKey || '';
};

// Helper para criar headers de autenticação com diferentes formatos
// Usa authenticationApiKey (AUTHENTICATION_API_KEY do servidor) para autenticar requisições HTTP
const createAuthHeaders = (config: ApiConfig, contentType: string = 'application/json'): Record<string, string> => {
    const headers: Record<string, string> = {
        'Content-Type': contentType
    };
    
    const authKey = getAuthKey(config);
    
    if (!authKey) {
        console.warn('[createAuthHeaders] ⚠️ Nenhuma chave de autenticação configurada');
    }
    
    // Formato padrão: apikey header (AUTHENTICATION_API_KEY do servidor)
    headers['apikey'] = authKey;
    
    return headers;
};

// Cria uma nova instância
export const createInstance = async (
    config: ApiConfig,
    instanceName: string,
    qrcode: boolean = true
): Promise<InstanceInfo | null> => {
    if (config.isDemo || !config.baseUrl) {
        console.warn('[createInstance] Configuração inválida:', {
            isDemo: config.isDemo,
            hasBaseUrl: !!config.baseUrl
        });
        return null;
    }
    
    // Valida se a AUTHENTICATION_API_KEY está configurada (necessária para autenticar requisições HTTP)
    const authKey = config.authenticationApiKey || config.apiKey;
    if (!authKey || !authKey.trim()) {
        console.error('[createInstance] ❌ AUTHENTICATION_API_KEY não configurada');
        if (typeof window !== 'undefined') {
            setTimeout(() => {
                alert('❌ Erro de Configuração\n\nA AUTHENTICATION_API_KEY não está configurada.\n\nPor favor:\n1. Vá em Configurações do ZapFlow\n2. Preencha o campo "AUTHENTICATION_API_KEY (Servidor)"\n3. Use a mesma chave do arquivo docker-compose.yml (variável AUTHENTICATION_API_KEY)\n4. Salve e tente novamente');
            }, 100);
        }
        return null;
    }
    
    try {
        // Usa authenticationApiKey (AUTHENTICATION_API_KEY do servidor) para autenticar requisições HTTP
        const headers = createAuthHeaders(config);
        
        // Gera token UUID automaticamente (formato esperado pelo Evolution API)
        // Se apiKey (token da instância) estiver configurado, usa ele; caso contrário, gera automaticamente
        const generateToken = () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16).toUpperCase();
            });
        };
        
        // Token da instância: usa apiKey se fornecido, senão gera automaticamente
        const instanceToken = config.apiKey && config.apiKey.trim() && config.apiKey !== authKey 
            ? config.apiKey 
            : generateToken();
        
        // Payload conforme documentação oficial da Evolution API v2
        // https://doc.evolution-api.com/v2/api-reference/instance-controller/create-instance-basic
        const payload: any = {
            instanceName,                    // required: Instance name
            integration: 'WHATSAPP-BAILEYS', // required: WhatsApp engine
            token: instanceToken,            // optional: Token da instância (gerado automaticamente se não fornecido)
            qrcode: qrcode                   // optional: Create QR Code automatically after creation
        };
        
        console.log('[createInstance] Tentando criar instância:', {
            baseUrl: config.baseUrl,
            instanceName,
            hasAuthenticationApiKey: !!config.authenticationApiKey,
            authKeyPreview: authKey.substring(0, 8) + '...',
            instanceTokenPreview: instanceToken.substring(0, 8) + '...',
            payload: { ...payload, token: instanceToken.substring(0, 8) + '...' }
        });
        
        const response = await fetch(`${config.baseUrl}/instance/create`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { message: errorText };
            }
            
            console.error('[createInstance] Erro na resposta:', {
                status: response.status,
                statusText: response.statusText,
                error: errorData,
                headers: Object.fromEntries(response.headers.entries())
            });
            
            // Se for 401, tenta formatos alternativos de autenticação
            if (response.status === 401) {
                console.warn('[createInstance] ⚠️ Erro 401 (Unauthorized) - AUTHENTICATION_API_KEY pode estar incorreta');
                console.log('[createInstance] Tentando formatos alternativos de autenticação...');
                
                // Tenta com Authorization Bearer
                const headersBearer = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authKey}`
                };
                
                const responseBearer = await fetch(`${config.baseUrl}/instance/create`, {
                    method: 'POST',
                    headers: headersBearer,
                    body: JSON.stringify(payload)
                });
                
                if (responseBearer.ok) {
                    const data = await responseBearer.json();
                    console.log('[createInstance] ✅ Sucesso com Authorization Bearer');
                    return {
                        instanceName: data.instanceName || instanceName,
                        status: data.status || 'qrcode',
                        qrcode: data.qrcode?.base64 || data.base64,
                        integration: data.integration || 'WHATSAPP-BAILEYS'
                    };
                }
                
                // Tenta com X-API-Key
                const headersXApiKey = {
                    'Content-Type': 'application/json',
                    'X-API-Key': authKey
                };
                
                const responseXApiKey = await fetch(`${config.baseUrl}/instance/create`, {
                    method: 'POST',
                    headers: headersXApiKey,
                    body: JSON.stringify(payload)
                });
                
                if (responseXApiKey.ok) {
                    const data = await responseXApiKey.json();
                    console.log('[createInstance] ✅ Sucesso com X-API-Key');
                    return {
                        instanceName: data.instanceName || instanceName,
                        status: data.status || 'qrcode',
                        qrcode: data.qrcode?.base64 || data.base64,
                        integration: data.integration || 'WHATSAPP-BAILEYS'
                    };
                }
                
                // Se todas as tentativas falharam, mostra mensagem clara
                console.error('[createInstance] ❌ Falha na autenticação após tentar todos os formatos');
                console.error('[createInstance] 💡 Verifique se a AUTHENTICATION_API_KEY nas configurações corresponde à do servidor Evolution API');
                console.error('[createInstance] 💡 A AUTHENTICATION_API_KEY deve ser exatamente igual à configurada no docker-compose.yml (variável AUTHENTICATION_API_KEY)');
                console.error('[createInstance] 💡 A mesma chave usada para fazer login no Evolution Manager deve ser usada aqui');
                
                // Mostra alerta para o usuário
                if (typeof window !== 'undefined') {
                    setTimeout(() => {
                        alert('❌ Erro de Autenticação\n\nA AUTHENTICATION_API_KEY configurada não corresponde à chave do servidor.\n\nPor favor:\n1. Abra o arquivo docker-compose.yml do servidor Evolution API\n2. Localize a variável AUTHENTICATION_API_KEY\n3. Vá em Configurações do ZapFlow\n4. Cole a mesma chave no campo "AUTHENTICATION_API_KEY (Servidor)"\n5. Salve e tente novamente\n\nA AUTHENTICATION_API_KEY deve ser exatamente igual à do docker-compose.yml!');
                    }, 100);
                }
            }
            
            return null;
        }
        
        const data = await response.json();
        console.log('[createInstance] ✅ Instância criada com sucesso');
        return {
            instanceName: data.instanceName || instanceName,
            status: data.status || 'qrcode',
            qrcode: data.qrcode?.base64 || data.base64,
            integration: data.integration || 'WHATSAPP-BAILEYS'
        };
    } catch (error) {
        console.error('[createInstance] Erro na requisição:', error);
        return null;
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
        console.log('[fetchRealQRCode] Instância não encontrada, tentando criar...');
        const created = await createInstance(config, targetInstance, true);
        if (created) {
            console.log('[fetchRealQRCode] Instância criada, aguardando inicialização...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            response = await fetch(`${config.baseUrl}/instance/connect/${targetInstance}`, {
                method: 'GET',
                headers: { 'apikey': getAuthKey(config) }
            });
        } else {
            console.error('[fetchRealQRCode] Falha ao criar instância');
            return null;
        }
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

export const sendRealMessage = async (config: ApiConfig, phone: string, text: string, replyToMessageId?: string, replyToRawMessage?: any) => {
  if (config.isDemo) {
    await new Promise(resolve => setTimeout(resolve, 800));
    return true;
  }

  const active = await findActiveInstance(config);
  const target = active?.instanceName || config.instanceName;
  
  // Formata o número (Adiciona 55 se faltar e tiver 10/11 dígitos)
  const cleanPhone = formatPhoneForApi(phone);

  try {
    // Valida que o texto não está vazio
    if (!text || text.trim().length === 0) {
      console.error(`[sendRealMessage] Erro: texto vazio para ${cleanPhone}`);
      return false;
    }

    // Payload simplificado para máxima compatibilidade com v2.x
    const payload: any = {
        number: cleanPhone,
        text: text.trim(),
        delay: 1200,
        linkPreview: false
    };

    // Adiciona referência à mensagem original se for uma resposta
    // Evolution API precisa do objeto completo da mensagem, não apenas o ID
    if (replyToMessageId) {
        if (replyToRawMessage && replyToRawMessage.key) {
            // Formato correto: objeto quoted com estrutura completa
            // A Evolution API espera o objeto completo com key e message
            payload.quoted = {
                key: {
                    remoteJid: replyToRawMessage.key.remoteJid || cleanPhone + '@s.whatsapp.net',
                    fromMe: replyToRawMessage.key.fromMe !== undefined ? replyToRawMessage.key.fromMe : false,
                    id: replyToRawMessage.key.id || replyToMessageId,
                    participant: replyToRawMessage.key.participant || undefined
                },
                message: replyToRawMessage.message || replyToRawMessage.messageTimestamp ? {
                    conversation: replyToRawMessage.message?.conversation || replyToRawMessage.content || ''
                } : undefined
            };
            console.log(`[sendRealMessage] Enviando resposta com objeto quoted completo:`, {
                remoteJid: payload.quoted.key.remoteJid,
                fromMe: payload.quoted.key.fromMe,
                id: payload.quoted.key.id
            });
        } else {
            // Fallback: tenta apenas com ID (pode não funcionar)
            payload.quotedMessageId = replyToMessageId;
            console.log(`[sendRealMessage] Enviando resposta com quotedMessageId (fallback): ${replyToMessageId}`);
        }
    }

    const response = await fetch(`${config.baseUrl}/message/sendText/${target}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': getAuthKey(config)
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[sendRealMessage] Falha API: ${response.status} para ${cleanPhone}`, errorText);
        
        // Tenta parsear o erro para verificar se é "exists: false"
        try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.response?.message?.[0]?.exists === false) {
                console.error(`[sendRealMessage] Número não existe no WhatsApp: ${cleanPhone}`);
                // Lança um erro específico para que o componente possa mostrar uma mensagem adequada
                throw new Error(`O número ${cleanPhone} não existe no WhatsApp ou não está registrado.`);
            }
        } catch (parseError) {
            // Se não conseguir parsear, continua com o tratamento normal
        }
        
        // Se quotedMessageId não funcionar, tenta sem ele
        if (replyToMessageId && response.status === 400) {
            console.log(`[sendRealMessage] Tentando enviar sem quotedMessageId...`);
            delete payload.quotedMessageId;
            const retryResponse = await fetch(`${config.baseUrl}/message/sendText/${target}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': getAuthKey(config)
                },
                body: JSON.stringify(payload)
            });
            if (retryResponse.ok) return true;
        }
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
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Remove o prefixo "data:image/jpeg;base64," ou similar, deixando apenas o base64 puro
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve(base64);
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
  if (config.isDemo) return true;

  const active = await findActiveInstance(config);
  const target = active?.instanceName || config.instanceName;
  
  // Formata o número
  const cleanPhone = formatPhoneForApi(phone);

  const base64 = await blobToBase64(mediaBlob);
    
  let endpoint = 'sendMedia';
  if (mediaType === 'audio') endpoint = 'sendWhatsAppAudio'; 

  // Evolution API v2.3.4 e v2.3.6 esperam mediatype no nível raiz, não dentro de mediaMessage
  const body: any = {
      number: cleanPhone,
      delay: 1200,
      mediatype: mediaType, // Propriedade no nível raiz (requerido pela API)
      media: base64,
      fileName: fileName
  };

  // Adiciona caption apenas se fornecido (não é obrigatório)
  if (caption && caption.trim()) {
      body.caption = caption;
  }

  try {
    const response = await fetch(`${config.baseUrl}/message/${endpoint}/${target}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': getAuthKey(config)
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

// Envia um contato via WhatsApp (vCard)
export const sendRealContact = async (
  config: ApiConfig,
  phone: string,
  contactName: string,
  contactPhone: string,
  contactEmail?: string
) => {
  if (config.isDemo) {
    await new Promise(resolve => setTimeout(resolve, 800));
    return true;
  }

  const active = await findActiveInstance(config);
  const target = active?.instanceName || config.instanceName;
  
  // Formata o número de destino (adiciona 55 se necessário)
  const cleanPhone = formatPhoneForApi(phone);
  
  // Limpa o número do contato SEM adicionar código do país
  // Preserva o formato exato fornecido pelo usuário
  const cleanContactPhoneNumber = cleanContactPhone(contactPhone);

  try {
    // Gera vCard format com número no formato internacional (+55...)
    // WhatsApp precisa do formato internacional com + para reconhecer o contato
    const vcardPhoneNumber = cleanContactPhoneNumber.startsWith('+') 
      ? cleanContactPhoneNumber 
      : `+${cleanContactPhoneNumber}`;
    
    let vcard = `BEGIN:VCARD\n`;
    vcard += `VERSION:3.0\n`;
    vcard += `FN:${contactName}\n`;
    vcard += `N:${contactName};;;;\n`;
    vcard += `TEL;TYPE=CELL:${vcardPhoneNumber}\n`;
    if (contactEmail) {
      vcard += `EMAIL:${contactEmail}\n`;
    }
    vcard += `END:VCARD`;

    // PRIORIDADE 1: Tenta enviar via vCard diretamente (formato mais compatível)
    // Formato vCard é o padrão do WhatsApp e tem melhor reconhecimento
    let payloadVCard = {
      number: cleanPhone,
      vcard: vcard,
      delay: 1200
    };

    let response = await fetch(`${config.baseUrl}/message/sendContact/${target}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': getAuthKey(config)
      },
      body: JSON.stringify(payloadVCard)
    });

    // PRIORIDADE 2: Se vCard falhar, tenta formato contact array
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[sendRealContact] sendContact com vCard falhou (${response.status}), tentando formato contact array:`, errorText);
      
      const payloadContact: any = {
        number: cleanPhone,
        contact: [
          {
            fullName: contactName,
            phoneNumber: cleanContactPhoneNumber
          }
        ],
        delay: 1200
      };

      response = await fetch(`${config.baseUrl}/message/sendContact/${target}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getAuthKey(config)
        },
        body: JSON.stringify(payloadContact)
      });
    }

    // PRIORIDADE 3: Fallback final - sendText com vCard (não recomendado, mas pode funcionar)
    if (!response.ok) {
      console.log(`[sendRealContact] sendContact falhou, tentando sendText com vCard como último recurso`);
      const payloadVCardWithText = {
        number: cleanPhone,
        text: `📇 ${contactName}`, // Campo obrigatório para sendText
        vcard: vcard,
        delay: 1200
      };
      response = await fetch(`${config.baseUrl}/message/sendText/${target}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': getAuthKey(config)
        },
        body: JSON.stringify(payloadVCardWithText)
      });
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[sendRealContact] Falha API: ${response.status}`, errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[sendRealContact] Erro de rede:", error);
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
            // Log removido para produção - muito verboso
            // console.log(`[ExtractChats] Array recebido com ${data.length} itens`);
            if (data.length > 0) {
                // Log removido para produção - muito verboso
                // console.log(`[ExtractChats] Primeiro item:`, {
                //     keys: Object.keys(data[0]).slice(0, 15),
                //     hasKey: !!data[0].key,
                //     keyRemoteJid: data[0].key?.remoteJid,
                //     hasId: !!data[0].id,
                //     id: data[0].id
                // });
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
                // Log removido para produção - muito verboso
                // console.log(`[ExtractChats] Chat criado: ${jid}, messages no raw: ${data.messages?.length || 0}, keys: ${Object.keys(data).join(', ')}`);
            }
            const chat = collectedChats.get(jid);
            // Atualiza metadata
            if (data.pushName) chat.raw.pushName = data.pushName;
            if (data.profilePictureUrl) chat.raw.profilePictureUrl = data.profilePictureUrl;
            if (data.unreadCount !== undefined) chat.raw.unreadCount = data.unreadCount;
            
            // Se tiver mensagens dentro do chat
            if (data.messages && Array.isArray(data.messages)) {
                // Log removido para produção - muito verboso
                // console.log(`[ExtractChats] Processando ${data.messages.length} mensagens do chat ${jid}`);
                extractChatsRecursively(data.messages, collectedChats, depth + 1);
            }
            
            // TAMBÉM procura mensagens em outros campos possíveis
            const possibleMessageFields = ['message', 'lastMessage', 'messages', 'conversation'];
            for (const field of possibleMessageFields) {
                if (data[field] && Array.isArray(data[field]) && data[field].length > 0) {
                    // Log removido para produção - muito verboso
                    // console.log(`[ExtractChats] Encontrado campo ${field} com ${data[field].length} itens no chat ${jid}`);
                    extractChatsRecursively(data[field], collectedChats, depth + 1);
                } else if (data[field] && typeof data[field] === 'object' && !Array.isArray(data[field])) {
                    // Pode ser uma única mensagem
                    // Log removido para produção - muito verboso
                    // console.log(`[ExtractChats] Encontrado campo ${field} como objeto único no chat ${jid}`);
                    extractChatsRecursively(data[field], collectedChats, depth + 1);
                }
            }
        }
    }

    // Caso 2: Objeto de Mensagem (Message Key)
    if (data.key && data.key.remoteJid) {
        let jid = normalizeJid(data.key.remoteJid);
        let actualJid = jid;
        
        // Se o JID é @lid, tenta usar remoteJidAlt (número real do contato)
        if (jid.includes('@lid') && data.key.remoteJidAlt) {
            const altJid = normalizeJid(data.key.remoteJidAlt);
            if (altJid.includes('@s.whatsapp.net')) {
                // Log removido para produção - muito verboso
                // console.log(`[ExtractChats] Usando remoteJidAlt para @lid: ${altJid} (original: ${jid})`);
                actualJid = altJid;
            }
        }
        
        if (actualJid.includes('@') && !actualJid.includes('status@broadcast')) {
            if (!collectedChats.has(actualJid)) {
                // Cria chat placeholder se encontrarmos uma mensagem solta
                collectedChats.set(actualJid, { id: actualJid, raw: {}, messages: [] });
                // Log removido para produção - muito verboso
                // console.log(`[ExtractChats] Criado chat para JID: ${actualJid}${jid !== actualJid ? ` (substituiu ${jid})` : ''}`);
            }
            const chat = collectedChats.get(actualJid);
            
            // Verifica duplicidade
            const msgId = data.key.id;
            const exists = chat.messages.some((m: any) => m.key?.id === msgId);
            if (!exists) {
                chat.messages.push(data);
                // Tenta pescar o nome do contato da mensagem se não tivermos
                if (data.pushName && !chat.raw.pushName) chat.raw.pushName = data.pushName;
                // Log removido para produção - muito verboso
                // console.log(`[ExtractChats] Mensagem adicionada ao chat ${actualJid}:`, {
                //     msgId: msgId,
                //     remoteJid: data.key.remoteJid,
                //     remoteJidAlt: data.key.remoteJidAlt,
                //     fromMe: data.key.fromMe,
                //     hasMessage: !!data.message
                // });
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
    
    // Log reduzido - apenas em caso de problema
    // const hasImageAtTopLevel = !!(apiMsg.imageMessage || apiMsg.message?.imageMessage);
    
    const msgObj = apiMsg.message || apiMsg;
    
    // Extração robusta de texto
    // Para mensagens de mídia, prioriza o caption, mas não define texto padrão se houver URL de mídia
    const hasImage = !!msgObj.imageMessage;
    const hasVideo = !!msgObj.videoMessage;
    const hasAudio = !!msgObj.audioMessage;
    const hasSticker = !!msgObj.stickerMessage;
    const hasDocument = !!msgObj.documentMessage;
    const hasMedia = hasImage || hasVideo || hasAudio || hasSticker || hasDocument;
    
    const content = 
        msgObj.conversation || 
        msgObj.extendedTextMessage?.text || 
        msgObj.imageMessage?.caption ||
        msgObj.videoMessage?.caption ||
        msgObj.documentMessage?.caption ||
        // Só define texto padrão se não houver URL de mídia (para não mostrar "Imagem" quando a imagem está sendo exibida)
        (hasImage && !msgObj.imageMessage?.url && !msgObj.imageMessage?.mediaUrl ? 'Imagem' : '') ||
        (hasAudio && !msgObj.audioMessage?.url && !msgObj.audioMessage?.mediaUrl ? 'Áudio' : '') ||
        (hasSticker && !msgObj.stickerMessage?.url && !msgObj.stickerMessage?.mediaUrl ? 'Sticker' : '') ||
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
    let mediaUrl: string | undefined = undefined;
    
    if (msgObj.imageMessage) {
        type = 'image';
        // Extrai URL da imagem - a Evolution API pode fornecer a URL em diferentes campos
        // Tenta múltiplas formas de obter a URL
        const imageMsg = msgObj.imageMessage;
        
        // Verifica se imageMessage está vazio (isso é comum na sincronização inicial)
        // A URL será atualizada quando os dados completos chegarem via WebSocket
        const isImageMessageEmpty = !imageMsg || (typeof imageMsg === 'object' && Object.keys(imageMsg).length === 0);
        const hasAnyUrl = !!(imageMsg?.url || imageMsg?.mediaUrl || imageMsg?.directPath || 
                            msgObj.url || msgObj.mediaUrl || apiMsg.url || apiMsg.mediaUrl);
        
        // Log apenas quando não tem URL E não está vazio (indicando possível problema real)
        // Comentado para reduzir verbosidade - descomente para debug
        // if (!hasAnyUrl && !isImageMessageEmpty) {
        //     console.warn('[mapApiMessageToInternal] ⚠️ imageMessage sem URL detectado:', {
        //         messageId: key?.id,
        //         imageMsgKeys: imageMsg ? Object.keys(imageMsg) : []
        //     });
        // }
        
        // Tenta extrair URL de múltiplas localizações
        // IMPORTANTE: A Evolution API pode retornar a URL em diferentes formatos:
        // 1. imageMsg.url (mais comum)
        // 2. imageMsg.mediaUrl
        // 3. imageMsg.directPath (caminho relativo)
        // 4. apiMsg.url (nível superior)
        // 5. Base64 data URL (data:image/...)
        // 6. apiMsg.message.imageMessage.url (estrutura aninhada completa)
        // 7. data.message.imageMessage.url (estrutura do Socket.IO)
        
        // Função auxiliar para verificar se uma string é uma URL válida
        const isValidUrl = (url: any): url is string => {
            return typeof url === 'string' && url.length > 0 && url.trim().length > 0;
        };
        
        // ✅ PRIORIDADE 1: Base64 do Webhook (quando Webhook Base64 está habilitado)
        // Se imageMessage tem base64, cria data URL diretamente (resolve problema de URLs ausentes)
        // O base64 pode vir:
        // 1. Diretamente no imageMessage.base64 (via WebSocket ou Webhook)
        // 2. Em apiMsg.base64 (nível superior)
        // 3. Em apiMsg.data?.imageMessage?.base64 (estrutura do Webhook)
        const base64Data = imageMsg?.base64 || 
                          (apiMsg as any).base64 || 
                          (apiMsg as any).data?.imageMessage?.base64 ||
                          (apiMsg as any).data?.base64;
        
        if (base64Data && typeof base64Data === 'string' && base64Data.length > 0) {
            const mimeType = imageMsg?.mimetype || (apiMsg as any).mimetype || 'image/jpeg';
            mediaUrl = `data:${mimeType};base64,${base64Data}`;
            // Log reduzido - apenas em debug se necessário
        }
        
        // Se não tem base64, tenta todas as possíveis localizações de URL
        if (!mediaUrl) {
            const possibleUrls = [
                // 1. Estrutura direta do imageMessage (mais comum)
                imageMsg.url,
                imageMsg.mediaUrl,
                imageMsg.directPath,
                imageMsg.media?.url,
                imageMsg.media?.mediaUrl,
                // 2. Estrutura do msgObj (apiMsg.message)
                msgObj.url,
                msgObj.mediaUrl,
                msgObj.directPath,
                // 3. Estrutura completa aninhada (apiMsg.message.imageMessage)
                apiMsg.message?.imageMessage?.url,
                apiMsg.message?.imageMessage?.mediaUrl,
                apiMsg.message?.imageMessage?.directPath,
                // 4. Estrutura no nível superior do apiMsg
                apiMsg.url,
                apiMsg.mediaUrl,
                apiMsg.directPath,
                apiMsg.imageMessage?.url, // Caso imageMessage esteja no nível superior
                apiMsg.imageMessage?.mediaUrl,
                apiMsg.imageMessage?.directPath,
                // 5. Estrutura de mensagens citadas
                apiMsg.contextInfo?.quotedMessage?.imageMessage?.url,
                apiMsg.contextInfo?.quotedMessage?.imageMessage?.mediaUrl,
                // 6. Casos especiais
                typeof imageMsg === 'string' ? imageMsg : undefined,
                // 7. Verifica também em data.message.imageMessage (estrutura do Socket.IO)
                (apiMsg as any).data?.message?.imageMessage?.url,
                (apiMsg as any).data?.message?.imageMessage?.mediaUrl,
                (apiMsg as any).data?.imageMessage?.url,
                (apiMsg as any).data?.imageMessage?.mediaUrl,
                // 8. Verifica em propriedades aninhadas adicionais
                (apiMsg as any).messageData?.imageMessage?.url,
                (apiMsg as any).messageData?.imageMessage?.mediaUrl
            ];
            
            // Encontra a primeira URL válida
            for (const url of possibleUrls) {
                if (isValidUrl(url)) {
                    mediaUrl = url;
                    break;
                }
            }
        }
        
        // Se ainda não encontrou, tenta busca recursiva na estrutura completa
        if (!mediaUrl) {
            const findUrlRecursive = (obj: any, depth: number = 0, maxDepth: number = 5, visited: Set<any> = new Set()): string | undefined => {
                if (!obj || depth > maxDepth) return undefined;
                
                // Evita loops infinitos
                if (visited.has(obj)) return undefined;
                visited.add(obj);
                
                // Verifica propriedades diretas comuns
                if (isValidUrl(obj.url)) return obj.url;
                if (isValidUrl(obj.mediaUrl)) return obj.mediaUrl;
                if (isValidUrl(obj.directPath)) return obj.directPath;
                
                // Se é um array, itera pelos elementos
                if (Array.isArray(obj)) {
                    for (const item of obj) {
                        const url = findUrlRecursive(item, depth + 1, maxDepth, visited);
                        if (url) return url;
                    }
                    return undefined;
                }
                
                // Se é um objeto, itera por todas as propriedades
                if (typeof obj === 'object') {
                    // Primeiro verifica propriedades específicas conhecidas (prioridade)
                    const priorityProps = ['imageMessage', 'message', 'media', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
                    for (const prop of priorityProps) {
                        if (obj[prop]) {
                            const url = findUrlRecursive(obj[prop], depth + 1, maxDepth, visited);
                            if (url) return url;
                        }
                    }
                    
                    // Depois itera por todas as outras propriedades
                    for (const key in obj) {
                        if (obj.hasOwnProperty(key) && !priorityProps.includes(key)) {
                            // Ignora propriedades que não são objetos/arrays ou que são muito grandes
                            const value = obj[key];
                            if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof RegExp)) {
                                const url = findUrlRecursive(value, depth + 1, maxDepth, visited);
                                if (url) return url;
                            }
                        }
                    }
                }
                
                return undefined;
            };
            
            mediaUrl = findUrlRecursive(apiMsg);
            // Log removido - muito verboso para produção
            // Se não encontrou URL mas imageMessage está vazio, isso é esperado (será atualizado via WebSocket)
        }
        
        // Log de normalização removido - muito verboso
        
        // Se ainda não encontrou URL mas tem directPath, tenta construir URL usando baseUrl
        if (!mediaUrl && imageMsg && typeof imageMsg === 'object') {
            const directPath = imageMsg.directPath || apiMsg.message?.imageMessage?.directPath || apiMsg.imageMessage?.directPath;
            if (directPath && typeof directPath === 'string' && directPath.length > 0) {
                // Se directPath começa com /, pode ser um caminho relativo que precisa de baseUrl
                // Mas geralmente directPath já é um caminho completo do WhatsApp
                // Tenta construir URL usando o padrão do WhatsApp: https://mmg.whatsapp.net + directPath
                if (directPath.startsWith('/')) {
                    // Remove o / inicial se houver e constrói URL completa
                    const cleanPath = directPath.startsWith('/') ? directPath.substring(1) : directPath;
                    mediaUrl = `https://mmg.whatsapp.net/${cleanPath}`;
                } else if (directPath.startsWith('http://') || directPath.startsWith('https://')) {
                    // Se directPath já é uma URL completa, usa diretamente
                    mediaUrl = directPath;
                }
            }
        }
        
        // Log temporário para debug - quando não encontra URL mas há imageMessage
        if (!mediaUrl && imageMsg && typeof imageMsg === 'object' && Object.keys(imageMsg).length > 0) {
            console.warn('[mapApiMessageToInternal] ⚠️ Imagem detectada mas URL não encontrada:', {
                messageId: key?.id,
                imageMsgKeys: Object.keys(imageMsg),
                imageMsgType: typeof imageMsg,
                imageMsgIsEmpty: Object.keys(imageMsg).length === 0,
                imageMsgContent: JSON.stringify(imageMsg).substring(0, 1000),
                imageMsgValues: Object.entries(imageMsg).slice(0, 10).map(([k, v]) => {
                    if (typeof v === 'string') {
                        return [k, v.length > 100 ? v.substring(0, 100) + '...' : v];
                    } else if (v && typeof v === 'object') {
                        return [k, `[object com ${Object.keys(v).length} chaves]`];
                    }
                    return [k, v];
                }),
                // Verifica valores específicos
                hasUrl: !!(imageMsg.url),
                hasMediaUrl: !!(imageMsg.mediaUrl),
                hasDirectPath: !!(imageMsg.directPath),
                urlValue: imageMsg.url ? imageMsg.url.substring(0, 100) : 'não encontrado',
                mediaUrlValue: imageMsg.mediaUrl ? imageMsg.mediaUrl.substring(0, 100) : 'não encontrado',
                directPathValue: imageMsg.directPath ? imageMsg.directPath.substring(0, 100) : 'não encontrado',
                hasMimetype: !!imageMsg.mimetype,
                mimetype: imageMsg.mimetype,
                hasFileLength: !!imageMsg.fileLength,
                fileLength: imageMsg.fileLength,
                hasJpegThumbnail: !!imageMsg.jpegThumbnail,
                // Verifica também na estrutura completa
                apiMsgHasUrl: !!(apiMsg.url || apiMsg.mediaUrl),
                msgObjHasUrl: !!(msgObj.url || msgObj.mediaUrl),
                apiMsgKeys: Object.keys(apiMsg).slice(0, 15)
            });
            
            // Log adicional com objeto completo para forçar visualização no console
            console.log('[mapApiMessageToInternal] 🔍 imageMessage COMPLETO:', imageMsg);
            console.log('[mapApiMessageToInternal] 🔍 apiMsg COMPLETO:', apiMsg);
        }
        // Quando imageMessage está vazio, isso é esperado na sincronização inicial
        // A URL será atualizada quando os dados completos chegarem via WebSocket
    } else if (msgObj.audioMessage) {
        type = 'audio';
        const audioMsg = msgObj.audioMessage;
        // ✅ PRIORIDADE: Base64 do Webhook (quando Webhook Base64 está habilitado)
        if (audioMsg?.base64 && typeof audioMsg.base64 === 'string' && audioMsg.base64.length > 0) {
            const mimeType = audioMsg.mimetype || 'audio/ogg; codecs=opus';
            mediaUrl = `data:${mimeType};base64,${audioMsg.base64}`;
        } else {
            mediaUrl = audioMsg.url || 
                       audioMsg.mediaUrl ||
                       audioMsg.directPath ||
                       undefined;
        }
    } else if (msgObj.videoMessage) {
        type = 'video';
        const videoMsg = msgObj.videoMessage;
        // ✅ PRIORIDADE: Base64 do Webhook (quando Webhook Base64 está habilitado)
        if (videoMsg?.base64 && typeof videoMsg.base64 === 'string' && videoMsg.base64.length > 0) {
            const mimeType = videoMsg.mimetype || 'video/mp4';
            mediaUrl = `data:${mimeType};base64,${videoMsg.base64}`;
        } else {
            mediaUrl = videoMsg.url || 
                       videoMsg.mediaUrl ||
                       videoMsg.directPath ||
                       undefined;
        }
    } else if (msgObj.stickerMessage) {
        type = 'sticker';
        const stickerMsg = msgObj.stickerMessage;
        // ✅ PRIORIDADE: Base64 do Webhook (quando Webhook Base64 está habilitado)
        if (stickerMsg?.base64 && typeof stickerMsg.base64 === 'string' && stickerMsg.base64.length > 0) {
            const mimeType = stickerMsg.mimetype || 'image/webp';
            mediaUrl = `data:${mimeType};base64,${stickerMsg.base64}`;
        } else {
            mediaUrl = stickerMsg.url || 
                       stickerMsg.mediaUrl ||
                       stickerMsg.directPath ||
                       undefined;
        }
    } else if (msgObj.documentMessage) {
        type = 'document';
        const docMsg = msgObj.documentMessage;
        // ✅ PRIORIDADE: Base64 do Webhook (quando Webhook Base64 está habilitado)
        if (docMsg?.base64 && typeof docMsg.base64 === 'string' && docMsg.base64.length > 0) {
            const mimeType = docMsg.mimetype || 'application/pdf';
            mediaUrl = `data:${mimeType};base64,${docMsg.base64}`;
        } else {
            mediaUrl = docMsg.url || 
                       docMsg.mediaUrl ||
                       docMsg.directPath ||
                       undefined;
        }
    }

    // Determina o autor real (importante para grupos ou chats com ID errado)
    // Sempre normaliza o JID para garantir formato correto
    let author: string | undefined = undefined;
    
    // Tenta múltiplas formas de obter o remoteJid
    let remoteJid = key?.remoteJid || 
                   key?.participant || 
                   apiMsg?.remoteJid ||
                   apiMsg?.key?.remoteJid ||
                   apiMsg?.jid ||
                   apiMsg?.chatId;
    
    // Se o remoteJid é @lid, tenta usar remoteJidAlt (número real do contato)
    if (remoteJid && remoteJid.includes('@lid')) {
        const remoteJidAlt = key?.remoteJidAlt || apiMsg?.remoteJidAlt;
        if (remoteJidAlt) {
            // Log removido para produção - muito verboso
            // console.log(`[MessageAuthor] Usando remoteJidAlt para @lid: ${remoteJidAlt} (original: ${remoteJid})`);
            remoteJid = remoteJidAlt;
        }
    }
    
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

    // Detecta se esta mensagem é uma resposta a outra mensagem
    // A Evolution API envia contextInfo.quotedMessage ou contextInfo.stanzaId quando é resposta
    let replyTo: { id: string; content: string; sender: 'user' | 'agent' | 'system'; whatsappMessageId?: string } | undefined = undefined;
    
    // Tenta múltiplas formas de detectar se é uma resposta
    const contextInfo = apiMsg.contextInfo || msgObj.contextInfo || msgObj.extendedTextMessage?.contextInfo;
    if (contextInfo) {
        // Formato 1: stanzaId (ID da mensagem original)
        const quotedMessageId = contextInfo.stanzaId || contextInfo.quotedMessageId;
        
        // Formato 2: quotedMessage (objeto com a mensagem original)
        const quotedMessage = contextInfo.quotedMessage;
        
        if (quotedMessageId || quotedMessage) {
            // Extrai conteúdo da mensagem original
            let quotedContent = '';
            if (quotedMessage) {
                quotedContent = quotedMessage.conversation || 
                               quotedMessage.extendedTextMessage?.text || 
                               quotedMessage.imageMessage?.caption ||
                               quotedMessage.videoMessage?.caption ||
                               quotedMessage.documentMessage?.caption ||
                               (quotedMessage.imageMessage ? 'Imagem' : '') ||
                               (quotedMessage.audioMessage ? 'Áudio' : '') ||
                               (quotedMessage.stickerMessage ? 'Sticker' : '') ||
                               '';
            }
            
            // Determina o sender da mensagem original
            // Se a mensagem atual é do cliente (fromMe: false) e tem participant no contextInfo,
            // significa que está respondendo a uma mensagem do agente (participant é o número do agente)
            // Se não tem participant, pode ser que esteja respondendo a outra mensagem do cliente
            // Mas geralmente: se tem participant, foi enviada pelo agente
            const hasParticipant = !!contextInfo.participant;
            // Se a mensagem atual é do cliente e tem participant, a original foi do agente
            const quotedFromMe = hasParticipant && !key.fromMe;
            const quotedSender: 'user' | 'agent' | 'system' = quotedFromMe ? 'agent' : 'user';
            
            replyTo = {
                id: quotedMessageId || `quoted_${Date.now()}`,
                content: quotedContent || 'Mensagem original',
                sender: quotedSender,
                whatsappMessageId: quotedMessageId
            };
            
            // Log removido para produção - muito verboso
            // console.log(`[mapApiMessageToInternal] ✅ Mensagem detectada como resposta: ID=${quotedMessageId}, conteúdo="${quotedContent.substring(0, 50)}", sender original=${quotedSender}`);
        }
    }

    return {
        id: key.id || `msg_${Math.random()}`,
        content,
        sender: key.fromMe ? 'agent' : 'user',
        timestamp,
        status: mapStatus(apiMsg.status),
        type,
        mediaUrl: mediaUrl, // URL da mídia (imagem, vídeo, áudio, documento, sticker)
        author: author, // Salva o JID real para correção automática (sempre normalizado)
        whatsappMessageId: key.id, // Salva o ID real do WhatsApp para respostas
        rawMessage: apiMsg, // Salva o objeto completo para respostas (Evolution API precisa do objeto completo)
        replyTo: replyTo // Informação sobre a mensagem que está sendo respondida
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
        // NOTA: Evolution API v2.3.6 tem bug que retorna erro 500 em alguns casos
        // Mas ainda tentamos buscar, pois pode funcionar em alguns cenários
        try {
            // Tenta POST findChats (V2 padrão) - SEM include messages para evitar erro 500
            // O erro "Cannot read properties of null (reading 'mediaUrl')" ocorre quando
            // a Evolution API tenta processar mensagens com mídia que tem mediaUrl null
            const res = await fetch(`${config.baseUrl}/chat/findChats/${instanceName}`, {
                method: 'POST',
                headers: { 'apikey': config.apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    where: {}, 
                    // Removido include: ['messages'] para evitar erro 500
                    // Mensagens serão buscadas separadamente quando necessário
                    limit: 1000
                })
            });
            
            if (res.ok) {
                rawData = await res.json();
            } else if (res.status === 500) {
                // Erro 500 conhecido - tenta buscar mensagens via endpoint alternativo
                console.warn(`[fetchChats] Evolution API retornou 500 para findChats/${instanceName}. Tentando buscar mensagens via endpoint alternativo...`);
                
                // Tenta buscar mensagens diretamente para construir chats
                try {
                    const resMsg = await fetch(`${config.baseUrl}/message/fetchMessages/${instanceName}`, {
                        method: 'POST',
                        headers: { 'apikey': config.apiKey, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ limit: 1000 }) 
                    });
                    
                    if (resMsg.ok) {
                        rawData = await resMsg.json();
                    } else {
                        // Se fetchMessages também falhar, retorna vazio mas não bloqueia
                        console.warn(`[fetchChats] Endpoint fetchMessages também falhou (${resMsg.status}). Continuando sem sincronização da Evolution API.`);
                        return [];
                    }
                } catch (msgError) {
                    console.warn(`[fetchChats] Erro ao tentar fetchMessages:`, msgError);
                    return [];
                }
            } else if (res.status === 404) {
                console.warn(`[fetchChats] Endpoint findChats não encontrado (404). Pulando sincronização.`);
                return [];
            } else {
                // Outros erros - tenta fallback
                try {
                    const resMsg = await fetch(`${config.baseUrl}/message/fetchMessages/${instanceName}`, {
                        method: 'POST',
                        headers: { 'apikey': config.apiKey, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ limit: 50 }) 
                    });
                    
                    if (resMsg.ok) {
                        rawData = await resMsg.json();
                    } else if (resMsg.status === 404) {
                        console.warn(`[fetchChats] Endpoint fetchMessages não encontrado (404). Pulando sincronização.`);
                        return [];
                    } else {
                        // Fallback Final: fetchAllMessages (V2 antigo)
                        try {
                            const resAll = await fetch(`${config.baseUrl}/message/fetchAllMessages/${instanceName}`, {
                                method: 'GET',
                                headers: { 'apikey': getAuthKey(config) }
                            });
                            if (resAll.ok) {
                                rawData = await resAll.json();
                            } else if (resAll.status === 404) {
                                console.warn(`[fetchChats] Endpoint fetchAllMessages não encontrado (404). Pulando sincronização.`);
                                return [];
                            }
                        } catch (fallbackError) {
                            console.warn(`[fetchChats] Erro no fallback fetchAllMessages:`, fallbackError);
                            return [];
                        }
                    }
                } catch (msgError) {
                    console.warn(`[fetchChats] Erro ao tentar fetchMessages:`, msgError);
                    return [];
                }
            }
        } catch (e) {
            console.error('[fetchChats] Falha na requisição:', e);
            return [];
        }

        if (!rawData) return [];

        // Debug: Log estrutura dos dados recebidos
        // Log removido para produção - muito verboso
        // console.log('[FetchChats] Dados brutos recebidos:', {
        //     isArray: Array.isArray(rawData),
        //     type: typeof rawData,
        //     keys: rawData && typeof rawData === 'object' ? Object.keys(rawData).slice(0, 20) : [],
        //     firstLevel: Array.isArray(rawData) && rawData.length > 0 ? {
        //         firstItemKeys: Object.keys(rawData[0]),
        //         firstItemType: typeof rawData[0],
        //         firstItem: rawData[0] // Log completo do primeiro item
        //     } : rawData && typeof rawData === 'object' ? {
        //         sampleKeys: Object.keys(rawData).slice(0, 10)
        //     } : null
        // });

        // 3. Processa os dados usando o Parser Recursivo Universal
        const chatsMap = new Map<string, any>();
        extractChatsRecursively(rawData, chatsMap);
        
        // Logs removidos para produção - muito verbosos
        // console.log(`[ExtractChats] Total de chats após extração: ${chatsMap.size}`);
        
        const chatsArray = Array.from(chatsMap.values());
        // console.log(`[FetchChats] Total de chats extraídos: ${chatsArray.length}`);
        // chatsArray.forEach((chat: any, idx: number) => {
        //     const msgCount = chat.messages?.length || 0;
        //     const hasValidId = !chat.id?.includes('cmin') && !chat.id?.includes('cmid') && !chat.id?.includes('cmio') && !chat.id?.includes('cmip') && !chat.id?.includes('cmit');
        //     console.log(`[FetchChats] Chat ${idx + 1}: ID=${chat.id}, Messages=${msgCount}, ValidID=${hasValidId}`);
        //     if (msgCount > 0) {
        //         const firstMsg = chat.messages[0];
        //         console.log(`[FetchChats] Primeira mensagem:`, {
        //             hasKey: !!firstMsg?.key,
        //             keyRemoteJid: firstMsg?.key?.remoteJid,
        //             remoteJid: firstMsg?.remoteJid,
        //             jid: firstMsg?.jid,
        //             keys: firstMsg ? Object.keys(firstMsg).slice(0, 10) : []
        //         });
        //     }
        // });

        // 4. Mapeia para o formato interno do Frontend
        const mappedChats = chatsArray.map((item: any) => {
            // Logs removidos para produção - muito verbosos
            // console.log(`[MapChat] Processando chat: ID=${item.id}, Messages=${item.messages?.length || 0}`);
            
            // Detecta se o ID é gerado (inclui todos os padrões: cmin*, cmid*, cmio*, cmip*, cmit*)
            const idIsGenerated = item.id.includes('cmin') || 
                                  item.id.includes('cmid') || 
                                  item.id.includes('cmio') ||
                                  item.id.includes('cmip') ||
                                  item.id.includes('cmit') ||
                                  !/^\d+@/.test(item.id) ||
                                  (item.id.split('@')[0].replace(/\D/g, '').length < 10 && !item.id.includes('@g.us'));
            
            // console.log(`[MapChat] ID gerado: ${idIsGenerated}, ID: ${item.id}`);
            
            // SOLUÇÃO DIRETA: Procura número válido PRIMEIRO no remoteJid do objeto raw
            let validJid: string | null = null;
            let validNumber: string | null = null;
            
            // PRIMEIRO: Tenta usar o remoteJid diretamente do objeto raw (se disponível)
            if (item.raw?.remoteJid) {
                const rawRemoteJid = normalizeJid(item.raw.remoteJid);
                if (rawRemoteJid.includes('@') && !rawRemoteJid.includes('@g.us') && !rawRemoteJid.includes('@lid')) {
                    const jidNum = rawRemoteJid.split('@')[0];
                    const digits = jidNum.replace(/\D/g, '');
                    
                    // Log removido para produção - muito verboso
                    // console.log(`[MapChat] remoteJid do raw: ${rawRemoteJid}, número: ${jidNum}, dígitos: ${digits.length}`);
                    
                    // Se é um número válido (>=10 dígitos)
                    if (/^\d+$/.test(digits) && digits.length >= 10) {
                        validJid = rawRemoteJid;
                        validNumber = jidNum;
                        // Log removido - apenas números válidos (não é necessário para análise)
                        // console.log(`[MapChat] ✅ Número válido encontrado no remoteJid do raw: ${validNumber} (${validJid})`);
                    }
                }
            }
            
            // SEGUNDO: Procura em TODAS as mensagens brutas pelo remoteJid válido
            if (!validNumber && item.messages && Array.isArray(item.messages)) {
                // Log removido para produção - muito verboso
                // console.log(`[MapChat] Procurando número válido em ${item.messages.length} mensagens brutas`);
                for (let i = 0; i < item.messages.length; i++) {
                    const rawMsg = item.messages[i];
                    // Tenta múltiplas formas de acessar o remoteJid
                    let remoteJid = rawMsg?.key?.remoteJid || 
                                   rawMsg?.remoteJid || 
                                   rawMsg?.jid ||
                                   rawMsg?.key?.participant;
                    
                    // Se o remoteJid é @lid, tenta usar remoteJidAlt (número real do contato)
                    if (remoteJid && remoteJid.includes('@lid')) {
                        const remoteJidAlt = rawMsg?.key?.remoteJidAlt || rawMsg?.remoteJidAlt;
                        if (remoteJidAlt) {
                            // Log removido para produção - muito verboso
                            // console.log(`[MapChat] Encontrado remoteJidAlt para @lid: ${remoteJidAlt} (original: ${remoteJid})`);
                            remoteJid = remoteJidAlt;
                        }
                    }
                    
                    // Log removido para produção - muito verboso
                    // console.log(`[MapChat] Mensagem ${i + 1}:`, {
                    //     hasKey: !!rawMsg?.key,
                    //     keyRemoteJid: rawMsg?.key?.remoteJid,
                    //     remoteJidAlt: rawMsg?.key?.remoteJidAlt,
                    //     remoteJid: rawMsg?.remoteJid,
                    //     jid: rawMsg?.jid,
                    //     participant: rawMsg?.key?.participant,
                    //     foundRemoteJid: remoteJid
                    // });
                    
                    if (remoteJid) {
                        const normalized = normalizeJid(remoteJid);
                        if (normalized.includes('@') && !normalized.includes('@g.us') && !normalized.includes('@lid')) {
                            const jidNum = normalized.split('@')[0];
                            const digits = jidNum.replace(/\D/g, '');
                            
                            // Log removido para produção - muito verboso
                            // console.log(`[MapChat] JID normalizado: ${normalized}, número: ${jidNum}, dígitos: ${digits.length}`);
                            
                            // Se é um número válido (10-14 dígitos)
                            // Aceita números com 10-14 dígitos (formatPhoneForApi adiciona DDI 55 se necessário)
                            // Números muito longos (>14 dígitos) podem ser IDs de lista de difusão
                            if (/^\d+$/.test(digits) && digits.length >= 10 && digits.length <= 14) {
                                validJid = normalized;
                                validNumber = jidNum;
                                // Log removido - apenas números válidos (não é necessário para análise)
                                // console.log(`[MapChat] ✅ Número válido encontrado: ${validNumber} (${validJid})`);
                                break; // Usa o primeiro número válido encontrado
                            } else if (digits.length > 14) {
                                console.warn(`[MapChat] ⚠️ Número muito longo (provavelmente ID de lista): ${jidNum} (${digits.length} dígitos)`);
                            } else {
                                console.warn(`[MapChat] ⚠️ Número inválido: ${jidNum} (${digits.length} dígitos, só números: ${/^\d+$/.test(digits)})`);
                            }
                        }
                    }
                }
            } else {
                // Log removido para produção - muito verboso
                // console.log(`[MapChat] ⚠️ Sem mensagens brutas para processar`);
            }
            
            // TERCEIRO: Tenta extrair do lastMessage se não encontrou nas mensagens do array
            if (!validNumber && item.raw?.lastMessage) {
                const lastMsg = item.raw.lastMessage;
                let lastMsgRemoteJid = lastMsg?.key?.remoteJid || lastMsg?.remoteJid || lastMsg?.jid;
                
                // Se o remoteJid é @lid, tenta usar remoteJidAlt
                if (lastMsgRemoteJid && lastMsgRemoteJid.includes('@lid')) {
                    const remoteJidAlt = lastMsg?.key?.remoteJidAlt || lastMsg?.remoteJidAlt;
                    if (remoteJidAlt) {
                        // Log removido para produção - muito verboso
                        // console.log(`[MapChat] Encontrado remoteJidAlt no lastMessage: ${remoteJidAlt} (original: ${lastMsgRemoteJid})`);
                        lastMsgRemoteJid = remoteJidAlt;
                    }
                }
                
                if (lastMsgRemoteJid) {
                    const normalized = normalizeJid(lastMsgRemoteJid);
                    if (normalized.includes('@') && !normalized.includes('@g.us') && !normalized.includes('@lid')) {
                        const jidNum = normalized.split('@')[0];
                        const digits = jidNum.replace(/\D/g, '');
                        // Valida comprimento: 10-14 dígitos (números muito longos podem ser IDs de lista)
                        if (/^\d+$/.test(digits) && digits.length >= 10 && digits.length <= 14) {
                            validJid = normalized;
                            validNumber = jidNum;
                            // Log removido - apenas números válidos (não é necessário para análise)
                            // console.log(`[MapChat] ✅ Número válido encontrado no lastMessage: ${validNumber} (${validJid})`);
                        } else if (digits.length > 14) {
                            console.warn(`[MapChat] ⚠️ Número muito longo no lastMessage (provavelmente ID de lista): ${jidNum} (${digits.length} dígitos)`);
                        }
                    }
                }
            }
            
            // QUARTO: Tenta extrair do campo message (objeto único) se disponível
            if (!validNumber && item.raw?.message) {
                const msg = item.raw.message;
                let msgRemoteJid = msg?.key?.remoteJid || msg?.remoteJid || msg?.jid;
                
                // Se o remoteJid é @lid, tenta usar remoteJidAlt
                if (msgRemoteJid && msgRemoteJid.includes('@lid')) {
                    const remoteJidAlt = msg?.key?.remoteJidAlt || msg?.remoteJidAlt;
                    if (remoteJidAlt) {
                        // Log removido para produção - muito verboso
                        // console.log(`[MapChat] Encontrado remoteJidAlt no campo message: ${remoteJidAlt} (original: ${msgRemoteJid})`);
                        msgRemoteJid = remoteJidAlt;
                    }
                }
                
                if (msgRemoteJid) {
                    const normalized = normalizeJid(msgRemoteJid);
                    if (normalized.includes('@') && !normalized.includes('@g.us') && !normalized.includes('@lid')) {
                        const jidNum = normalized.split('@')[0];
                        const digits = jidNum.replace(/\D/g, '');
                        // Valida comprimento: 10-14 dígitos (números muito longos podem ser IDs de lista)
                        if (/^\d+$/.test(digits) && digits.length >= 10 && digits.length <= 14) {
                            validJid = normalized;
                            validNumber = jidNum;
                            // Log removido - apenas números válidos (não é necessário para análise)
                            // console.log(`[MapChat] ✅ Número válido encontrado no campo message: ${validNumber} (${validJid})`);
                        } else if (digits.length > 14) {
                            console.warn(`[MapChat] ⚠️ Número muito longo no campo message (provavelmente ID de lista): ${jidNum} (${digits.length} dígitos)`);
                        }
                    }
                }
            }
            
            // Se não encontrou nas mensagens, verifica se o ID original é válido
            // IMPORTANTE: Não tenta extrair de @lid (já verificado acima)
            if (!validNumber && !idIsGenerated && !item.id.includes('@g.us') && !item.id.includes('@lid')) {
                const idNum = item.id.split('@')[0];
                const idDigits = idNum.replace(/\D/g, '');
                // Aceita números com 10-14 dígitos (formatPhoneForApi adiciona DDI 55 se necessário)
                // Números muito longos (>14 dígitos) podem ser IDs de lista de difusão
                if (/^\d+$/.test(idDigits) && idDigits.length >= 10 && idDigits.length <= 14) {
                    validJid = item.id;
                    validNumber = idNum;
                    // Log removido - apenas números válidos (não é necessário para análise)
                    // console.log(`[MapChat] ✅ Número válido encontrado no ID original: ${validNumber} (${validJid})`);
                } else if (idDigits.length > 14) {
                    console.warn(`[MapChat] ⚠️ ID original muito longo (provavelmente ID de lista): ${idNum} (${idDigits.length} dígitos)`);
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
                            // Log removido para produção - muito verboso
                            // console.log(`[MessageAuthorFix] Author adicionado: ${mapped.author} de ${msgRemoteJid}`);
                        } else if (validJid) {
                            // Se não tem na mensagem, usa o JID válido encontrado nas mensagens
                            mapped.author = validJid;
                            // Log removido para produção - muito verboso
                            // console.log(`[MessageAuthorFix] Author adicionado do validJid: ${mapped.author}`);
                        } else {
                            // Último recurso: usa o ID do chat se for válido
                            if (!item.id.includes('cmin') && !item.id.includes('cmid') && !item.id.includes('cmio') && !item.id.includes('cmip') && !item.id.includes('cmit') && !item.id.includes('@g.us')) {
                                mapped.author = item.id;
                                // Log removido para produção - muito verboso
                                // console.log(`[MessageAuthorFix] Author adicionado do chat ID: ${mapped.author}`);
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
                    // Log removido para produção - muito verboso
                    // console.log(`[ChatFix] Chat corrigido: ${item.id} -> ${chatId} (número: ${validNumber})`);
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

        // 5. FILTRA CHATS INVÁLIDOS antes de consolidar
        // Remove chats que não têm número válido, mensagens válidas ou são placeholders vazios
        const validChats = mappedChats.filter((chat: Chat) => {
            // Extrai número do contactNumber ou ID
            const contactNumber = chat.contactNumber?.replace(/\D/g, '') || '';
            const chatIdNumber = chat.id.split('@')[0].replace(/\D/g, '');
            
            // Validação mais rigorosa: números brasileiros devem ter:
            // - 11 dígitos (DDD + número celular: 11 98765-4321)
            // - 12-13 dígitos (DDI + DDD + número: 55 11 98765-4321)
            // Números de 10 dígitos são inválidos (faltam dígitos)
            const isValidContactNumber = contactNumber.length >= 11 && contactNumber.length <= 14 && /^\d+$/.test(contactNumber);
            const isValidChatIdNumber = chatIdNumber.length >= 11 && chatIdNumber.length <= 14 && /^\d+$/.test(chatIdNumber);
            const hasValidNumber = isValidContactNumber || isValidChatIdNumber;
            
            // Detecta IDs gerados (cmin*, cmid*, cmio*, cmip*, cmit*, cmiu*)
            const idIsGenerated = chat.id.includes('cmin') || 
                                  chat.id.includes('cmid') || 
                                  chat.id.includes('cmio') ||
                                  chat.id.includes('cmip') ||
                                  chat.id.includes('cmit') ||
                                  chat.id.includes('cmiu') ||
                                  chat.id.startsWith('chat_');
            
            // Verifica se tem mensagens válidas
            const hasValidMessages = chat.messages && chat.messages.length > 0;
            
            // Verifica se é grupo (grupos são válidos mesmo sem número de telefone)
            const isGroup = chat.id.includes('@g.us');
            
            // Chat é válido se:
            // 1. É um grupo, OU
            // 2. Tem número válido E (não tem ID gerado OU tem mensagens válidas)
            const isValid = isGroup || (hasValidNumber && (!idIsGenerated || hasValidMessages));
            
            if (!isValid) {
                // Log removido para produção - muito verboso
                // console.log(`[ChatFilter] Removendo chat inválido: ID=${chat.id}, contactNumber=${chat.contactNumber}, messages=${chat.messages?.length || 0}, hasValidNumber=${hasValidNumber}, idIsGenerated=${idIsGenerated}`);
            }
            
            return isValid;
        });
        
        // Log removido para produção - muito verboso
        // console.log(`[ChatFilter] Filtrados ${mappedChats.length} -> ${validChats.length} chats válidos`);
        
        // 6. Consolida chats duplicados (mesmo número = mesmo chat)
        const consolidatedChatsMap = new Map<string, Chat>();
        
        // Primeiro, tenta encontrar números válidos em todos os chats (incluindo LIDs)
        const chatNumberMap = new Map<string, string>(); // Mapeia chat.id -> número válido
        
        validChats.forEach((chat: Chat) => {
            // Extrai número do ID do chat se for válido
            const chatIdNumber = chat.id.split('@')[0].replace(/\D/g, '');
            // Validação mais rigorosa: números brasileiros devem ter pelo menos 11 dígitos
            if (chatIdNumber.length >= 11 && chatIdNumber.length <= 14 && /^\d+$/.test(chatIdNumber)) {
                chatNumberMap.set(chat.id, chatIdNumber);
            }
            
            // Extrai número do contactNumber
            const contactNumber = chat.contactNumber.replace(/\D/g, '');
            // Validação mais rigorosa: números brasileiros devem ter pelo menos 11 dígitos
            if (contactNumber.length >= 11 && contactNumber.length <= 14 && /^\d+$/.test(contactNumber)) {
                chatNumberMap.set(chat.id, contactNumber);
            }
            
            // Para LIDs, tenta encontrar correspondência em outros chats
            if (chat.id.includes('@lid')) {
                // Procura em outros chats por mensagens que referenciem este LID
                validChats.forEach((otherChat: Chat) => {
                    if (otherChat.id !== chat.id && otherChat.messages) {
                        for (const msg of otherChat.messages) {
                            // Verifica se a mensagem tem remoteJidAlt ou referência ao LID
                            const msgAuthor = msg.author || '';
                            if (msgAuthor.includes(chat.id.split('@')[0])) {
                                // Encontrou correspondência - usa o número do outro chat
                                const otherNumber = otherChat.contactNumber.replace(/\D/g, '');
                                // Validação mais rigorosa: números brasileiros devem ter pelo menos 11 dígitos
                                if (otherNumber.length >= 11 && otherNumber.length <= 14 && /^\d+$/.test(otherNumber)) {
                                    chatNumberMap.set(chat.id, otherNumber);
                                    // Log removido para produção - muito verboso
                                    // console.log(`[ChatMerge] LID ${chat.id} mapeado para número ${otherNumber} via mensagem`);
                                }
                            }
                        }
                    }
                });
            }
        });
        
        validChats.forEach((chat: Chat) => {
            // Determina a chave de consolidação
            let chatKey: string;
            
            // Prioridade 1: Número válido do contactNumber
            const contactNumber = chat.contactNumber.replace(/\D/g, '');
            if (contactNumber.length >= 10 && /^\d+$/.test(contactNumber)) {
                chatKey = contactNumber;
            }
            // Prioridade 2: Número encontrado no mapeamento (para LIDs e IDs gerados)
            else if (chatNumberMap.has(chat.id)) {
                chatKey = chatNumberMap.get(chat.id)!;
                // Log removido para produção - muito verboso
                // console.log(`[ChatMerge] Usando número mapeado para ${chat.id}: ${chatKey}`);
            }
            // Prioridade 3: Número do ID do chat se for válido
            else if (chat.id.includes('@') && !chat.id.includes('@g.us') && !chat.id.includes('@lid')) {
                const idNumber = chat.id.split('@')[0].replace(/\D/g, '');
                // Validação mais rigorosa: números brasileiros devem ter pelo menos 11 dígitos
                if (idNumber.length >= 11 && idNumber.length <= 14 && /^\d+$/.test(idNumber)) {
                    chatKey = idNumber;
                } else {
                    chatKey = chat.id; // Fallback: usa ID completo
                }
            }
            // Fallback: usa ID completo
            else {
                chatKey = chat.id;
            }
            
            if (consolidatedChatsMap.has(chatKey)) {
                // Chat já existe: faz merge
                const existingChat = consolidatedChatsMap.get(chatKey)!;
                
                // Merge de mensagens (remove duplicatas por ID)
                const allMessages = [...existingChat.messages, ...chat.messages];
                const uniqueMessages = new Map<string, Message>();
                allMessages.forEach(msg => {
                    if (!uniqueMessages.has(msg.id)) {
                        uniqueMessages.set(msg.id, msg);
                    }
                });
                existingChat.messages = Array.from(uniqueMessages.values())
                    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                
                // Atualiza metadados com os mais recentes/completos
                if (chat.contactName && (!existingChat.contactName || existingChat.contactName === existingChat.contactNumber)) {
                    existingChat.contactName = chat.contactName;
                }
                if (chat.contactAvatar && chat.contactAvatar !== `https://ui-avatars.com/api/?name=${chat.contactName}`) {
                    existingChat.contactAvatar = chat.contactAvatar;
                }
                existingChat.unreadCount = Math.max(existingChat.unreadCount, chat.unreadCount);
                
                // Atualiza última mensagem se a nova for mais recente (com verificação de diferença mínima para evitar atualizações por reordenação)
                const timeDiff = chat.lastMessageTime.getTime() - existingChat.lastMessageTime.getTime();
                if (timeDiff > 1000) { // Só atualiza se a diferença for maior que 1 segundo (evita atualizações por reordenação)
                    existingChat.lastMessage = chat.lastMessage;
                    existingChat.lastMessageTime = chat.lastMessageTime;
                }
                
                // Garante que o ID seja o mais correto (prefere número válido sobre ID gerado ou LID)
                const chatHasValidId = chat.id.includes('@') && 
                                      !chat.id.includes('cmin') && 
                                      !chat.id.includes('cmid') && 
                                      !chat.id.includes('cmio') &&
                                      !chat.id.includes('cmip') &&
                                      !chat.id.includes('cmit') &&
                                      !chat.id.includes('@lid') &&
                                      !chat.id.includes('@g.us');
                const existingHasInvalidId = existingChat.id.includes('cmin') || 
                                             existingChat.id.includes('cmid') || 
                                             existingChat.id.includes('cmio') ||
                                             existingChat.id.includes('cmip') ||
                                             existingChat.id.includes('cmit') ||
                                             existingChat.id.includes('@lid');
                
                if (chatHasValidId && existingHasInvalidId) {
                    existingChat.id = chat.id;
                    existingChat.contactNumber = chat.contactNumber;
                }
                
                // console.log(`[ChatMerge] Chats consolidados: ${chat.id} + ${existingChat.id} -> ${existingChat.id} (chave: ${chatKey})`); // Comentado para deixar console F12 mais limpo
            } else {
                // Primeira ocorrência: adiciona ao mapa
                // Se encontrou número válido, atualiza o ID e contactNumber
                if (chatNumberMap.has(chat.id) && chatKey !== chat.id) {
                    const mappedNumber = chatNumberMap.get(chat.id)!;
                    const mappedJid = `${mappedNumber}@s.whatsapp.net`;
                    chat.id = mappedJid;
                    chat.contactNumber = mappedNumber;
                    // console.log(`[ChatMerge] Chat ${chat.id} atualizado para número ${mappedNumber}`); // Comentado para deixar console F12 mais limpo
                }
                consolidatedChatsMap.set(chatKey, { ...chat });
            }
        });
        
        // Remove chats que são apenas IDs gerados sem número válido e sem mensagens
        const finalChats = Array.from(consolidatedChatsMap.values()).filter((chat: Chat) => {
            // Mantém chats com mensagens, número válido, ou grupos
            const hasMessages = chat.messages && chat.messages.length > 0;
            const hasValidNumber = chat.contactNumber.replace(/\D/g, '').length >= 10;
            const isGroup = chat.id.includes('@g.us');
            const isLid = chat.id.includes('@lid');
            
            // Remove apenas IDs gerados sem mensagens e sem número válido
            // Detecta todos os padrões de IDs gerados: cmin*, cmid*, cmio*, cmip*, cmit*
            if (!hasMessages && !hasValidNumber && !isGroup && !isLid) {
                const isGenerated = chat.id.includes('cmin') || 
                                   chat.id.includes('cmid') || 
                                   chat.id.includes('cmio') || 
                                   chat.id.includes('cmip') ||
                                   chat.id.includes('cmit');
                if (isGenerated) {
                    console.log(`[ChatMerge] Removendo chat sem número válido e sem mensagens: ${chat.id}`);
                    return false;
                }
            }
            return true;
        });
        
        // Log removido para produção - muito verboso
        // console.log(`[ChatMerge] Total de chats: ${validChats.length} -> ${finalChats.length} (após consolidação e filtragem)`);
        
        return finalChats;

    } catch (error) {
        console.error("[fetchChats] Erro fatal:", error);
        return [];
    }
};

// Busca mensagens de um chat específico
export const fetchChatMessages = async (config: ApiConfig, chatId: string, limit: number = 1000): Promise<Message[]> => {
    // Logs de debug reduzidos
    
    if (config.isDemo || !config.baseUrl || !config.apiKey) {
        // Log removido para produção - muito verboso (mantém apenas erros críticos)
        // console.log(`[fetchChatMessages] ❌ Retornando vazio: isDemo=${config.isDemo}, baseUrl=${!!config.baseUrl}, apiKey=${!!config.apiKey}`);
        return [];
    }

    try {
        let active;
        try {
            active = await findActiveInstance(config);
        } catch (err) {
            console.error(`[fetchChatMessages] ❌ Erro ao buscar instância:`, err);
            active = null;
        }
        
        const instanceName = active?.instanceName || config.instanceName;
        
        if (!instanceName) {
            console.error(`[fetchChatMessages] ❌ Retornando vazio: instância não encontrada`);
            return [];
        }

        // Extrai o número do JID (remove @s.whatsapp.net)
        const phoneNumber = chatId.split('@')[0];
        
        const messages: Message[] = [];
        
        // Função para processar mensagens recursivamente
        const processMessages = (items: any[]) => {
            if (!Array.isArray(items)) {
                return;
            }
            items.forEach((item, index) => {
                if (!item || typeof item !== 'object') {
                    return;
                }
                
                // Caso 1: Objeto de mensagem com key.remoteJid (formato padrão de mensagem)
                if (item.key && item.key.remoteJid) {
                    const normalizedJid = normalizeJid(item.key.remoteJid);
                    // Aceita mensagens que correspondem ao JID completo ou contém o número
                    if (normalizedJid === chatId || normalizedJid.includes(phoneNumber)) {
                        // Log para debug de imagens sem URL
                        if (item.message?.imageMessage || item.imageMessage) {
                            const hasUrl = !!(item.message?.imageMessage?.url || item.imageMessage?.url);
                            if (!hasUrl) {
                                console.warn('[fetchChatMessages] ⚠️ Imagem sem URL detectada na resposta REST:', {
                                    messageId: item.key?.id,
                                    hasMessageImageMessage: !!item.message?.imageMessage,
                                    hasImageMessage: !!item.imageMessage,
                                    imageMessageKeys: item.message?.imageMessage ? Object.keys(item.message.imageMessage) : 
                                                    item.imageMessage ? Object.keys(item.imageMessage) : [],
                                    fullItem: JSON.stringify(item).substring(0, 1000)
                                });
                            }
                        }
                        const mapped = mapApiMessageToInternal(item);
                        if (mapped) {
                            messages.push(mapped);
                        }
                    }
                    return; // Processou como mensagem, não precisa continuar
                }
                
                // Caso 2: Objeto de chat do findChats (tem remoteJid direto e messages dentro)
                if (item.remoteJid && typeof item.remoteJid === 'string') {
                    const normalizedJid = normalizeJid(item.remoteJid);
                    const normalizedChatId = normalizeJid(chatId);
                    const itemIdNumber = normalizedJid.split('@')[0];
                    
                    // Verifica se é o chat correto
                    const isMatchingChat = normalizedJid === normalizedChatId || 
                                          normalizedJid.includes(phoneNumber) || 
                                          item.id === chatId ||
                                          (itemIdNumber === phoneNumber && phoneNumber.length >= 10);
                    
                    if (isMatchingChat) {
                        // Se o chat tem mensagens, processa elas
                        if (item.messages && Array.isArray(item.messages) && item.messages.length > 0) {
                            processMessages(item.messages);
                        }
                    }
                    return; // Processou como chat, não precisa continuar
                }
                
                // Caso 3: Mensagem com remoteJid direto (sem key, mas tem estrutura de mensagem)
                if (item.remoteJid && item.message) {
                    const normalizedJid = normalizeJid(item.remoteJid);
                    if (normalizedJid === chatId || normalizedJid.includes(phoneNumber)) {
                        const mapped = mapApiMessageToInternal(item);
                        if (mapped) {
                            messages.push(mapped);
                        }
                    }
                    return; // Processou como mensagem alternativa, não precisa continuar
                }
                
                // Recursão em arrays aninhados e objetos
                if (Array.isArray(item)) {
                    processMessages(item);
                } else if (typeof item === 'object') {
                    // Procura arrays dentro do objeto que possam conter mensagens
                    Object.values(item).forEach(val => {
                        if (Array.isArray(val)) {
                            processMessages(val);
                        }
                    });
                }
            });
            
        };
        
        // Tenta múltiplos endpoints e formatos de query
        // NOTA IMPORTANTE: Problemas conhecidos com Evolution API 2.3.6:
        // - imageMessage pode vir vazio ({}) ao buscar mensagens via REST API (findChats)
        // - Incluir 'messages' no include pode causar erro 500 em ambas as versões (2.3.4 e 2.3.6)
        // - Mensagens de mídia podem não ter URL na resposta REST inicial
        // SOLUÇÃO: Mensagens serão atualizadas via WebSocket quando os dados completos chegarem
        // ou via busca automática usando fetchMediaUrlByMessageId quando messageId estiver disponível
        // 
        // Endpoint /message/fetchMessages não existe (retorna 404) em ambas as versões
        // NOTA: Removido include: ['messages'] de todos os endpoints para evitar erro 500
        // Versões afetadas: 2.3.4 e 2.3.6 (problema mais comum na 2.3.6)
        const endpoints = [
            // Endpoint 1: findChats com remoteJid (sem include messages para evitar erro 500)
            {
                url: `${config.baseUrl}/chat/findChats/${instanceName}`,
                body: { where: { remoteJid: chatId }, limit: 1000 },
                isFindChats: true
            },
            // Endpoint 2: findChats com remoteJid sem @s.whatsapp.net
            {
                url: `${config.baseUrl}/chat/findChats/${instanceName}`,
                body: { where: { remoteJid: phoneNumber }, limit: 1000 },
                isFindChats: true
            },
            // Endpoint 3: findChats sem filtro (busca todos e filtra depois) - último recurso
            {
                url: `${config.baseUrl}/chat/findChats/${instanceName}`,
                body: { where: {}, limit: 1000 },
                isFindChats: true
            }
        ];
        
        for (let i = 0; i < endpoints.length; i++) {
            const endpoint = endpoints[i];
            try {
                const res = await fetch(endpoint.url, {
                    method: endpoint.body ? 'POST' : 'GET',
                    headers: { 
                        'apikey': getAuthKey(config), 
                        'Content-Type': 'application/json' 
                    },
                    body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
                });
                
                if (res.ok) {
                    const data = await res.json();
                    
                    // Detecta se é resposta de findChats (objetos de chat com remoteJid)
                    // Usa a flag do endpoint ou detecta pela estrutura dos dados
                    const isFindChatsResponse = endpoint.isFindChats || 
                                                (Array.isArray(data) && data.length > 0 && 
                                                 data[0].remoteJid && 
                                                 !data[0].key?.remoteJid);
                    
                    if (isFindChatsResponse) {
                        const normalizedChatId = normalizeJid(chatId);
                        // Busca todos os chats que podem corresponder (não só o primeiro)
                        const matchingChats = data.filter((chat: any) => {
                            if (!chat) return false;
                            const chatRemoteJid = normalizeJid(chat.remoteJid || '');
                            const chatIdValue = chat.id || '';
                            
                            // Prioriza correspondência exata do remoteJid
                            if (chatRemoteJid === normalizedChatId) return true;
                            
                            // Tenta correspondência parcial do número (se o chatRemoteJid for um número)
                            const chatRemoteJidNumber = chatRemoteJid.split('@')[0];
                            if (chatRemoteJidNumber === phoneNumber && phoneNumber.length >= 10) return true;
                            
                            // Tenta correspondência exata do ID (para IDs gerados)
                            if (chatIdValue === chatId) return true;
                            
                            // Tenta correspondência do número no ID do chat (para IDs gerados que contêm o número)
                            const chatIdNumber = chatIdValue.split('@')[0];
                            if (chatIdNumber === phoneNumber && phoneNumber.length >= 10) return true;
                            
                            // Verifica se tem mensagem com remoteJid correspondente
                            if (chat.message && chat.message.key && chat.message.key.remoteJid) {
                                const msgJid = normalizeJid(chat.message.key.remoteJid);
                                if (msgJid === normalizedChatId || msgJid.includes(phoneNumber)) return true;
                            }
                            
                            // Verifica se tem lastMessage com remoteJid correspondente
                            if (chat.lastMessage && chat.lastMessage.key && chat.lastMessage.key.remoteJid) {
                                const msgJid = normalizeJid(chat.lastMessage.key.remoteJid);
                                if (msgJid === normalizedChatId || msgJid.includes(phoneNumber)) return true;
                            }
                            
                            return false;
                        });
                        
                        // Processa todos os chats correspondentes
                        if (matchingChats.length > 0) {
                            matchingChats.forEach((matchingChat: any) => {
                                // Tenta múltiplos formatos de mensagens
                                if (matchingChat.messages && Array.isArray(matchingChat.messages) && matchingChat.messages.length > 0) {
                                    processMessages(matchingChat.messages);
                                } else if (matchingChat.message && typeof matchingChat.message === 'object') {
                                    // Mensagem como objeto único (não array) - formato novo da API
                                    if (matchingChat.message.key && matchingChat.message.key.remoteJid) {
                                        const normalizedJid = normalizeJid(matchingChat.message.key.remoteJid);
                                        if (normalizedJid === chatId || normalizedJid.includes(phoneNumber)) {
                                            const mapped = mapApiMessageToInternal(matchingChat.message);
                                            if (mapped) messages.push(mapped);
                                        }
                                    } else {
                                        // Tenta processar como mensagem direta (sem key)
                                        const mapped = mapApiMessageToInternal(matchingChat.message);
                                        if (mapped) messages.push(mapped);
                                    }
                                } else if (matchingChat.lastMessage && typeof matchingChat.lastMessage === 'object') {
                                    // lastMessage como objeto único
                                    if (matchingChat.lastMessage.key && matchingChat.lastMessage.key.remoteJid) {
                                        const normalizedJid = normalizeJid(matchingChat.lastMessage.key.remoteJid);
                                        if (normalizedJid === chatId || normalizedJid.includes(phoneNumber)) {
                                            const mapped = mapApiMessageToInternal(matchingChat.lastMessage);
                                            if (mapped) messages.push(mapped);
                                        }
                                    } else {
                                        const mapped = mapApiMessageToInternal(matchingChat.lastMessage);
                                        if (mapped) messages.push(mapped);
                                    }
                                } else if (matchingChat.key && matchingChat.key.remoteJid) {
                                    // O próprio chat pode ser uma mensagem
                                    const normalizedJid = normalizeJid(matchingChat.key.remoteJid);
                                    if (normalizedJid === chatId || normalizedJid.includes(phoneNumber)) {
                                        const mapped = mapApiMessageToInternal(matchingChat);
                                        if (mapped) messages.push(mapped);
                                    }
                                }
                            });
                        } else {
                            // Se nenhum chat correspondente foi encontrado, tenta processar todos os itens da resposta
                            processMessages(data);
                        }
                    } else if (Array.isArray(data)) {
                        // Resposta direta é um array de mensagens
                        processMessages(data);
                    } else if (data.messages && Array.isArray(data.messages)) {
                        // Resposta tem campo messages
                        processMessages(data.messages);
                    } else if (data && typeof data === 'object') {
                        // Tenta encontrar mensagens em qualquer campo do objeto
                        Object.values(data).forEach(val => {
                            if (Array.isArray(val)) {
                                processMessages(val);
                            }
                        });
                    }
                    
                    // Se encontrou mensagens, para de tentar outros endpoints
                    if (messages.length > 0) {
                        // Log removido para produção - muito verboso
                        // console.log(`[fetchChatMessages] ✅ ${messages.length} mensagens encontradas`);
                        break;
                    }
                } else {
                    // Só loga erros 404 se não for fetchMessages (endpoint pode não existir em algumas versões)
                    if (res.status !== 404 || !endpoint.url.includes('/message/fetchMessages/')) {
                        const errorText = await res.text().catch(() => '');
                        let errorJson: any = { message: errorText || 'No error text' };
                        try {
                            if (errorText) {
                                errorJson = JSON.parse(errorText);
                            }
                        } catch {
                            errorJson = { message: errorText || 'No error text' };
                        }
                        console.warn(`[fetchChatMessages] Endpoint ${endpoint.url} retornou ${res.status}`);
                    }
                }
            } catch (err) {
                console.error(`[fetchChatMessages] Erro ao tentar ${endpoint.url}:`, err);
            }
        }
        
        const sortedMessages = messages.sort((a, b) => {
            const timeA = a.timestamp?.getTime() || 0;
            const timeB = b.timestamp?.getTime() || 0;
            const timeDiff = timeA - timeB;
            const absTimeDiff = Math.abs(timeDiff);
            
            // PRIORIDADE 1: Se timestamps são muito próximos (< 10 segundos) e senders diferentes
            // Sempre prioriza mensagens do agente (enviadas) para aparecer ANTES das do usuário (recebidas)
            // Isso garante que mensagens enviadas apareçam antes de recebidas quando timestamps estão próximos
            // independentemente de pequenas diferenças de sincronização de relógio
            if (absTimeDiff < 10000 && a.sender !== b.sender) {
                // Agente sempre vem antes do usuário quando timestamps estão próximos
                if (a.sender === 'agent' && b.sender === 'user') {
                    return -1; // Agente antes
                }
                // Usuário sempre vem depois do agente quando timestamps estão próximos
                if (a.sender === 'user' && b.sender === 'agent') {
                    return 1; // Usuário depois
                }
            }
            
            // PRIORIDADE 2: Para diferenças maiores, usa timestamp real
            if (absTimeDiff >= 10000) {
                return timeDiff;
            }
            
            // PRIORIDADE 3: Se timestamps são idênticos (timeDiff === 0) e mesmo sender, mantém ordem original
            // IMPORTANTE: Só mantém ordem original quando timeDiff === 0 exatamente
            // Se houver qualquer diferença (mesmo que muito pequena), usa timestamp para garantir ordem cronológica
            // Isso evita que mensagens recebidas rapidamente (1, 2, 3, 4, 5, 6) apareçam na ordem errada (6, 5, 4, 3, 2, 1)
            if (timeDiff === 0 && a.sender === b.sender) {
                return 0; // Mantém ordem original
            }
            
            // PRIORIDADE 4: Se chegou aqui, timestamps são muito próximos mas não idênticos, ou senders são diferentes
            // e a PRIORIDADE 1 não se aplicou. Nesses casos, usa o timestamp real para garantir a ordem cronológica.
            // Isso garante que mensagens recebidas rapidamente sejam sempre ordenadas corretamente por timestamp.
            return timeDiff;
        });
        // Log para diagnóstico
        if (sortedMessages.length === 0) {
            console.warn(`[fetchChatMessages] ⚠️ Nenhuma mensagem encontrada para ${chatId} após tentar ${endpoints.length} endpoints`);
        } else {
            console.log(`[fetchChatMessages] ✅ Encontrou ${sortedMessages.length} mensagens para ${chatId}`);
        }
        return sortedMessages;
    } catch (error) {
        console.error(`[fetchChatMessages] ❌ Erro ao buscar mensagens para ${chatId}:`, error);
        console.error(`[fetchChatMessages] Stack trace:`, error instanceof Error ? error.stack : 'N/A');
        return [];
    }
};

// Busca URL de mídia usando messageId quando imageMessage está vazio
export const fetchMediaUrlByMessageId = async (
    config: ApiConfig,
    messageId: string,
    remoteJid: string,
    mediaType: 'image' | 'video' | 'audio' | 'document' = 'image'
): Promise<string | null> => {
    if (config.isDemo || !config.baseUrl || !config.apiKey || !messageId || !remoteJid) {
        return null;
    }

    try {
        const active = await findActiveInstance(config);
        const instanceName = active?.instanceName || config.instanceName;
        
        if (!instanceName) {
            return null;
        }

        // ⚠️ LIMITAÇÃO CONHECIDA: Evolution API v2.3.4/v2.3.6
        // 
        // A Evolution API v2.3.4 tem um problema conhecido onde imageMessage vem vazio ({})
        // quando mensagens são buscadas via REST API do banco de dados.
        // 
        // URLs de mídia só estão disponíveis quando:
        // 1. Mensagem é recebida via WebSocket (em tempo real) ✅
        // 2. Mensagem é sincronizada diretamente do WhatsApp (não do banco) ✅
        // 
        // Endpoints REST que NÃO existem na v2.3.4:
        // - /message/downloadMedia/{instanceName} ❌ (retorna 404)
        // - /message/fetchMessages/{instanceName} ❌ (retorna 404)
        // 
        // SOLUÇÃO:
        // - Mensagens antigas do banco podem não ter URL inicialmente
        // - URLs serão atualizadas automaticamente quando chegarem via WebSocket
        // - Esta função tenta buscar via findChats como último recurso (pode não funcionar)
        
        // Tentativa única: Buscar via findChats (pode não retornar URLs porque vem do banco)

        // Buscar via findChats (pode não retornar URLs porque vem do banco)
        const response = await fetch(`${config.baseUrl}/chat/findChats/${instanceName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': getAuthKey(config)
            },
            body: JSON.stringify({
                where: { remoteJid: remoteJid },
                limit: 1000
            })
        });

        if (response.ok) {
            const data = await response.json();
            
            // Procura a mensagem com o messageId nos resultados
            const findMessageInResponse = (obj: any): any | null => {
                if (!obj || typeof obj !== 'object') return null;
                
                // Verifica se é uma mensagem com o ID correto
                if (obj.key?.id === messageId || obj.id === messageId) {
                    return obj;
                }
                
                // Verifica se tem mensagens aninhadas
                if (obj.messages && Array.isArray(obj.messages)) {
                    for (const msg of obj.messages) {
                        const found = findMessageInResponse(msg);
                        if (found) return found;
                    }
                }
                
                // Itera por todas as propriedades
                for (const key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        const found = findMessageInResponse(obj[key]);
                        if (found) return found;
                    }
                }
                
                return null;
            };

            const message = findMessageInResponse(data);
            
            if (message) {
                // Extrai URL do imageMessage se estiver presente
                const imageMsg = message.message?.imageMessage || message.imageMessage;
                if (imageMsg && (imageMsg.url || imageMsg.mediaUrl || imageMsg.directPath)) {
                    return imageMsg.url || imageMsg.mediaUrl || 
                           (imageMsg.directPath ? `https://mmg.whatsapp.net/${imageMsg.directPath.replace(/^\//, '')}` : null);
                }
            }
        }

        // Se não funcionou, retorna null
        // A URL será atualizada automaticamente quando a mensagem for recebida/atualizada via WebSocket
        // Isso é esperado para mensagens antigas do banco na Evolution API v2.3.4
        // Log reduzido - apenas em modo debug se necessário
        return null;
    } catch (error) {
        console.error('[fetchMediaUrlByMessageId] Erro ao buscar URL da mídia:', error);
        return null;
    }
};

// --- DEPARTMENT SELECTION MESSAGE ---

// Gera saudação baseada no horário do dia
export const getGreetingByTime = (): string => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
        return 'Bom dia';
    } else if (hour >= 12 && hour < 18) {
        return 'Boa tarde';
    } else {
        return 'Boa noite';
    }
};

// Gera mensagem de seleção de setores
export const generateDepartmentSelectionMessage = (departments: Department[]): string => {
    const greeting = getGreetingByTime();
    let message = `${greeting}! Favor selecionar o departamento para atendimento:\n\n`;
    
    departments.forEach((dept, index) => {
        message += `${index + 1} - ${dept.name}\n`;
    });
    
    return message.trim();
};

// Envia mensagem de seleção de setores
export const sendDepartmentSelectionMessage = async (
    config: ApiConfig,
    phone: string,
    departments: Department[]
): Promise<boolean> => {
    if (departments.length === 0) {
        console.warn('[sendDepartmentSelectionMessage] Nenhum departamento disponível');
        return false;
    }
    
    const message = generateDepartmentSelectionMessage(departments);
    return await sendRealMessage(config, phone, message);
};

// Processa resposta numérica do usuário e retorna o ID do departamento selecionado
export const processDepartmentSelection = (
    messageContent: string,
    departments: Department[]
): string | null => {
    // Remove espaços e converte para número
    const trimmed = messageContent.trim();
    const number = parseInt(trimmed, 10);
    
    // Verifica se é um número válido e está no range
    if (isNaN(number) || number < 1 || number > departments.length) {
        return null;
    }
    
    // Retorna o ID do departamento correspondente (índice é number - 1)
    return departments[number - 1]?.id || null;
};

// --- INSTANCE MANAGEMENT ---

export interface InstanceInfo {
    instanceName: string;
    status: 'open' | 'connecting' | 'close' | 'qrcode';
    qrcode?: string;
    integration?: string;
    token?: string; // Token da instância
}

// Lista todas as instâncias
export const fetchAllInstances = async (config: ApiConfig): Promise<InstanceInfo[]> => {
    if (config.isDemo || !config.baseUrl) return [];
    
    try {
        const response = await fetch(`${config.baseUrl}/instance/fetchInstances`, {
            method: 'GET',
            headers: { 'apikey': getAuthKey(config) }
        });
        
        if (!response.ok) return [];
        
        const rawData = await response.json();
        let instances: any[] = [];
        
        if (Array.isArray(rawData)) {
            instances = rawData;
        } else if (rawData && typeof rawData === 'object') {
            if (Array.isArray(rawData.instances)) instances = rawData.instances;
            else if (rawData.instance) instances = [rawData.instance];
            else if (rawData.instanceName) instances = [rawData];
        }
        
        return instances.map((item: any) => {
            const instance = item.instance || item;
            const statusValue = instance.status || instance.state || 'close';
            return {
                instanceName: instance.instanceName || instance.name || item.instanceName || item.name,
                status: (statusValue === 'open' || statusValue === 'connecting' || statusValue === 'close' || statusValue === 'qrcode') 
                    ? statusValue as 'open' | 'connecting' | 'close' | 'qrcode'
                    : 'close' as 'open' | 'connecting' | 'close' | 'qrcode',
                integration: instance.integration || 'WHATSAPP-BAILEYS',
                token: instance.token || instance.apikey || item.token || item.apikey
            };
        }).filter((i: InstanceInfo) => i.instanceName);
    } catch (error) {
        console.error('[fetchAllInstances] Erro:', error);
        return [];
    }
};

// Busca detalhes de uma instância específica (incluindo token)
export const fetchInstanceDetails = async (config: ApiConfig, instanceName: string): Promise<InstanceInfo | null> => {
    if (config.isDemo || !config.baseUrl || !instanceName) return null;
    
    try {
        // Busca todas as instâncias e filtra pela desejada
        const allInstances = await fetchAllInstances(config);
        const instance = allInstances.find(i => i.instanceName === instanceName);
        
        if (instance) {
            // Tenta buscar mais detalhes via endpoint fetchInstances se disponível
            try {
                const response = await fetch(`${config.baseUrl}/instance/fetchInstances`, {
                    method: 'GET',
                    headers: { 'apikey': getAuthKey(config) }
                });
                
                if (response.ok) {
                    const rawData = await response.json();
                    let instances: any[] = [];
                    
                    if (Array.isArray(rawData)) {
                        instances = rawData;
                    } else if (rawData && typeof rawData === 'object') {
                        if (Array.isArray(rawData.instances)) instances = rawData.instances;
                        else if (rawData.instance) instances = [rawData.instance];
                        else if (rawData.instanceName) instances = [rawData];
                    }
                    
                    const found = instances.find((item: any) => {
                        const inst = item.instance || item;
                        const name = inst.instanceName || inst.name || item.instanceName || item.name;
                        return name === instanceName;
                    });
                    
                    if (found) {
                        const inst = found.instance || found;
                        const statusValue = inst.status || inst.state || 'close';
                        return {
                            instanceName: inst.instanceName || inst.name || found.instanceName || found.name,
                            status: (statusValue === 'open' || statusValue === 'connecting' || statusValue === 'close' || statusValue === 'qrcode') 
                                ? statusValue as 'open' | 'connecting' | 'close' | 'qrcode'
                                : 'close' as 'open' | 'connecting' | 'close' | 'qrcode',
                            integration: inst.integration || 'WHATSAPP-BAILEYS',
                            token: inst.token || inst.apikey || found.token || found.apikey || instance.token
                        };
                    }
                }
            } catch (e) {
                // Log removido para produção - muito verboso
            }
            
            return instance;
        }
        
        return null;
    } catch (error) {
        console.error('[fetchInstanceDetails] Erro:', error);
        return null;
    }
};

// Atualiza o nome de uma instância (renomeia)
// Nota: A Evolution API pode não ter endpoint direto para renomear
// Esta função tenta atualizar, mas pode precisar criar nova e deletar antiga
export const updateInstanceName = async (config: ApiConfig, oldInstanceName: string, newInstanceName: string): Promise<boolean> => {
    if (config.isDemo || !config.baseUrl || !oldInstanceName || !newInstanceName || oldInstanceName === newInstanceName) {
        return false;
    }
    
    try {
        // Primeiro, busca os detalhes da instância antiga
        const instanceDetails = await fetchInstanceDetails(config, oldInstanceName);
        if (!instanceDetails) {
            console.error('[updateInstanceName] Instância não encontrada:', oldInstanceName);
            return false;
        }
        
        // Tenta usar endpoint de update se existir (algumas versões da Evolution API têm)
        try {
            const response = await fetch(`${config.baseUrl}/instance/update/${oldInstanceName}`, {
                method: 'PUT',
                headers: createAuthHeaders(config),
                body: JSON.stringify({ instanceName: newInstanceName })
            });
            
            if (response.ok) {
                console.log('[updateInstanceName] ✅ Nome atualizado com sucesso');
                return true;
            }
        } catch (e) {
            console.warn('[updateInstanceName] Endpoint PUT não disponível, tentando alternativa...');
        }
        
        // Se não funcionar, cria nova instância com o novo nome e mesmo token
        const token = instanceDetails.token || '';
        
        // Cria uma nova instância com o token da antiga
        const configWithToken = {
            ...config,
            apiKey: token // Usa o token da instância antiga
        };
        
        const created = await createInstance(configWithToken, newInstanceName, false);
        
        if (created) {
            console.log('[updateInstanceName] ✅ Nova instância criada com o mesmo token. Delete a antiga manualmente se necessário.');
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('[updateInstanceName] Erro:', error);
        return false;
    }
};

// Deleta uma instância
export const deleteInstance = async (config: ApiConfig, instanceName: string): Promise<boolean> => {
    if (config.isDemo || !config.baseUrl) return false;
    
    try {
        const response = await fetch(`${config.baseUrl}/instance/delete/${instanceName}`, {
            method: 'DELETE',
            headers: { 'apikey': getAuthKey(config) }
        });
        
        return response.ok;
    } catch (error) {
        console.error('[deleteInstance] Erro:', error);
        return false;
    }
};

// Obtém QR Code de uma instância específica
export const getInstanceQRCode = async (config: ApiConfig, instanceName: string): Promise<string | null> => {
    if (config.isDemo || !config.baseUrl || !config.apiKey) return null;
    
    try {
        const response = await fetch(`${config.baseUrl}/instance/connect/${instanceName}`, {
            method: 'GET',
            headers: { 'apikey': getAuthKey(config) }
        });
        
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
        console.error('[getInstanceQRCode] Erro:', error);
        return null;
    }
};

// Deleta um chat na Evolution API e no WhatsApp
export const deleteChat = async (config: ApiConfig, instanceName: string, remoteJid: string): Promise<boolean> => {
    if (config.isDemo || !config.baseUrl) return false;
    
    try {
        // Evolution API endpoint para deletar chat
        // Documentação: https://doc.evolution-api.com/v2/api-reference/chat-controller/delete-chat
        const response = await fetch(`${config.baseUrl}/chat/delete/${instanceName}`, {
            method: 'DELETE',
            headers: {
                'apikey': getAuthKey(config),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                remoteJid: remoteJid
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[deleteChat] Erro na Evolution API: ${response.status} - ${errorText}`);
            return false;
        }
        
        const result = await response.json();
        console.log(`[deleteChat] ✅ Chat deletado com sucesso: ${remoteJid}`);
        return result?.status === 'success' || response.ok;
    } catch (error) {
        console.error('[deleteChat] Erro ao deletar chat:', error);
        return false;
    }
};