import React, { useState, useEffect, useMemo } from 'react';
import { Chat, Department, ViewState, ApiConfig, User, UserRole, QuickReply, Workflow, Contact, ChatbotConfig } from './types';
import { INITIAL_CHATS, INITIAL_DEPARTMENTS, INITIAL_USERS, INITIAL_QUICK_REPLIES, INITIAL_WORKFLOWS, MOCK_GOOGLE_CONTACTS, INITIAL_CHATBOT_CONFIG } from './constants';
import Login from './components/Login';
import ChatInterface from './components/ChatInterface';
import Connection from './components/Connection';
import DepartmentSettings from './components/DepartmentSettings';
import UserSettings from './components/UserSettings';
import Settings from './components/Settings';
import QuickMessageSettings from './components/QuickMessageSettings';
import WorkflowSettings from './components/WorkflowSettings';
import ReportsDashboard from './components/ReportsDashboard';
import Contacts from './components/Contacts';
import ChatbotSettings from './components/ChatbotSettings';
import { MessageSquare, Settings as SettingsIcon, Smartphone, Users, LayoutDashboard, LogOut, ShieldCheck, Menu, X, Zap, BarChart, ListChecks, Info, AlertTriangle, CheckCircle, Contact as ContactIcon, Bot, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchChats, fetchChatMessages, normalizeJid, mapApiMessageToInternal, findActiveInstance } from './services/whatsappService'; 

const loadConfig = (): ApiConfig => {
  const saved = localStorage.getItem('zapflow_config');
  if (saved) return JSON.parse(saved);
  return {
    baseUrl: '', 
    apiKey: '',
    instanceName: 'zapflow',
    isDemo: false 
  };
};

const loadUserSession = (): User | null => {
  const saved = localStorage.getItem('zapflow_user');
  if (saved) return JSON.parse(saved);
  return null;
};

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success';
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(loadUserSession);
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Carrega chats do localStorage se existir, senão usa INITIAL_CHATS
  const loadChatsFromStorage = (): Chat[] => {
    try {
      const saved = localStorage.getItem('zapflow_chats');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Converte timestamps de string para Date
        return parsed.map((chat: Chat) => ({
          ...chat,
          lastMessageTime: new Date(chat.lastMessageTime),
          messages: chat.messages.map((msg: Message) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        }));
      }
    } catch (e) {
      console.error('[App] Erro ao carregar chats do localStorage:', e);
    }
    return INITIAL_CHATS;
  };

  const [chats, setChats] = useState<Chat[]>(loadChatsFromStorage());
  const [departments, setDepartments] = useState<Department[]>(INITIAL_DEPARTMENTS);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>(INITIAL_QUICK_REPLIES);
  const [workflows, setWorkflows] = useState<Workflow[]>(INITIAL_WORKFLOWS);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [chatbotConfig, setChatbotConfig] = useState<ChatbotConfig>(INITIAL_CHATBOT_CONFIG);
  const [apiConfig, setApiConfig] = useState<ApiConfig>(loadConfig());

  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    localStorage.setItem('zapflow_config', JSON.stringify(apiConfig));
  }, [apiConfig]);

  // Persiste chats no localStorage sempre que mudarem
  useEffect(() => {
    try {
      localStorage.setItem('zapflow_chats', JSON.stringify(chats));
    } catch (e) {
      console.error('[App] Erro ao salvar chats no localStorage:', e);
    }
  }, [chats]);

  useEffect(() => {
    if (!currentUser || apiConfig.isDemo || !apiConfig.baseUrl) return;

    const syncChats = async () => {
        // console.log('[App] Iniciando sync de chats...');
        const realChats = await fetchChats(apiConfig);
        // console.log(`[App] fetchChats retornou ${realChats.length} chats`);
        
        if (realChats.length > 0) {
            setChats(currentChats => {
                // console.log(`[App] Fazendo merge: ${currentChats.length} chats atuais com ${realChats.length} chats novos`);
                const mergedChats = realChats.map(realChat => {
                    // Tenta encontrar chat existente por ID ou por contactNumber
                    let existingChat = currentChats.find(c => c.id === realChat.id);
                    
                    // Se não encontrou por ID, tenta encontrar por contactNumber (para casos de IDs gerados)
                    if (!existingChat && realChat.contactNumber) {
                        const realContactDigits = realChat.contactNumber.replace(/\D/g, '').length;
                        if (realContactDigits >= 10) {
                            // Busca exata primeiro
                            existingChat = currentChats.find(c => {
                                const existingNumber = c.contactNumber?.replace(/\D/g, '') || '';
                                const realNumber = realChat.contactNumber.replace(/\D/g, '');
                                // Busca exata ou pelos últimos dígitos (para casos onde um tem DDI e outro não)
                                return existingNumber === realNumber || 
                                       (existingNumber.length >= 8 && realNumber.length >= 8 && 
                                        existingNumber.slice(-Math.min(existingNumber.length, 11)) === realNumber.slice(-Math.min(realNumber.length, 11)));
                            });
                            
                            // Se ainda não encontrou, tenta pelo ID do chat (extraindo número do ID)
                            if (!existingChat) {
                                existingChat = currentChats.find(c => {
                                    if (c.id.includes('@') && !c.id.includes('@g.us')) {
                                        const idNumber = c.id.split('@')[0].replace(/\D/g, '');
                                        const realNumber = realChat.contactNumber.replace(/\D/g, '');
                                        return idNumber === realNumber || 
                                               (idNumber.length >= 8 && realNumber.length >= 8 && 
                                                idNumber.slice(-Math.min(idNumber.length, 11)) === realNumber.slice(-Math.min(realNumber.length, 11)));
                                    }
                                    return false;
                                });
                            }
                        }
                    }
                    
                    if (existingChat) {
                        const newMsgCount = realChat.messages.length;
                        const oldMsgCount = existingChat.messages.length;
                        
                        // console.log(`[App] Chat ${realChat.id}: ${oldMsgCount} -> ${newMsgCount} mensagens`);
                        
                        if (newMsgCount > oldMsgCount) {
                            const lastMsg = realChat.messages[realChat.messages.length - 1];
                            if (lastMsg.sender === 'user') {
                                if (existingChat.assignedTo === currentUser.id) {
                                    // Play sound or notify
                                }
                            }
                        }

                        // Atualiza contactNumber se o realChat tiver um número mais completo
                        const existingDigits = existingChat.contactNumber?.replace(/\D/g, '').length || 0;
                        const realDigits = realChat.contactNumber?.replace(/\D/g, '').length || 0;
                        // Detecta IDs gerados: qualquer coisa que comece com 'cmin', 'cmid', ou 'chat_'
                        const existingIsGenerated = existingChat.contactNumber?.includes('cmin') || 
                                                      existingChat.contactNumber?.includes('cmid') || 
                                                      existingChat.contactNumber?.startsWith('chat_') || 
                                                      !/^\d+$/.test(existingChat.contactNumber?.replace(/\D/g, '') || '');
                        const useRealContactNumber = (realDigits > existingDigits && realDigits >= 10) || (existingIsGenerated && realDigits >= 10);

                        // Se o chat existente tem ID gerado mas o realChat tem ID válido, atualiza o ID também
                        // Detecta qualquer ID gerado (cmin*, cmid*, chat_*)
                        const existingIdIsGenerated = existingChat.id.includes('cmin') || 
                                                       existingChat.id.includes('cmid') || 
                                                       existingChat.id.startsWith('chat_');
                        // ID válido: tem @, não é grupo, não é gerado
                        const realIdIsValid = realChat.id.includes('@') && 
                                              !realChat.id.includes('@g.us') && 
                                              !realChat.id.includes('cmin') && 
                                              !realChat.id.includes('cmid') && 
                                              !realChat.id.startsWith('chat_');
                        const shouldUpdateId = existingIdIsGenerated && realIdIsValid;

                        // Merge inteligente de mensagens: combina mensagens locais e da API, removendo duplicatas
                        const mergedMessages: Message[] = [];
                        const messageMap = new Map<string, Message>();
                        
                        // Primeiro, adiciona todas as mensagens da API (histórico real)
                        realChat.messages.forEach(msg => {
                            // Usa ID da mensagem ou gera um baseado em timestamp + conteúdo para evitar duplicatas
                            const msgKey = msg.id || `${msg.timestamp?.getTime() || Date.now()}_${msg.content?.substring(0, 20) || ''}`;
                            if (!messageMap.has(msgKey)) {
                                messageMap.set(msgKey, msg);
                            }
                        });
                        
                        // Depois, adiciona mensagens locais que não estão na API (mensagens enviadas recentemente)
                        existingChat.messages.forEach(msg => {
                            // Verifica se a mensagem já existe na API (pode ter sido sincronizada)
                            const msgKey = msg.id || `${msg.timestamp?.getTime() || Date.now()}_${msg.content?.substring(0, 20) || ''}`;
                            const existsInApi = realChat.messages.some(apiMsg => {
                                // Compara por ID, ou por timestamp + conteúdo se ID não existir
                                if (apiMsg.id && msg.id) return apiMsg.id === msg.id;
                                if (apiMsg.timestamp && msg.timestamp) {
                                    const timeDiff = Math.abs(apiMsg.timestamp.getTime() - msg.timestamp.getTime());
                                    return timeDiff < 5000 && apiMsg.content === msg.content; // 5 segundos de tolerância
                                }
                                return false;
                            });
                            
                            // Se não existe na API, mantém a mensagem local (não apenas recentes)
                            // Isso garante que mensagens enviadas não desapareçam mesmo após F5
                            if (!existsInApi) {
                                if (!messageMap.has(msgKey)) {
                                    messageMap.set(msgKey, msg);
                                }
                            }
                        });
                        
                        // Se não há mensagens na API, tenta buscar mensagens do chat (mesmo sem mensagens locais)
                        // Isso garante que mensagens recebidas apareçam mesmo quando a API não retorna no findChats
                        if (realChat.messages.length === 0) {
                            // Busca mensagens do chat de forma assíncrona (não bloqueia o merge)
                            // Usa um debounce para evitar múltiplas buscas simultâneas
                            const chatId = realChat.id || existingChat.id;
                            const lastFetchKey = `last_fetch_${chatId}`;
                            const lastFetch = sessionStorage.getItem(lastFetchKey);
                            const now = Date.now();
                            
                            // Só busca se não buscou nos últimos 5 segundos (evita spam)
                            if (!lastFetch || (now - parseInt(lastFetch)) > 5000) {
                                sessionStorage.setItem(lastFetchKey, now.toString());
                                
                                fetchChatMessages(apiConfig, chatId, 100).then(apiMessages => {
                                    if (apiMessages.length > 0) {
                                        setChats(currentChats => {
                                            return currentChats.map(c => {
                                                if (c.id === chatId) {
                                                    // Merge das mensagens da API com as locais
                                                    const allMessages = [...c.messages, ...apiMessages];
                                                    const uniqueMessages = Array.from(
                                                        new Map(allMessages.map(msg => [msg.id || `${msg.timestamp?.getTime()}_${msg.content}`, msg])).values()
                                                    ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                                                    
                                                    // Detecta se há novas mensagens recebidas
                                                    const newReceivedMessages = apiMessages.filter(apiMsg => 
                                                        apiMsg.sender === 'user' && 
                                                        !c.messages.some(existingMsg => 
                                                            existingMsg.id === apiMsg.id || 
                                                            (existingMsg.timestamp && apiMsg.timestamp && 
                                                             Math.abs(existingMsg.timestamp.getTime() - apiMsg.timestamp.getTime()) < 5000 &&
                                                             existingMsg.content === apiMsg.content)
                                                        )
                                                    );
                                                    
                                                    if (newReceivedMessages.length > 0 && currentUser) {
                                                        const lastNewMsg = newReceivedMessages[newReceivedMessages.length - 1];
                                                        if (c.assignedTo === currentUser.id) {
                                                            addNotification(
                                                                `Nova mensagem de ${c.contactName}`,
                                                                lastNewMsg.content.length > 50 ? lastNewMsg.content.substring(0, 50) + '...' : lastNewMsg.content,
                                                                'info'
                                                            );
                                                        }
                                                    }
                                                    
                                                    return {
                                                        ...c,
                                                        messages: uniqueMessages,
                                                        lastMessage: uniqueMessages.length > 0 ? 
                                                            (uniqueMessages[uniqueMessages.length - 1].type === 'text' ? 
                                                                uniqueMessages[uniqueMessages.length - 1].content : 
                                                                `📷 ${uniqueMessages[uniqueMessages.length - 1].type}`) : 
                                                            c.lastMessage,
                                                        lastMessageTime: uniqueMessages.length > 0 && uniqueMessages[uniqueMessages.length - 1].timestamp ? 
                                                            uniqueMessages[uniqueMessages.length - 1].timestamp : 
                                                            c.lastMessageTime,
                                                        unreadCount: newReceivedMessages.length > 0 ? 
                                                            (c.unreadCount || 0) + newReceivedMessages.length : 
                                                            c.unreadCount
                                                    };
                                                }
                                                return c;
                                            });
                                        });
                                    }
                                }).catch(err => {
                                    console.error(`[App] Erro ao buscar mensagens do chat ${chatId}:`, err);
                                });
                            }
                        }
                        
                        // Converte para array e ordena por timestamp
                        mergedMessages.push(...Array.from(messageMap.values()));
                        mergedMessages.sort((a, b) => {
                            const timeA = a.timestamp?.getTime() || 0;
                            const timeB = b.timestamp?.getTime() || 0;
                            return timeA - timeB;
                        });

                        return {
                            ...realChat,
                            messages: mergedMessages, // Usa mensagens mescladas
                            id: shouldUpdateId ? realChat.id : existingChat.id, // Atualiza ID se existente for gerado e real for válido
                            contactName: existingChat.contactName, // Mantém nome editado localmente se houver
                            contactNumber: useRealContactNumber ? realChat.contactNumber : existingChat.contactNumber, // Atualiza se número mais completo
                            clientCode: existingChat.clientCode,
                            departmentId: existingChat.departmentId,
                            assignedTo: existingChat.assignedTo,
                            tags: existingChat.tags,
                            status: existingChat.status === 'closed' ? 'closed' : realChat.status,
                            rating: existingChat.rating,
                            activeWorkflow: existingChat.activeWorkflow,
                            lastMessage: mergedMessages.length > 0 ? 
                                (mergedMessages[mergedMessages.length - 1].type === 'text' ? 
                                    mergedMessages[mergedMessages.length - 1].content : 
                                    `📷 ${mergedMessages[mergedMessages.length - 1].type}`) : 
                                realChat.lastMessage,
                            lastMessageTime: mergedMessages.length > 0 && mergedMessages[mergedMessages.length - 1].timestamp ? 
                                mergedMessages[mergedMessages.length - 1].timestamp : 
                                realChat.lastMessageTime
                        };
                    } else {
                        // console.log(`[App] Novo chat encontrado: ${realChat.id} (${realChat.contactName})`);
                        return realChat;
                    }
                });
                // console.log(`[App] Merge concluído: ${mergedChats.length} chats no total`);
                return mergedChats;
            });
        } else {
            // console.log('[App] Nenhum chat retornado da API, mantendo estado atual');
        }
    };

    syncChats();
    // Polling a cada 3 segundos para parecer tempo real
    const intervalId = setInterval(syncChats, 3000);

    // WebSocket para receber mensagens em tempo real
    let ws: WebSocket | null = null;
    
    // Inicializa WebSocket de forma assíncrona
    const initWebSocket = async () => {
        if (apiConfig.isDemo || !apiConfig.baseUrl) return;
        
        try {
            const active = await findActiveInstance(apiConfig);
            const instanceName = active?.instanceName || apiConfig.instanceName;
            
            if (!instanceName) return;
            
            // Converte http:// para ws:// ou https:// para wss://
            const wsUrl = apiConfig.baseUrl.replace(/^http/, 'ws') + `/chat/${instanceName}`;
            console.log(`[App] Conectando WebSocket: ${wsUrl}`);
            
            ws = new WebSocket(wsUrl);
            
            ws.onopen = () => {
                console.log('[App] WebSocket conectado');
                // Envia autenticação se necessário
                if (apiConfig.apiKey) {
                    ws?.send(JSON.stringify({ apikey: apiConfig.apiKey }));
                }
            };
            
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('[App] Mensagem recebida via WebSocket:', data);
                    
                    // Processa mensagens recebidas
                    if (data.event === 'messages.upsert' || data.event === 'messages.update' || data.event === 'message') {
                        const messageData = data.data || data;
                        if (messageData && messageData.key && messageData.key.remoteJid) {
                            const remoteJid = normalizeJid(messageData.key.remoteJid);
                            const mapped = mapApiMessageToInternal(messageData);
                            
                            if (mapped) {
                                setChats(currentChats => {
                                    return currentChats.map(chat => {
                                        // Encontra o chat pelo JID
                                        const chatJid = normalizeJid(chat.id);
                                        const messageJid = normalizeJid(remoteJid);
                                        
                                        if (chatJid === messageJid || 
                                            (chat.contactNumber && messageJid.includes(chat.contactNumber.replace(/\D/g, '')))) {
                                            // Verifica se a mensagem já existe
                                            const exists = chat.messages.some(m => 
                                                m.id === mapped.id || 
                                                (m.timestamp && mapped.timestamp && 
                                                 Math.abs(m.timestamp.getTime() - mapped.timestamp.getTime()) < 2000 &&
                                                 m.content === mapped.content)
                                            );
                                            
                                            if (!exists) {
                                                const updatedMessages = [...chat.messages, mapped].sort((a, b) => 
                                                    a.timestamp.getTime() - b.timestamp.getTime()
                                                );
                                                
                                                // Notifica se for mensagem recebida
                                                if (mapped.sender === 'user' && currentUser && chat.assignedTo === currentUser.id) {
                                                    addNotification(
                                                        `Nova mensagem de ${chat.contactName}`,
                                                        mapped.content.length > 50 ? mapped.content.substring(0, 50) + '...' : mapped.content,
                                                        'info'
                                                    );
                                                }
                                                
                                                return {
                                                    ...chat,
                                                    messages: updatedMessages,
                                                    lastMessage: mapped.type === 'text' ? mapped.content : `📷 ${mapped.type}`,
                                                    lastMessageTime: mapped.timestamp,
                                                    unreadCount: mapped.sender === 'user' ? (chat.unreadCount || 0) + 1 : chat.unreadCount
                                                };
                                            }
                                        }
                                        return chat;
                                    });
                                });
                            }
                        }
                    }
                } catch (err) {
                    console.error('[App] Erro ao processar mensagem WebSocket:', err, event.data);
                }
            };
            
            ws.onerror = (error) => {
                console.error('[App] Erro no WebSocket:', error);
            };
            
            ws.onclose = () => {
                console.log('[App] WebSocket desconectado, tentando reconectar em 5s...');
                setTimeout(() => {
                    // Reconecta após 5 segundos
                    if (currentUser && apiConfig.baseUrl && !apiConfig.isDemo) {
                        initWebSocket();
                    }
                }, 5000);
            };
        } catch (err) {
            console.error('[App] Erro ao criar WebSocket:', err);
        }
    };
    
    initWebSocket();

    return () => {
        clearInterval(intervalId);
        if (ws) {
            ws.close();
        }
    };
  }, [currentUser, apiConfig]);

  useEffect(() => {
    if (currentUser && currentUser.role === UserRole.AGENT && currentView === 'dashboard') {
        setCurrentView('chat');
    }
  }, []);

  const addNotification = (title: string, message: string, type: 'info' | 'warning' | 'success' = 'info') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('zapflow_user', JSON.stringify(user));
    if (user.role === UserRole.AGENT) {
        setCurrentView('chat');
    } else {
        setCurrentView('dashboard');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('zapflow_user');
    setCurrentUser(null);
    setCurrentView('dashboard');
    setIsMobileMenuOpen(false);
  };

  const handleViewChange = (view: ViewState) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
  };

  const handleUpdateChat = (updatedChat: Chat) => {
    const chatExists = chats.some(c => c.id === updatedChat.id);

    if (chatExists) {
        const oldChat = chats.find(c => c.id === updatedChat.id);
        if (oldChat && currentUser) {
            const newMsgCount = updatedChat.messages.length;
            const oldMsgCount = oldChat.messages.length;
            if (newMsgCount > oldMsgCount) {
                const lastMsg = updatedChat.messages[updatedChat.messages.length - 1];
                if (lastMsg.sender === 'user') {
                    if (updatedChat.assignedTo === currentUser.id) {
                        addNotification(
                            `Nova mensagem de ${updatedChat.contactName}`,
                            lastMsg.content.length > 50 ? lastMsg.content.substring(0, 50) + '...' : lastMsg.content,
                            'info'
                        );
                    } else if (!updatedChat.departmentId && currentUser.allowGeneralConnection) {
                        addNotification(
                            `Novo chamado na Triagem`,
                            `${updatedChat.contactName}: ${lastMsg.content}`,
                            'warning'
                        );
                    }
                }
            }
        }
        setChats(chats.map(c => c.id === updatedChat.id ? updatedChat : c));
    } else {
        setChats([updatedChat, ...chats]);
    }
  };

  const handleAddDepartment = (dept: Department) => setDepartments([...departments, dept]);
  const handleUpdateDepartment = (updatedDept: Department) => {
    setDepartments(departments.map(d => d.id === updatedDept.id ? updatedDept : d));
  };
  const handleDeleteDepartment = (id: string) => {
    setDepartments(departments.filter(d => d.id !== id));
    setChats(chats.map(c => c.departmentId === id ? { ...c, departmentId: null } : c));
  };

  const handleSaveConfig = (newConfig: ApiConfig) => setApiConfig(newConfig);

  const handleAddUser = (user: User) => setUsers([...users, user]);
  const handleUpdateUser = (updatedUser: User) => setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
  const handleDeleteUser = (id: string) => setUsers(users.filter(u => u.id !== id));

  const handleAddQuickReply = (qr: QuickReply) => setQuickReplies([...quickReplies, qr]);
  const handleUpdateQuickReply = (updatedQr: QuickReply) => setQuickReplies(quickReplies.map(q => q.id === updatedQr.id ? updatedQr : q));
  const handleDeleteQuickReply = (id: string) => setQuickReplies(quickReplies.filter(q => q.id !== id));

  const handleAddWorkflow = (wf: Workflow) => setWorkflows([...workflows, wf]);
  const handleUpdateWorkflow = (updatedWf: Workflow) => setWorkflows(workflows.map(w => w.id === updatedWf.id ? updatedWf : w));
  const handleDeleteWorkflow = (id: string) => setWorkflows(workflows.filter(w => w.id !== id));

  const handleSyncGoogleContacts = async (importedContacts?: Contact[]) => {
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            let newContacts: Contact[] = [];
            if (importedContacts && importedContacts.length > 0) {
                newContacts = importedContacts;
            } else {
                if (apiConfig.isDemo) {
                   newContacts = MOCK_GOOGLE_CONTACTS.map(c => ({...c, lastSync: new Date()}));
                }
            }
            setContacts(newContacts);
            const updatedChats = chats.map(chat => {
                const chatPhone = chat.contactNumber.replace(/\D/g, '');
                const match = newContacts.find(c => {
                    const cPhone = c.phone.replace(/\D/g, '');
                    return cPhone === chatPhone || (cPhone.length > 8 && chatPhone.endsWith(cPhone.slice(-8)));
                });
                if (match) {
                    return { ...chat, contactName: match.name, contactAvatar: match.avatar || chat.contactAvatar };
                }
                return chat;
            });
            setChats(updatedChats);
            if (newContacts.length > 0) {
               addNotification('Sincronização Concluída', `${newContacts.length} contatos atualizados do Google.`, 'success');
            } else {
               addNotification('Sincronização', `Nenhum contato encontrado.`, 'info');
            }
            resolve();
        }, 500);
    });
  };

  const handleUpdateChatbotConfig = (cfg: ChatbotConfig) => setChatbotConfig(cfg);

  const filteredChats = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === UserRole.ADMIN) return chats;
    if (currentUser.role === UserRole.AGENT) {
       return chats.filter(chat => {
          const matchesDepartment = chat.departmentId === currentUser.departmentId;
          const matchesGeneral = !chat.departmentId && currentUser.allowGeneralConnection;
          return matchesDepartment || matchesGeneral;
       });
    }
    return [];
  }, [chats, currentUser]);

  const canAccess = (view: ViewState): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === UserRole.ADMIN) return true;
    if (['settings', 'users', 'connections', 'departments', 'reports', 'workflows', 'contacts', 'chatbot'].includes(view)) return false;
    return true;
  };

  if (!currentUser) {
    return <Login users={users} onLogin={handleLogin} />;
  }

  const renderContent = () => {
    if (!canAccess(currentView)) return <div className="p-8 text-red-500">Acesso não autorizado.</div>;

    switch (currentView) {
      case 'dashboard':
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 md:p-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <div className="flex items-center gap-4 mb-4">
                 <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><MessageSquare /></div>
                 <div>
                   <p className="text-slate-500 text-sm">Meus Chats Ativos</p>
                   <h3 className="text-2xl font-bold text-slate-800">{filteredChats.filter(c => c.status === 'open').length}</h3>
                 </div>
              </div>
            </div>
            {currentUser.role === UserRole.ADMIN && (
                <>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-orange-100 text-orange-600 rounded-lg"><Users /></div>
                    <div><p className="text-slate-500 text-sm">Aguardando Triagem</p><h3 className="text-2xl font-bold text-slate-800">{chats.filter(c => !c.departmentId).length}</h3></div>
                </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-green-100 text-green-600 rounded-lg"><Smartphone /></div>
                    <div><p className="text-slate-500 text-sm">Status Conexão</p><h3 className="text-2xl font-bold text-emerald-600">{apiConfig.isDemo ? 'Modo Simulação' : 'Modo Real'}</h3></div>
                </div>
                </div>
                </>
            )}
            <div className="col-span-1 md:col-span-3 bg-white p-6 rounded-lg shadow-sm border border-slate-200 mt-4">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Olá, {currentUser.name} ({currentUser.role === 'ADMIN' ? 'Administrador' : 'Agente'})</h3>
              <p className="text-slate-600">
                {currentUser.role === 'ADMIN' ? "Você tem acesso total ao sistema." : `Você está visualizando os atendimentos do setor: ${departments.find(d => d.id === currentUser.departmentId)?.name || 'Nenhum'}.`}
                {currentUser.role === 'AGENT' && currentUser.allowGeneralConnection && <span className="block mt-2 font-medium text-emerald-600">Você tem permissão para acessar a Triagem (Geral).</span>}
              </p>
            </div>
          </div>
        );
      case 'chat':
        return <div className="h-full md:p-4"><ChatInterface chats={filteredChats} departments={departments} currentUser={currentUser} onUpdateChat={handleUpdateChat} apiConfig={apiConfig} quickReplies={quickReplies} workflows={workflows} contacts={contacts} /></div>;
      case 'reports': return <ReportsDashboard chats={chats} departments={departments} />;
      case 'contacts': return <Contacts contacts={contacts} onSyncGoogle={handleSyncGoogleContacts} clientId={apiConfig.googleClientId} />;
      case 'chatbot': return <ChatbotSettings config={chatbotConfig} onSave={handleUpdateChatbotConfig} />;
      case 'connections': return <Connection config={apiConfig} onNavigateToSettings={() => setCurrentView('settings')} onUpdateConfig={handleSaveConfig} />;
      case 'departments': return <DepartmentSettings departments={departments} onAdd={handleAddDepartment} onUpdate={handleUpdateDepartment} onDelete={handleDeleteDepartment} />;
      case 'workflows': return <WorkflowSettings workflows={workflows} departments={departments} onAdd={handleAddWorkflow} onUpdate={handleUpdateWorkflow} onDelete={handleDeleteWorkflow} />;
      case 'users': return <UserSettings users={users} departments={departments} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} />;
      case 'settings': return <div className="p-4 space-y-6 overflow-y-auto h-full"><Settings config={apiConfig} onSave={handleSaveConfig} /><QuickMessageSettings quickReplies={quickReplies} onAdd={handleAddQuickReply} onUpdate={handleUpdateQuickReply} onDelete={handleDeleteQuickReply} /></div>;
      default: return <div className="p-8">Página não encontrada</div>;
    }
  };

  const SidebarItem = ({ view, icon: Icon, label }: { view: ViewState, icon: any, label: string }) => (
    <button 
        onClick={() => handleViewChange(view)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-all ${currentView === view ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-300'} ${isSidebarCollapsed ? 'justify-center' : ''}`}
        title={isSidebarCollapsed ? label : ''}
    >
        <Icon size={20} className="flex-shrink-0" /> 
        {!isSidebarCollapsed && <span className="truncate">{label}</span>}
    </button>
  );

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
        {notifications.map(n => (
          <div key={n.id} className={`min-w-[300px] max-w-sm p-4 rounded-lg shadow-xl border-l-4 bg-white animate-in slide-in-from-right flex items-start gap-3 ${n.type === 'info' ? 'border-blue-500' : n.type === 'warning' ? 'border-orange-500' : 'border-emerald-500'}`}>
             <div className={`mt-1 ${n.type === 'info' ? 'text-blue-500' : n.type === 'warning' ? 'text-orange-500' : 'text-emerald-500'}`}>
                {n.type === 'info' ? <Info size={20} /> : n.type === 'warning' ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
             </div>
             <div className="flex-1">
                <h4 className="font-bold text-slate-800 text-sm">{n.title}</h4>
                <p className="text-sm text-slate-600 mt-1 line-clamp-2">{n.message}</p>
             </div>
             <button onClick={() => removeNotification(n.id)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
        ))}
      </div>

      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 z-40 flex items-center justify-between px-4 shadow-md flex-shrink-0">
        <div className="flex items-center gap-3"><div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold">Z</div><span className="text-xl font-bold text-white tracking-tight">ZapFlow</span></div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-white p-2 hover:bg-slate-800 rounded-lg">{isMobileMenuOpen ? <X /> : <Menu />}</button>
      </div>

      {isMobileMenuOpen && <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setIsMobileMenuOpen(false)} />}

      <aside className={`fixed md:static inset-y-0 left-0 z-50 bg-slate-900 flex flex-col h-full transform transition-all duration-300 ease-in-out flex-shrink-0 ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full'} md:translate-x-0 shadow-xl md:shadow-none ${isSidebarCollapsed ? 'md:w-20' : 'md:w-64'}`}>
        <div className={`hidden md:flex p-6 border-b border-slate-800 items-center gap-3 flex-shrink-0 ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}>
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0">Z</div>
          {!isSidebarCollapsed && <span className="text-xl font-bold text-white tracking-tight animate-in fade-in">ZapFlow</span>}
        </div>
        
        <div className={`p-4 bg-slate-800/50 flex items-center gap-3 border-b border-slate-800 mt-16 md:mt-0 flex-shrink-0 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
            <img src={currentUser.avatar} alt="User" className="w-8 h-8 rounded-full border border-slate-600 flex-shrink-0 object-cover"/>
            {!isSidebarCollapsed && <div className="overflow-hidden animate-in fade-in"><p className="text-sm font-semibold text-white truncate">{currentUser.name}</p><p className="text-xs text-slate-400 truncate capitalize">{currentUser.role === 'ADMIN' ? 'Administrador' : 'Agente'}</p></div>}
        </div>

        <nav className="flex-1 py-4 px-3 space-y-2 overflow-y-auto custom-scrollbar overflow-x-hidden">
          <SidebarItem view="dashboard" icon={LayoutDashboard} label="Dashboard" />
          <SidebarItem view="chat" icon={MessageSquare} label="Atendimento" />
          <SidebarItem view="contacts" icon={ContactIcon} label="Contatos" />
          {currentUser.role === UserRole.ADMIN && (
            <>
                <div className={`pt-4 pb-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider ${isSidebarCollapsed ? 'text-center' : ''}`}>{isSidebarCollapsed ? 'Admin' : 'Administração'}</div>
                <SidebarItem view="reports" icon={BarChart} label="Relatórios" />
                <SidebarItem view="chatbot" icon={Bot} label="Chatbot & Horários" />
                <SidebarItem view="workflows" icon={ListChecks} label="Fluxos (SOP)" />
                <SidebarItem view="departments" icon={Users} label="Departamentos" />
                <SidebarItem view="users" icon={ShieldCheck} label="Usuários" />
                <SidebarItem view="connections" icon={Smartphone} label="Conexões" />
                <SidebarItem view="settings" icon={SettingsIcon} label="Configurações" />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800 flex-shrink-0 flex flex-col gap-2">
            <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="hidden md:flex items-center justify-center p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition-colors w-full" title={isSidebarCollapsed ? "Expandir Menu" : "Recolher Menu"}>{isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}</button>
            <button onClick={handleLogout} className={`flex items-center gap-2 text-slate-400 hover:text-white transition-colors w-full px-2 py-2 rounded hover:bg-slate-800 ${isSidebarCollapsed ? 'justify-center' : ''}`} title="Sair"><LogOut size={18} /> {!isSidebarCollapsed && <span>Sair</span>}</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full relative min-w-0 bg-slate-100">
         <div className={`flex-1 w-full pt-16 md:pt-0 ${currentView === 'chat' ? 'overflow-hidden' : 'overflow-y-auto'}`}>{renderContent()}</div>
      </main>
    </div>
  );
};

export default App;