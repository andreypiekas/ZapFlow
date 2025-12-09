import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Chat, Department, ViewState, ApiConfig, User, UserRole, QuickReply, Workflow, Contact, ChatbotConfig, MessageStatus, Message } from './types';
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
import { fetchChats, fetchChatMessages, normalizeJid, mapApiMessageToInternal, findActiveInstance, sendDepartmentSelectionMessage, processDepartmentSelection } from './services/whatsappService';
import { processChatbotMessages } from './services/chatbotService';
import { storageService } from './services/storageService';
import { apiService } from './services/apiService';
import { SecurityService } from './services/securityService';
import { io, Socket } from 'socket.io-client'; 

const loadConfig = (): ApiConfig => {
  try {
    // Verifica se deve usar apenas PostgreSQL
    if (storageService.getUseOnlyPostgreSQL()) {
      // Se configurado para usar apenas PostgreSQL, não carrega do localStorage
      return {
        baseUrl: '', 
        apiKey: '',
        instanceName: 'zapflow',
        isDemo: false,
        googleClientId: '',
        geminiApiKey: ''
      };
    }
    
    const saved = localStorage.getItem('zapflow_config');
    if (saved) {
      // Tenta descriptografar se estiver criptografado
      let decrypted = saved;
      try {
        decrypted = SecurityService.decrypt(saved);
      } catch {
        // Se falhar, usa como está (compatibilidade)
        decrypted = saved;
      }
      const parsed = JSON.parse(decrypted);
      return parsed;
    }
  } catch (e) {
    console.error('[App] ❌ Erro ao carregar configurações do localStorage:', e);
  }
  return {
    baseUrl: '', 
    apiKey: '',
    instanceName: 'zapflow',
    isDemo: false,
    googleClientId: '',
    geminiApiKey: ''
  };
};

const loadUserSession = (): User | null => {
  try {
    // Verifica se deve usar apenas PostgreSQL
    if (storageService.getUseOnlyPostgreSQL()) {
      return null; // Não carrega do localStorage se usar apenas PostgreSQL
    }
    
    const saved = localStorage.getItem('zapflow_user');
    if (saved) {
      // Tenta descriptografar se estiver criptografado
      let decrypted = saved;
      try {
        decrypted = SecurityService.decrypt(saved);
      } catch {
        // Se falhar, usa como está (compatibilidade)
        decrypted = saved;
      }
      return JSON.parse(decrypted);
    }
  } catch (e) {
    console.error('[App] Erro ao carregar sessão do usuário:', e);
  }
  return null;
};

const loadDepartmentsFromStorage = (): Department[] => {
  try {
    const saved = localStorage.getItem('zapflow_departments');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('[App] Erro ao carregar departamentos do localStorage:', e);
  }
  return INITIAL_DEPARTMENTS;
};

const loadQuickRepliesFromStorage = (): QuickReply[] => {
  try {
    const saved = localStorage.getItem('zapflow_quickReplies');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('[App] Erro ao carregar respostas rápidas do localStorage:', e);
  }
  return INITIAL_QUICK_REPLIES;
};

const loadWorkflowsFromStorage = (): Workflow[] => {
  try {
    const saved = localStorage.getItem('zapflow_workflows');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('[App] Erro ao carregar workflows do localStorage:', e);
  }
  return INITIAL_WORKFLOWS;
};

const loadChatbotConfigFromStorage = (): ChatbotConfig => {
  try {
    const saved = localStorage.getItem('zapflow_chatbotConfig');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('[App] Erro ao carregar configuração do chatbot do localStorage:', e);
  }
  return INITIAL_CHATBOT_CONFIG;
};

const loadViewStateFromStorage = (): ViewState => {
  try {
    const saved = localStorage.getItem('zapflow_currentView');
    if (saved && ['dashboard', 'chats', 'contacts', 'settings', 'connection', 'departments', 'users', 'quickMessages', 'workflows', 'reports', 'chatbot'].includes(saved)) {
      return saved as ViewState;
    }
  } catch (e) {
    console.error('[App] Erro ao carregar view state do localStorage:', e);
  }
  return 'dashboard';
};

const loadSidebarStateFromStorage = (): boolean => {
  try {
    const saved = localStorage.getItem('zapflow_sidebarCollapsed');
    if (saved !== null) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('[App] Erro ao carregar estado da sidebar do localStorage:', e);
  }
  return false;
};

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success';
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(loadUserSession);
  const [currentView, setCurrentView] = useState<ViewState>(loadViewStateFromStorage());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(loadSidebarStateFromStorage());
  
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

  // Carrega usuários do localStorage se existir, senão usa INITIAL_USERS
  const loadUsersFromStorage = (): User[] => {
    try {
      const saved = localStorage.getItem('zapflow_users');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed;
      }
    } catch (e) {
      console.error('[App] Erro ao carregar usuários do localStorage:', e);
    }
    return INITIAL_USERS;
  };

  // Carrega contatos do localStorage se existir, senão usa array vazio
  const loadContactsFromStorage = (): Contact[] => {
    try {
      const saved = localStorage.getItem('zapflow_contacts');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Converte lastSync de string para Date se existir
        return parsed.map((contact: Contact) => ({
          ...contact,
          lastSync: contact.lastSync ? new Date(contact.lastSync) : undefined
        }));
      }
    } catch (e) {
      console.error('[App] Erro ao carregar contatos do localStorage:', e);
    }
    return [];
  };

  // Estados iniciais - serão carregados do storageService no useEffect
  const [chats, setChats] = useState<Chat[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [chatbotConfig, setChatbotConfig] = useState<ChatbotConfig>(INITIAL_CHATBOT_CONFIG);
  const [apiConfig, setApiConfig] = useState<ApiConfig>(loadConfig()); // Config precisa ser carregado imediatamente
  const [forceSelectChatId, setForceSelectChatId] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Persiste configurações usando storageService (API + localStorage)
  useEffect(() => {
    storageService.save('config', apiConfig).catch(err => {
      console.error('[App] Erro ao salvar configurações:', err);
    });
  }, [apiConfig]);

  // Persiste chats usando storageService
  useEffect(() => {
    storageService.save('chats', chats).catch(err => {
      console.error('[App] Erro ao salvar chats:', err);
    });
  }, [chats]);

  // Persiste usuários usando storageService
  useEffect(() => {
    storageService.save('users', users).catch(err => {
      console.error('[App] Erro ao salvar usuários:', err);
    });
  }, [users]);

  // Persiste contatos usando storageService
  useEffect(() => {
    storageService.save('contacts', contacts).catch(err => {
      console.error('[App] Erro ao salvar contatos:', err);
    });
  }, [contacts]);

  // Persiste departamentos usando storageService
  useEffect(() => {
    storageService.save('departments', departments).catch(err => {
      console.error('[App] Erro ao salvar departamentos:', err);
    });
  }, [departments]);

  // Persiste respostas rápidas usando storageService
  useEffect(() => {
    storageService.save('quickReplies', quickReplies).catch(err => {
      console.error('[App] Erro ao salvar respostas rápidas:', err);
    });
  }, [quickReplies]);

  // Persiste workflows usando storageService
  useEffect(() => {
    storageService.save('workflows', workflows).catch(err => {
      console.error('[App] Erro ao salvar workflows:', err);
    });
  }, [workflows]);

  // Persiste configuração do chatbot usando storageService
  useEffect(() => {
    storageService.save('chatbotConfig', chatbotConfig).catch(err => {
      console.error('[App] Erro ao salvar configuração do chatbot:', err);
    });
  }, [chatbotConfig]);

  // Persiste view state usando storageService
  useEffect(() => {
    storageService.save('viewState', currentView).catch(err => {
      console.error('[App] Erro ao salvar view state:', err);
    });
  }, [currentView]);

  // Persiste estado da sidebar usando storageService
  useEffect(() => {
    storageService.save('sidebarState', isSidebarCollapsed).catch(err => {
      console.error('[App] Erro ao salvar estado da sidebar:', err);
    });
  }, [isSidebarCollapsed]);

  // Persiste sessão do usuário
  useEffect(() => {
    if (currentUser) {
      // Salva no localStorage para compatibilidade
      try {
        // Salva usuário apenas se não estiver configurado para usar apenas PostgreSQL
        if (!storageService.getUseOnlyPostgreSQL()) {
          localStorage.setItem('zapflow_user', SecurityService.encrypt(JSON.stringify(currentUser)));
        }
      } catch (e) {
        console.error('[App] Erro ao salvar sessão do usuário:', e);
      }
    } else {
      localStorage.removeItem('zapflow_user');
    }
  }, [currentUser]);

  // Carrega dados iniciais do storageService (localStorage ou API) quando o componente montar
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Carrega todos os dados do storageService (tenta API primeiro, fallback para localStorage)
        const [
          departmentsData, 
          quickRepliesData, 
          workflowsData, 
          chatbotConfigData,
          usersData,
          contactsData,
          chatsData
        ] = await Promise.all([
          storageService.load<Department[]>('departments'),
          storageService.load<QuickReply[]>('quickReplies'),
          storageService.load<Workflow[]>('workflows'),
          storageService.load<ChatbotConfig>('chatbotConfig'),
          storageService.load<User[]>('users'),
          storageService.load<Contact[]>('contacts'),
          storageService.load<Chat[]>('chats'),
        ]);

        // Define valores iniciais (usa dados do storage ou valores padrão)
        if (departmentsData && departmentsData.length > 0) {
          setDepartments(departmentsData);
        } else {
          setDepartments(INITIAL_DEPARTMENTS);
        }

        if (quickRepliesData && quickRepliesData.length > 0) {
          setQuickReplies(quickRepliesData);
        } else {
          setQuickReplies(INITIAL_QUICK_REPLIES);
        }

        if (workflowsData && workflowsData.length > 0) {
          setWorkflows(workflowsData);
        } else {
          setWorkflows(INITIAL_WORKFLOWS);
        }

        if (chatbotConfigData) {
          setChatbotConfig(chatbotConfigData);
        }

        if (usersData && usersData.length > 0) {
          setUsers(usersData);
        } else {
          setUsers(INITIAL_USERS);
        }

        if (contactsData && contactsData.length > 0) {
          setContacts(contactsData);
        }

        if (chatsData && chatsData.length > 0) {
          // Converte timestamps de string para Date
          const chatsWithDates = chatsData.map((chat: Chat) => ({
            ...chat,
            lastMessageTime: chat.lastMessageTime ? new Date(chat.lastMessageTime) : new Date(),
            messages: chat.messages?.map((msg: Message) => ({
              ...msg,
              timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
            })) || []
          }));
          setChats(chatsWithDates);
        } else {
          setChats(INITIAL_CHATS);
        }
      } catch (error) {
        console.error('[App] Erro ao carregar dados iniciais:', error);
        // Em caso de erro, usa valores padrão
        setDepartments(INITIAL_DEPARTMENTS);
        setQuickReplies(INITIAL_QUICK_REPLIES);
        setWorkflows(INITIAL_WORKFLOWS);
        setUsers(INITIAL_USERS);
        setChats(INITIAL_CHATS);
      }
    };

    loadInitialData();
  }, []); // Executa apenas uma vez quando o componente montar

  // Carrega dados da API quando o componente montar e usuário estiver logado
  useEffect(() => {
    if (!currentUser) return;

    const loadDataFromAPI = async () => {
      try {
        // Tenta carregar cada tipo de dado da API
        const [
          apiConfigData, 
          departmentsData, 
          quickRepliesData, 
          workflowsData, 
          chatbotConfigData, 
          viewStateData, 
          sidebarStateData,
          usersData,
          contactsData,
          chatsData
        ] = await Promise.all([
          storageService.load<ApiConfig>('config'),
          storageService.load<Department[]>('departments'),
          storageService.load<QuickReply[]>('quickReplies'),
          storageService.load<Workflow[]>('workflows'),
          storageService.load<ChatbotConfig>('chatbotConfig'),
          storageService.load<ViewState>('viewState'),
          storageService.load<boolean>('sidebarState'),
          storageService.load<User[]>('users'),
          storageService.load<Contact[]>('contacts'),
          storageService.load<Chat[]>('chats'),
        ]);

        // Atualiza apenas se os dados vieram da API (não são null)
        // Para config, faz merge completo para preservar valores padrão
        if (apiConfigData) {
          setApiConfig({
            baseUrl: apiConfigData.baseUrl || '',
            apiKey: apiConfigData.apiKey || '',
            authenticationApiKey: apiConfigData.authenticationApiKey || '',
            instanceName: apiConfigData.instanceName || 'zapflow',
            isDemo: apiConfigData.isDemo || false,
            googleClientId: apiConfigData.googleClientId || '',
            geminiApiKey: apiConfigData.geminiApiKey || ''
          });
        }
        if (departmentsData && departmentsData.length > 0) {
          setDepartments(departmentsData);
        }
        if (quickRepliesData && quickRepliesData.length > 0) {
          setQuickReplies(quickRepliesData);
        }
        if (workflowsData && workflowsData.length > 0) {
          setWorkflows(workflowsData);
        }
        if (chatbotConfigData) {
          setChatbotConfig(chatbotConfigData);
        }
        if (viewStateData) {
          setCurrentView(viewStateData);
        }
        if (sidebarStateData !== null) {
          setIsSidebarCollapsed(sidebarStateData);
        }
        // Carrega users, contacts e chats da API se existirem
        if (usersData && usersData.length > 0) {
          setUsers(usersData);
        }
        if (contactsData && contactsData.length > 0) {
          setContacts(contactsData);
        }
        if (chatsData && chatsData.length > 0) {
          // Converte timestamps de string para Date
          const chatsWithDates = chatsData.map((chat: Chat) => ({
            ...chat,
            lastMessageTime: chat.lastMessageTime ? new Date(chat.lastMessageTime) : new Date(),
            messages: chat.messages?.map((msg: Message) => ({
              ...msg,
              timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
            })) || []
          }));
          setChats(chatsWithDates);
        }
      } catch (error) {
        console.error('[App] Erro ao carregar dados da API:', error);
      }
    };

    loadDataFromAPI();
  }, [currentUser]); // Executa quando o usuário fizer login

  // Carrega dados das tabelas específicas quando o usuário estiver logado
  useEffect(() => {
    if (!currentUser) return;

    const loadSpecificTables = async () => {
      try {
        // Carrega dados das tabelas específicas (prioridade sobre storageService)
        const loadPromises = [
          apiService.getDepartments(),
          apiService.getContacts(),
          apiService.getQuickReplies(),
          apiService.getWorkflows()
        ];

        // Se for ADMIN, também carrega usuários
        if (currentUser.role === UserRole.ADMIN) {
          loadPromises.push(apiService.getUsers());
        }

        const results = await Promise.all(loadPromises);

        const [
          departmentsResult,
          contactsResult,
          quickRepliesResult,
          workflowsResult,
          usersResult
        ] = results;

        // Atualiza apenas se os dados vieram da API com sucesso
        if (departmentsResult.success && departmentsResult.data && departmentsResult.data.length > 0) {
          setDepartments(departmentsResult.data);
        }
        if (contactsResult.success && contactsResult.data && contactsResult.data.length > 0) {
          setContacts(contactsResult.data);
        }
        if (quickRepliesResult.success && quickRepliesResult.data && quickRepliesResult.data.length > 0) {
          setQuickReplies(quickRepliesResult.data);
        }
        if (workflowsResult.success && workflowsResult.data && workflowsResult.data.length > 0) {
          setWorkflows(workflowsResult.data);
        }
        // Atualiza usuários apenas se for ADMIN e tiver sucesso
        if (currentUser.role === UserRole.ADMIN && usersResult && usersResult.success && usersResult.data && usersResult.data.length > 0) {
          // Converte os usuários do formato da API para o formato interno
          const formattedUsers: User[] = usersResult.data.map((u: any) => ({
            id: u.id.toString(),
            name: u.name,
            email: u.email || u.username,
            role: u.role as UserRole,
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=0D9488&color=fff`,
            departmentId: undefined, // Não está na tabela users, pode vir de user_data se necessário
            allowGeneralConnection: false // Não está na tabela users, pode vir de user_data se necessário
          }));
          setUsers(formattedUsers);
        }
      } catch (error) {
        console.error('[App] Erro ao carregar dados das tabelas específicas:', error);
        // Em caso de erro, os dados do storageService já foram carregados no useEffect anterior
      }
    };

    loadSpecificTables();
  }, [currentUser]); // Executa quando o usuário fizer login

  // Refs para armazenar interval e Socket.IO
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const wsReconnectAttemptsRef = useRef<number>(0);
  const wsReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const INITIAL_RECONNECT_DELAY = 5000; // 5 segundos
  
  // Estado para rastrear status do WebSocket (para feedback visual)
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected');

  useEffect(() => {
    if (!currentUser || apiConfig.isDemo || !apiConfig.baseUrl) {
      // Limpa interval e WebSocket se não há usuário ou está em demo
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setWsStatus('disconnected');
      return;
    }

    const syncChats = async () => {
        // console.log('[App] Iniciando sync de chats...');
        const realChats = await fetchChats(apiConfig);
        // console.log(`[App] fetchChats retornou ${realChats.length} chats`);
        
        if (realChats.length > 0) {
            setChats(currentChats => {
                // console.log(`[App] Fazendo merge: ${currentChats.length} chats atuais com ${realChats.length} chats novos`);
                const mergedChats = realChats.map(realChat => {
                    // Tenta encontrar chat existente por ID ou por contactNumber
                    // IMPORTANTE: Preserva chats existentes que estão atribuídos e em 'open'
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
                        // Detecta qualquer ID gerado (cmin*, cmid*, cmio*, cmip*, cmit*, chat_*)
                        const existingIdIsGenerated = existingChat.id.includes('cmin') || 
                                                       existingChat.id.includes('cmid') || 
                                                       existingChat.id.includes('cmio') ||
                                                       existingChat.id.includes('cmip') ||
                                                       existingChat.id.includes('cmit') ||
                                                       existingChat.id.startsWith('chat_');
                        // ID válido: tem @, não é grupo, não é gerado
                        const realIdIsValid = realChat.id.includes('@') && 
                                              !realChat.id.includes('@g.us') && 
                                              !realChat.id.includes('cmin') && 
                                              !realChat.id.includes('cmid') && 
                                              !realChat.id.includes('cmio') &&
                                              !realChat.id.includes('cmip') &&
                                              !realChat.id.includes('cmit') &&
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
                        // Se uma mensagem local existe na API, prioriza a local se for mais recente
                        existingChat.messages.forEach(msg => {
                            // Verifica se a mensagem já existe na API (pode ter sido sincronizada)
                            const msgKey = msg.id || `${msg.timestamp?.getTime() || Date.now()}_${msg.content?.substring(0, 20) || ''}`;
                            const existingApiMsg = realChat.messages.find(apiMsg => {
                                // Verifica por ID do WhatsApp (mais confiável)
                                if (apiMsg.whatsappMessageId && msg.whatsappMessageId && 
                                    apiMsg.whatsappMessageId === msg.whatsappMessageId) {
                                    return true;
                                }
                                // Compara por ID interno
                                if (apiMsg.id && msg.id && apiMsg.id === msg.id) {
                                    return true;
                                }
                                // Para mensagens do agente, usa janela maior (30 segundos) e verifica conteúdo normalizado
                                if (msg.sender === 'agent' && apiMsg.sender === 'agent') {
                                    const contentMatch = apiMsg.content && msg.content && 
                                        apiMsg.content.trim() === msg.content.trim();
                                    const timeMatch = apiMsg.timestamp && msg.timestamp && 
                                        Math.abs(apiMsg.timestamp.getTime() - msg.timestamp.getTime()) < 30000;
                                    if (contentMatch && timeMatch) {
                                        return true;
                                    }
                                }
                                // Para outras mensagens, compara por conteúdo e timestamp próximo (10 segundos)
                                if (apiMsg.timestamp && msg.timestamp && apiMsg.content && msg.content) {
                                    const contentMatch = apiMsg.content.trim() === msg.content.trim();
                                    const timeDiff = Math.abs(apiMsg.timestamp.getTime() - msg.timestamp.getTime());
                                    if (contentMatch && timeDiff < 10000) {
                                        return true;
                                    }
                                }
                                return false;
                            });
                            
                            if (existingApiMsg) {
                                // Mensagem existe na API: prioriza a local se tiver whatsappMessageId ou for mais recente
                                if (msg.whatsappMessageId || 
                                    !msg.timestamp || !existingApiMsg.timestamp || 
                                    msg.timestamp.getTime() >= existingApiMsg.timestamp.getTime()) {
                                    // Mensagem local é mais recente ou tem whatsappMessageId, substitui a da API
                                    messageMap.set(msgKey, msg);
                                }
                                // Se a da API for mais recente, mantém a da API (já está no map)
                            } else {
                                // Mensagem não existe na API, verifica se já não está no map antes de adicionar
                                const alreadyInMap = Array.from(messageMap.values()).some(m => {
                                    // Verifica por ID do WhatsApp
                                    if (m.whatsappMessageId && msg.whatsappMessageId && 
                                        m.whatsappMessageId === msg.whatsappMessageId) {
                                        return true;
                                    }
                                    // Verifica por ID interno
                                    if (m.id && msg.id && m.id === msg.id) {
                                        return true;
                                    }
                                    // Verifica por conteúdo + timestamp (para mensagens do agente, usa janela maior)
                                    if (m.content && msg.content && m.sender === msg.sender) {
                                        const contentMatch = m.content.trim() === msg.content.trim();
                                        const timeWindow = msg.sender === 'agent' ? 30000 : 10000;
                                        const timeMatch = m.timestamp && msg.timestamp && 
                                            Math.abs(m.timestamp.getTime() - msg.timestamp.getTime()) < timeWindow;
                                        if (contentMatch && timeMatch) {
                                            return true;
                                        }
                                    }
                                    return false;
                                });
                                
                                if (!alreadyInMap) {
                                    messageMap.set(msgKey, msg);
                                }
                            }
                        });
                        
                        // Se não há mensagens na API, tenta buscar mensagens do chat (mesmo sem mensagens locais)
                        // Isso garante que mensagens recebidas apareçam mesmo quando a API não retorna no findChats
                        // SEMPRE tenta buscar mensagens via fetchChatMessages (mesmo que já tenha algumas)
                        // Isso garante que mensagens recebidas apareçam mesmo se o Socket.IO não funcionar
                        const chatId = realChat.id || existingChat.id;
                        const lastFetchKey = `last_fetch_${chatId}`;
                        const lastFetch = sessionStorage.getItem(lastFetchKey);
                        const now = Date.now();
                        
                        // Só busca se não buscou nos últimos 5 segundos (evita spam e atualizações excessivas)
                        if (!lastFetch || (now - parseInt(lastFetch)) > 5000) {
                            sessionStorage.setItem(lastFetchKey, now.toString());
                            
                            fetchChatMessages(apiConfig, chatId, 100).then(apiMessages => {
                                if (apiMessages.length > 0) {
                                    // Log removido para produção - muito verboso
                                    // console.log(`[App] 🔄 Buscou ${apiMessages.length} mensagens da API para ${chatId}`);
                                    setChats(currentChats => {
                                        return currentChats.map(c => {
                                            if (c.id === chatId || normalizeJid(c.id) === normalizeJid(chatId)) {
                                                // Merge das mensagens da API com as locais
                                                // Usa Map para garantir unicidade, mas preserva mensagens locais quando há conflito de timestamp
                                                const messageMap = new Map<string, Message>();
                                                
                                                // Primeiro adiciona mensagens da API (histórico)
                                                apiMessages.forEach(msg => {
                                                    const msgKey = msg.id || `${msg.timestamp?.getTime()}_${msg.content?.substring(0, 50)}`;
                                                    if (!messageMap.has(msgKey)) {
                                                        messageMap.set(msgKey, msg);
                                                    }
                                                });
                                                
                                                // Depois adiciona mensagens locais (prioriza sobre API se houver conflito)
                                                c.messages.forEach(msg => {
                                                    const msgKey = msg.id || `${msg.timestamp?.getTime()}_${msg.content?.substring(0, 50)}`;
                                                    // Verifica se já existe na API usando múltiplos critérios
                                                    const existingApiMsg = Array.from(messageMap.values()).find(m => {
                                                        // Verifica por ID do WhatsApp (mais confiável)
                                                        if (m.whatsappMessageId && msg.whatsappMessageId && 
                                                            m.whatsappMessageId === msg.whatsappMessageId) {
                                                            return true;
                                                        }
                                                        // Verifica por ID interno
                                                        if (m.id && msg.id && m.id === msg.id) {
                                                            return true;
                                                        }
                                                        // Para mensagens do agente, usa janela maior (30 segundos)
                                                        if (msg.sender === 'agent' && m.sender === 'agent') {
                                                            const contentMatch = m.content && msg.content && 
                                                                m.content.trim() === msg.content.trim();
                                                            const timeMatch = m.timestamp && msg.timestamp && 
                                                                Math.abs(m.timestamp.getTime() - msg.timestamp.getTime()) < 30000;
                                                            if (contentMatch && timeMatch) {
                                                                return true;
                                                            }
                                                        }
                                                        // Para outras mensagens, usa janela menor (10 segundos)
                                                        if (m.content && msg.content && 
                                                            m.content.trim() === msg.content.trim() &&
                                                            m.sender === msg.sender &&
                                                            m.timestamp && msg.timestamp && 
                                                            Math.abs(m.timestamp.getTime() - msg.timestamp.getTime()) < 10000) {
                                                            return true;
                                                        }
                                                        return false;
                                                    });
                                                    
                                                    if (existingApiMsg) {
                                                        // Se a mensagem local tem whatsappMessageId ou é mais recente, prioriza a local
                                                        // Isso garante que mensagens atualizadas localmente não sejam sobrescritas
                                                        if (msg.whatsappMessageId || 
                                                            !msg.timestamp || !existingApiMsg.timestamp || 
                                                            msg.timestamp.getTime() >= existingApiMsg.timestamp.getTime()) {
                                                            messageMap.set(msgKey, msg);
                                                        }
                                                    } else {
                                                        // Nova mensagem local, adiciona
                                                        messageMap.set(msgKey, msg);
                                                    }
                                                });
                                                
                                                // Ordena por timestamp, respeitando ordem cronológica real
                                                const uniqueMessages = Array.from(messageMap.values())
                                                    .sort((a, b) => {
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
                                                        
                                                        // PRIORIDADE 3: Se timestamps são idênticos ou muito próximos e mesmo sender, mantém ordem de inserção
                                                        // (retorna 0 para manter ordem estável quando senders são iguais)
                                                        return 0;
                                                    });
                                                
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
                                                    // Notifica se estiver atribuído ao usuário atual ou se não estiver atribuído a ninguém (triagem)
                                                    if (c.assignedTo === currentUser.id || !c.assignedTo) {
                                                        addNotification(
                                                            `Nova mensagem de ${c.contactName}`,
                                                            lastNewMsg.content.length > 50 ? lastNewMsg.content.substring(0, 50) + '...' : lastNewMsg.content,
                                                            'info',
                                                            true, // Toca som
                                                            true  // Mostra notificação do navegador
                                                        );
                                                    }
                                                }
                                                
                                                if (uniqueMessages.length > c.messages.length) {
                                                    // Log removido para produção - muito verboso
                                                    // console.log(`[App] ✅ Adicionadas ${uniqueMessages.length - c.messages.length} novas mensagens ao chat ${c.contactName}`);
                                                }
                                                
                                                // Lógica para processar mensagens de clientes finalizados
                                                let updatedChat = { ...c };
                                                
                                                // Verifica se há novas mensagens do cliente em chat finalizado
                                                if (c.status === 'closed' && newReceivedMessages.length > 0) {
                                                    const lastNewMessage = newReceivedMessages[newReceivedMessages.length - 1];
                                                    const messageContent = lastNewMessage.content.trim();
                                                    const isRatingResponse = /^[1-5]$/.test(messageContent);
                                                    
                                                    if (isRatingResponse && c.awaitingRating) {
                                                        // Cliente respondeu com avaliação (1-5)
                                                        const rating = parseInt(messageContent);
                                                        updatedChat = {
                                                            ...c,
                                                            rating: rating,
                                                            awaitingRating: false, // Não está mais aguardando
                                                            status: 'closed' // Mantém finalizado
                                                        };
                                                        // Log removido para produção - muito verboso
                                                        // console.log(`[App] ✅ Avaliação recebida: ${rating} estrelas para chat ${c.contactName}`);
                                                    } else if (!isRatingResponse) {
                                                        // Cliente enviou nova mensagem (não é avaliação) - reabre o chat
                                                        updatedChat = {
                                                            ...c,
                                                            status: 'open',
                                                            awaitingRating: false, // Cancela aguardo de avaliação
                                                            departmentId: null, // Remove do departamento para ir para triagem
                                                            assignedTo: undefined, // Remove atribuição
                                                            endedAt: undefined // Remove data de finalização
                                                        };
                                                        // Log removido para produção - muito verboso
                                                        // console.log(`[App] 🔄 Chat ${c.contactName} reaberto - cliente enviou nova mensagem`);
                                                    }
                                                }
                                                
                                                // Só atualiza lastMessageTime se realmente houver nova mensagem
                                                const hasNewMessagesInFetch = uniqueMessages.length > c.messages.length;
                                                const lastUniqueMsg = uniqueMessages.length > 0 ? uniqueMessages[uniqueMessages.length - 1] : null;
                                                const lastExistingMsg = c.messages.length > 0 ? c.messages[c.messages.length - 1] : null;
                                                
                                                const shouldUpdateTime = hasNewMessagesInFetch && lastUniqueMsg && 
                                                    (!lastExistingMsg || 
                                                     !lastUniqueMsg.id || 
                                                     lastUniqueMsg.id !== lastExistingMsg.id ||
                                                     (lastUniqueMsg.timestamp && lastExistingMsg.timestamp && 
                                                      lastUniqueMsg.timestamp.getTime() > lastExistingMsg.timestamp.getTime()));
                                                
                                                return {
                                                    ...updatedChat,
                                                    messages: uniqueMessages,
                                                    lastMessage: uniqueMessages.length > 0 ? 
                                                        (uniqueMessages[uniqueMessages.length - 1].type === 'text' ? 
                                                            uniqueMessages[uniqueMessages.length - 1].content : 
                                                            `📷 ${uniqueMessages[uniqueMessages.length - 1].type}`) : 
                                                        updatedChat.lastMessage,
                                                    // Só atualiza lastMessageTime se realmente houver nova mensagem
                                                    lastMessageTime: shouldUpdateTime && lastUniqueMsg?.timestamp ? 
                                                        lastUniqueMsg.timestamp : 
                                                        updatedChat.lastMessageTime,
                                                    unreadCount: newReceivedMessages.length > 0 ? 
                                                        (updatedChat.unreadCount || 0) + newReceivedMessages.length : 
                                                        updatedChat.unreadCount
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
                        
                        // Converte para array e ordena por timestamp
                        // Preserva ordem de mensagens locais quando timestamps são muito próximos
                        const allMessages = Array.from(messageMap.values());
                        // Cria um índice para rastrear ordem de inserção (mensagens locais têm índice maior)
                        const messageOrder = new Map<string, number>();
                        let orderIndex = 0;
                        realChat.messages.forEach(msg => {
                            const key = msg.id || `${msg.timestamp?.getTime()}_${msg.content?.substring(0, 20)}`;
                            messageOrder.set(key, orderIndex++);
                        });
                        existingChat.messages.forEach(msg => {
                            const key = msg.id || `${msg.timestamp?.getTime()}_${msg.content?.substring(0, 20)}`;
                            if (!messageOrder.has(key)) {
                                messageOrder.set(key, orderIndex++);
                            }
                        });
                        
                        // Adiciona índice de ordem às mensagens antes de ordenar
                        const messagesWithOrder = allMessages.map((msg, index) => ({
                            ...msg,
                            _sortOrder: messageOrder.get(msg.id || `${msg.timestamp?.getTime()}_${msg.content?.substring(0, 20)}`) ?? index + 1000
                        }));
                        
                        mergedMessages.push(...messagesWithOrder);
                        mergedMessages.sort((a, b) => {
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
                            
                            // PRIORIDADE 3: Se timestamps são idênticos ou muito próximos e mesmo sender, usa ordem de inserção
                            // Mas só aplica se os senders forem iguais (caso contrário, a PRIORIDADE 1 já foi aplicada)
                            if (a.sender === b.sender) {
                                const orderA = (a as any)._sortOrder ?? 0;
                                const orderB = (b as any)._sortOrder ?? 0;
                                return orderA - orderB;
                            }
                            
                            // Se chegou aqui, os senders são diferentes mas a PRIORIDADE 1 não foi aplicada
                            // Isso não deveria acontecer, mas como fallback, usa timestamp
                            return timeDiff;
                        });
                        
                        // Remove o campo temporário de ordenação
                        mergedMessages.forEach(msg => {
                            delete (msg as any)._sortOrder;
                        });

                        // Preserva status local (closed ou open) - a API sempre retorna 'open', então precisamos preservar o status local
                        // Se o chat foi finalizado localmente (closed), mantém closed a menos que tenha nova mensagem do cliente
                        // Se o chat foi reaberto localmente (open), mantém open
                        let finalStatus = existingChat.status;
                        
                        // Verifica se há novas mensagens do cliente nas mensagens mescladas
                        // Se houver, pode ser que o chat precise ser reaberto
                        const hasNewUserMessages = mergedMessages.length > existingChat.messages.length && 
                                                  mergedMessages.some(msg => {
                                                      const isNew = !existingChat.messages.some(existingMsg => 
                                                          existingMsg.id === msg.id || 
                                                          (existingMsg.timestamp && msg.timestamp && 
                                                           Math.abs(existingMsg.timestamp.getTime() - msg.timestamp.getTime()) < 5000 &&
                                                           existingMsg.content === msg.content)
                                                      );
                                                      return isNew && msg.sender === 'user';
                                                  });
                        
                        // Se o chat está finalizado mas há nova mensagem do cliente, verifica se deve reabrir
                        if (existingChat.status === 'closed' && hasNewUserMessages) {
                            const lastNewUserMessage = mergedMessages
                                .filter(msg => msg.sender === 'user')
                                .find(msg => !existingChat.messages.some(existingMsg => 
                                    existingMsg.id === msg.id || 
                                    (existingMsg.timestamp && msg.timestamp && 
                                     Math.abs(existingMsg.timestamp.getTime() - msg.timestamp.getTime()) < 5000 &&
                                     existingMsg.content === msg.content)
                                ));
                            
                            if (lastNewUserMessage) {
                                const messageContent = lastNewUserMessage.content.trim();
                                const isRatingResponse = /^[1-5]$/.test(messageContent);
                                
                                // Se não é avaliação, reabre o chat
                                if (!isRatingResponse || !existingChat.awaitingRating) {
                                    finalStatus = 'open';
                                    // Log removido para produção - muito verboso
                                    // console.log(`[App] 🔄 Chat ${existingChat.contactName} reaberto via sync - cliente enviou nova mensagem`);
                                } else {
                                    // É avaliação, mantém fechado
                                    finalStatus = 'closed';
                                }
                            } else {
                                // Não encontrou mensagem nova, mantém fechado
                                finalStatus = 'closed';
                            }
                        }
                        // Se o chat está finalizado e não há novas mensagens, mantém fechado
                        else if (existingChat.status === 'closed' && !hasNewUserMessages) {
                            finalStatus = 'closed';
                        }
                        // Se o chat foi reaberto localmente (open), mantém open mesmo se API retornar closed
                        else if (existingChat.status === 'open' && realChat.status === 'closed') {
                            finalStatus = 'open';
                        }
                        // Se o chat está atribuído e em 'open', sempre mantém 'open' (preserva após reload)
                        // IMPORTANTE: Status do banco tem prioridade absoluta se o chat está atribuído
                        else if (existingChat.status === 'open' && existingChat.assignedTo) {
                            finalStatus = 'open'; // Força 'open' se está atribuído - nunca volta para 'pending'
                        }
                        // Se o chat está atribuído (mesmo que status seja 'pending'), preserva status do banco
                        else if (existingChat.assignedTo) {
                            // Se está atribuído, sempre usa status do banco (não permite API sobrescrever)
                            finalStatus = existingChat.status;
                        }
                        // Caso padrão: usa o status existente (que já é 'open' ou 'pending')
                        else {
                            finalStatus = existingChat.status || realChat.status;
                        }
                        
                        // Se o chat foi reaberto (mudou de closed para open), limpa departamento e atribuição
                        const wasReopened = existingChat.status === 'closed' && finalStatus === 'open';
                        
                        // Detecta se há novas mensagens reais (não apenas reordenação)
                        const hasNewMessages = mergedMessages.length > existingChat.messages.length;
                        const lastMergedMsg = mergedMessages.length > 0 ? mergedMessages[mergedMessages.length - 1] : null;
                        const lastExistingMsg = existingChat.messages.length > 0 ? existingChat.messages[existingChat.messages.length - 1] : null;
                        
                        // Lógica de seleção de setores para novos contatos
                        let finalDepartmentId = wasReopened ? null : existingChat.departmentId;
                        let finalStatusForDept = finalStatus;
                        
                        // Preserva status 'open' se o chat já está atribuído e em 'open'
                        // Isso evita que chats em "A Fazer" voltem para "Aguardando" durante sync
                        const isAssignedAndOpen = existingChat.status === 'open' && existingChat.assignedTo;
                        
                        if (hasNewUserMessages && existingChat.departmentId === null && departments.length > 0) {
                            // Encontra a última mensagem nova do usuário
                            const newUserMessages = mergedMessages.filter(msg => {
                                const isNew = !existingChat.messages.some(existingMsg => 
                                    existingMsg.id === msg.id || 
                                    (existingMsg.timestamp && msg.timestamp && 
                                     Math.abs(existingMsg.timestamp.getTime() - msg.timestamp.getTime()) < 5000 &&
                                     existingMsg.content === msg.content)
                                );
                                return isNew && msg.sender === 'user';
                            });
                            
                            if (newUserMessages.length > 0) {
                                const lastNewUserMessage = newUserMessages[newUserMessages.length - 1];
                                const messageContent = lastNewUserMessage.content.trim();
                                
                                // Verifica se é resposta numérica para seleção de setor
                                const selectedDeptId = processDepartmentSelection(messageContent, departments);
                                
                                if (selectedDeptId) {
                                    // Usuário selecionou um setor válido
                                    finalDepartmentId = selectedDeptId;
                                    // Só muda para 'pending' se o chat não estiver atribuído
                                    // Se já estiver 'open' e atribuído, mantém 'open' (evita voltar para "Aguardando")
                                    if (isAssignedAndOpen) {
                                        finalStatusForDept = 'open'; // Mantém 'open' se já está atribuído
                                    } else {
                                        finalStatusForDept = 'pending'; // Vai para triagem do setor
                                    }
                                    // Log removido para produção - muito verboso
                                    // console.log(`[App] ✅ Setor selecionado pelo usuário via sync: ${departments.find(d => d.id === selectedDeptId)?.name}`);
                                    
                                    // Remove a mensagem numérica da lista (é apenas uma resposta de seleção)
                                    const messageIndex = mergedMessages.findIndex(m => m.id === lastNewUserMessage.id);
                                    if (messageIndex >= 0) {
                                        mergedMessages.splice(messageIndex, 1);
                                    }
                                    
                                    // Adiciona mensagem de confirmação do sistema
                                    mergedMessages.push({
                                        id: `sys_dept_${Date.now()}`,
                                        content: `Atendimento direcionado para ${departments.find(d => d.id === selectedDeptId)?.name}`,
                                        sender: 'system',
                                        timestamp: new Date(),
                                        status: MessageStatus.READ,
                                        type: 'text'
                                    });
                                } else {
                                    // É primeira mensagem do usuário e ainda não tem departamento - envia mensagem de seleção
                                    // Verifica se já foi enviada para evitar duplicatas
                                    const hasUserMessages = mergedMessages.some(m => m.sender === 'user');
                                    const isFirstUserMessage = hasUserMessages && 
                                        !existingChat.departmentSelectionSent && 
                                        !existingChat.departmentId;
                                    
                                    if (isFirstUserMessage) {
                                        // Garante que o status seja 'open' quando enviar mensagem de seleção (não 'closed')
                                        const chatStatusForSelection = existingChat.status === 'closed' ? 'open' : existingChat.status;
                                        
                                        // Envia mensagem de seleção de setores de forma assíncrona
                                        sendDepartmentSelectionMessage(
                                            apiConfig,
                                            existingChat.contactNumber,
                                            departments
                                        ).then(sent => {
                                            if (sent) {
                                                // Log removido para produção - muito verboso
                                                // console.log(`[App] ✅ Mensagem de seleção de setores enviada para ${existingChat.contactName} via sync`);
                                                // Marca que a mensagem foi enviada e garante status 'open'
                                                handleUpdateChat({
                                                    ...existingChat,
                                                    status: chatStatusForSelection,
                                                    departmentSelectionSent: true,
                                                    awaitingDepartmentSelection: true
                                                });
                                            } else {
                                                console.error(`[App] ❌ Falha ao enviar mensagem de seleção de setores para ${existingChat.contactName}`);
                                            }
                                        }).catch(err => {
                                            console.error(`[App] ❌ Erro ao enviar mensagem de seleção de setores:`, err);
                                        });
                                    } else if (hasUserMessages && !existingChat.departmentId && departments.length === 0) {
                                        // Se não há departamentos cadastrados, processa chatbot
                                        processChatbotMessages(apiConfig, chatbotConfig, {
                                            ...existingChat,
                                            messages: mergedMessages
                                        }).then(result => {
                                            if (result.sent && result.type) {
                                                // Adiciona mensagem de sistema indicando que o chatbot enviou
                                                const systemMessage: Message = {
                                                    id: `sys_chatbot_${Date.now()}`,
                                                    content: result.type === 'greeting' 
                                                        ? 'greeting_sent - Saudação automática enviada'
                                                        : 'away_sent - Mensagem de ausência enviada',
                                                    sender: 'system',
                                                    timestamp: new Date(),
                                                    status: MessageStatus.READ,
                                                    type: 'text'
                                                };
                                                mergedMessages.push(systemMessage);
                                                
                                                // Atualiza o chat com a mensagem de sistema
                                                handleUpdateChat({
                                                    ...existingChat,
                                                    messages: mergedMessages
                                                });
                                                
                                                // Log removido para produção - muito verboso
                                                // console.log(`[App] ✅ Chatbot processou mensagem para ${existingChat.contactName}`);
                                            }
                                        }).catch(err => {
                                            console.error(`[App] ❌ Erro ao processar chatbot:`, err);
                                        });
                                    }
                                }
                            }
                        }
                        
                        // Garante que chats atribuídos e em 'open' não voltem para 'pending' durante sync
                        // Isso previne que chats em "A Fazer" voltem para "Aguardando"
                        // IMPORTANTE: Preserva status 'open' se chat está atribuído, mesmo após reload
                        if (isAssignedAndOpen) {
                            // Se o chat está atribuído e em 'open', sempre mantém 'open'
                            finalStatusForDept = 'open';
                        } else if (existingChat.status === 'open' && existingChat.assignedTo && finalStatusForDept === 'pending') {
                            // Fallback: se por algum motivo o status foi alterado para 'pending' mas o chat está atribuído, corrige
                            finalStatusForDept = 'open';
                        }
                        
                        // Só atualiza lastMessageTime se realmente houver nova mensagem (não apenas reordenação)
                        const shouldUpdateLastMessageTime = hasNewMessages && lastMergedMsg && 
                            (!lastExistingMsg || 
                             !lastMergedMsg.id || 
                             lastMergedMsg.id !== lastExistingMsg.id ||
                             (lastMergedMsg.timestamp && lastExistingMsg.timestamp && 
                              lastMergedMsg.timestamp.getTime() > lastExistingMsg.timestamp.getTime()));
                        
                        return {
                            ...realChat,
                            messages: mergedMessages, // Usa mensagens mescladas
                            id: shouldUpdateId ? realChat.id : existingChat.id, // Atualiza ID se existente for gerado e real for válido
                            contactName: existingChat.contactName, // Mantém nome editado localmente se houver
                            contactNumber: useRealContactNumber ? realChat.contactNumber : existingChat.contactNumber, // Atualiza se número mais completo
                            clientCode: existingChat.clientCode,
                            // Se chat foi reaberto ou setor foi selecionado, atualiza departamento
                            departmentId: finalDepartmentId,
                            assignedTo: wasReopened ? undefined : existingChat.assignedTo,
                            tags: existingChat.tags,
                            status: finalStatusForDept,
                            rating: existingChat.rating,
                            awaitingRating: wasReopened ? false : existingChat.awaitingRating, // Cancela aguardo de avaliação se reaberto
                            awaitingDepartmentSelection: (finalDepartmentId && finalDepartmentId !== existingChat.departmentId) ? false : existingChat.awaitingDepartmentSelection, // Cancela se setor foi selecionado
                            departmentSelectionSent: existingChat.departmentSelectionSent || false, // Mantém flag de envio
                            activeWorkflow: existingChat.activeWorkflow,
                            endedAt: wasReopened ? undefined : existingChat.endedAt, // Remove endedAt se reaberto
                            lastMessage: mergedMessages.length > 0 ? 
                                (mergedMessages[mergedMessages.length - 1].type === 'text' ? 
                                    mergedMessages[mergedMessages.length - 1].content : 
                                    `📷 ${mergedMessages[mergedMessages.length - 1].type}`) : 
                                (existingChat.lastMessage || realChat.lastMessage),
                            // Só atualiza lastMessageTime se realmente houver nova mensagem
                            lastMessageTime: shouldUpdateLastMessageTime && lastMergedMsg?.timestamp ? 
                                lastMergedMsg.timestamp : 
                                existingChat.lastMessageTime
                        };
                    } else {
                        // Novo chat encontrado - verifica se precisa enviar mensagem de seleção de setores
                        const hasUserMessages = realChat.messages.some(m => m.sender === 'user');
                        const needsDepartmentSelection = hasUserMessages && 
                            !realChat.departmentId && 
                            !realChat.departmentSelectionSent &&
                            departments.length > 0;
                        
                        if (needsDepartmentSelection) {
                            // Envia mensagem de seleção de setores de forma assíncrona
                            sendDepartmentSelectionMessage(
                                apiConfig,
                                realChat.contactNumber,
                                departments
                            ).then(sent => {
                                if (sent) {
                                    // Log removido para produção - muito verboso
                                    // console.log(`[App] ✅ Mensagem de seleção de setores enviada para novo chat ${realChat.contactName}`);
                                    // Atualiza o chat para marcar que a mensagem foi enviada
                                    setChats(currentChats => {
                                        return currentChats.map(c => 
                                            c.id === realChat.id 
                                                ? { ...c, departmentSelectionSent: true, awaitingDepartmentSelection: true }
                                                : c
                                        );
                                    });
                                } else {
                                    console.error(`[App] ❌ Falha ao enviar mensagem de seleção de setores para novo chat ${realChat.contactName}`);
                                }
                            }).catch(err => {
                                console.error(`[App] ❌ Erro ao enviar mensagem de seleção de setores para novo chat:`, err);
                            });
                        } else if (hasUserMessages && !realChat.departmentId) {
                            // Se não precisa de seleção de setores mas é novo chat sem departamento, processa chatbot
                            processChatbotMessages(apiConfig, chatbotConfig, realChat).then(result => {
                                if (result.sent && result.type) {
                                    // Adiciona mensagem de sistema indicando que o chatbot enviou
                                    const systemMessage: Message = {
                                        id: `sys_chatbot_${Date.now()}`,
                                        content: result.type === 'greeting' 
                                            ? 'greeting_sent - Saudação automática enviada'
                                            : 'away_sent - Mensagem de ausência enviada',
                                        sender: 'system',
                                        timestamp: new Date(),
                                        status: MessageStatus.READ,
                                        type: 'text'
                                    };
                                    
                                    // Atualiza o chat com a mensagem de sistema
                                    handleUpdateChat({
                                        ...realChat,
                                        messages: [...(realChat.messages || []), systemMessage]
                                    });
                                    
                                    // Log removido para produção - muito verboso
                                    // console.log(`[App] ✅ Chatbot processou mensagem para novo chat ${realChat.contactName}`);
                                }
                            }).catch(err => {
                                console.error(`[App] ❌ Erro ao processar chatbot:`, err);
                            });
                        }
                        
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

    // Primeira sincronização
    syncChats();
    
    // Polling a cada 5 segundos para evitar atualizações excessivas (era 2s)
    intervalIdRef.current = setInterval(syncChats, 5000);
    
    // Inicializa Socket.IO de forma assíncrona
    const initWebSocket = async (isReconnect: boolean = false) => {
        // Limpa timeout anterior se existir
        if (wsReconnectTimeoutRef.current) {
            clearTimeout(wsReconnectTimeoutRef.current);
            wsReconnectTimeoutRef.current = null;
        }
        
        if (apiConfig.isDemo || !apiConfig.baseUrl) {
            if (!isReconnect) {
                console.log('[App] Socket.IO desabilitado: isDemo ou baseUrl vazio');
            }
            return;
        }
        
        // Verifica limite de tentativas
        if (isReconnect && wsReconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            console.warn(`[App] ⚠️ Limite de ${MAX_RECONNECT_ATTEMPTS} tentativas de reconexão Socket.IO atingido. Parando tentativas.`);
            return;
        }
        
        try {
            // Atualiza status para "connecting" quando inicia tentativa
            if (!isReconnect) {
                setWsStatus('connecting');
            }
            
            // Verifica se instância está ativa antes de tentar conectar
            const active = await findActiveInstance(apiConfig);
            const instanceName = active?.instanceName || apiConfig.instanceName;
            
            if (!instanceName) {
                if (!isReconnect) {
                    console.log('[App] Socket.IO desabilitado: instância não encontrada');
                    setWsStatus('failed');
                }
                return;
            }
            
            // Se instância não está conectada, não tenta Socket.IO (mas permite "unknown" para tentar conectar)
            if (active && active.status && active.status !== 'open' && active.status !== 'unknown') {
                if (!isReconnect) {
                    console.warn(`[App] Socket.IO desabilitado: instância ${instanceName} não está conectada (status: ${active.status})`);
                    setWsStatus('failed');
                }
                return;
            }
            
            const apiKey = apiConfig.apiKey || apiConfig.authenticationApiKey || '';
            
            // Verifica se tem apiKey antes de tentar conectar
            if (!apiKey) {
                console.warn('[App] ⚠️ Socket.IO: apiKey não configurada. Conexão pode ser rejeitada.');
                setWsStatus('failed');
                return;
            }
            
            // Desconecta socket anterior se existir
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            
            // Cria conexão Socket.IO com autenticação
            const socket = io(apiConfig.baseUrl, {
                path: '/socket.io/',
                transports: ['websocket', 'polling'], // Tenta WebSocket primeiro, fallback para polling
                query: {
                    instance: instanceName,
                    apikey: apiKey
                },
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
                timeout: 20000
            });
            
            socketRef.current = socket;
            
            // Event: connect
            socket.on('connect', () => {
                console.log('[App] ✅ Socket.IO conectado com sucesso!');
                wsReconnectAttemptsRef.current = 0;
                setWsStatus('connected');
            });
            
            // Event: disconnect
            socket.on('disconnect', (reason: string) => {
                if (reason === 'io server disconnect') {
                    // Servidor desconectou, precisa reconectar manualmente
                    console.warn('[App] ⚠️ Socket.IO desconectado pelo servidor. Tentando reconectar...');
                    setWsStatus('connecting');
                    socket.connect();
                } else {
                    // Desconexão normal ou erro de transporte
                    console.log(`[App] ℹ️ Socket.IO desconectado: ${reason}`);
                    setWsStatus('disconnected');
                }
            });
            
            // Event: connect_error
            socket.on('connect_error', (error: Error) => {
                wsReconnectAttemptsRef.current += 1;
                if (wsReconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
                    console.warn('[App] ⚠️ Socket.IO: Erro ao conectar. Sistema funcionando via polling (sincronização periódica).');
                    setWsStatus('failed');
                } else {
                    setWsStatus('connecting');
                    console.warn(`[App] ⚠️ Socket.IO: Erro de conexão (tentativa ${wsReconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}):`, error.message);
                }
            });
            
            // Event: messages.upsert - mensagens novas ou atualizadas
            socket.on('messages.upsert', (data: any) => {
                try {
                    // Processa mensagens recebidas - múltiplos formatos possíveis
                    // Formato 1: { key: {...}, message: {...} }
                    // Formato 2: { data: { key: {...}, message: {...} } }
                    let messageData: any = null;
                    
                    if (data.data && data.data.key) {
                        messageData = data.data;
                    } else if (data.key) {
                        messageData = data;
                    } else {
                        messageData = data;
                    }
                    
                    if (messageData && messageData.key && messageData.key.remoteJid) {
                        const remoteJid = normalizeJid(messageData.key.remoteJid);
                        const mapped = mapApiMessageToInternal(messageData);
                        
                        if (mapped) {
                            setChats(currentChats => {
                                let chatUpdated = false;
                                const updatedChats = currentChats.map(chat => {
                                    // Encontra o chat pelo JID
                                    const chatJid = normalizeJid(chat.id);
                                    const messageJid = normalizeJid(remoteJid);
                                    
                                    // Comparação mais flexível de JIDs
                                    const chatNumber = chat.contactNumber?.replace(/\D/g, '') || '';
                                    const messageNumber = messageJid.split('@')[0].replace(/\D/g, '');
                                    const chatNumberMatch = chatNumber && messageNumber && (
                                        chatNumber === messageNumber || 
                                        chatNumber.endsWith(messageNumber.slice(-8)) ||
                                        messageNumber.endsWith(chatNumber.slice(-8))
                                    );
                                    
                                    if (chatJid === messageJid || chatNumberMatch) {
                                        // Para mensagens enviadas (fromMe: true), tenta atualizar mensagem local existente
                                        // ao invés de adicionar uma nova (evita duplicação)
                                        let messageIndex = -1;
                                        let shouldUpdate = false;
                                        
                                        // Para mensagens enviadas (agent), tenta encontrar mensagem local para atualizar
                                        if (mapped.sender === 'agent') {
                                                // Procura mensagem local sem whatsappMessageId mas com mesmo conteúdo e timestamp próximo
                                                messageIndex = chat.messages.findIndex(m => {
                                                    // Se já tem whatsappMessageId, verifica por ele (mais confiável)
                                                    if (m.whatsappMessageId && mapped.whatsappMessageId && 
                                                        m.whatsappMessageId === mapped.whatsappMessageId) {
                                                        return true;
                                                    }
                                                    // Se não tem whatsappMessageId, verifica por conteúdo + timestamp (mensagem local pendente)
                                                    // Aumenta janela de tempo para 30 segundos para capturar confirmações com delay
                                                    if (!m.whatsappMessageId && m.sender === 'agent') {
                                                        const contentMatch = m.content && mapped.content && 
                                                            m.content.trim() === mapped.content.trim();
                                                        const timeMatch = m.timestamp && mapped.timestamp && 
                                                            Math.abs(m.timestamp.getTime() - mapped.timestamp.getTime()) < 30000;
                                                        if (contentMatch && timeMatch) {
                                                            return true;
                                                        }
                                                    }
                                                    return false;
                                                });
                                                
                                                if (messageIndex >= 0) {
                                                    shouldUpdate = true;
                                                }
                                            }
                                            
                                            // Verifica se a mensagem já existe (para mensagens recebidas ou já atualizadas)
                                            const exists = !shouldUpdate && chat.messages.some(m => {
                                                // Verifica por ID do WhatsApp (mais confiável)
                                                if (m.whatsappMessageId && mapped.whatsappMessageId && 
                                                    m.whatsappMessageId === mapped.whatsappMessageId) {
                                                    return true;
                                                }
                                                // Verifica por ID interno
                                                if (m.id && mapped.id && m.id === mapped.id) {
                                                    return true;
                                                }
                                                // Para mensagens do agente, verifica também por conteúdo + timestamp (pode ter sido atualizada)
                                                if (mapped.sender === 'agent' && m.sender === 'agent') {
                                                    const contentMatch = m.content && mapped.content && 
                                                        m.content.trim() === mapped.content.trim();
                                                    const timeMatch = m.timestamp && mapped.timestamp && 
                                                        Math.abs(m.timestamp.getTime() - mapped.timestamp.getTime()) < 30000;
                                                    if (contentMatch && timeMatch) {
                                                        return true;
                                                    }
                                                }
                                                // Para outras mensagens, verifica por conteúdo + timestamp muito próximo (evita duplicação)
                                                if (m.content && mapped.content && 
                                                    m.content.trim() === mapped.content.trim() &&
                                                    m.sender === mapped.sender &&
                                                    m.timestamp && mapped.timestamp && 
                                                    Math.abs(m.timestamp.getTime() - mapped.timestamp.getTime()) < 1000) {
                                                    return true;
                                                }
                                                return false;
                                            });
                                            
                                            if (shouldUpdate && messageIndex >= 0) {
                                            // Atualiza mensagem local existente com dados da API (inclui whatsappMessageId)
                                            chatUpdated = true;
                                            // Log removido para produção - muito verboso
                                            // console.log(`[App] 🔄 Mensagem enviada atualizada com ID do WhatsApp no chat ${chat.contactName}`);
                                            const updatedMessages = [...chat.messages];
                                            updatedMessages[messageIndex] = {
                                                ...updatedMessages[messageIndex],
                                                whatsappMessageId: mapped.whatsappMessageId,
                                                id: mapped.whatsappMessageId || updatedMessages[messageIndex].id, // Usa ID do WhatsApp se disponível
                                                rawMessage: mapped.rawMessage,
                                                status: mapped.status // Atualiza status (pode ter mudado)
                                            };
                                            
                                            // Reordena após atualização
                                            const sortedMessages = updatedMessages.sort((a, b) => {
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
                                                
                                                // PRIORIDADE 3: Se timestamps são idênticos ou muito próximos e mesmo sender, mantém ordem de inserção
                                                // (retorna 0 para manter ordem estável quando senders são iguais)
                                                return 0;
                                            });
                                            
                                            // Lógica para processar mensagens de clientes finalizados
                                            let updatedChat = { ...chat };
                                            
                                            return {
                                                ...updatedChat,
                                                messages: sortedMessages,
                                                lastMessage: mapped.type === 'text' ? mapped.content : `📷 ${mapped.type}`,
                                                lastMessageTime: mapped.timestamp,
                                                unreadCount: updatedChat.unreadCount
                                            };
                                        } else if (!exists) {
                                            // Nova mensagem (não existe e não é atualização)
                                            chatUpdated = true;
                                            // Log removido para produção - muito verboso
                                            // console.log(`[App] ✅ Nova mensagem adicionada ao chat ${chat.contactName}`);
                                            let updatedMessages = [...chat.messages, mapped].sort((a, b) => {
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
                                                
                                                // PRIORIDADE 3: Se timestamps são idênticos ou muito próximos e mesmo sender, mantém ordem de inserção
                                                // (retorna 0 para manter ordem estável quando senders são iguais)
                                                return 0;
                                            });
                                            
                                            // Lógica para processar mensagens de clientes finalizados
                                            let updatedChat = { ...chat };
                                            
                                            // Se o chat está finalizado e recebeu mensagem do cliente
                                            if (chat.status === 'closed' && mapped.sender === 'user') {
                                                const messageContent = mapped.content.trim();
                                                const isRatingResponse = /^[1-5]$/.test(messageContent);
                                                
                                                if (isRatingResponse && chat.awaitingRating) {
                                                    // Cliente respondeu com avaliação (1-5)
                                                    const rating = parseInt(messageContent);
                                                    updatedChat = {
                                                        ...chat,
                                                        rating: rating,
                                                        awaitingRating: false, // Não está mais aguardando
                                                        status: 'closed' // Mantém finalizado
                                                    };
                                                    // Log removido para produção - muito verboso
                                                    // console.log(`[App] ✅ Avaliação recebida: ${rating} estrelas para chat ${chat.contactName}`);
                                                } else if (!isRatingResponse) {
                                                    // Cliente enviou nova mensagem (não é avaliação) - reabre o chat
                                                    updatedChat = {
                                                        ...chat,
                                                        status: 'open',
                                                        awaitingRating: false, // Cancela aguardo de avaliação
                                                        departmentId: null, // Remove do departamento para ir para triagem
                                                        assignedTo: undefined, // Remove atribuição
                                                        endedAt: undefined // Remove data de finalização
                                                    };
                                                    // Log removido para produção - muito verboso
                                                    // console.log(`[App] 🔄 Chat ${chat.contactName} reaberto - cliente enviou nova mensagem`);
                                                }
                                            }
                                            
                                            // Lógica de seleção de setores para novos contatos
                                            if (mapped.sender === 'user') {
                                                const messageContent = mapped.content.trim();
                                                
                                                // Verifica se é resposta numérica para seleção de setor
                                                if (updatedChat.departmentId === null && departments.length > 0) {
                                                    const selectedDeptId = processDepartmentSelection(messageContent, departments);
                                                    
                                                    if (selectedDeptId) {
                                                        // Usuário selecionou um setor válido
                                                        // Só muda para 'pending' se o chat não estiver atribuído
                                                        // Se já estiver 'open' e atribuído, mantém 'open' (evita voltar para "Aguardando")
                                                        const shouldBePending = !(updatedChat.status === 'open' && updatedChat.assignedTo);
                                                        updatedChat = {
                                                            ...updatedChat,
                                                            departmentId: selectedDeptId,
                                                            status: shouldBePending ? 'pending' : 'open', // Vai para triagem do setor ou mantém 'open' se atribuído
                                                            awaitingDepartmentSelection: false // Não está mais aguardando seleção
                                                        };
                                                        // Log removido para produção - muito verboso
                                                        // console.log(`[App] ✅ Setor selecionado pelo usuário: ${departments.find(d => d.id === selectedDeptId)?.name}`);
                                                        
                                                        // Remove a mensagem numérica da lista (é apenas uma resposta de seleção)
                                                        const filteredMessages = updatedMessages.filter(m => m.id !== mapped.id);
                                                        updatedMessages = filteredMessages;
                                                    } else {
                                                        // É primeira mensagem do usuário e ainda não tem departamento - envia mensagem de seleção
                                                        const isFirstUserMessage = updatedChat.messages.filter(m => m.sender === 'user').length === 1;
                                                        
                                                        if (isFirstUserMessage) {
                                                            // Garante que o status seja 'open' quando enviar mensagem de seleção (não 'closed')
                                                            if (updatedChat.status === 'closed') {
                                                                updatedChat = {
                                                                    ...updatedChat,
                                                                    status: 'open',
                                                                    awaitingDepartmentSelection: true,
                                                                    departmentSelectionSent: true
                                                                };
                                                            } else {
                                                                updatedChat = {
                                                                    ...updatedChat,
                                                                    awaitingDepartmentSelection: true,
                                                                    departmentSelectionSent: true
                                                                };
                                                            }
                                                            
                                                            // Envia mensagem de seleção de setores de forma assíncrona
                                                            sendDepartmentSelectionMessage(
                                                                apiConfig,
                                                                updatedChat.contactNumber,
                                                                departments
                                                            ).then(sent => {
                                                                if (sent) {
                                                                    // Log removido para produção - muito verboso
                                                                    // console.log(`[App] ✅ Mensagem de seleção de setores enviada para ${updatedChat.contactName}`);
                                                                    // Atualiza o chat para garantir que o status seja mantido
                                                                    handleUpdateChat({
                                                                        ...updatedChat,
                                                                        status: 'open',
                                                                        awaitingDepartmentSelection: true,
                                                                        departmentSelectionSent: true
                                                                    });
                                                                } else {
                                                                    console.error(`[App] ❌ Falha ao enviar mensagem de seleção de setores para ${updatedChat.contactName}`);
                                                                }
                                                            }).catch(err => {
                                                                console.error(`[App] ❌ Erro ao enviar mensagem de seleção de setores:`, err);
                                                            });
                                                        }
                                                    }
                                                }
                                            }
                                            
                                            // Notifica se for mensagem recebida
                                            if (mapped.sender === 'user' && currentUser) {
                                                // Notifica se estiver atribuído ao usuário atual ou se não estiver atribuído a ninguém (triagem)
                                                if (updatedChat.assignedTo === currentUser.id || !updatedChat.assignedTo) {
                                                    addNotification(
                                                        `Nova mensagem de ${updatedChat.contactName}`,
                                                        mapped.content && mapped.content.length > 50 ? mapped.content.substring(0, 50) + '...' : (mapped.content || 'Nova mensagem'),
                                                        'info',
                                                        true, // Toca som
                                                        true  // Mostra notificação do navegador
                                                    );
                                                }
                                            }
                                            
                                            return {
                                                ...updatedChat,
                                                messages: updatedMessages,
                                                lastMessage: mapped.type === 'text' ? mapped.content : `📷 ${mapped.type}`,
                                                lastMessageTime: mapped.timestamp,
                                                unreadCount: mapped.sender === 'user' ? (updatedChat.unreadCount || 0) + 1 : updatedChat.unreadCount,
                                                // Status já foi atualizado corretamente acima (pode ser 'open', 'pending', ou 'closed')
                                                status: updatedChat.status
                                            };
                                        } else {
                                            // Log removido para produção - muito verboso (mantém apenas warnings importantes)
                                            // console.log(`[App] ⚠️ Mensagem já existe no chat ${chat.contactName}`);
                                        }
                                    }
                                    return chat;
                                });
                                
                                if (chatUpdated) {
                                    console.log('[App] ✅ Chats atualizados com nova mensagem via Socket.IO');
                                }
                                
                                return updatedChats;
                            });
                        }
                    }
                } catch (err) {
                    console.error('[App] ❌ Erro ao processar mensagem Socket.IO:', err);
                }
            });
            
            // Event: messages.update - atualizações de status de mensagens
            socket.on('messages.update', (data: any) => {
                try {
                    // Processa atualizações de status (entregue, lida, etc.)
                    if (data && data.key && data.update) {
                        const remoteJid = normalizeJid(data.key.remoteJid);
                        const updateStatus = data.update.status;
                        
                        if (remoteJid && updateStatus) {
                            setChats(currentChats => {
                                return currentChats.map(chat => {
                                    const chatJid = normalizeJid(chat.id);
                                    if (chatJid === remoteJid) {
                                        // Atualiza status da mensagem correspondente
                                        const updatedMessages = chat.messages.map(msg => {
                                            if (msg.whatsappMessageId === data.key.id) {
                                                return {
                                                    ...msg,
                                                    status: updateStatus === 'READ' ? MessageStatus.READ :
                                                            updateStatus === 'DELIVERED' ? MessageStatus.DELIVERED :
                                                            updateStatus === 'SENT' ? MessageStatus.SENT :
                                                            msg.status
                                                };
                                            }
                                            return msg;
                                        });
                                        
                                        return {
                                            ...chat,
                                            messages: updatedMessages
                                        };
                                    }
                                    return chat;
                                });
                            });
                        }
                    }
                } catch (err) {
                    console.error('[App] ❌ Erro ao processar atualização de mensagem Socket.IO:', err);
                }
            });
            
            // Event: qrcode.updated - QR Code atualizado
            socket.on('qrcode.updated', (data: any) => {
                // QR Code atualizado - pode ser usado para mostrar QR Code na interface
                // Por enquanto, apenas loga
                if (data && data.qrcode) {
                    console.log('[App] 📱 QR Code atualizado via Socket.IO');
                }
            });
            
        } catch (err) {
            console.error('[App] Erro ao criar Socket.IO:', err);
            setWsStatus('failed');
            // Se não for reconexão, tenta uma vez após 5 segundos
            if (!isReconnect && wsReconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
                wsReconnectAttemptsRef.current += 1;
                wsReconnectTimeoutRef.current = setTimeout(() => {
                    if (currentUser && apiConfig.baseUrl && !apiConfig.isDemo) {
                        initWebSocket(true).catch(e => {
                            console.error('[App] ❌ Erro ao reconectar Socket.IO:', e);
                        });
                    }
                }, INITIAL_RECONNECT_DELAY);
            }
        }
    };
    
    // Inicializa Socket.IO apenas se não estiver em demo
    if (!apiConfig.isDemo && apiConfig.baseUrl) {
        initWebSocket().catch(err => {
            console.error('[App] ❌ Erro ao inicializar Socket.IO:', err);
        });
    }

    // Cleanup: fecha interval e Socket.IO quando dependências mudam ou componente desmonta
    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
        wsReconnectTimeoutRef.current = null;
      }
      if (socketRef.current) {
        console.log('[App] Desconectando Socket.IO...');
        // Reset contador ao fechar intencionalmente
        wsReconnectAttemptsRef.current = 0;
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      // Reset status quando componente desmonta
      setWsStatus('disconnected');
    };
  }, [currentUser, apiConfig]);

  // Função utilitária para normalizar números de telefone para comparação
  const normalizePhoneForMatch = (phone: string): string => {
    // Remove tudo que não é dígito
    let cleaned = phone.replace(/\D/g, '');
    // Remove código do país (55) se estiver no início e o número tiver mais de 10 dígitos
    if (cleaned.length > 10 && cleaned.startsWith('55')) {
      cleaned = cleaned.slice(2);
    }
    // Retorna os últimos 9-11 dígitos (DDD + número)
    return cleaned.length > 11 ? cleaned.slice(-11) : cleaned;
  };

  useEffect(() => {
    if (currentUser && currentUser.role === UserRole.AGENT && currentView === 'dashboard') {
        setCurrentView('chat');
    }
  }, []);

  // Vincula contatos automaticamente aos chats quando há correspondência
  // Preserva clientCode e outras informações editadas pelo operador
  useEffect(() => {
    if (contacts.length === 0) return; // Não faz nada se não há contatos
    
    setChats(currentChats => {
      let hasUpdates = false;
      const updatedChats = currentChats.map(chat => {
        const chatPhone = normalizePhoneForMatch(chat.contactNumber);
        const match = contacts.find(c => {
          const cPhone = normalizePhoneForMatch(c.phone);
          return cPhone === chatPhone || 
                 (cPhone.length >= 8 && chatPhone.length >= 8 && 
                  (cPhone.slice(-8) === chatPhone.slice(-8) || cPhone.slice(-9) === chatPhone.slice(-9)));
        });
        
        if (match) {
          // Só atualiza se o nome ou avatar do contato for diferente e mais completo
          const shouldUpdateName = match.name && match.name.trim() && 
                                   (chat.contactName === chat.contactNumber || 
                                    chat.contactName.length < match.name.length ||
                                    chat.contactName === match.name);
          const shouldUpdateAvatar = match.avatar && match.avatar !== chat.contactAvatar;
          
          if (shouldUpdateName || shouldUpdateAvatar) {
            hasUpdates = true;
            return {
              ...chat,
              contactName: shouldUpdateName ? match.name : chat.contactName,
              contactAvatar: shouldUpdateAvatar ? match.avatar : chat.contactAvatar,
              // clientCode é preservado automaticamente (não é sobrescrito)
            };
          }
        }
        return chat;
      });
      
      return hasUpdates ? updatedChats : currentChats;
    });
  }, [contacts]); // Executa quando contatos mudam

  // Solicita permissão para notificações do navegador após login
  const requestNotificationPermission = () => {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            console.log('[App] ✅ Permissão de notificações concedida');
            addNotification('Notificações Ativadas', 'Você receberá notificações quando novas mensagens chegarem.', 'success', false, false);
          } else if (permission === 'denied') {
            console.warn('[App] ⚠️ Permissão de notificações negada');
            addNotification('Notificações Desativadas', 'As notificações do navegador foram negadas. Você pode ativá-las nas configurações do navegador.', 'warning', false, false);
          }
        }).catch(err => {
          console.warn('[App] Erro ao solicitar permissão de notificações:', err);
        });
      } else if (Notification.permission === 'denied') {
        addNotification('Notificações Bloqueadas', 'As notificações estão bloqueadas. Desbloqueie nas configurações do navegador para receber alertas.', 'warning', false, false);
      }
    }
  };

  useEffect(() => {
    if (currentUser && 'Notification' in window && Notification.permission === 'default') {
      // Solicita permissão após um pequeno delay para garantir que é após interação do usuário
      const timer = setTimeout(() => {
        requestNotificationPermission();
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [currentUser]);

  // Função para tocar som de notificação
  const playNotificationSound = () => {
    try {
      // Tenta usar Web Audio API primeiro
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Resolve o contexto se estiver suspenso (alguns navegadores suspendem após interação)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (err) {
      console.warn('[App] Erro ao tocar som de notificação:', err);
      // Fallback silencioso - não tenta outros métodos para evitar mais erros
    }
  };

  // Função para mostrar notificação do navegador
  const showBrowserNotification = (title: string, message: string) => {
    if (!('Notification' in window)) {
      console.warn('[App] Notificações do navegador não são suportadas');
      return;
    }

    // Se a permissão ainda não foi solicitada, solicita agora
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          // Tenta mostrar a notificação novamente após permissão concedida
          showBrowserNotification(title, message);
        } else {
          console.warn('[App] Permissão de notificações negada pelo usuário');
        }
      }).catch(err => {
        console.warn('[App] Erro ao solicitar permissão de notificações:', err);
      });
      return;
    }

    // Se a permissão foi negada, não tenta mostrar
    if (Notification.permission === 'denied') {
      console.warn('[App] Permissão de notificações foi negada');
      return;
    }

    // Se a permissão foi concedida, mostra a notificação
    if (Notification.permission === 'granted') {
      try {
        const notification = new Notification(title, {
          body: message,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'zapflow-message',
          requireInteraction: false,
          silent: false // Garante que o som do sistema seja reproduzido
        });
        
        // Fecha a notificação após 5 segundos
        setTimeout(() => {
          notification.close();
        }, 5000);
        
        // Foca na janela quando clica na notificação
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch (err) {
        console.warn('[App] Erro ao mostrar notificação do navegador:', err);
      }
    }
  };

  const addNotification = (title: string, message: string, type: 'info' | 'warning' | 'success' = 'info', playSound: boolean = false, showBrowser: boolean = false) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, title, message, type }]);
    
    // Toca som se solicitado (geralmente para novas mensagens)
    if (playSound) {
      playNotificationSound();
    }
    
    // Mostra notificação do navegador se solicitado (sempre que não estiver em foco ou quando solicitado explicitamente)
    if (showBrowser) {
      // Mostra notificação se a página não está em foco OU se a permissão foi concedida
      if (!document.hasFocus() || Notification.permission === 'granted') {
        showBrowserNotification(title, message);
      }
    }
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    // Salva usuário apenas se não estiver configurado para usar apenas PostgreSQL
    if (!storageService.getUseOnlyPostgreSQL()) {
      localStorage.setItem('zapflow_user', SecurityService.encrypt(JSON.stringify(user)));
    }
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

  const handleUpdateChat = async (updatedChat: Chat) => {
    const chatExists = chats.some(c => c.id === updatedChat.id);

    if (chatExists) {
        const oldChat = chats.find(c => c.id === updatedChat.id);
        
        // Verifica se status ou assignedTo mudaram - se sim, salva no banco
        const statusChanged = oldChat && oldChat.status !== updatedChat.status;
        const assignedToChanged = oldChat && oldChat.assignedTo !== updatedChat.assignedTo;
        const departmentIdChanged = oldChat && oldChat.departmentId !== updatedChat.departmentId;
        
        // Salva no banco se status, assignedTo ou departmentId mudaram
        if (currentUser && (statusChanged || assignedToChanged || departmentIdChanged)) {
          try {
            await apiService.updateChatStatus(
              updatedChat.id,
              updatedChat.status,
              updatedChat.assignedTo,
              updatedChat.departmentId || null
            );
            // Log removido para produção - muito verboso
            // console.log(`[App] ✅ Status do chat ${updatedChat.contactName} salvo no banco: status=${updatedChat.status}, assignedTo=${updatedChat.assignedTo}`);
          } catch (error) {
            console.error(`[App] ❌ Erro ao salvar status do chat no banco:`, error);
          }
        }
        
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
        
        // Faz merge inteligente: preserva mensagens locais recentes e ordena corretamente
        setChats(chats.map(c => {
            if (c.id === updatedChat.id) {
                // Se o chat atualizado tem mensagens, faz merge preservando ordem
                if (updatedChat.messages.length > 0 && c.messages.length > 0) {
                    const messageMap = new Map<string, Message>();
                    
                    // Adiciona mensagens existentes primeiro
                    c.messages.forEach(msg => {
                        const key = msg.id || `${msg.timestamp?.getTime()}_${msg.content?.substring(0, 50)}`;
                        messageMap.set(key, msg);
                    });
                    
                    // Adiciona/atualiza com mensagens novas (prioriza novas se forem mais recentes)
                    updatedChat.messages.forEach(msg => {
                        const key = msg.id || `${msg.timestamp?.getTime()}_${msg.content?.substring(0, 50)}`;
                        const existing = messageMap.get(key);
                        
                        if (!existing) {
                            // Nova mensagem, adiciona
                            messageMap.set(key, msg);
                        } else if (msg.timestamp && existing.timestamp) {
                            // Se a nova for mais recente, substitui
                            if (msg.timestamp.getTime() > existing.timestamp.getTime()) {
                                messageMap.set(key, msg);
                            }
                        }
                    });
                    
                    // Ordena por timestamp, respeitando ordem cronológica real
                    const mergedMessages = Array.from(messageMap.values()).sort((a, b) => {
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
                        
                        // PRIORIDADE 3: Se timestamps são idênticos ou muito próximos e mesmo sender, mantém ordem de inserção
                        // (retorna 0 para manter ordem estável quando senders são iguais)
                        return 0;
                    });
                    
                    return {
                        ...updatedChat,
                        messages: mergedMessages
                    };
                }
                
                return updatedChat;
            }
            return c;
        }));
    } else {
        setChats([updatedChat, ...chats]);
    }
  };

  const handleAddDepartment = async (dept: Department) => {
    try {
      const result = await apiService.createDepartment(dept.name, dept.description, dept.color);
      if (result.success && result.data) {
        setDepartments([...departments, {
          id: result.data.id,
          name: result.data.name,
          description: result.data.description || '',
          color: result.data.color
        }]);
      } else {
        console.error('[App] Erro ao criar departamento:', result.error);
        alert(`Erro ao criar departamento: ${result.error || 'Erro desconhecido'}`);
        // Fallback: adiciona localmente
        setDepartments([...departments, dept]);
      }
    } catch (error) {
      console.error('[App] Erro ao criar departamento na API:', error);
      // Fallback: adiciona localmente
      setDepartments([...departments, dept]);
      alert('Erro ao criar departamento no servidor. Adicionado apenas localmente.');
    }
  };

  const handleUpdateDepartment = async (updatedDept: Department) => {
    try {
      const deptId = parseInt(updatedDept.id);
      if (!isNaN(deptId)) {
        const result = await apiService.updateDepartment(deptId, updatedDept.name, updatedDept.description, updatedDept.color);
        if (result.success && result.data) {
          setDepartments(departments.map(d => d.id === updatedDept.id ? {
            id: result.data.id,
            name: result.data.name,
            description: result.data.description || '',
            color: result.data.color
          } : d));
        } else {
          console.error('[App] Erro ao atualizar departamento:', result.error);
          // Fallback: atualiza localmente
          setDepartments(departments.map(d => d.id === updatedDept.id ? updatedDept : d));
        }
      } else {
        // Se não for um ID numérico, apenas atualiza localmente
        setDepartments(departments.map(d => d.id === updatedDept.id ? updatedDept : d));
      }
    } catch (error) {
      console.error('[App] Erro ao atualizar departamento na API:', error);
      // Fallback: atualiza localmente
      setDepartments(departments.map(d => d.id === updatedDept.id ? updatedDept : d));
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    try {
      const deptId = parseInt(id);
      if (!isNaN(deptId)) {
        const result = await apiService.deleteDepartment(deptId);
        if (result.success) {
          setDepartments(departments.filter(d => d.id !== id));
          setChats(chats.map(c => c.departmentId === id ? { ...c, departmentId: null } : c));
        } else {
          console.error('[App] Erro ao deletar departamento:', result.error);
          alert(`Erro ao deletar departamento: ${result.error || 'Erro desconhecido'}`);
        }
      } else {
        // Se não for um ID numérico, apenas remove localmente
        setDepartments(departments.filter(d => d.id !== id));
        setChats(chats.map(c => c.departmentId === id ? { ...c, departmentId: null } : c));
      }
    } catch (error) {
      console.error('[App] Erro ao deletar departamento na API:', error);
      // Fallback: remove localmente
      setDepartments(departments.filter(d => d.id !== id));
      setChats(chats.map(c => c.departmentId === id ? { ...c, departmentId: null } : c));
      alert('Erro ao deletar departamento no servidor. Removido apenas localmente.');
    }
  };

  const handleSaveConfig = async (newConfig: ApiConfig) => {
    // Atualiza o estado
    setApiConfig(newConfig);
    // Salva imediatamente via storageService (que salva na API se disponível)
    try {
      const saved = await storageService.save('config', newConfig);
      if (saved) {
        // Config salvo com sucesso (na API ou localStorage)
        addNotification('Configurações salvas', 'As configurações foram salvas com sucesso.', 'success');
      } else {
        console.warn('[App] ⚠️ Falha ao salvar configurações');
        addNotification('Aviso', 'As configurações podem não ter sido salvas completamente.', 'warning');
      }
    } catch (err) {
      console.error('[App] Erro ao salvar configurações:', err);
      addNotification('Erro', 'Erro ao salvar configurações. Tente novamente.', 'error');
    }
  };

  const handleAddUser = async (user: User) => {
    // Tenta criar o usuário no banco de dados via API
    try {
      const result = await apiService.createUser(
        user.email, // username é o email
        user.password || '', // senha
        user.name,
        user.email,
        user.role
      );
      
      if (result.success && result.user) {
        // Converte o usuário retornado da API para o formato interno
        const newUser: User = {
          id: result.user.id.toString(),
          name: result.user.name,
          email: result.user.email || result.user.username,
          role: result.user.role as UserRole,
          avatar: user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(result.user.name)}&background=0D9488&color=fff`,
          departmentId: user.departmentId,
          allowGeneralConnection: user.allowGeneralConnection
        };
        setUsers(prevUsers => [...prevUsers, newUser]);
      } else {
        console.error('[App] Erro ao criar usuário:', result.error);
        alert(`Erro ao criar usuário: ${result.error || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('[App] Erro ao criar usuário na API:', error);
      // Em caso de erro, ainda adiciona localmente como fallback
      setUsers(prevUsers => [...prevUsers, user]);
      alert('Erro ao criar usuário no servidor. Usuário adicionado apenas localmente.');
    }
  };
  const handleUpdateUser = async (updatedUser: User) => {
    // Atualiza o estado local
    setUsers(prevUsers => prevUsers.map(u => u.id === updatedUser.id ? updatedUser : u));
    
    // Se o usuário atualizado for o currentUser, atualiza também o currentUser e o banco de dados
    // Compara tanto por ID quanto por email (para garantir que funcione mesmo se IDs forem diferentes)
    const isCurrentUser = currentUser && (
      currentUser.id === updatedUser.id || 
      currentUser.id === updatedUser.id.toString() ||
      updatedUser.id === currentUser.id.toString() ||
      (currentUser.email && updatedUser.email && currentUser.email.toLowerCase() === updatedUser.email.toLowerCase())
    );
    
    // Tenta atualizar no banco de dados via API
    try {
      let result;
      if (isCurrentUser) {
        // Se for o próprio usuário, usa o endpoint de perfil
        result = await apiService.updateUserProfile(updatedUser.name, updatedUser.email);
        if (result.success && result.user) {
          // Atualiza o currentUser com os dados retornados da API
          const updatedCurrentUser: User = {
            ...currentUser,
            id: result.user.id.toString(),
            name: result.user.name,
            email: result.user.email || updatedUser.email,
            role: result.user.role as UserRole
          };
          setCurrentUser(updatedCurrentUser);
          // Salva no localStorage apenas se não estiver configurado para usar apenas PostgreSQL
          if (!storageService.getUseOnlyPostgreSQL()) {
            securityService.saveSensitiveData('user', updatedCurrentUser);
          }
        }
      } else {
        // Se for outro usuário e o currentUser for ADMIN, usa o endpoint de atualização de usuários
        if (currentUser?.role === UserRole.ADMIN) {
          const userId = parseInt(updatedUser.id);
          if (!isNaN(userId)) {
            result = await apiService.updateUser(
              userId,
              updatedUser.name,
              updatedUser.email,
              updatedUser.role,
              updatedUser.password // Se houver senha, atualiza
            );
            if (result.success && result.user) {
              // Atualiza o estado com os dados retornados da API
              const updatedUserFromApi: User = {
                ...updatedUser,
                id: result.user.id.toString(),
                name: result.user.name,
                email: result.user.email || updatedUser.email,
                role: result.user.role as UserRole
              };
              setUsers(prevUsers => prevUsers.map(u => u.id === updatedUser.id ? updatedUserFromApi : u));
            }
          }
        }
      }
    } catch (error) {
      console.error('[App] Erro ao atualizar usuário na API:', error);
      // Continua mesmo se a API falhar, pois já atualizou o estado local
    }
  };
  
  const handleDeleteUser = async (id: string) => {
    // Tenta deletar no banco de dados via API
    try {
      const userId = parseInt(id);
      if (!isNaN(userId) && currentUser?.role === UserRole.ADMIN) {
        const result = await apiService.deleteUser(userId);
        if (result.success) {
          // Remove do estado local apenas se deletou com sucesso no banco
          setUsers(prevUsers => prevUsers.filter(u => u.id !== id));
        } else {
          console.error('[App] Erro ao deletar usuário:', result.error);
          alert(`Erro ao deletar usuário: ${result.error || 'Erro desconhecido'}`);
        }
      } else {
        // Se não for um ID numérico ou não for ADMIN, apenas remove do estado local
        setUsers(prevUsers => prevUsers.filter(u => u.id !== id));
      }
    } catch (error) {
      console.error('[App] Erro ao deletar usuário na API:', error);
      // Em caso de erro, ainda remove localmente como fallback
      setUsers(prevUsers => prevUsers.filter(u => u.id !== id));
      alert('Erro ao deletar usuário no servidor. Usuário removido apenas localmente.');
    }
  };

  const handleAddQuickReply = async (qr: QuickReply) => {
    try {
      const result = await apiService.createQuickReply(qr.title, qr.content);
      if (result.success && result.data) {
        setQuickReplies([...quickReplies, {
          id: result.data.id,
          title: result.data.title,
          content: result.data.content
        }]);
      } else {
        console.error('[App] Erro ao criar resposta rápida:', result.error);
        // Fallback: adiciona localmente
        setQuickReplies([...quickReplies, qr]);
      }
    } catch (error) {
      console.error('[App] Erro ao criar resposta rápida na API:', error);
      // Fallback: adiciona localmente
      setQuickReplies([...quickReplies, qr]);
    }
  };

  const handleUpdateQuickReply = async (updatedQr: QuickReply) => {
    try {
      const qrId = parseInt(updatedQr.id);
      if (!isNaN(qrId)) {
        const result = await apiService.updateQuickReply(qrId, updatedQr.title, updatedQr.content);
        if (result.success && result.data) {
          setQuickReplies(quickReplies.map(q => q.id === updatedQr.id ? {
            id: result.data.id,
            title: result.data.title,
            content: result.data.content
          } : q));
        } else {
          // Fallback: atualiza localmente
          setQuickReplies(quickReplies.map(q => q.id === updatedQr.id ? updatedQr : q));
        }
      } else {
        // Se não for um ID numérico, apenas atualiza localmente
        setQuickReplies(quickReplies.map(q => q.id === updatedQr.id ? updatedQr : q));
      }
    } catch (error) {
      console.error('[App] Erro ao atualizar resposta rápida na API:', error);
      // Fallback: atualiza localmente
      setQuickReplies(quickReplies.map(q => q.id === updatedQr.id ? updatedQr : q));
    }
  };

  const handleDeleteQuickReply = async (id: string) => {
    try {
      const qrId = parseInt(id);
      if (!isNaN(qrId)) {
        const result = await apiService.deleteQuickReply(qrId);
        if (result.success) {
          setQuickReplies(quickReplies.filter(q => q.id !== id));
        } else {
          console.error('[App] Erro ao deletar resposta rápida:', result.error);
        }
      } else {
        // Se não for um ID numérico, apenas remove localmente
        setQuickReplies(quickReplies.filter(q => q.id !== id));
      }
    } catch (error) {
      console.error('[App] Erro ao deletar resposta rápida na API:', error);
      // Fallback: remove localmente
      setQuickReplies(quickReplies.filter(q => q.id !== id));
    }
  };

  const handleAddWorkflow = async (wf: Workflow) => {
    try {
      const result = await apiService.createWorkflow(
        wf.title,
        wf.steps,
        (wf as any).description,
        (wf as any).triggerKeywords,
        (wf as any).targetDepartmentId
      );
      if (result.success && result.data) {
        setWorkflows([...workflows, {
          id: result.data.id,
          title: result.data.title,
          steps: result.data.steps,
          ...(result.data.description && { description: result.data.description }),
          ...(result.data.triggerKeywords && { triggerKeywords: result.data.triggerKeywords }),
          ...(result.data.targetDepartmentId && { targetDepartmentId: result.data.targetDepartmentId })
        }]);
      } else {
        console.error('[App] Erro ao criar workflow:', result.error);
        // Fallback: adiciona localmente
        setWorkflows([...workflows, wf]);
      }
    } catch (error) {
      console.error('[App] Erro ao criar workflow na API:', error);
      // Fallback: adiciona localmente
      setWorkflows([...workflows, wf]);
    }
  };

  const handleUpdateWorkflow = async (updatedWf: Workflow) => {
    try {
      const wfId = parseInt(updatedWf.id);
      if (!isNaN(wfId)) {
        const result = await apiService.updateWorkflow(
          wfId,
          updatedWf.title,
          updatedWf.steps,
          (updatedWf as any).description,
          (updatedWf as any).triggerKeywords,
          (updatedWf as any).targetDepartmentId
        );
        if (result.success && result.data) {
          setWorkflows(workflows.map(w => w.id === updatedWf.id ? {
            id: result.data.id,
            title: result.data.title,
            steps: result.data.steps,
            ...(result.data.description && { description: result.data.description }),
            ...(result.data.triggerKeywords && { triggerKeywords: result.data.triggerKeywords }),
            ...(result.data.targetDepartmentId && { targetDepartmentId: result.data.targetDepartmentId })
          } : w));
        } else {
          // Fallback: atualiza localmente
          setWorkflows(workflows.map(w => w.id === updatedWf.id ? updatedWf : w));
        }
      } else {
        // Se não for um ID numérico, apenas atualiza localmente
        setWorkflows(workflows.map(w => w.id === updatedWf.id ? updatedWf : w));
      }
    } catch (error) {
      console.error('[App] Erro ao atualizar workflow na API:', error);
      // Fallback: atualiza localmente
      setWorkflows(workflows.map(w => w.id === updatedWf.id ? updatedWf : w));
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    try {
      const wfId = parseInt(id);
      if (!isNaN(wfId)) {
        const result = await apiService.deleteWorkflow(wfId);
        if (result.success) {
          setWorkflows(workflows.filter(w => w.id !== id));
        } else {
          console.error('[App] Erro ao deletar workflow:', result.error);
        }
      } else {
        // Se não for um ID numérico, apenas remove localmente
        setWorkflows(workflows.filter(w => w.id !== id));
      }
    } catch (error) {
      console.error('[App] Erro ao deletar workflow na API:', error);
      // Fallback: remove localmente
      setWorkflows(workflows.filter(w => w.id !== id));
    }
  };

  // Adiciona novo contato manualmente
  const handleAddContact = async (contact: Contact) => {
    try {
      const result = await apiService.createContact(
        contact.name,
        contact.phone,
        contact.email,
        contact.avatar,
        contact.source || 'manual'
      );
      if (result.success && result.data) {
        setContacts(currentContacts => {
          // Verifica se já existe contato com o mesmo telefone
          const existingIndex = currentContacts.findIndex(c => 
            normalizePhoneForMatch(c.phone) === normalizePhoneForMatch(contact.phone)
          );
          if (existingIndex >= 0) {
            // Atualiza contato existente
            const updated = [...currentContacts];
            updated[existingIndex] = {
              id: result.data.id,
              name: result.data.name,
              phone: result.data.phone,
              email: result.data.email,
              avatar: result.data.avatar,
              source: result.data.source as 'manual' | 'google' | 'csv',
              lastSync: result.data.lastSync ? new Date(result.data.lastSync) : undefined
            };
            return updated;
          }
          // Adiciona novo contato
          return [...currentContacts, {
            id: result.data.id,
            name: result.data.name,
            phone: result.data.phone,
            email: result.data.email,
            avatar: result.data.avatar,
            source: result.data.source as 'manual' | 'google' | 'csv',
            lastSync: result.data.lastSync ? new Date(result.data.lastSync) : undefined
          }];
        });
      } else {
        console.error('[App] Erro ao criar contato:', result.error);
        // Fallback: adiciona localmente
        setContacts(currentContacts => {
          const existingIndex = currentContacts.findIndex(c => 
            normalizePhoneForMatch(c.phone) === normalizePhoneForMatch(contact.phone)
          );
          if (existingIndex >= 0) {
            const updated = [...currentContacts];
            updated[existingIndex] = { ...contact, source: 'manual' as const };
            return updated;
          }
          return [...currentContacts, { ...contact, source: 'manual' as const }];
        });
      }
    } catch (error) {
      console.error('[App] Erro ao criar contato na API:', error);
      // Fallback: adiciona localmente
      setContacts(currentContacts => {
        const existingIndex = currentContacts.findIndex(c => 
          normalizePhoneForMatch(c.phone) === normalizePhoneForMatch(contact.phone)
        );
        if (existingIndex >= 0) {
          const updated = [...currentContacts];
          updated[existingIndex] = { ...contact, source: 'manual' as const };
          return updated;
        }
        return [...currentContacts, { ...contact, source: 'manual' as const }];
      });
    }
  };

  // Inicia chat a partir de um contato
  const handleStartChatFromContact = (contact: Contact) => {
    const contactNumber = contact.phone.replace(/\D/g, '');
    
    if (!contactNumber || contactNumber.length < 8) {
      console.error('[handleStartChatFromContact] Número de telefone inválido:', contact.phone);
      alert('Número de telefone inválido. Por favor, verifique o contato.');
      return;
    }
    
    // Verifica se já existe chat com esse número
    const existingChat = chats.find(c => {
      const chatNumber = c.contactNumber.replace(/\D/g, '');
      return chatNumber === contactNumber || 
             (chatNumber.length >= 8 && contactNumber.length >= 8 && 
              chatNumber.slice(-8) === contactNumber.slice(-8));
    });
    
    let chatIdToSelect: string;
    
    if (existingChat) {
      // Se já existe, atualiza o chat com informações do contato e muda para a view de chat
      console.log(`[handleStartChatFromContact] Chat existente encontrado: ${existingChat.id}`);
      handleUpdateChat({
        ...existingChat,
        contactName: contact.name,
        contactAvatar: contact.avatar || existingChat.contactAvatar
      });
      chatIdToSelect = existingChat.id;
    } else {
      // Cria novo chat
      const chatId = contactNumber.includes('@') ? contactNumber : `${contactNumber}@s.whatsapp.net`;
      const newChat: Chat = {
        id: chatId,
        contactName: contact.name,
        contactNumber: contactNumber,
        contactAvatar: contact.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}`,
        departmentId: null,
        unreadCount: 0,
        lastMessage: '',
        lastMessageTime: new Date(),
        status: 'open',
        messages: [],
        assignedTo: currentUser?.id || undefined // Garante que seja atribuído ao usuário atual se disponível
      };
      
      console.log(`[handleStartChatFromContact] Criando novo chat: ${chatId} para contato ${contact.name} (${contactNumber})`);
      
      // Adiciona o chat diretamente à lista usando setChats para garantir que seja adicionado imediatamente
      setChats(currentChats => {
        // Verifica se o chat já não foi adicionado (evita duplicatas)
        const alreadyExists = currentChats.some(c => c.id === chatId);
        if (alreadyExists) {
          console.log(`[handleStartChatFromContact] Chat ${chatId} já existe na lista, atualizando...`);
          return currentChats.map(c => c.id === chatId ? newChat : c);
        } else {
          console.log(`[handleStartChatFromContact] Adicionando novo chat ${chatId} à lista`);
          return [newChat, ...currentChats];
        }
      });
      
      chatIdToSelect = chatId;
    }
    
    // Muda para a view de chat e força a seleção do chat
    setCurrentView('chat');
    setForceSelectChatId(chatIdToSelect);
    
    console.log(`[handleStartChatFromContact] Forçando seleção do chat: ${chatIdToSelect}`);
    
    // Limpa o forceSelectChatId após um delay maior para garantir que o chat seja selecionado
    // mesmo se houver atualizações na lista de chats
    setTimeout(() => {
      setForceSelectChatId(null);
    }, 500);
  };

  // Função para atualizar chats com informações de contatos (preservando clientCode)
  const updateChatsWithContacts = (contactList: Contact[]) => {
    setChats(currentChats => {
      return currentChats.map(chat => {
        const chatPhone = normalizePhoneForMatch(chat.contactNumber);
        const match = contactList.find(c => {
          const cPhone = normalizePhoneForMatch(c.phone);
          // Match exato ou match pelos últimos 8-9 dígitos
          return cPhone === chatPhone || 
                 (cPhone.length >= 8 && chatPhone.length >= 8 && 
                  (cPhone.slice(-8) === chatPhone.slice(-8) || cPhone.slice(-9) === chatPhone.slice(-9)));
        });
        
        if (match) {
          // Atualiza informações do contato, mas preserva clientCode e outras informações editadas
          return { 
            ...chat, 
            contactName: match.name, 
            contactAvatar: match.avatar || chat.contactAvatar,
            // clientCode é preservado automaticamente (não é sobrescrito)
          };
        }
        return chat;
      });
    });
  };

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
            
            // Mescla com contatos existentes (CSV e manual)
            setContacts(currentContacts => {
              const merged = [...currentContacts];
              newContacts.forEach(newContact => {
                const existingIndex = merged.findIndex(c => 
                  normalizePhoneForMatch(c.phone) === normalizePhoneForMatch(newContact.phone)
                );
                if (existingIndex >= 0) {
                  // Atualiza contato existente, mas preserva source se for CSV ou manual
                  merged[existingIndex] = {
                    ...newContact,
                    source: merged[existingIndex].source === 'csv' || merged[existingIndex].source === 'manual' 
                      ? merged[existingIndex].source 
                      : newContact.source
                  };
                } else {
                  merged.push(newContact);
                }
              });
              return merged;
            });
            
            // Atualiza chats com novos contatos
            updateChatsWithContacts(newContacts);
            
            if (newContacts.length > 0) {
               addNotification('Sincronização Concluída', `${newContacts.length} contatos atualizados do Google.`, 'success');
            } else {
               addNotification('Sincronização', `Nenhum contato encontrado.`, 'info');
            }
            resolve();
        }, 500);
    });
  };

  const handleImportCSVContacts = async (importedContacts: Contact[]) => {
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            // Mescla com contatos existentes
            setContacts(currentContacts => {
              const merged = [...currentContacts];
              importedContacts.forEach(newContact => {
                const existingIndex = merged.findIndex(c => 
                  normalizePhoneForMatch(c.phone) === normalizePhoneForMatch(newContact.phone)
                );
                if (existingIndex >= 0) {
                  // Atualiza contato existente, preservando source se for CSV
                  merged[existingIndex] = {
                    ...newContact,
                    source: 'csv',
                    lastSync: new Date()
                  };
                } else {
                  merged.push({
                    ...newContact,
                    source: 'csv',
                    lastSync: new Date()
                  });
                }
              });
              return merged;
            });
            
            // Atualiza chats com novos contatos
            updateChatsWithContacts(importedContacts);
            
            if (importedContacts.length > 0) {
               addNotification('Importação Concluída', `${importedContacts.length} contatos importados do CSV.`, 'success');
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
    // Contatos agora está disponível para todos
    if (['settings', 'users', 'connections', 'departments', 'reports', 'workflows', 'chatbot'].includes(view)) return false;
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
                    <div><p className="text-slate-500 text-sm">Aguardando Triagem</p><h3 className="text-2xl font-bold text-slate-800">{chats.filter(c => !c.departmentId && c.status !== 'closed').length}</h3></div>
                </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-green-100 text-green-600 rounded-lg"><Smartphone /></div>
                    <div><p className="text-slate-500 text-sm">Status Conexão</p><h3 className="text-2xl font-bold text-emerald-600">{apiConfig.isDemo ? 'Modo Simulação' : 'Modo Real'}</h3></div>
                </div>
                </div>
                {!apiConfig.isDemo && (
                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <div className="flex items-center gap-4 mb-2">
                    <div className={`p-3 rounded-lg ${
                        wsStatus === 'connected' ? 'bg-emerald-100 text-emerald-600' :
                        wsStatus === 'connecting' ? 'bg-amber-100 text-amber-600' :
                        wsStatus === 'failed' ? 'bg-red-100 text-red-600' :
                        'bg-slate-100 text-slate-600'
                    }`}>
                        {wsStatus === 'connected' ? <MessageSquare /> :
                         wsStatus === 'connecting' ? <MessageSquare className="animate-pulse" /> :
                         <MessageSquare />}
                    </div>
                    <div className="flex-1">
                        <p className="text-slate-500 text-sm">Tempo Real (Socket.IO)</p>
                        <div className="flex items-center gap-2">
                            <h3 className={`text-lg font-bold ${
                                wsStatus === 'connected' ? 'text-emerald-600' :
                                wsStatus === 'connecting' ? 'text-amber-600' :
                                wsStatus === 'failed' ? 'text-red-600' :
                                'text-slate-600'
                            }`}>
                                {wsStatus === 'connected' ? 'Conectado' :
                                 wsStatus === 'connecting' ? 'Conectando...' :
                                 wsStatus === 'failed' ? 'Desconectado' :
                                 'Desconectado'}
                            </h3>
                            {wsStatus === 'failed' && (
                                <button
                                    onClick={() => {
                                        wsReconnectAttemptsRef.current = 0;
                                        setWsStatus('connecting');
                                        initWebSocket(false).catch(err => {
                                            console.error('[App] ❌ Erro ao reconectar Socket.IO:', err);
                                        });
                                    }}
                                    className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                                    title="Tentar reconectar"
                                >
                                    Reconectar
                                </button>
                            )}
                        </div>
                        {wsStatus === 'failed' && (
                            <p className="text-xs text-slate-500 mt-1">
                                Sistema funcionando via sincronização periódica
                            </p>
                        )}
                    </div>
                </div>
                </div>
                )}
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
        return <div className="h-full md:p-4"><ChatInterface chats={filteredChats} departments={departments} currentUser={currentUser} onUpdateChat={handleUpdateChat} apiConfig={apiConfig} quickReplies={quickReplies} workflows={workflows} contacts={contacts} forceSelectChatId={forceSelectChatId} /></div>;
      case 'reports': return <ReportsDashboard chats={chats} departments={departments} />;
      case 'contacts': return <Contacts contacts={contacts} onSyncGoogle={handleSyncGoogleContacts} onImportCSV={handleImportCSVContacts} onAddContact={handleAddContact} onStartChat={handleStartChatFromContact} clientId={apiConfig.googleClientId} />;
      case 'chatbot': return <ChatbotSettings config={chatbotConfig} onSave={handleUpdateChatbotConfig} />;
      case 'connections': return <Connection config={apiConfig} onNavigateToSettings={() => setCurrentView('settings')} onUpdateConfig={handleSaveConfig} />;
      case 'departments': return <DepartmentSettings departments={departments} onAdd={handleAddDepartment} onUpdate={handleUpdateDepartment} onDelete={handleDeleteDepartment} />;
      case 'workflows': return <WorkflowSettings workflows={workflows} departments={departments} onAdd={handleAddWorkflow} onUpdate={handleUpdateWorkflow} onDelete={handleDeleteWorkflow} />;
      case 'users': return <UserSettings users={users} departments={departments} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} />;
      case 'settings': return <div className="p-4 space-y-6 overflow-y-auto h-full"><Settings config={apiConfig} onSave={handleSaveConfig} currentUser={currentUser} />{currentUser?.role === UserRole.ADMIN && <QuickMessageSettings quickReplies={quickReplies} onAdd={handleAddQuickReply} onUpdate={handleUpdateQuickReply} onDelete={handleDeleteQuickReply} />}</div>;
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