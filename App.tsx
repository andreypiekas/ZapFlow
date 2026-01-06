import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Chat, Department, ViewState, ApiConfig, User, UserRole, QuickReply, Workflow, Contact, ChatbotConfig, MessageStatus, Message } from './types';
import { INITIAL_CHATS, INITIAL_DEPARTMENTS, INITIAL_USERS, INITIAL_QUICK_REPLIES, INITIAL_WORKFLOWS, MOCK_GOOGLE_CONTACTS, INITIAL_CHATBOT_CONFIG } from './constants';
import Login from './components/Login';
import BackendConnectionError from './components/BackendConnectionError';
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
import Holidays from './components/Holidays';
import { MessageSquare, Settings as SettingsIcon, Smartphone, Users, LayoutDashboard, LogOut, ShieldCheck, Menu, X, Zap, BarChart, ListChecks, Info, AlertTriangle, CheckCircle, Contact as ContactIcon, Bot, ChevronLeft, ChevronRight, Calendar, Flag } from 'lucide-react';
import { fetchChats, fetchChatMessages, normalizeJid, mapApiMessageToInternal, findActiveInstance, sendDepartmentSelectionMessage, processDepartmentSelection } from './services/whatsappService';
import { processChatbotMessages } from './services/chatbotService'; 
import { storageService } from './services/storageService';
import { apiService, getBackendUrl, loadConfig as loadConfigFromBackend, saveConfig as saveConfigToBackend, getUpcomingNationalHolidays } from './services/apiService';
import { SecurityService } from './services/securityService';
import { io, Socket } from 'socket.io-client';
import { getNationalHolidays, getUpcomingHolidays, Holiday, BRAZILIAN_STATES } from './services/holidaysService'; 

// Carrega configuração padrão (será substituída quando usuário fizer login)
const loadConfig = (): ApiConfig => {
  return {
    baseUrl: '', 
    apiKey: '',
    instanceName: 'zapflow',
    isDemo: false,
    googleClientId: '',
    geminiApiKey: '',
    holidayStates: []
  };
};

// TODO: Remover localStorage - backend é obrigatório
const loadUserSession = (): User | null => {
  try {
    // Verifica se deve usar apenas PostgreSQL
    if (storageService.getUseOnlyPostgreSQL()) {
      return null; // Não carrega do localStorage se usar apenas PostgreSQL
    }
    
    // TODO: Remover este bloco - backend é obrigatório
    // Fallback temporário para localStorage (será removido)
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
    if (saved && ['dashboard', 'chats', 'contacts', 'settings', 'connection', 'departments', 'users', 'quickMessages', 'workflows', 'reports', 'chatbot', 'holidays'].includes(saved)) {
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

// Função auxiliar para encontrar o operador específico do departamento
// Retorna o primeiro usuário atribuído ao departamento (não round-robin)
const findAvailableUserForDepartment = (
  departmentId: string,
  users: User[],
  chats: Chat[]
): User | null => {
  // Filtra usuários do departamento (excluindo ADMINs, que não têm departmentId)
  const departmentUsers = users.filter(
    user => user.departmentId === departmentId && user.role !== UserRole.ADMIN
  );
  
  if (departmentUsers.length === 0) {
    return null;
  }
  
  // Retorna o primeiro usuário do departamento (operador específico)
  return departmentUsers[0] || null;
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(loadUserSession());
  const [currentView, setCurrentView] = useState<ViewState>(loadViewStateFromStorage());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(loadSidebarStateFromStorage());
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  
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
          messages: (chat.messages && Array.isArray(chat.messages)) ? chat.messages.map((msg: Message) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          })) : []
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
  const [upcomingHolidays, setUpcomingHolidays] = useState<Holiday[]>([]);

  // Configurações são salvas apenas via handleSaveConfig (endpoint /api/config)
  // Não salvar automaticamente aqui para evitar conflitos com configurações globais

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

  // Carrega feriados nacionais e municipais próximos para o dashboard
  useEffect(() => {
    const loadUpcomingHolidays = async () => {
      try {
        // Primeiro carrega apenas nacionais do banco (rápido)
        const today = new Date();
        
        // Busca do banco de dados
        const upcomingNational = await getUpcomingNationalHolidays(30);

        // Exibe nacionais imediatamente
        setUpcomingHolidays(upcomingNational.slice(0, 5));

        // Depois busca municipais em background (pode demorar)
        try {
          // Busca API key do Gemini e estados configurados
          const configData = await loadConfigFromBackend();
          const geminiApiKey = configData?.geminiApiKey || '';
          
          // Estados principais (prioridade): SC, PR, RS
          const priorityStates = ['SC', 'PR', 'RS'];
          
          // Estados adicionais configurados pelo usuário (ou todos os demais se não configurado)
          const configuredStates = configData?.holidayStates || [];
          const otherStates = configuredStates.length > 0 
            ? configuredStates.filter(s => !priorityStates.includes(s))
            : BRAZILIAN_STATES.map(s => s.code).filter(s => !priorityStates.includes(s));
          
          // Busca apenas municipais (getUpcomingHolidays retorna nacionais + municipais, então filtra)
          let allMunicipalHolidays: Holiday[] = [];
          
          if (priorityStates.length > 0) {
            console.log('[App] 🔍 Buscando feriados municipais dos estados principais (SC, PR, RS)...');
            const priorityHolidays = await getUpcomingHolidays(
              15, // Apenas próximos 15 dias
              priorityStates,
              undefined,
              geminiApiKey || undefined
            );
            // Filtra apenas municipais (remove nacionais que já foram buscados)
            const municipalOnly = priorityHolidays.filter(h => h.type === 'municipal');
            allMunicipalHolidays.push(...municipalOnly);
          }
          
          // Depois busca dos demais estados configurados
          if (otherStates.length > 0) {
            console.log(`[App] 🔍 Buscando feriados municipais dos demais estados (${otherStates.length} estados)...`);
            const otherHolidays = await getUpcomingHolidays(
              15, // Apenas próximos 15 dias
              otherStates,
              undefined,
              geminiApiKey || undefined
            );
            // Filtra apenas municipais
            const municipalOnly = otherHolidays.filter(h => h.type === 'municipal');
            allMunicipalHolidays.push(...municipalOnly);
          }

          // Combina nacionais e municipais, remove duplicatas, ordena e pega os 5 próximos
          const combined = [...upcomingNational, ...allMunicipalHolidays]
            .filter((h, index, self) => 
              index === self.findIndex(t => 
                t.date === h.date && 
                t.name === h.name && 
                (t.type !== 'municipal' || (t.city === h.city && t.state === h.state))
              )
            )
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(0, 5);

          setUpcomingHolidays(combined);
        } catch (municipalError) {
          console.warn('[App] Erro ao carregar feriados municipais, usando apenas nacionais:', municipalError);
          // Mantém apenas os nacionais se der erro
        }
      } catch (error) {
        console.error('[App] Erro ao carregar feriados:', error);
      }
    };

    loadUpcomingHolidays();
    // Atualiza automaticamente a cada 10 dias (para atualizar cache de feriados municipais)
    const interval = setInterval(loadUpcomingHolidays, 10 * 24 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [apiConfig.holidayStates]); // Reexecuta quando os estados configurados mudarem

  // Verifica se o backend está disponível ao montar o componente
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const isAvailable = await apiService.healthCheck();
        setBackendAvailable(isAvailable);
      } catch (error) {
        setBackendAvailable(false);
      }
    };

    checkBackend();
    // Verifica a cada 10 segundos
    const interval = setInterval(checkBackend, 10000);
    return () => clearInterval(interval);
  }, []);

  // Carrega dados da API quando o componente montar e usuário estiver logado
  useEffect(() => {
    if (!currentUser) return;

    const loadDataFromAPI = async () => {
      try {
        // Carrega configurações globais do endpoint específico /api/config
        // Outros dados usam o endpoint genérico /api/data
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
          loadConfigFromBackend(), // Usa endpoint específico /api/config
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

        // Atualiza configuração - sempre atualiza mesmo que venha com valores vazios
        // Isso garante que os valores do banco sejam aplicados
        if (apiConfigData !== null) {
          // Sempre atualiza, mesmo se alguns campos estiverem vazios
          const loadedConfig = {
            baseUrl: apiConfigData.baseUrl || '',
            apiKey: apiConfigData.apiKey || '',
            authenticationApiKey: apiConfigData.authenticationApiKey || '',
            instanceName: apiConfigData.instanceName || 'zapflow',
            isDemo: apiConfigData.isDemo || false,
            googleClientId: apiConfigData.googleClientId || '',
            geminiApiKey: apiConfigData.geminiApiKey || '',
            holidayStates: apiConfigData.holidayStates || []
          };
          
          // Verifica se há pelo menos um campo não vazio para considerar como configuração válida
          const hasConfig = loadedConfig.baseUrl || loadedConfig.apiKey || loadedConfig.geminiApiKey;
          
          setApiConfig(loadedConfig);
          
          if (hasConfig) {
            console.log('[App] ✅ Configurações carregadas do banco de dados:', {
              hasBaseUrl: !!loadedConfig.baseUrl,
              hasApiKey: !!loadedConfig.apiKey,
              instanceName: loadedConfig.instanceName,
              hasGeminiApiKey: !!loadedConfig.geminiApiKey
            });
          } else {
            console.warn('[App] ⚠️ Configuração carregada do banco está vazia - usuário precisa configurar');
          }
        } else {
          console.warn('[App] ⚠️ Não foi possível carregar configuração do banco de dados (retornou null)');
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
          
          // Após carregar chats, atualiza com nomes dos contatos se houver contatos
          if (contactsData && contactsData.length > 0) {
            // Usa setTimeout para garantir que setChats seja executado primeiro
            setTimeout(() => {
              updateChatsWithContacts(contactsData);
            }, 100);
          }
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
            departmentId: u.departmentId || undefined, // Agora vem do banco de dados
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

    // Flag para evitar múltiplas execuções simultâneas
    let isSyncing = false;

    const syncChats = async () => {
        // Evita múltiplas execuções simultâneas
        if (isSyncing) {
            console.log('[App] ⏸️ [DEBUG] syncChats já em execução, pulando...');
            return;
        }
        
        isSyncing = true;
        try {
            console.log('[App] 🔍 [DEBUG] Iniciando syncChats...');
        // PASSO 1: Carrega chats do banco PRIMEIRO para ter status fixo
        let dbChatsMap = new Map<string, Chat>();
        try {
            const dbChatsData = await apiService.getAllData<Chat>('chats');
            console.log('[App] 🔍 [DEBUG] syncChats - getAllData retornou:', {
                count: dbChatsData ? Object.keys(dbChatsData).length : 0,
                keys: dbChatsData ? Object.keys(dbChatsData).slice(0, 5) : []
            });
            if (dbChatsData && Object.keys(dbChatsData).length > 0) {
                // Processa cada entrada do objeto { "chatId": {...chat} }
                Object.entries(dbChatsData).forEach(([key, chat]: [string, any]) => {
                    // Se o chat é um objeto com id, usa diretamente
                    // Se não, pode ser que a key seja o id
                    const chatObj = chat && typeof chat === 'object' ? chat : { id: key };
                    
                    if (chatObj && chatObj.id) {
                        console.log('[App] 🔍 [DEBUG] syncChats - Adicionando chat ao Map:', {
                            id: chatObj.id,
                            status: chatObj.status,
                            assignedTo: chatObj.assignedTo
                        });
                        dbChatsMap.set(chatObj.id, {
                            ...chatObj,
                            id: chatObj.id || key,
                            lastMessageTime: chatObj.lastMessageTime ? new Date(chatObj.lastMessageTime) : new Date(),
                            messages: chatObj.messages?.map((msg: Message) => ({
                                ...msg,
                                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
                            })) || []
                        });
                    } else {
                        console.log('[App] 🔍 [DEBUG] syncChats - Chat inválido ignorado:', { key, chat, chatObj });
                    }
                });
                console.log(`[App] 🔍 [DEBUG] syncChats - dbChatsMap criado com ${dbChatsMap.size} chats.`);
            } else {
                console.log('[App] ⚠️ [DEBUG] syncChats - Nenhum chat no banco para criar Map');
            }
        } catch (error) {
            console.error('[App] ❌ [DEBUG] Erro ao carregar chats do banco antes da sincronização:', error);
        }

        // PASSO 2: Busca chats da API (com tratamento de erro)
        let realChats: Chat[] = [];
        try {
            realChats = await fetchChats(apiConfig);
        } catch (error) {
            console.error('[App] ❌ [DEBUG] Erro ao buscar chats da Evolution API:', error);
            // Continua com os chats do banco mesmo se a API falhar
            realChats = [];
        }
        
        // PASSO 2.5: Busca mensagens separadamente para chats que precisam
        // NOTA: fetchChats não retorna mensagens (removemos include: ['messages'] para evitar erro 500)
        // Busca mensagens em paralelo para chats que têm poucas mensagens na API
        const chatsNeedingMessages = realChats.filter(realChat => {
            if (!realChat || !realChat.id) return false;
            const dbChat = dbChatsMap.get(realChat.id);
            const dbMessages = dbChat?.messages || [];
            const maxExpectedMessages = Math.max(dbMessages.length, realChat.messages.length);
            // Se a API retornou muito menos mensagens que o esperado, precisa buscar separadamente
            return realChat.messages.length < maxExpectedMessages * 0.5 && maxExpectedMessages > 5;
        });
        
        // Busca mensagens em paralelo para os chats que precisam
        const messagesMap = new Map<string, Message[]>();
        if (chatsNeedingMessages.length > 0) {
            console.log(`[App] 🔍 [DEBUG] syncChats: Buscando mensagens separadamente para ${chatsNeedingMessages.length} chats...`);
            await Promise.all(chatsNeedingMessages.map(async (realChat) => {
                try {
                    console.log(`[App] 🔍 [DEBUG] syncChats: Iniciando busca de mensagens para ${realChat.id} (API tem ${realChat.messages.length} mensagens)...`);
                    const fetchedMessages = await fetchChatMessages(apiConfig, realChat.id, 1000);
                    console.log(`[App] 🔍 [DEBUG] syncChats: fetchChatMessages retornou ${fetchedMessages.length} mensagens para ${realChat.id}`);
                    if (fetchedMessages.length > realChat.messages.length) {
                        console.log(`[App] ✅ [DEBUG] syncChats: Buscou ${fetchedMessages.length} mensagens separadamente para ${realChat.id} (antes tinha ${realChat.messages.length})`);
                        messagesMap.set(realChat.id, fetchedMessages);
                    } else {
                        console.log(`[App] ⚠️ [DEBUG] syncChats: fetchChatMessages retornou ${fetchedMessages.length} mensagens (não é maior que ${realChat.messages.length}), não atualizando messagesMap para ${realChat.id}`);
                    }
                } catch (error) {
                    console.error(`[App] ❌ [DEBUG] syncChats: Erro ao buscar mensagens separadamente para ${realChat.id}:`, error);
                }
            }));
            console.log(`[App] 🔍 [DEBUG] syncChats: messagesMap final tem ${messagesMap.size} entradas:`, Array.from(messagesMap.keys()));
        }
        
        if (realChats.length > 0) {
            setChats(currentChats => {
                const mergedChats = realChats
                    .filter(realChat => realChat && realChat.id) // Filtra chats inválidos
                    .map(realChat => {
                    // Tenta encontrar chat existente por ID ou por contactNumber
                    // IMPORTANTE: Preserva chats existentes que estão atribuídos e em 'open'
                    let existingChat = currentChats.find(c => c && c.id && c.id === realChat.id);
                    
                    // Se não encontrou por ID, tenta encontrar por contactNumber (para casos de IDs gerados)
                    if (!existingChat && realChat.contactNumber) {
                        const realContactNumber = (realChat.contactNumber && typeof realChat.contactNumber === 'string') ? realChat.contactNumber : '';
                        const realContactDigits = realContactNumber.replace(/\D/g, '').length;
                        if (realContactDigits >= 10) {
                            // Busca exata primeiro
                            existingChat = currentChats.find(c => {
                                const existingNumber = (c.contactNumber && typeof c.contactNumber === 'string') ? c.contactNumber.replace(/\D/g, '') : '';
                                const realNumber = realContactNumber.replace(/\D/g, '');
                                // Busca exata ou pelos últimos dígitos (para casos onde um tem DDI e outro não)
                                return existingNumber === realNumber || 
                                       (existingNumber.length >= 8 && realNumber.length >= 8 && 
                                        existingNumber.slice(-Math.min(existingNumber.length, 11)) === realNumber.slice(-Math.min(realNumber.length, 11)));
                            });
                            
                            // Se ainda não encontrou, tenta pelo ID do chat (extraindo número do ID)
                            if (!existingChat) {
                                existingChat = currentChats.find(c => {
                                    if (c.id && typeof c.id === 'string' && c.id.includes('@') && !c.id.includes('@g.us')) {
                                        const idNumber = (c.id && typeof c.id === 'string') ? c.id.split('@')[0].replace(/\D/g, '') : '';
                                        const realNumber = realContactNumber.replace(/\D/g, '');
                                        return idNumber === realNumber || 
                                               (idNumber.length >= 8 && realNumber.length >= 8 && 
                                                idNumber.slice(-Math.min(idNumber.length, 11)) === realNumber.slice(-Math.min(realNumber.length, 11)));
                                    }
                                    return false;
                                });
                            }
                        }
                    }
                    
                    // PRIORIDADE ABSOLUTA: Status do banco tem precedência sobre tudo
                    const dbChat = existingChat && existingChat.id 
                        ? dbChatsMap.get(existingChat.id) 
                        : (realChat && realChat.id ? dbChatsMap.get(realChat.id) : undefined);
                    
                    console.log('[App] 🔍 [DEBUG] syncChats - Processando chat:', {
                        realChatId: realChat?.id,
                        existingChatId: existingChat?.id,
                        existingChatStatus: existingChat?.status,
                        existingChatAssignedTo: existingChat?.assignedTo,
                        dbChatExists: !!dbChat,
                        dbChatStatus: dbChat?.status,
                        dbChatAssignedTo: dbChat?.assignedTo,
                        dbChatsMapSize: dbChatsMap.size
                    });
                    
                    if (existingChat && realChat) {
                        // NOTA: fetchChats não retorna mensagens (removemos include: ['messages'] para evitar erro 500)
                        // Usa mensagens buscadas separadamente se disponíveis, senão usa as da API
                        const messagesFromMap = messagesMap.get(realChat.id);
                        let apiMessages = messagesFromMap || realChat.messages;
                        
                        if (messagesFromMap) {
                            console.log(`[App] ✅ [DEBUG] syncChats: Usando ${messagesFromMap.length} mensagens do messagesMap para ${realChat.id}`);
                        } else {
                            console.log(`[App] ⚠️ [DEBUG] syncChats: Nenhuma mensagem no messagesMap para ${realChat.id}, usando ${realChat.messages.length} mensagens da API`);
                        }
                        
                        const newMsgCount = apiMessages.length;
                        const oldMsgCount = existingChat.messages.length;
                        
                        // Log para rastrear contagem de mensagens
                        if (newMsgCount !== oldMsgCount) {
                            console.log(`[App] 📊 [DEBUG] syncChats: Contagem de mensagens diferente - chatId: ${realChat.id}, oldCount: ${oldMsgCount}, newCount: ${newMsgCount}, dbStatus: ${dbChat?.status}`);
                        }
                        
                        // COMPARAÇÃO ROBUSTA: Verifica se há novas mensagens do usuário comparando as mensagens reais
                        // Filtra apenas mensagens do usuário e agente (ignora mensagens de sistema)
                        const realUserMessages = apiMessages.filter(m => m.sender === 'user' || m.sender === 'agent');
                        const existingUserMessages = existingChat.messages.filter(m => m.sender === 'user' || m.sender === 'agent');
                        
                        // Encontra a última mensagem do usuário na API
                        const lastRealUserMsg = realUserMessages.length > 0 ? realUserMessages[realUserMessages.length - 1] : null;
                        const lastExistingUserMsg = existingUserMessages.length > 0 ? existingUserMessages[existingUserMessages.length - 1] : null;
                        
                        // Verifica se há uma nova mensagem do usuário que não estava no estado anterior
                        // Compara por ID, timestamp e conteúdo para detectar mensagens realmente novas
                        const hasNewUserMessage = lastRealUserMsg && lastRealUserMsg.sender === 'user' && (
                            !lastExistingUserMsg || 
                            lastRealUserMsg.id !== lastExistingUserMsg.id ||
                            (lastRealUserMsg.timestamp && lastExistingUserMsg.timestamp && 
                             lastRealUserMsg.timestamp.getTime() > lastExistingUserMsg.timestamp.getTime())
                        );
                        
                        // Verifica se há novas mensagens (qualquer tipo) ou se há nova mensagem do usuário
                        const hasNewMessages = newMsgCount > oldMsgCount || hasNewUserMessage;
                        
                        if (hasNewMessages) {
                            const lastMsg = apiMessages[apiMessages.length - 1];
                            const dbChatStatus = dbChat?.status;
                            
                            console.log(`[App] 🔍 [DEBUG] syncChats: Nova mensagem detectada - chatId: ${realChat.id}, dbStatus: ${dbChatStatus}, lastMsgSender: ${lastMsg?.sender}, lastMsgContent: ${lastMsg?.content?.substring(0, 50)}, hasNewUserMessage: ${hasNewUserMessage}`);
                            
                            // Se o chat está fechado no banco e recebeu nova mensagem do usuário, reabre IMEDIATAMENTE
                            if (dbChatStatus === 'closed' && hasNewUserMessage) {
                                console.log(`[App] 🔄 [DEBUG] syncChats: Chat fechado ${realChat.id} recebeu nova mensagem do usuário, reabrindo IMEDIATAMENTE...`);
                                
                                // Atualiza status para pending e limpa assignedTo/departmentId IMEDIATAMENTE
                                // Usa IIFE async para executar imediatamente sem bloquear
                                (async () => {
                                    try {
                                        // Atualiza banco IMEDIATAMENTE
                                        await apiService.updateChatStatus(realChat.id, 'pending', undefined, null);
                                        console.log(`[App] ✅ [DEBUG] syncChats: Chat ${realChat.id} reaberto e salvo no banco`);
                                        
                                        // Quando chat fechado é reaberto, SEMPRE envia mensagem de seleção de departamento
                                        // pois o departamento foi desatribuído ao fechar o chat
                                        const chatHasDepartment = dbChat?.departmentId || existingChat?.departmentId;
                                        
                                        // Carrega departamentos diretamente da API para garantir que estão disponíveis
                                        const departmentsResult = await apiService.getDepartments();
                                        const availableDepartments = departmentsResult.success && departmentsResult.data ? departmentsResult.data : departments;
                                        
                                        console.log(`[App] 🔍 [DEBUG] syncChats: Verificando envio de mensagem de seleção - chatHasDepartment: ${chatHasDepartment}, departments.length: ${availableDepartments.length}, realChat.id: ${realChat.id}`);
                                        
                                        // Se não tem departamento (foi desatribuído ao fechar), SEMPRE envia mensagem de seleção
                                        if (!chatHasDepartment && availableDepartments.length > 0) {
                                            // Envia mensagem de seleção de departamento
                                            // Tenta obter número de várias fontes
                                            const contactNumber = realChat.contactNumber || 
                                                                  existingChat?.contactNumber || 
                                                                  (realChat.id ? realChat.id.split('@')[0] : null) ||
                                                                  (existingChat?.id ? existingChat.id.split('@')[0] : null);
                                            
                                            console.log(`[App] 🔍 [DEBUG] syncChats: Tentando enviar mensagem - contactNumber: ${contactNumber}, realChat.contactNumber: ${realChat.contactNumber}, existingChat?.contactNumber: ${existingChat?.contactNumber}`);
                                            
                                            if (contactNumber && contactNumber.length >= 10) {
                                                console.log(`[App] 📤 [DEBUG] syncChats: Chat reaberto sem departamento - Enviando mensagem de seleção de departamento para ${realChat.id} (número: ${contactNumber})`);
                                                const sent = await sendDepartmentSelectionMessage(apiConfig, contactNumber, availableDepartments);
                                                
                                                if (sent) {
                                                    // Adiciona mensagem de sistema
                                                    const systemMessage: Message = {
                                                        id: `sys_dept_selection_reopen_${Date.now()}`,
                                                        content: 'department_selection_sent - Mensagem de seleção de departamento enviada (chat reaberto)',
                                                        sender: 'system',
                                                        timestamp: new Date(),
                                                        status: MessageStatus.READ,
                                                        type: 'text'
                                                    };
                                                    
                                                    handleUpdateChat({
                                                        ...realChat,
                                                        status: 'pending',
                                                        assignedTo: undefined,
                                                        departmentId: null,
                                                        endedAt: undefined,
                                                        departmentSelectionSent: true,
                                                        awaitingDepartmentSelection: true,
                                                        messages: [...realChat.messages, systemMessage]
                                                    });
                                                    console.log(`[App] ✅ [DEBUG] syncChats: Mensagem de seleção de departamento enviada para ${realChat.id}`);
                                                } else {
                                                    console.error(`[App] ❌ [DEBUG] syncChats: Falha ao enviar mensagem de seleção de departamento para ${realChat.id}`);
                                                }
                                            } else {
                                                console.warn(`[App] ⚠️ [DEBUG] syncChats: Não foi possível enviar mensagem de seleção - número de contato inválido para ${realChat.id} (contactNumber: ${contactNumber})`);
                                            }
                                        } else {
                                            if (availableDepartments.length === 0) {
                                                console.warn(`[App] ⚠️ [DEBUG] syncChats: Não enviando mensagem de seleção - NENHUM DEPARTAMENTO CONFIGURADO. Configure departamentos em Configurações > Departamentos para que a mensagem seja enviada automaticamente.`);
                                            } else {
                                                console.log(`[App] ⚠️ [DEBUG] syncChats: Não enviando mensagem de seleção - chatHasDepartment: ${chatHasDepartment}, departments.length: ${availableDepartments.length}`);
                                            }
                                        }
                                        
                                        if (chatHasDepartment) {
                                            // Se já tem departamento, pode enviar mensagem de saudação se configurado
                                            const chatbotConfig = await storageService.load<ChatbotConfig>('chatbotConfig');
                                            if (chatbotConfig && chatbotConfig.isEnabled && chatbotConfig.greetingMessage) {
                                                // Verifica se já foi enviada (para evitar reenvio)
                                                const hasGreeting = realChat.messages.some((msg: Message) =>
                                                    msg.sender === 'system' && msg.content?.includes('greeting_sent')
                                                );
                                                
                                                if (!hasGreeting) {
                                                    const { sendGreetingMessage } = await import('./services/chatbotService');
                                                    const success = await sendGreetingMessage(apiConfig, chatbotConfig, {
                                                        ...realChat,
                                                        status: 'pending'
                                                    });
                                                    
                                                    if (success) {
                                                        // Adiciona mensagem de sistema
                                                        const systemMessage: Message = {
                                                            id: `sys_chatbot_reopen_sync_${Date.now()}`,
                                                            content: 'greeting_sent - Saudação automática enviada (chat reaberto)',
                                                            sender: 'system',
                                                            timestamp: new Date(),
                                                            status: MessageStatus.READ,
                                                            type: 'text'
                                                        };
                                                        
                                                        handleUpdateChat({
                                                            ...realChat,
                                                            status: 'pending',
                                                            assignedTo: undefined,
                                                            departmentId: dbChat?.departmentId || existingChat?.departmentId || null,
                                                            endedAt: undefined,
                                                            messages: [...realChat.messages, systemMessage]
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    } catch (error) {
                                        console.error('[App] ❌ Erro ao reabrir chat fechado no syncChats:', error);
                                    }
                                })(); // IIFE async - executa imediatamente
                            }
                            
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
                        const existingIsGenerated = (existingChat.contactNumber && typeof existingChat.contactNumber === 'string') && (
                            existingChat.contactNumber.includes('cmin') || 
                            existingChat.contactNumber.includes('cmid') || 
                            existingChat.contactNumber.startsWith('chat_')
                        ) || !/^\d+$/.test((existingChat.contactNumber || '').replace(/\D/g, ''));
                        const useRealContactNumber = (realDigits > existingDigits && realDigits >= 10) || (existingIsGenerated && realDigits >= 10);

                        // Se o chat existente tem ID gerado mas o realChat tem ID válido, atualiza o ID também
                        // Detecta qualquer ID gerado (cmin*, cmid*, cmio*, cmip*, cmit*, chat_*)
                        const existingIdIsGenerated = existingChat.id && typeof existingChat.id === 'string' && (
                            existingChat.id.includes('cmin') || 
                                                       existingChat.id.includes('cmid') || 
                                                       existingChat.id.includes('cmio') ||
                                                       existingChat.id.includes('cmip') ||
                                                       existingChat.id.includes('cmit') ||
                            existingChat.id.startsWith('chat_')
                        );
                        // ID válido: tem @, não é grupo, não é gerado
                        const realIdIsValid = realChat.id && typeof realChat.id === 'string' && (
                            realChat.id.includes('@') && 
                                              !realChat.id.includes('@g.us') && 
                                              !realChat.id.includes('cmin') && 
                                              !realChat.id.includes('cmid') && 
                                              !realChat.id.includes('cmio') &&
                                              !realChat.id.includes('cmip') &&
                                              !realChat.id.includes('cmit') &&
                            !realChat.id.startsWith('chat_')
                        );
                        const shouldUpdateId = existingIdIsGenerated && realIdIsValid;

                        // Merge inteligente de mensagens: combina mensagens locais, do banco e da API, removendo duplicatas
                        // PRIORIDADE: Mensagens do banco > Mensagens locais > Mensagens da API
                        // SEMPRE usa whatsappMessageId como chave primária para evitar duplicatas
                        const mergedMessages: Message[] = [];
                        const messageMap = new Map<string, Message>();
                        
                        // Função para gerar chave única de mensagem (prioriza whatsappMessageId)
                        const getMessageKey = (msg: Message): string => {
                            if (msg.whatsappMessageId) {
                                return `whatsapp_${msg.whatsappMessageId}`;
                            }
                            if (msg.id) {
                                return `id_${msg.id}`;
                            }
                            const timestamp = msg.timestamp?.getTime() || Date.now();
                            const content = msg.content?.substring(0, 50) || '';
                            const sender = msg.sender || 'unknown';
                            return `gen_${timestamp}_${sender}_${content}`;
                        };
                        
                        // Função para verificar se mensagens são duplicadas
                        const isDuplicate = (msg1: Message, msg2: Message): boolean => {
                            if (msg1.whatsappMessageId && msg2.whatsappMessageId) {
                                return msg1.whatsappMessageId === msg2.whatsappMessageId;
                            }
                            if (msg1.id && msg2.id) {
                                return msg1.id === msg2.id;
                            }
                            const time1 = msg1.timestamp?.getTime() || 0;
                            const time2 = msg2.timestamp?.getTime() || 0;
                            if (time1 === time2 && time1 !== 0) {
                                const content1 = msg1.content?.trim() || '';
                                const content2 = msg2.content?.trim() || '';
                                const sender1 = msg1.sender || '';
                                const sender2 = msg2.sender || '';
                                if (content1 === content2 && content1 !== '' && sender1 === sender2) {
                                    return true;
                                }
                            }
                            return false;
                        };
                        
                        // Usa mensagens da API (que podem ter sido buscadas separadamente)
                        const apiMessagesForMerge = apiMessages;
                        
                        // Verifica se o banco tem mensagens e se tem mais que a API
                        const dbMessages = dbChat?.messages || [];
                        const hasMoreDbMessages = dbMessages.length > apiMessagesForMerge.length;
                        const hasMoreLocalMessages = existingChat.messages.length > apiMessagesForMerge.length;
                        
                        // PRIORIDADE 1: Se o banco tem mais mensagens que a API, SEMPRE usa mensagens do banco como base
                        if (hasMoreDbMessages && dbMessages.length > 0) {
                            console.log(`[App] 🔍 [DEBUG] syncChats: Banco tem ${dbMessages.length} mensagens, API tem ${apiMessagesForMerge.length}. Usando banco como base.`);
                            
                            // Adiciona TODAS as mensagens do banco primeiro (fonte mais completa)
                            dbMessages.forEach(msg => {
                                const msgKey = getMessageKey(msg);
                                messageMap.set(msgKey, msg);
                            });
                            
                            // Depois adiciona mensagens da API que não estão no banco (usando whatsappMessageId)
                            apiMessagesForMerge.forEach(msg => {
                                const msgKey = getMessageKey(msg);
                                const existing = messageMap.get(msgKey);
                                
                                if (!existing) {
                                    // Verifica se não é duplicata de outra mensagem no map
                                    let isDup = false;
                                    for (const existingMsg of messageMap.values()) {
                                        if (isDuplicate(msg, existingMsg)) {
                                            isDup = true;
                                            // Se a nova mensagem tem whatsappMessageId e a existente não, substitui
                                            if (msg.whatsappMessageId && !existingMsg.whatsappMessageId) {
                                                const existingKey = getMessageKey(existingMsg);
                                                messageMap.delete(existingKey);
                                                messageMap.set(msgKey, msg);
                                            }
                                            break;
                                        }
                                    }
                                    if (!isDup) {
                                        messageMap.set(msgKey, msg);
                                    }
                                } else if (msg.whatsappMessageId && !existing.whatsappMessageId) {
                                    // Nova tem whatsappMessageId, existente não - substitui
                                    messageMap.set(msgKey, msg);
                                } else if (msg.timestamp && existing.timestamp && 
                                          msg.timestamp.getTime() > existing.timestamp.getTime()) {
                                    // Nova é mais recente - substitui
                                    messageMap.set(msgKey, msg);
                                }
                            });
                            
                            // Por último, adiciona mensagens locais que não estão no banco nem na API
                            existingChat.messages.forEach(msg => {
                                const msgKey = getMessageKey(msg);
                                const existing = messageMap.get(msgKey);
                                
                                if (!existing) {
                                    // Verifica se não é duplicata
                                    let isDup = false;
                                    for (const existingMsg of messageMap.values()) {
                                        if (isDuplicate(msg, existingMsg)) {
                                            isDup = true;
                                            // Se a mensagem local tem whatsappMessageId e a existente não, substitui
                                            if (msg.whatsappMessageId && !existingMsg.whatsappMessageId) {
                                                const existingKey = getMessageKey(existingMsg);
                                                messageMap.delete(existingKey);
                                                messageMap.set(msgKey, msg);
                                            }
                                            break;
                                        }
                                    }
                                    if (!isDup) {
                                        messageMap.set(msgKey, msg);
                                    }
                                } else if (msg.whatsappMessageId && !existing.whatsappMessageId) {
                                    // Local tem whatsappMessageId, existente não - substitui
                                    messageMap.set(msgKey, msg);
                                } else if (msg.timestamp && existing.timestamp && 
                                          msg.timestamp.getTime() > existing.timestamp.getTime()) {
                                    // Local é mais recente - substitui
                                    messageMap.set(msgKey, msg);
                                }
                            });
                        } else if (hasMoreLocalMessages) {
                            // PRIORIDADE: Adiciona mensagens locais primeiro (têm mais mensagens)
                            existingChat.messages.forEach(msg => {
                                const msgKey = msg.id || `${msg.timestamp?.getTime() || Date.now()}_${msg.content?.substring(0, 20) || ''}`;
                                if (!messageMap.has(msgKey)) {
                                    messageMap.set(msgKey, msg);
                                }
                            });
                            
                            // Depois adiciona mensagens da API que não estão nas locais
                            apiMessagesForMerge.forEach(msg => {
                                const msgKey = msg.id || `${msg.timestamp?.getTime() || Date.now()}_${msg.content?.substring(0, 20) || ''}`;
                                // Verifica se já existe nas mensagens locais
                                const existsInLocal = Array.from(messageMap.values()).some(localMsg => {
                                    if (localMsg.whatsappMessageId && msg.whatsappMessageId && 
                                        localMsg.whatsappMessageId === msg.whatsappMessageId) {
                                        return true;
                                    }
                                    if (localMsg.id && msg.id && localMsg.id === msg.id) {
                                        return true;
                                    }
                                    if (localMsg.content && msg.content && localMsg.sender === msg.sender) {
                                        const contentMatch = localMsg.content.trim() === msg.content.trim();
                                        const timeWindow = msg.sender === 'agent' ? 30000 : 10000;
                                        const timeMatch = localMsg.timestamp && msg.timestamp && 
                                            Math.abs(localMsg.timestamp.getTime() - msg.timestamp.getTime()) < timeWindow;
                                        if (contentMatch && timeMatch) {
                                            return true;
                                        }
                                    }
                                    return false;
                                });
                                
                                if (!existsInLocal && !messageMap.has(msgKey)) {
                                    messageMap.set(msgKey, msg);
                                }
                            });
                        } else {
                            // Se API tem mais ou igual mensagens, usa ordem padrão (API primeiro, depois locais)
                            // Primeiro, adiciona todas as mensagens da API (histórico real)
                            apiMessagesForMerge.forEach(msg => {
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
                            const existingApiMsg = apiMessagesForMerge.find(apiMsg => {
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
                            
                            fetchChatMessages(apiConfig, chatId, 1000).then(apiMessages => {
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
                                                // SEMPRE usa o timestamp real para garantir ordem correta de envio/recebimento
                                                const uniqueMessages = Array.from(messageMap.values())
                                                    .sort((a, b) => {
                                                        const timeA = a.timestamp?.getTime() || 0;
                                                        const timeB = b.timestamp?.getTime() || 0;
                                                        const timeDiff = timeA - timeB;
                                                        
                                                        // PRIORIDADE 1: Se timestamps são diferentes, usa timestamp real (ordem cronológica)
                                                        if (timeDiff !== 0) {
                                                            return timeDiff;
                                                        }
                                                        
                                                        // PRIORIDADE 2: Se timestamps são idênticos, usa whatsappMessageId para desempate
                                                        if (a.whatsappMessageId && b.whatsappMessageId) {
                                                            return a.whatsappMessageId.localeCompare(b.whatsappMessageId);
                                                        }
                                                        if (a.whatsappMessageId && !b.whatsappMessageId) {
                                                            return -1;
                                                        }
                                                        if (!a.whatsappMessageId && b.whatsappMessageId) {
                                                            return 1;
                                                        }
                                                        
                                                        // PRIORIDADE 3: Se timestamps são idênticos, usa ordem de inserção (_sortOrder)
                                                        const orderA = (a as any)._sortOrder ?? 0;
                                                        const orderB = (b as any)._sortOrder ?? 0;
                                                        if (orderA !== orderB) {
                                                            return orderA - orderB;
                                                        }
                                                        
                                                        // PRIORIDADE 4: Se tudo é igual, usa ID para desempate
                                                        if (a.id && b.id) {
                                                            return a.id.localeCompare(b.id);
                                                        }
                                                        
                                                        // PRIORIDADE 5: Se tudo é igual, mantém ordem original
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
                                                
                                                // PRIORIDADE ABSOLUTA: Status do banco NUNCA é alterado automaticamente
                                                // Apenas processa avaliação se chat está fechado e aguardando
                                                let updatedChat = { ...c };
                                                
                                                // Processa avaliação se chat está fechado e aguardando avaliação
                                                if (c.status === 'closed' && newReceivedMessages.length > 0 && c.awaitingRating) {
                                                    const lastNewMessage = newReceivedMessages[newReceivedMessages.length - 1];
                                                    const messageContent = lastNewMessage.content.trim();
                                                    const isRatingResponse = /^[1-5]$/.test(messageContent);
                                                    
                                                    if (isRatingResponse) {
                                                        // Cliente respondeu com avaliação - atualiza via handleUpdateChat para persistir no banco
                                                        const rating = parseInt(messageContent);
                                                        handleUpdateChat({
                                                            ...c,
                                                            rating: rating,
                                                            awaitingRating: false,
                                                            status: 'closed' // Mantém fechado
                                                        });
                                                    }
                                                    // Se não é avaliação, NÃO reabre automaticamente - apenas adiciona mensagem
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
                        // SEMPRE usa o timestamp real para garantir ordem correta de envio/recebimento
                        mergedMessages.sort((a, b) => {
                            const timeA = a.timestamp?.getTime() || 0;
                            const timeB = b.timestamp?.getTime() || 0;
                            const timeDiff = timeA - timeB;
                            
                            // PRIORIDADE 1: Se timestamps são diferentes, usa timestamp real (ordem cronológica)
                            if (timeDiff !== 0) {
                                return timeDiff;
                            }
                            
                            // PRIORIDADE 2: Se timestamps são idênticos, usa whatsappMessageId para desempate
                            if (a.whatsappMessageId && b.whatsappMessageId) {
                                return a.whatsappMessageId.localeCompare(b.whatsappMessageId);
                            }
                            if (a.whatsappMessageId && !b.whatsappMessageId) {
                                return -1;
                            }
                            if (!a.whatsappMessageId && b.whatsappMessageId) {
                                return 1;
                            }
                            
                            // PRIORIDADE 3: Se timestamps são idênticos, usa ordem de inserção (_sortOrder)
                            const orderA = (a as any)._sortOrder ?? 0;
                            const orderB = (b as any)._sortOrder ?? 0;
                            if (orderA !== orderB) {
                                return orderA - orderB;
                            }
                            
                            // PRIORIDADE 4: Se tudo é igual, usa ID para desempate
                            if (a.id && b.id) {
                                return a.id.localeCompare(b.id);
                            }
                            
                            // PRIORIDADE 5: Se tudo é igual, mantém ordem original
                            return 0;
                        });
                        
                        // Remove o campo temporário de ordenação
                        mergedMessages.forEach(msg => {
                            delete (msg as any)._sortOrder;
                        });

                        // PRIORIDADE ABSOLUTA: Status do banco NUNCA é sobrescrito pela API
                        // Apenas mudanças via interface (handleUpdateChat) podem alterar o status
                        let finalStatus: 'open' | 'pending' | 'closed';
                        let finalAssignedTo: string | undefined;
                        let finalDepartmentId: string | null;
                        
                        // PRIORIDADE ABSOLUTA: Status do banco SEMPRE tem prioridade
                        // Se o chat está no banco, usa APENAS os dados do banco (status, assignedTo, departmentId)
                        // Ignora completamente status da API e dados locais se o chat está no banco
                        if (dbChat) {
                            // Chat existe no banco: usa status, assignedTo e departmentId do banco SEMPRE (PRIORIDADE ABSOLUTA)
                            finalStatus = dbChat.status || 'pending'; // Se não tem status no banco, usa pending
                            finalAssignedTo = dbChat.assignedTo;
                            finalDepartmentId = dbChat.departmentId !== undefined ? dbChat.departmentId : null;
                            console.log('[App] 🔍 [DEBUG] syncChats - Usando dados do BANCO (PRIORIDADE ABSOLUTA):', {
                                id: realChat.id,
                                status: finalStatus,
                                assignedTo: finalAssignedTo,
                                departmentId: finalDepartmentId
                            });
                                } else {
                            // Chat NÃO está no banco: usa status da API (pending para novos chats)
                            // NÃO preserva status local - apenas banco tem prioridade
                            finalStatus = realChat.status || 'pending';
                            finalAssignedTo = undefined;
                            finalDepartmentId = null;
                            console.log('[App] 🔍 [DEBUG] syncChats - Chat NÃO está no banco, usando status da API:', {
                                id: realChat.id,
                                status: finalStatus
                            });
                        }
                        
                        // Detecta se há novas mensagens reais (não apenas reordenação)
                        const hasNewMessagesAfterMerge = mergedMessages.length > existingChat.messages.length;
                        const lastMergedMsg = mergedMessages.length > 0 ? mergedMessages[mergedMessages.length - 1] : null;
                        const lastExistingMsg = existingChat.messages.length > 0 ? existingChat.messages[existingChat.messages.length - 1] : null;
                        
                        // Verifica se chat estava fechado e recebeu nova mensagem do usuário
                        // Se sim, reabre para 'pending' (isso já foi tratado acima na verificação de dbChat)
                        const wasReopened = dbChat?.status === 'closed' && hasNewMessagesAfterMerge && lastMergedMsg?.sender === 'user';
                        
                        // Processa seleção de setores apenas se não estiver no banco (novos chats)
                        // Chats no banco já têm departmentId fixo
                        if (!dbChat && hasNewMessagesAfterMerge) {
                            const newUserMessages = mergedMessages.filter(msg => {
                                const isNew = !existingChat.messages.some(existingMsg => 
                                    existingMsg.id === msg.id || 
                                    (existingMsg.timestamp && msg.timestamp && 
                                     Math.abs(existingMsg.timestamp.getTime() - msg.timestamp.getTime()) < 5000 &&
                                     existingMsg.content === msg.content)
                                );
                                return isNew && msg.sender === 'user';
                            });
                            
                            if (newUserMessages.length > 0 && finalDepartmentId === null && departments.length > 0) {
                                const lastNewUserMessage = newUserMessages[newUserMessages.length - 1];
                                const messageContent = lastNewUserMessage.content.trim();
                                const selectedDeptId = processDepartmentSelection(messageContent, departments);
                                
                                if (selectedDeptId) {
                                    finalDepartmentId = selectedDeptId;
                                    
                                    // Encontra usuário disponível do departamento
                                    const assignedUser = findAvailableUserForDepartment(selectedDeptId, users, currentChats);
                                    
                                    // Remove mensagem numérica e adiciona confirmação
                                    const messageIndex = mergedMessages.findIndex(m => m.id === lastNewUserMessage.id);
                                    if (messageIndex >= 0) {
                                        mergedMessages.splice(messageIndex, 1);
                                    }
                                    
                                    const departmentName = departments.find(d => d.id === selectedDeptId)?.name || 'Departamento';
                                    mergedMessages.push({
                                        id: `sys_dept_${Date.now()}`,
                                        content: `Atendimento direcionado para ${departmentName}${assignedUser ? ` - Atribuído a ${assignedUser.name}` : ''}`,
                                        sender: 'system',
                                        timestamp: new Date(),
                                        status: MessageStatus.READ,
                                        type: 'text'
                                    });
                                    
                                    // Atribui chat ao usuário encontrado (se houver)
                                    if (assignedUser) {
                                        finalAssignedTo = assignedUser.id;
                                        finalStatus = 'open';
                                        
                                        // Envia notificações
                                        // Notifica o usuário atribuído se for o currentUser
                                        if (assignedUser.id === currentUser?.id) {
                                            addNotification(
                                                `Novo chat atribuído - ${departmentName}`,
                                                `Chat de ${existingChat.contactName} foi atribuído ao departamento ${departmentName} e está na sua fila`,
                                                'info',
                                                true,
                                                true
                                            );
                                        }
                                        
                                        // Notifica administradores (se currentUser for admin)
                                        if (currentUser?.role === UserRole.ADMIN) {
                                            addNotification(
                                                `Novo chat atribuído - ${departmentName}`,
                                                `Chat de ${existingChat.contactName} foi atribuído ao departamento ${departmentName}${assignedUser.id === currentUser?.id ? ' (atribuído a você)' : ` (atribuído a ${assignedUser.name})`}`,
                                                'info',
                                                true,
                                                true
                                            );
                                        }
                                    } else {
                                        // Se não há usuário disponível, deixa como 'pending' para triagem
                                        finalAssignedTo = undefined;
                                        finalStatus = 'pending';
                                        
                                        // Notifica administradores que não há usuário disponível (se currentUser for admin)
                                        if (currentUser?.role === UserRole.ADMIN) {
                                            addNotification(
                                                `Chat aguardando atendimento - ${departmentName}`,
                                                `Chat de ${existingChat.contactName} foi direcionado para ${departmentName}, mas não há operadores disponíveis`,
                                                'warning',
                                                true,
                                                true
                                            );
                                        }
                                    }
                                } else if (!existingChat.departmentSelectionSent) {
                                    // Primeira mensagem sem departamento: envia seleção
                                    sendDepartmentSelectionMessage(apiConfig, existingChat.contactNumber, departments)
                                        .then(sent => {
                                            if (sent) {
                                                handleUpdateChat({
                                                    ...existingChat,
                                                    departmentSelectionSent: true,
                                                    awaitingDepartmentSelection: true
                                                });
                                            }
                                        }).catch(err => console.error('[App] Erro ao enviar seleção de setores:', err));
                                }
                            }
                        }
                        
                        // Só atualiza lastMessageTime se realmente houver nova mensagem
                        const shouldUpdateLastMessageTime = hasNewMessagesAfterMerge && lastMergedMsg && 
                            (!lastExistingMsg || 
                             !lastMergedMsg.id || 
                             lastMergedMsg.id !== lastExistingMsg.id ||
                             (lastMergedMsg.timestamp && lastExistingMsg.timestamp && 
                              lastMergedMsg.timestamp.getTime() > lastExistingMsg.timestamp.getTime()));
                        
                        // Verifica se há contato salvo para atualizar o nome
                        let finalContactName = existingChat.contactName;
                        if (contacts.length > 0) {
                          const chatPhone = normalizePhoneForMatch(useRealContactNumber ? realChat.contactNumber : existingChat.contactNumber);
                          const contactMatch = contacts.find(c => {
                            if (!c.phone) return false;
                            const cPhone = normalizePhoneForMatch(c.phone);
                            return cPhone === chatPhone || 
                                   (cPhone.length >= 8 && chatPhone.length >= 8 && 
                                    (cPhone.slice(-8) === chatPhone.slice(-8) || 
                                     cPhone.slice(-9) === chatPhone.slice(-9) ||
                                     cPhone.slice(-10) === chatPhone.slice(-10) ||
                                     cPhone.slice(-11) === chatPhone.slice(-11)));
                          });
                          
                          if (contactMatch && contactMatch.name && contactMatch.name.trim()) {
                            const chatNameIsNumber = !existingChat.contactName || 
                                                     existingChat.contactName === existingChat.contactNumber || 
                                                     (existingChat.contactNumber && existingChat.contactName === existingChat.contactNumber.replace(/\D/g, '')) ||
                                                     (existingChat.contactName && /^\d+$/.test(existingChat.contactName));
                            if (chatNameIsNumber) {
                              finalContactName = contactMatch.name.trim();
                            }
                          }
                        }
                        
                        let finalContactAvatar = existingChat.contactAvatar || realChat.contactAvatar;
                        
                        // Se encontrou contato e o chat não tem avatar ou tem avatar padrão, usa o avatar do contato
                        if (contacts.length > 0) {
                          const chatPhone = normalizePhoneForMatch(useRealContactNumber ? realChat.contactNumber : existingChat.contactNumber);
                          const contactMatch = contacts.find(c => {
                            if (!c.phone) return false;
                            const cPhone = normalizePhoneForMatch(c.phone);
                            return cPhone === chatPhone || 
                                   (cPhone.length >= 8 && chatPhone.length >= 8 && 
                                    (cPhone.slice(-8) === chatPhone.slice(-8) || 
                                     cPhone.slice(-9) === chatPhone.slice(-9) ||
                                     cPhone.slice(-10) === chatPhone.slice(-10) ||
                                     cPhone.slice(-11) === chatPhone.slice(-11)));
                          });
                          
                          if (contactMatch && contactMatch.avatar && (!finalContactAvatar || finalContactAvatar.includes('ui-avatars.com'))) {
                            finalContactAvatar = contactMatch.avatar;
                          }
                        }
                        
                        const mergedChat = {
                            ...realChat,
                            messages: mergedMessages, // Usa mensagens mescladas
                            id: shouldUpdateId ? realChat.id : existingChat.id, // Atualiza ID se existente for gerado e real for válido
                            contactName: finalContactName, // Usa nome do contato se encontrado, senão mantém o existente
                            contactAvatar: finalContactAvatar, // Preserva avatar existente ou usa da API ou do contato
                            contactNumber: useRealContactNumber ? realChat.contactNumber : existingChat.contactNumber, // Atualiza se número mais completo
                            clientCode: dbChat?.clientCode || existingChat.clientCode,
                            // PRIORIDADE ABSOLUTA: Dados do banco têm precedência
                            departmentId: finalDepartmentId,
                            assignedTo: finalAssignedTo, // Sempre do banco se existir
                            tags: dbChat?.tags || existingChat.tags,
                            status: finalStatus, // Status final com prioridade ABSOLUTA do banco
                            rating: dbChat?.rating || existingChat.rating,
                            awaitingRating: dbChat?.awaitingRating !== undefined ? dbChat.awaitingRating : existingChat.awaitingRating,
                            awaitingDepartmentSelection: dbChat?.awaitingDepartmentSelection !== undefined ? dbChat.awaitingDepartmentSelection : existingChat.awaitingDepartmentSelection,
                            departmentSelectionSent: dbChat?.departmentSelectionSent !== undefined ? dbChat.departmentSelectionSent : (existingChat.departmentSelectionSent || false),
                            activeWorkflow: dbChat?.activeWorkflow || existingChat.activeWorkflow,
                            endedAt: dbChat?.endedAt || existingChat.endedAt,
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
                        
                        // Se o nome ou avatar foi atualizado do contato, salva no banco
                        // IMPORTANTE: Só salva se realmente mudou para evitar loops infinitos
                        const nameChanged = finalContactName !== existingChat.contactName;
                        const avatarChanged = finalContactAvatar !== (existingChat.contactAvatar || realChat.contactAvatar);
                        if (nameChanged || avatarChanged) {
                          // Salva assincronamente para não bloquear e evitar múltiplas chamadas
                          setTimeout(() => {
                            handleUpdateChat(mergedChat);
                          }, 500);
                        }
                        
                        return mergedChat;
                    }
                    
                    if (realChat && !existingChat) {
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
                        
                        // Verifica se há contato salvo para atualizar o nome do novo chat
                        let finalContactName = realChat.contactName;
                        if (contacts.length > 0 && realChat.contactNumber) {
                          const chatPhone = normalizePhoneForMatch(realChat.contactNumber);
                          const contactMatch = contacts.find(c => {
                            if (!c.phone) return false;
                            const cPhone = normalizePhoneForMatch(c.phone);
                            return cPhone === chatPhone || 
                                   (cPhone.length >= 8 && chatPhone.length >= 8 && 
                                    (cPhone.slice(-8) === chatPhone.slice(-8) || 
                                     cPhone.slice(-9) === chatPhone.slice(-9) ||
                                     cPhone.slice(-10) === chatPhone.slice(-10) ||
                                     cPhone.slice(-11) === chatPhone.slice(-11)));
                          });
                          
                          if (contactMatch && contactMatch.name && contactMatch.name.trim()) {
                            const chatNameIsNumber = !realChat.contactName || 
                                                     realChat.contactName === realChat.contactNumber || 
                                                     (realChat.contactNumber && realChat.contactName === realChat.contactNumber.replace(/\D/g, '')) ||
                                                     (realChat.contactName && /^\d+$/.test(realChat.contactName));
                            if (chatNameIsNumber) {
                              finalContactName = contactMatch.name.trim();
                            }
                          }
                        }
                        
                        // console.log(`[App] Novo chat encontrado: ${realChat.id} (${finalContactName})`);
                        let finalContactAvatar = realChat.contactAvatar;
                        
                        // Se encontrou contato e o chat não tem avatar ou tem avatar padrão, usa o avatar do contato
                        if (contacts.length > 0 && realChat.contactNumber) {
                          const chatPhone = normalizePhoneForMatch(realChat.contactNumber);
                          const contactMatch = contacts.find(c => {
                            if (!c.phone) return false;
                            const cPhone = normalizePhoneForMatch(c.phone);
                            return cPhone === chatPhone || 
                                   (cPhone.length >= 8 && chatPhone.length >= 8 && 
                                    (cPhone.slice(-8) === chatPhone.slice(-8) || 
                                     cPhone.slice(-9) === chatPhone.slice(-9) ||
                                     cPhone.slice(-10) === chatPhone.slice(-10) ||
                                     cPhone.slice(-11) === chatPhone.slice(-11)));
                          });
                          
                          if (contactMatch && contactMatch.avatar && (!finalContactAvatar || finalContactAvatar.includes('ui-avatars.com'))) {
                            finalContactAvatar = contactMatch.avatar;
                          }
                        }
                        
                        const newChat = {
                          ...realChat,
                          contactName: finalContactName,
                          contactAvatar: finalContactAvatar
                        };
                        
                        // Salva o novo chat no banco com o nome do contato se foi atualizado
                        // IMPORTANTE: Só salva se realmente mudou para evitar loops infinitos
                        const nameChanged = finalContactName !== realChat.contactName;
                        const avatarChanged = finalContactAvatar !== realChat.contactAvatar;
                        if (nameChanged || avatarChanged) {
                          // Salva assincronamente para não bloquear e evitar múltiplas chamadas
                          setTimeout(() => {
                            handleUpdateChat(newChat);
                          }, 500);
                        }
                        
                        return newChat;
                    }
                    
                    // Se nenhum dos casos acima, retorna o realChat original
                    return realChat;
                });
                // console.log(`[App] Merge concluído: ${mergedChats.length} chats no total`);
                // VERIFICAÇÃO FINAL: Garante que status do banco seja SEMPRE preservado
                const finalMergedChats = mergedChats
                    .filter(chat => chat && chat.id) // Filtra chats inválidos
                    .map(chat => {
                    const dbChat = chat && chat.id ? dbChatsMap.get(chat.id) : undefined;
                    if (dbChat) {
                        // Chat existe no banco: usa status, assignedTo e departmentId do banco SEMPRE
                        return {
                            ...chat,
                            status: dbChat.status || chat.status,
                            assignedTo: dbChat.assignedTo,
                            departmentId: dbChat.departmentId !== undefined ? dbChat.departmentId : chat.departmentId,
                            rating: dbChat.rating,
                            awaitingRating: dbChat.awaitingRating,
                            awaitingDepartmentSelection: dbChat.awaitingDepartmentSelection,
                            departmentSelectionSent: dbChat.departmentSelectionSent,
                            activeWorkflow: dbChat.activeWorkflow,
                            endedAt: dbChat.endedAt
                        };
                    }
                    return chat;
                });
                
                return finalMergedChats;
            });
            
            // Após sincronizar chats, verifica contatos para atualizar nomes
            if (contacts.length > 0) {
                updateChatsWithContacts(contacts);
            }
        } else {
            // console.log('[App] Nenhum chat retornado da API, mantendo estado atual');
        }
        } catch (error) {
            console.error('[App] ❌ [DEBUG] Erro em syncChats:', error);
        } finally {
            isSyncing = false;
        }
    };

    // Carrega chats individuais do banco ANTES da sincronização
    // Isso garante que status, assignedTo e departmentId do banco tenham prioridade
    const loadChatsFromDatabase = async () => {
      try {
        console.log('[App] 🔍 [DEBUG] Iniciando loadChatsFromDatabase...');
        // Carrega todos os chats individuais do banco (data_key = chatId)
        const allChatsData = await apiService.getAllData<Chat>('chats');
        console.log('[App] 🔍 [DEBUG] getAllData retornou:', {
          isNull: allChatsData === null,
          isUndefined: allChatsData === undefined,
          keys: allChatsData ? Object.keys(allChatsData) : [],
          count: allChatsData ? Object.keys(allChatsData).length : 0,
          sample: allChatsData ? Object.values(allChatsData).slice(0, 2) : []
        });
        
        if (allChatsData && Object.keys(allChatsData).length > 0) {
          console.log('[App] 🔍 [DEBUG] Estrutura de allChatsData:', {
            keys: Object.keys(allChatsData),
            firstKey: Object.keys(allChatsData)[0],
            firstValue: Object.values(allChatsData)[0],
            firstValueType: typeof Object.values(allChatsData)[0],
            firstValueKeys: Object.values(allChatsData)[0] ? Object.keys(Object.values(allChatsData)[0] as any) : []
          });
          
          // Converte o objeto de chats em array
          // O backend retorna { "chatId": {...chat} }, então precisamos processar cada entrada
          const chatsArray = Object.entries(allChatsData)
            .map(([key, chat]: [string, any]) => {
              // Se o chat é um objeto com id, usa diretamente
              // Se não, pode ser que a key seja o id
              const chatObj = chat && typeof chat === 'object' ? chat : { id: key };
              
              console.log('[App] 🔍 [DEBUG] Processando entrada do banco:', {
                key,
                chatType: typeof chat,
                chatIsObject: chat && typeof chat === 'object',
                chatHasId: chat && chat.id,
                chatObjId: chatObj.id,
                chatObjStatus: chatObj.status,
                chatObjAssignedTo: chatObj.assignedTo,
                chatObjDepartmentId: chatObj.departmentId
              });
              
              return {
                ...chatObj,
                id: chatObj.id || key, // Usa o id do chat ou a key como fallback
                lastMessageTime: chatObj.lastMessageTime ? new Date(chatObj.lastMessageTime) : new Date(),
                messages: chatObj.messages?.map((msg: Message) => ({
                  ...msg,
                  timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
                })) || []
              };
            })
            .filter((chat: any) => {
              // Valida se o chat tem ID
              if (!chat || !chat.id || typeof chat.id !== 'string') {
                console.log('[App] 🔍 [DEBUG] Chat filtrado (sem id válido):', chat);
                return false;
              }
              
              // Valida número do chat antes de adicionar
              const chatIdStr = chat.id && typeof chat.id === 'string' ? chat.id : '';
              const chatIdNumber = chatIdStr ? chatIdStr.split('@')[0].replace(/\D/g, '') : '';
              const contactNumber = (chat.contactNumber && typeof chat.contactNumber === 'string') ? chat.contactNumber.replace(/\D/g, '') : '';
              
              // Validação rigorosa: números brasileiros devem ter pelo menos 11 dígitos
              const isValidChatIdNumber = chatIdNumber.length >= 11 && chatIdNumber.length <= 14 && /^\d+$/.test(chatIdNumber);
              const isValidContactNumber = contactNumber.length >= 11 && contactNumber.length <= 14 && /^\d+$/.test(contactNumber);
              const hasValidNumber = isValidChatIdNumber || isValidContactNumber;
              
              // Verifica se é grupo (grupos são válidos mesmo sem número de telefone)
              const isGroup = chat.id.includes('@g.us');
              
              // Chat é válido se: é grupo OU tem número válido
              if (!isGroup && !hasValidNumber) {
                console.warn(`[App] ⚠️ [DEBUG] Chat inválido ignorado ao carregar do banco: ${chat.id} (número: ${chatIdNumber || contactNumber || 'N/A'}, dígitos: ${chatIdNumber.length || contactNumber.length || 0})`);
                return false;
              }
              
              return true;
            });
          
          console.log('[App] 🔍 [DEBUG] Chats processados:', {
            total: chatsArray.length,
            statuses: chatsArray.map(c => ({ 
              id: c?.id || 'unknown', 
              status: c?.status || 'unknown', 
              assignedTo: c?.assignedTo || undefined 
            }))
          });
          
          // PRIORIDADE ABSOLUTA: Define chats do banco diretamente no estado
          // Isso garante que status, assignedTo e departmentId do banco sejam preservados
          // Não faz merge com currentChats - banco é a fonte da verdade
          // Só atualiza se houver mudanças reais para evitar re-renderizações desnecessárias
          setChats(prevChats => {
            // Compara se há diferenças significativas antes de atualizar
            if (prevChats.length !== chatsArray.length) {
              return chatsArray;
            }
            
            // Verifica se há diferenças nos IDs ou status
            const prevIds = new Set(prevChats.map(c => c.id));
            const newIds = new Set(chatsArray.map(c => c.id));
            if (prevIds.size !== newIds.size || [...prevIds].some(id => !newIds.has(id))) {
              return chatsArray;
            }
            
            // Verifica se há mudanças de status ou assignedTo
            const hasStatusChanges = chatsArray.some(newChat => {
              const prevChat = prevChats.find(c => c.id === newChat.id);
              return !prevChat || 
                     prevChat.status !== newChat.status || 
                     prevChat.assignedTo !== newChat.assignedTo ||
                     prevChat.departmentId !== newChat.departmentId;
            });
            
            return hasStatusChanges ? chatsArray : prevChats;
          });
          
          console.log(`[App] ✅ Carregados ${chatsArray.length} chats do banco com status fixo`);
        } else {
          console.log('[App] ⚠️ [DEBUG] Nenhum chat encontrado no banco - allChatsData:', allChatsData);
        }
      } catch (error) {
        console.error('[App] ❌ [DEBUG] Erro ao carregar chats do banco:', error);
      }
    };

    // Limpa intervalo anterior se existir (evita múltiplos intervalos)
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
    
    // Carrega chats do banco PRIMEIRO, depois sincroniza
    loadChatsFromDatabase().then(() => {
      // Após carregar chats do banco, atualiza nomes com contatos
      if (contacts.length > 0) {
        updateChatsWithContacts(contacts);
      }
      // Aguarda um pouco para garantir que o estado foi atualizado
      setTimeout(() => {
        syncChats();
      }, 100);
    });
    
    // Polling a cada 2 segundos para detectar mensagens (reduzido de 100ms para evitar re-renderizações constantes)
    // IMPORTANTE: Só cria novo intervalo se não existir um já rodando
    if (!intervalIdRef.current) {
      intervalIdRef.current = setInterval(syncChats, 2000);
    }
    
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
                // Protege eventNames() caso não esteja disponível
                let allListeners: string[] = [];
                try {
                    if (socket.eventNames && typeof socket.eventNames === 'function') {
                        allListeners = Array.from(socket.eventNames());
                    }
                } catch (e) {
                    console.warn('[App] ⚠️ [DEBUG] socket.eventNames() não disponível:', e);
                }
                
                console.log('[App] ✅ Socket.IO conectado com sucesso!', {
                    socketId: socket.id,
                    connected: socket.connected,
                    hasMessagesUpsertHandler: socket.hasListeners ? socket.hasListeners('messages.upsert') : 'unknown',
                    allListeners: allListeners
                });
                wsReconnectAttemptsRef.current = 0;
                setWsStatus('connected');
                
                // Loga todos os listeners registrados para debug
                if (allListeners.length > 0) {
                    console.log('[App] 🔍 [DEBUG] Socket.IO listeners registrados:', allListeners);
                }
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
                    
            // Debug: Listener genérico para ver todos os eventos
            // IMPORTANTE: onAny pode não estar disponível em todas as versões do Socket.IO
            try {
                if (socket.onAny && typeof socket.onAny === 'function') {
                    socket.onAny((eventName, ...args) => {
                        // Loga TODOS os eventos para debug (não apenas mensagens)
                        console.log(`[App] 🔔 [DEBUG] Socket.IO evento recebido: ${eventName}`, {
                            eventName,
                            argsCount: args.length,
                            firstArgType: args[0] ? typeof args[0] : 'undefined',
                            firstArgKeys: args[0] && typeof args[0] === 'object' ? Object.keys(args[0]).slice(0, 10) : []
                        });
                    });
                    console.log('[App] ✅ [DEBUG] socket.onAny registrado com sucesso');
                } else {
                    console.warn('[App] ⚠️ [DEBUG] socket.onAny não está disponível nesta versão do Socket.IO');
                }
            } catch (e) {
                console.error('[App] ❌ [DEBUG] Erro ao registrar socket.onAny:', e);
            }
            
            // Event: messages.upsert - mensagens novas ou atualizadas
            console.log('[App] 🔧 [DEBUG] Registrando handler messages.upsert no Socket.IO');
            
            // Verifica se o socket está conectado antes de registrar handlers
            if (!socket.connected) {
                console.warn('[App] ⚠️ [DEBUG] Socket.IO não está conectado ao registrar handlers. Aguardando conexão...');
                socket.once('connect', () => {
                    console.log('[App] ✅ [DEBUG] Socket.IO conectado, handlers serão registrados agora');
                });
            }
            
            // Debounce para processar múltiplas mensagens rápidas em batch
            // Agrupa mensagens por remoteJid e processa em batch após 100ms
            const messageQueue = new Map<string, any[]>();
            const messageProcessTimeouts = new Map<string, NodeJS.Timeout>();
            
            const processMessageBatch = (remoteJid: string, messages: any[]) => {
                // Processa todas as mensagens do batch
                messages.forEach((messageData, index) => {
                    try {
                        console.log(`[App] 🔍 [DEBUG] processMessageBatch: Processando mensagem ${index + 1}/${messages.length} para ${remoteJid}`, {
                            hasKey: !!messageData.key,
                            hasMessage: !!messageData.message,
                            status: messageData.status,
                            fromMe: messageData.key?.fromMe,
                            conversation: messageData.message?.conversation
                        });
                        
                        const mapped = mapApiMessageToInternal(messageData);
                        if (!mapped) {
                            console.log(`[App] ⚠️ [DEBUG] processMessageBatch: mapApiMessageToInternal retornou null para mensagem ${index + 1}`, {
                                hasKey: !!messageData.key,
                                hasMessage: !!messageData.message,
                                conversation: messageData.message?.conversation,
                                status: messageData.status
                            });
                            return;
                        }
                        
                        console.log(`[App] ✅ [DEBUG] processMessageBatch: Mensagem mapeada com sucesso`, {
                            sender: mapped.sender,
                            content: mapped.content?.substring(0, 50),
                            type: mapped.type,
                            hasMediaUrl: !!mapped.mediaUrl,
                            mediaUrl: mapped.mediaUrl?.substring(0, 100),
                            // Log completo da estrutura original para imagens
                            originalHasImageMessage: !!(messageData.message?.imageMessage || messageData.imageMessage),
                            originalImageUrl: messageData.message?.imageMessage?.url || messageData.imageMessage?.url || messageData.url || 'não encontrado',
                            // Log detalhado da estrutura completa para debug de imagens
                            messageDataKeys: Object.keys(messageData).slice(0, 20),
                            hasMessage: !!messageData.message,
                            messageKeys: messageData.message ? Object.keys(messageData.message).slice(0, 20) : [],
                            // Log completo da estrutura imageMessage se existir
                            imageMessageStructure: messageData.message?.imageMessage ? JSON.stringify(messageData.message.imageMessage).substring(0, 500) : 
                                                  messageData.imageMessage ? JSON.stringify(messageData.imageMessage).substring(0, 500) : 'não encontrado'
                        });
                        
                        // Processa mensagem individual (código existente abaixo)
                        processSingleMessage(remoteJid, mapped, messageData);
                    } catch (error) {
                        console.error(`[App] ❌ Erro ao processar mensagem do batch:`, error);
                    }
                });
            };
            
            socket.on('messages.upsert', (data: any) => {
                console.log('[App] 🎯 [DEBUG] Socket.IO messages.upsert HANDLER CHAMADO!', {
                    hasData: !!data,
                    dataType: typeof data,
                    dataKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 10) : [],
                    socketConnected: socket.connected,
                    socketId: socket.id
                });
                
                try {
                    // Log detalhado da estrutura original ANTES de processar
                    if (data && typeof data === 'object') {
                        const hasImageInData = !!(data.message?.imageMessage || data.imageMessage);
                        if (hasImageInData) {
                            console.log('[App] 🖼️ [DEBUG] Socket.IO: Estrutura ORIGINAL do data recebido:', {
                                hasDataMessage: !!data.message,
                                hasDataImageMessage: !!data.imageMessage,
                                dataMessageKeys: data.message ? Object.keys(data.message).slice(0, 20) : [],
                                dataImageMessageKeys: data.imageMessage ? Object.keys(data.imageMessage).slice(0, 20) : [],
                                dataMessageImageMessageKeys: data.message?.imageMessage ? Object.keys(data.message.imageMessage).slice(0, 20) : [],
                                dataMessageImageMessageUrl: data.message?.imageMessage?.url || 'não encontrado',
                                dataImageMessageUrl: data.imageMessage?.url || 'não encontrado',
                                fullDataStructure: JSON.stringify(data).substring(0, 3000)
                            });
                        }
                    }
                    
                    // Extrai dados da mensagem
                    const messageData = data.message || data;
                    if (!messageData || !messageData.key) {
                        console.log('[App] 🔍 [DEBUG] Socket.IO messages.upsert: messageData ou key ausente', { hasMessage: !!data.message, hasData: !!data, hasKey: !!messageData?.key });
                        return;
                    }
                    
                    const remoteJid = normalizeJid(messageData.key.remoteJid || messageData.key.remoteJidAlt || '');
                    if (!remoteJid) {
                        console.log('[App] 🔍 [DEBUG] Socket.IO messages.upsert: remoteJid ausente', { key: messageData.key });
                        return;
                    }
                    
                    // Log para debug
                    const messageContent = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || messageData.message?.imageMessage?.caption || 'sem conteúdo';
                    const messageStatus = messageData.status || 'sem status';
                    const fromMe = messageData.key?.fromMe || false;
                    const hasImageMessage = !!(messageData.message?.imageMessage || messageData.imageMessage);
                    const imageUrl = messageData.message?.imageMessage?.url || messageData.imageMessage?.url || messageData.url || 'não encontrado';
                    
                    // Log detalhado para imagens
                    if (hasImageMessage) {
                        console.log('[App] 🖼️ [DEBUG] Socket.IO: Imagem detectada na mensagem recebida:', {
                            hasMessageImageMessage: !!messageData.message?.imageMessage,
                            hasImageMessage: !!messageData.imageMessage,
                            messageImageMessageKeys: messageData.message?.imageMessage ? Object.keys(messageData.message.imageMessage) : [],
                            imageMessageKeys: messageData.imageMessage ? Object.keys(messageData.imageMessage) : [],
                            messageImageMessageUrl: messageData.message?.imageMessage?.url || 'não encontrado',
                            imageMessageUrl: messageData.imageMessage?.url || 'não encontrado',
                            messageImageMessageDirectPath: messageData.message?.imageMessage?.directPath || 'não encontrado',
                            imageMessageDirectPath: messageData.imageMessage?.directPath || 'não encontrado',
                            fullMessageDataStructure: JSON.stringify(messageData).substring(0, 2000)
                        });
                    }
                    
                    console.log(`[App] 🔍 [DEBUG] Socket.IO messages.upsert recebido: remoteJid=${remoteJid}, fromMe=${fromMe}, status=${messageStatus}, content=${messageContent.substring(0, 50)}, hasImage=${hasImageMessage}, imageUrl=${typeof imageUrl === 'string' ? imageUrl.substring(0, 100) : imageUrl}`);
                    
                    // Se é uma imagem e encontrou URL, garante que ela seja preservada na estrutura
                    if (hasImageMessage && imageUrl && imageUrl !== 'não encontrado' && typeof imageUrl === 'string') {
                        // Garante que a URL esteja na estrutura correta antes de processar
                        if (messageData.message?.imageMessage && !messageData.message.imageMessage.url) {
                            messageData.message.imageMessage.url = imageUrl;
                            console.log('[App] ✅ [DEBUG] Socket.IO: URL preservada em message.imageMessage.url');
                        } else if (messageData.imageMessage && !messageData.imageMessage.url) {
                            messageData.imageMessage.url = imageUrl;
                            console.log('[App] ✅ [DEBUG] Socket.IO: URL preservada em imageMessage.url');
                        }
                    }
                    
                    // Adiciona mensagem à fila para processamento em batch
                    if (!messageQueue.has(remoteJid)) {
                        messageQueue.set(remoteJid, []);
                    }
                    messageQueue.get(remoteJid)?.push(messageData);
                    
                    // Limpa timeout anterior e cria novo
                    if (messageProcessTimeouts.has(remoteJid)) {
                        clearTimeout(messageProcessTimeouts.get(remoteJid)!);
                    }
                    messageProcessTimeouts.set(remoteJid, setTimeout(() => {
                        const messagesToProcess = messageQueue.get(remoteJid) || [];
                        console.log(`[App] 🔍 [DEBUG] Socket.IO: Processando batch de ${messagesToProcess.length} mensagens para ${remoteJid}`);
                        processMessageBatch(remoteJid, messagesToProcess);
                        messageQueue.delete(remoteJid);
                        messageProcessTimeouts.delete(remoteJid);
                    }, 100));
                } catch (err) {
                    console.error('[App] ❌ Erro ao processar mensagem Socket.IO:', err);
                }
            });
            
            const processSingleMessage = async (remoteJid: string, mapped: Message, messageData: any) => {
                try {
                    // Debug: log para rastrear remoteJid recebido
                    console.log(`[App] 🔍 [DEBUG] Mensagem recebida via Socket.IO: remoteJid=${remoteJid}, sender=${mapped?.sender}, content=${mapped?.content?.substring(0, 50)}`);
                    
                    if (mapped) {
                        // Verifica se o chat já existe antes de processar
                        let chatExistsBefore = false;
                        let existingChatBefore: Chat | undefined = undefined;
                        setChats(currentChats => {
                            // Verifica se chat existe antes de processar
                            const existingChat = currentChats.find(c => {
                                if (!c || !c.id) return false;
                                const chatJid = normalizeJid(c.id);
                                const messageJid = normalizeJid(remoteJid);
                                return chatJid === messageJid || 
                                       (c.contactNumber && typeof c.contactNumber === 'string' && 
                                        c.contactNumber.replace(/\D/g, '') === remoteJid.split('@')[0]?.replace(/\D/g, ''));
                            });
                            chatExistsBefore = !!existingChat;
                            existingChatBefore = existingChat;
                            return currentChats;
                        });
                        
                        // VERIFICAÇÃO CRÍTICA: Se é mensagem do usuário, verifica no banco se chat está fechado
                        // e envia mensagem de seleção IMEDIATAMENTE, mesmo se chat não estiver no estado
                        console.log(`[App] 🔍 [DEBUG] Socket.IO: Verificando mensagem - sender=${mapped?.sender}, remoteJid=${remoteJid}, departments.length=${departments.length}`);
                        
                        if (mapped.sender === 'user' && departments.length > 0) {
                                    const contactNumber = remoteJid.split('@')[0]?.replace(/\D/g, '') || '';
                                    
                                    // Verifica se chat existe no estado
                                    const chatInState = existingChatBefore;
                                    
                                    console.log(`[App] 🔍 [DEBUG] Socket.IO: Mensagem do usuário detectada - remoteJid=${remoteJid}, contactNumber=${contactNumber}, chatInState=${!!chatInState}, status=${chatInState?.status}`);
                                    
                                    // Se chat não está no estado OU está fechado, verifica no banco e envia mensagem
                                    if (!chatInState || chatInState.status === 'closed') {
                                        console.log(`[App] 🔍 [DEBUG] Socket.IO: Verificando chat no banco para envio imediato - remoteJid=${remoteJid}, chatInState=${!!chatInState}, status=${chatInState?.status}`);
                                        
                                        // Busca chat no banco de dados
                                        storageService.getAllData('chats').then(allChatsData => {
                                            if (allChatsData && typeof allChatsData === 'object') {
                                                const chatKey = Object.keys(allChatsData).find(key => {
                                                    const chat = allChatsData[key];
                                                    if (!chat || typeof chat !== 'object') return false;
                                                    const chatId = chat.id;
                                                    if (!chatId) return false;
                                                    const chatJid = normalizeJid(chatId);
                                                    const messageJid = normalizeJid(remoteJid);
                                                    return chatJid === messageJid || 
                                                           (chat.contactNumber && typeof chat.contactNumber === 'string' && 
                                                            chat.contactNumber.replace(/\D/g, '') === contactNumber);
                                                });
                                                
                                                if (chatKey) {
                                                    const dbChat = allChatsData[chatKey];
                                                    const wasClosed = dbChat.status === 'closed';
                                                    const hasNoDepartment = !dbChat.departmentId;
                                                    const shouldSend = !dbChat.departmentSelectionSent || wasClosed;
                                                    
                                                    console.log(`[App] 🔍 [DEBUG] Socket.IO: Chat encontrado no banco - chatId=${chatKey}, status=${dbChat.status}, departmentId=${dbChat.departmentId}, departmentSelectionSent=${dbChat.departmentSelectionSent}, shouldSend=${shouldSend}`);
                                                    
                                                    if (wasClosed && hasNoDepartment && shouldSend && contactNumber.length >= 10) {
                                                        console.log(`[App] 🔄 [DEBUG] Socket.IO: Chat fechado no banco recebeu mensagem do usuário - Reabrindo IMEDIATAMENTE para ${remoteJid} (número: ${contactNumber})`);
                                                        
                                                        // Reabre o chat IMEDIATAMENTE no banco antes de enviar mensagem
                                                        (async () => {
                                                            try {
                                                                // Atualiza status no banco IMEDIATAMENTE
                                                                await apiService.updateChatStatus(dbChat.id, 'pending', undefined, null);
                                                                console.log(`[App] ✅ [DEBUG] Socket.IO: Chat ${dbChat.id} reaberto e salvo no banco IMEDIATAMENTE (verificação do banco)`);
                                                                
                                                                // Depois de salvar, envia mensagem de seleção de departamento
                                                                const sent = await sendDepartmentSelectionMessage(apiConfig, contactNumber, departments);
                                                                if (sent) {
                                                                    console.log(`[App] ✅ [DEBUG] Socket.IO: Mensagem de seleção enviada IMEDIATAMENTE do banco para ${remoteJid}`);
                                                                    // Atualiza chat com departmentSelectionSent
                                                                    handleUpdateChat({
                                                                        ...dbChat,
                                                                        departmentSelectionSent: true,
                                                                        awaitingDepartmentSelection: true,
                                                                        status: 'pending',
                                                                        assignedTo: undefined,
                                                                        departmentId: null
                                                                    });
                                                                }
                                                            } catch (error) {
                                                                console.error(`[App] ❌ [DEBUG] Socket.IO: Erro ao reabrir chat do banco:`, error);
                                                            }
                                                        })();
                                                    } else if (wasClosed && contactNumber.length >= 10) {
                                                        // Chat está fechado mas já tem departamento ou mensagem já foi enviada - apenas reabre
                                                        console.log(`[App] 🔄 [DEBUG] Socket.IO: Chat fechado no banco recebeu mensagem do usuário - Reabrindo (sem enviar mensagem) para ${remoteJid}`);
                                                        (async () => {
                                                            try {
                                                                await apiService.updateChatStatus(dbChat.id, 'pending', undefined, null);
                                                                console.log(`[App] ✅ [DEBUG] Socket.IO: Chat ${dbChat.id} reaberto no banco (sem enviar mensagem)`);
                                                            } catch (error) {
                                                                console.error(`[App] ❌ [DEBUG] Socket.IO: Erro ao reabrir chat do banco:`, error);
                                                            }
                                                        })();
                                                    }
                                                } else {
                                                    // Chat não existe no banco - é um chat novo, envia mensagem imediatamente
                                                    if (contactNumber.length >= 10) {
                                                        console.log(`[App] 📤 [DEBUG] Socket.IO: Chat novo detectado - Enviando mensagem de seleção IMEDIATAMENTE para ${remoteJid} (número: ${contactNumber})`);
                                                        sendDepartmentSelectionMessage(apiConfig, contactNumber, departments)
                                                            .then(sent => {
                                                                if (sent) {
                                                                    console.log(`[App] ✅ [DEBUG] Socket.IO: Mensagem de seleção enviada IMEDIATAMENTE para chat novo ${remoteJid}`);
                                                                }
                                                            })
                                                            .catch(err => {
                                                                console.error(`[App] ❌ [DEBUG] Socket.IO: Erro ao enviar mensagem para chat novo:`, err);
                                                            });
                                                    }
                                                }
                                            }
                                        }).catch(err => {
                                            console.error(`[App] ❌ [DEBUG] Socket.IO: Erro ao buscar chat no banco:`, err);
                                        });
                                    }
                        }
                        
                        setChats(currentChats => {
                            let chatUpdated = false;
                            let foundChat = false;
                            
                            const updatedChats = currentChats.map(chat => {
                                // Encontra o chat pelo JID
                                const chatJid = normalizeJid(chat.id);
                                const messageJid = normalizeJid(remoteJid);
                                
                                // Comparação mais flexível de JIDs
                                const chatNumber = (chat.contactNumber && typeof chat.contactNumber === 'string') ? chat.contactNumber.replace(/\D/g, '') : '';
                                const chatIdNumber = (chatJid && typeof chatJid === 'string') ? chatJid.split('@')[0]?.replace(/\D/g, '') || '' : '';
                                const messageNumber = (messageJid && typeof messageJid === 'string') ? messageJid.split('@')[0]?.replace(/\D/g, '') || '' : '';
                                
                                // Match exato por JID
                                const exactMatch = chatJid === messageJid;
                                        
                                        // Match por número completo (todos os dígitos)
                                        const fullNumberMatch = chatNumber && messageNumber && (
                                            chatNumber === messageNumber || 
                                            chatIdNumber === messageNumber
                                        );
                                        
                                        // Match parcial (últimos 8-10 dígitos) - mais flexível
                                        const partialMatch = chatNumber && messageNumber && (
                                            chatNumber.endsWith(messageNumber.slice(-8)) ||
                                            messageNumber.endsWith(chatNumber.slice(-8)) ||
                                            chatIdNumber.endsWith(messageNumber.slice(-8)) ||
                                            messageNumber.endsWith(chatIdNumber.slice(-8))
                                        );
                                        
                                        // Match por número sem código do país (últimos 9-11 dígitos)
                                        // Ex: 554984329374 vs 4984329374 (sem o 55)
                                        const chatNumberWithoutCountry = chatNumber.length > 2 ? chatNumber.slice(2) : chatNumber;
                                        const messageNumberWithoutCountry = messageNumber.length > 2 ? messageNumber.slice(2) : messageNumber;
                                        const chatIdNumberWithoutCountry = chatIdNumber.length > 2 ? chatIdNumber.slice(2) : chatIdNumber;
                                        
                                        const numberWithoutCountryMatch = (
                                            chatNumberWithoutCountry === messageNumber ||
                                            messageNumberWithoutCountry === chatNumber ||
                                            chatIdNumberWithoutCountry === messageNumber ||
                                            messageNumberWithoutCountry === chatIdNumber ||
                                            chatNumberWithoutCountry === messageNumberWithoutCountry ||
                                            chatIdNumberWithoutCountry === messageNumberWithoutCountry
                                        );
                                        
                                        const chatNumberMatch = exactMatch || fullNumberMatch || partialMatch || numberWithoutCountryMatch;
                                        
                                        if (chatJid === messageJid || chatNumberMatch) {
                                            foundChat = true;
                                            console.log(`[App] 🔍 [DEBUG] Chat encontrado: chatId=${chat.id}, chatJid=${chatJid}, messageJid=${messageJid}, matchType=${exactMatch ? 'exato' : fullNumberMatch ? 'número completo' : 'parcial'}`);
                                        
                                            // Verifica se precisa enviar mensagem de seleção de departamento IMEDIATAMENTE
                                            // ANTES de processar a mensagem, para garantir que seja enviada sempre que necessário
                                            const wasClosed = chat.status === 'closed';
                                            const isUserMessage = mapped.sender === 'user';
                                            
                                            // Debug: log detalhado para entender por que a condição não está sendo satisfeita
                                            if (isUserMessage) {
                                                console.log(`[App] 🔍 [DEBUG] Socket.IO: Verificando envio de mensagem de seleção - chatId: ${chat.id}, isUserMessage: ${isUserMessage}, departmentId: ${chat.departmentId}, departmentSelectionSent: ${chat.departmentSelectionSent}, departments.length: ${departments.length}, status: ${chat.status}, assignedTo: ${chat.assignedTo}, wasClosed: ${wasClosed}`);
                                            }
                                            
                                            // Se chat estava fechado e recebeu mensagem do usuário, RESETA departmentSelectionSent para permitir reenvio
                                            // Isso garante que a mensagem seja enviada quando o chat for reaberto
                                            if (wasClosed && isUserMessage) {
                                                console.log(`[App] 🔄 [DEBUG] Socket.IO: Chat fechado recebeu mensagem do usuário - Resetando departmentSelectionSent para permitir reenvio`);
                                                // Não atualiza o chat ainda, apenas prepara para enviar a mensagem
                                            }
                                            
                                            // Condição ajustada: se chat estava fechado, reseta departmentSelectionSent na verificação
                                            const shouldSendSelection = isUserMessage && 
                                                !chat.departmentId && 
                                                departments.length > 0 &&
                                                (chat.status === 'pending' || !chat.assignedTo || wasClosed) &&
                                                (!chat.departmentSelectionSent || wasClosed); // Permite reenvio se chat estava fechado
                                            
                                            if (shouldSendSelection) {
                                                console.log(`[App] 📤 [DEBUG] Socket.IO: Chat sem departamento - Enviando mensagem de seleção IMEDIATAMENTE para ${chat.id} (status: ${chat.status}, wasClosed: ${wasClosed})`);
                                                const contactNumber = chat.contactNumber || (chat.id ? chat.id.split('@')[0] : null);
                                                
                                                if (contactNumber && contactNumber.length >= 10) {
                                                    // Envia imediatamente, sem esperar processar a mensagem
                                                    sendDepartmentSelectionMessage(apiConfig, contactNumber, departments)
                                                        .then(sent => {
                                                            if (sent) {
                                                                console.log(`[App] ✅ [DEBUG] Socket.IO: Mensagem de seleção de departamento enviada IMEDIATAMENTE para ${chat.id}`);
                                                                // Marca como enviada para evitar reenvio
                                                                handleUpdateChat({
                                                                    ...chat,
                                                                    departmentSelectionSent: true,
                                                                    awaitingDepartmentSelection: true,
                                                                    // Se estava fechado, já marca como pending para evitar loop
                                                                    status: wasClosed ? 'pending' : chat.status,
                                                                    assignedTo: wasClosed ? undefined : chat.assignedTo,
                                                                    departmentId: null
                                                                });
                                                            } else {
                                                                console.error(`[App] ❌ [DEBUG] Socket.IO: Falha ao enviar mensagem de seleção de departamento para ${chat.id}`);
                                                            }
                                                        })
                                                        .catch(err => {
                                                            console.error(`[App] ❌ [DEBUG] Socket.IO: Erro ao enviar mensagem de seleção de departamento:`, err);
                                                        });
                                                } else {
                                                    console.warn(`[App] ⚠️ [DEBUG] Socket.IO: Não foi possível enviar mensagem de seleção - número de contato inválido para ${chat.id} (contactNumber: ${contactNumber})`);
                                                }
                                            } else if (isUserMessage && !shouldSendSelection) {
                                                console.log(`[App] ⚠️ [DEBUG] Socket.IO: Condição não satisfeita para envio - isUserMessage: ${isUserMessage}, departmentId: ${chat.departmentId}, departmentSelectionSent: ${chat.departmentSelectionSent}, departments.length: ${departments.length}, status: ${chat.status}, assignedTo: ${chat.assignedTo}, wasClosed: ${wasClosed}`);
                                            }
                                        
                                            // Para mensagens enviadas (fromMe: true), tenta atualizar mensagem local existente
                                            // ao invés de adicionar uma nova (evita duplicação)
                                            let messageIndex = -1;
                                            let shouldUpdate = false;
                                            let updatedMessages: Message[] | undefined = undefined;
                                            
                                            // Para mensagens enviadas (agent), tenta encontrar mensagem local para atualizar
                                            if (mapped.sender === 'agent') {
                                                // Função para normalizar conteúdo removendo cabeçalho (ex: "Andrey:\n" ou "Andrey - Departamento:\n")
                                                const normalizeContent = (content: string): string => {
                                                    if (!content) return '';
                                                    // Remove padrões como "Nome:\n" ou "Nome - Departamento:\n" do início
                                                    // Tenta múltiplos padrões para garantir que capture todos os casos
                                                    let normalized = content;
                                                    // Remove "Nome:\n" ou "Nome:\n\n"
                                                    normalized = normalized.replace(/^[^:]+:\n+/g, '');
                                                    // Remove "Nome - Departamento:\n" ou "Nome - Departamento:\n\n"
                                                    normalized = normalized.replace(/^[^:]+ - [^:]+:\n+/g, '');
                                                    return normalized.trim();
                                                };
                                                
                                                // Procura mensagem local sem whatsappMessageId mas com mesmo conteúdo e timestamp próximo
                                                messageIndex = chat.messages.findIndex(m => {
                                                    // Se já tem whatsappMessageId, verifica por ele (mais confiável)
                                                    if (m.whatsappMessageId && mapped.whatsappMessageId && 
                                                        m.whatsappMessageId === mapped.whatsappMessageId) {
                                                        console.log(`[App] 🔍 [DEBUG] Socket.IO: Encontrou mensagem por whatsappMessageId: ${m.whatsappMessageId}`);
                                                        return true;
                                                    }
                                                    // Se não tem whatsappMessageId, verifica por conteúdo normalizado + timestamp (mensagem local pendente)
                                                    // CRÍTICO: A mensagem local pode não ter o cabeçalho "Andrey:\n" mas a do Socket.IO tem
                                                    // Então normaliza o conteúdo removendo o cabeçalho antes de comparar
                                                    if (!m.whatsappMessageId && m.sender === 'agent') {
                                                        // Verifica se é uma mensagem local recente (ID começa com "m_" e timestamp próximo)
                                                        const isLocalMessage = m.id && m.id.startsWith('m_');
                                                        const timeMatch = m.timestamp && mapped.timestamp && 
                                                            Math.abs(m.timestamp.getTime() - mapped.timestamp.getTime()) < 60000;
                                                        
                                                        if (isLocalMessage && timeMatch) {
                                                            // Se é mensagem local recente, verifica conteúdo normalizado
                                                            const normalizedLocal = normalizeContent(m.content || '');
                                                            const normalizedMapped = normalizeContent(mapped.content || '');
                                                            const contentMatch = normalizedLocal && normalizedMapped && 
                                                                normalizedLocal === normalizedMapped;
                                                            
                                                            if (contentMatch) {
                                                                console.log(`[App] 🔍 [DEBUG] Socket.IO: Encontrou mensagem local por conteúdo normalizado - local="${normalizedLocal}", mapped="${normalizedMapped}", timeDiff=${Math.abs(m.timestamp.getTime() - mapped.timestamp.getTime())}ms`);
                                                                return true;
                                                            } else {
                                                                // Se conteúdo não bate exatamente, mas é mensagem local muito recente (últimos 5 segundos), considera match
                                                                // Isso evita duplicação quando há pequenas diferenças no conteúdo
                                                                const veryRecent = Math.abs(m.timestamp.getTime() - mapped.timestamp.getTime()) < 5000;
                                                                if (veryRecent && normalizedLocal && normalizedMapped) {
                                                                    // Verifica se o conteúdo normalizado está contido um no outro (mais flexível)
                                                                    const localInMapped = normalizedMapped.includes(normalizedLocal);
                                                                    const mappedInLocal = normalizedLocal.includes(normalizedMapped);
                                                                    if (localInMapped || mappedInLocal) {
                                                                        console.log(`[App] 🔍 [DEBUG] Socket.IO: Encontrou mensagem local por conteúdo parcial (muito recente) - local="${normalizedLocal}", mapped="${normalizedMapped}"`);
                                                                        return true;
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                    return false;
                                                });
                                                
                                                if (messageIndex >= 0) {
                                                    shouldUpdate = true;
                                                    console.log(`[App] ✅ [DEBUG] Socket.IO: shouldUpdate=true, messageIndex=${messageIndex}`);
                                                } else {
                                                    console.log(`[App] ⚠️ [DEBUG] Socket.IO: Mensagem do agente não encontrada localmente - mappedContent="${mapped.content?.substring(0, 50)}", whatsappId=${mapped.whatsappMessageId}, totalMessages=${chat.messages.length}`);
                                                }
                                            }
                                            
                                            // Verifica se a mensagem já existe e encontra seu índice para possível atualização
                                            let existingMessageIndex = -1;
                                            const exists = !shouldUpdate && chat.messages.some((m, idx) => {
                                                // PRIORIDADE 1: Verifica por ID do WhatsApp (mais confiável)
                                                if (m.whatsappMessageId && mapped.whatsappMessageId && 
                                                    m.whatsappMessageId === mapped.whatsappMessageId) {
                                                    existingMessageIndex = idx;
                                                    return true;
                                                }
                                                // PRIORIDADE 2: Verifica por ID interno
                                                if (m.id && mapped.id && m.id === mapped.id) {
                                                    existingMessageIndex = idx;
                                                    return true;
                                                }
                                                // PRIORIDADE 3: Para mensagens do agente, verifica por conteúdo + timestamp (janela maior)
                                                // IMPORTANTE: Mensagens do agente podem ter sido adicionadas localmente sem whatsappMessageId
                                                // e depois recebidas via Socket.IO com whatsappMessageId, então precisa verificar por conteúdo
                                                // CRÍTICO: A mensagem local pode não ter o cabeçalho "Andrey:\n" mas a do Socket.IO tem
                                                // Então normaliza o conteúdo removendo o cabeçalho antes de comparar
                                                if (mapped.sender === 'agent' && m.sender === 'agent') {
                                                    // Função para normalizar conteúdo removendo cabeçalho (ex: "Andrey:\n" ou "Andrey - Departamento:\n")
                                                    const normalizeContent = (content: string): string => {
                                                        if (!content) return '';
                                                        // Remove padrões como "Nome:\n" ou "Nome - Departamento:\n" do início
                                                        const headerPattern = /^[^:]+(?: - [^:]+)?:\n?/;
                                                        return content.replace(headerPattern, '').trim();
                                                    };
                                                    
                                                    const normalizedLocal = normalizeContent(m.content || '');
                                                    const normalizedMapped = normalizeContent(mapped.content || '');
                                                    const contentMatch = normalizedLocal && normalizedMapped && 
                                                        normalizedLocal === normalizedMapped;
                                                    // Janela maior para mensagens do agente (até 60 segundos) para pegar mensagens recém-enviadas
                                                    const timeMatch = m.timestamp && mapped.timestamp && 
                                                        Math.abs(m.timestamp.getTime() - mapped.timestamp.getTime()) < 60000;
                                                    if (contentMatch && timeMatch) {
                                                        existingMessageIndex = idx;
                                                        return true;
                                                    }
                                                }
                                                // PRIORIDADE 4: Para outras mensagens, verifica por conteúdo + timestamp muito próximo (evita duplicação)
                                                if (m.content && mapped.content && 
                                                    m.content.trim() === mapped.content.trim() &&
                                                    m.sender === mapped.sender &&
                                                    m.timestamp && mapped.timestamp && 
                                                    Math.abs(m.timestamp.getTime() - mapped.timestamp.getTime()) < 1000) {
                                                    existingMessageIndex = idx;
                                                    return true;
                                                }
                                                return false;
                                            });
                                            
                                            // Se mensagem já existe mas não tem mediaUrl e a nova tem, atualiza
                                            if (exists && existingMessageIndex >= 0) {
                                                const existingMsg = chat.messages[existingMessageIndex];
                                                // Se a mensagem existente não tem mediaUrl mas a nova tem, atualiza
                                                if (!existingMsg.mediaUrl && mapped.mediaUrl) {
                                                    console.log(`[App] 🔄 [DEBUG] Socket.IO: Atualizando mediaUrl de mensagem existente: ${existingMsg.id}`, {
                                                        existingHasMediaUrl: !!existingMsg.mediaUrl,
                                                        newHasMediaUrl: !!mapped.mediaUrl,
                                                        newMediaUrl: mapped.mediaUrl.substring(0, 100)
                                                    });
                                                    shouldUpdate = true;
                                                    messageIndex = existingMessageIndex;
                                                }
                                            }
                                            
                                            if (shouldUpdate && messageIndex >= 0) {
                                                // Atualiza mensagem local existente com dados da API (inclui whatsappMessageId e mediaUrl)
                                                chatUpdated = true;
                                                console.log(`[App] 🔄 [DEBUG] Socket.IO: Atualizando mensagem existente do agente - messageIndex=${messageIndex}, localId=${chat.messages[messageIndex]?.id}, whatsappId=${mapped.whatsappMessageId}`);
                                                const updatedMessages = [...chat.messages];
                                                
                                                // Normaliza o conteúdo removendo cabeçalho para manter consistência
                                                // A mensagem local já tem o conteúdo sem cabeçalho, então preserva ele
                                                const normalizeContent = (content: string): string => {
                                                    if (!content) return '';
                                                    let normalized = content;
                                                    normalized = normalized.replace(/^[^:]+:\n+/g, '');
                                                    normalized = normalized.replace(/^[^:]+ - [^:]+:\n+/g, '');
                                                    return normalized.trim();
                                                };
                                                
                                                // Preserva o conteúdo local (sem cabeçalho) em vez do conteúdo do Socket.IO (com cabeçalho)
                                                const existingContent = updatedMessages[messageIndex].content || '';
                                                const normalizedSocketContent = normalizeContent(mapped.content || '');
                                                // Se o conteúdo normalizado do Socket.IO é igual ao conteúdo local, mantém o local
                                                // Caso contrário, usa o normalizado (sem cabeçalho)
                                                const finalContent = normalizedSocketContent === existingContent 
                                                    ? existingContent 
                                                    : normalizedSocketContent || existingContent;
                                                
                                                // IMPORTANTE: Atualiza mediaUrl se estiver presente na mensagem mapeada
                                                // Isso garante que URLs de mídia sejam atualizadas quando chegarem via WebSocket
                                                updatedMessages[messageIndex] = {
                                                    ...updatedMessages[messageIndex],
                                                    whatsappMessageId: mapped.whatsappMessageId,
                                                    id: mapped.whatsappMessageId || updatedMessages[messageIndex].id, // Usa ID do WhatsApp se disponível
                                                    rawMessage: mapped.rawMessage,
                                                    status: mapped.status, // Atualiza status (pode ter mudado)
                                                    content: finalContent, // Preserva conteúdo sem cabeçalho
                                                    // Atualiza mediaUrl se a nova mensagem tiver URL (importante para imagens que chegam sem URL inicialmente)
                                                    mediaUrl: mapped.mediaUrl || updatedMessages[messageIndex].mediaUrl
                                                };
                                                
                                                // Reordena após atualização
                                                // SEMPRE usa o timestamp real para garantir ordem correta de envio/recebimento
                                                const sortedMessages = updatedMessages.sort((a, b) => {
                                                    const timeA = a.timestamp?.getTime() || 0;
                                                    const timeB = b.timestamp?.getTime() || 0;
                                                    const timeDiff = timeA - timeB;
                                                    
                                                    // PRIORIDADE 1: Se timestamps são diferentes, usa timestamp real (ordem cronológica)
                                                    if (timeDiff !== 0) {
                                                        return timeDiff;
                                                    }
                                                    
                        // PRIORIDADE 2: Se timestamps são idênticos, usa whatsappMessageId para desempate
                        // Isso garante ordem estável mesmo quando timestamps são idênticos
                        if (a.whatsappMessageId && b.whatsappMessageId) {
                            return a.whatsappMessageId.localeCompare(b.whatsappMessageId);
                        }
                        if (a.whatsappMessageId && !b.whatsappMessageId) {
                            return -1; // Mensagem com whatsappMessageId vem antes
                        }
                        if (!a.whatsappMessageId && b.whatsappMessageId) {
                            return 1; // Mensagem com whatsappMessageId vem antes
                        }
                        
                        // PRIORIDADE 3: Se timestamps são idênticos, usa ordem de inserção (_sortOrder)
                        // Isso garante que mensagens com mesmo timestamp mantenham a ordem de chegada
                        const orderA = (a as any)._sortOrder ?? 0;
                        const orderB = (b as any)._sortOrder ?? 0;
                        if (orderA !== orderB) {
                            return orderA - orderB;
                        }
                        
                        // PRIORIDADE 4: Se tudo é igual, usa ID para desempate (ordem estável)
                        if (a.id && b.id) {
                            return a.id.localeCompare(b.id);
                        }
                        
                        // PRIORIDADE 5: Se tudo é igual, mantém ordem original (estável)
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
                                            } else if (!exists && !shouldUpdate) {
                                                // Nova mensagem (não existe e não é atualização)
                                                // IMPORTANTE: Só adiciona se não for uma atualização (shouldUpdate = false)
                                                chatUpdated = true;
                                                
                                                // Normaliza o conteúdo para mensagens do agente (remove cabeçalho)
                                                let finalMappedContent = mapped.content;
                                                if (mapped.sender === 'agent' && mapped.content) {
                                                    const normalizeContent = (content: string): string => {
                                                        if (!content) return '';
                                                        let normalized = content;
                                                        normalized = normalized.replace(/^[^:]+:\n+/g, '');
                                                        normalized = normalized.replace(/^[^:]+ - [^:]+:\n+/g, '');
                                                        return normalized.trim();
                                                    };
                                                    finalMappedContent = normalizeContent(mapped.content);
                                                }
                                                
                                                const messageToAdd = {
                                                    ...mapped,
                                                    content: finalMappedContent
                                                };
                                                
                                                console.log(`[App] ✅ [DEBUG] Socket.IO: Adicionando nova mensagem - sender=${mapped.sender}, whatsappId=${mapped.whatsappMessageId}, originalContent="${mapped.content?.substring(0, 50)}", normalizedContent="${finalMappedContent?.substring(0, 50)}", isAgent=${mapped.sender === 'agent'}`);
                                                
                                                // Verifica se já existe uma mensagem idêntica antes de adicionar (prevenção extra de duplicação)
                                                const alreadyExists = chat.messages.some(m => {
                                                    if (m.whatsappMessageId && messageToAdd.whatsappMessageId && 
                                                        m.whatsappMessageId === messageToAdd.whatsappMessageId) {
                                                        return true;
                                                    }
                                                    if (m.sender === 'agent' && messageToAdd.sender === 'agent' && 
                                                        m.content === finalMappedContent &&
                                                        m.timestamp && messageToAdd.timestamp &&
                                                        Math.abs(m.timestamp.getTime() - messageToAdd.timestamp.getTime()) < 5000) {
                                                        console.log(`[App] ⚠️ [DEBUG] Socket.IO: Mensagem idêntica já existe, ignorando duplicata - content="${finalMappedContent?.substring(0, 50)}"`);
                                                        return true;
                                                    }
                                                    return false;
                                                });
                                                
                                                if (alreadyExists) {
                                                    console.log(`[App] ⚠️ [DEBUG] Socket.IO: Mensagem duplicada detectada, não adicionando novamente`);
                                                    return chat; // Retorna chat sem alterações
                                                }
                                                
                                                // SEMPRE usa o timestamp real para garantir ordem correta de envio/recebimento
                                                let updatedMessages = [...chat.messages, messageToAdd].sort((a, b) => {
                                                    const timeA = a.timestamp?.getTime() || 0;
                                                    const timeB = b.timestamp?.getTime() || 0;
                                                    const timeDiff = timeA - timeB;
                                                    
                                                    // PRIORIDADE 1: Se timestamps são diferentes, usa timestamp real (ordem cronológica)
                                                    if (timeDiff !== 0) {
                                                        return timeDiff;
                                                    }
                                                    
                                                    // PRIORIDADE 2: Se timestamps são idênticos, usa whatsappMessageId para desempate
                                                    if (a.whatsappMessageId && b.whatsappMessageId) {
                                                        return a.whatsappMessageId.localeCompare(b.whatsappMessageId);
                                                    }
                                                    if (a.whatsappMessageId && !b.whatsappMessageId) {
                                                        return -1;
                                                    }
                                                    if (!a.whatsappMessageId && b.whatsappMessageId) {
                                                        return 1;
                                                    }
                                                    
                                                    // PRIORIDADE 3: Se timestamps são idênticos, usa ordem de inserção (_sortOrder)
                                                    const orderA = (a as any)._sortOrder ?? 0;
                                                    const orderB = (b as any)._sortOrder ?? 0;
                                                    if (orderA !== orderB) {
                                                        return orderA - orderB;
                                                    }
                                                    
                                                    // PRIORIDADE 4: Se tudo é igual, usa ID para desempate
                                                    if (a.id && b.id) {
                                                        return a.id.localeCompare(b.id);
                                                    }
                                                    
                                                    // PRIORIDADE 5: Se tudo é igual, mantém ordem original
                                                    return 0;
                                                });
                                            
                                            // PRIORIDADE ABSOLUTA: Status do banco NUNCA é alterado via Socket.IO
                                            // Apenas adiciona mensagens, não altera status
                                                let updatedChat = { ...chat };
                                                
                                            // Processa avaliação se chat está fechado e aguardando avaliação
                                            if (wasClosed && isUserMessage && chat.awaitingRating) {
                                                    const messageContent = mapped.content.trim();
                                                    const isRatingResponse = /^[1-5]$/.test(messageContent);
                                                    
                                                if (isRatingResponse) {
                                                    // Cliente respondeu com avaliação (1-5) - atualiza via handleUpdateChat para persistir no banco
                                                        const rating = parseInt(messageContent);
                                                    handleUpdateChat({
                                                            ...chat,
                                                            rating: rating,
                                                        awaitingRating: false,
                                                        status: 'closed' // Mantém fechado
                                                    });
                                                    // Se é avaliação, não reabre - retorna sem processar reabertura
                                                    return {
                                                            ...chat,
                                                        messages: updatedMessages,
                                                        lastMessage: mapped.type === 'text' ? mapped.content : `📷 ${mapped.type}`,
                                                        lastMessageTime: mapped.timestamp,
                                                        unreadCount: mapped.sender === 'user' ? (chat.unreadCount || 0) + 1 : chat.unreadCount
                                                    };
                                                }
                                                // Se não é avaliação, continua para reabertura (lógica abaixo)
                                            }
                                            
                                            // Processa seleção de setores apenas se não estiver no banco (novos chats)
                                            // Chats no banco já têm departmentId fixo e não devem ser alterados via Socket.IO
                                            if (mapped.sender === 'user' && !updatedChat.departmentId && departments.length > 0) {
                                                    const messageContent = mapped.content.trim();
                                                        const selectedDeptId = processDepartmentSelection(messageContent, departments);
                                                        
                                                        if (selectedDeptId) {
                                                    // Usuário selecionou setor - encontra usuário disponível e atribui
                                                            const filteredMessages = updatedMessages.filter(m => m.id !== mapped.id);
                                                            updatedMessages = filteredMessages;
                                                            
                                                            // Encontra usuário disponível do departamento
                                                            const assignedUser = findAvailableUserForDepartment(selectedDeptId, users, chats);
                                                            
                                                            // Adiciona mensagem de sistema
                                                            const departmentName = departments.find(d => d.id === selectedDeptId)?.name || 'Departamento';
                                                            updatedMessages.push({
                                                                id: `sys_dept_${Date.now()}`,
                                                                content: `Atendimento direcionado para ${departmentName}${assignedUser ? ` - Atribuído a ${assignedUser.name}` : ''}`,
                                                                sender: 'system',
                                                                timestamp: new Date(),
                                                                status: MessageStatus.READ,
                                                                type: 'text'
                                                            });
                                                            
                                                            // Prepara dados do chat atualizado
                                                            const updatedChatData: Chat = {
                                                                        ...updatedChat,
                                                                departmentId: selectedDeptId,
                                                                status: assignedUser ? 'open' : 'pending',
                                                                assignedTo: assignedUser?.id,
                                                                awaitingDepartmentSelection: false,
                                                                messages: updatedMessages
                                                            };
                                                            
                                                    handleUpdateChat(updatedChatData);
                                                            
                                                            // Envia notificações
                                                            if (assignedUser) {
                                                                // Notifica o usuário atribuído se for o currentUser
                                                                if (assignedUser.id === currentUser?.id) {
                                                                    addNotification(
                                                                        `Novo chat atribuído - ${departmentName}`,
                                                                        `Chat de ${updatedChat.contactName} foi atribuído ao departamento ${departmentName} e está na sua fila`,
                                                                        'info',
                                                                        true,
                                                                        true
                                                                    );
                                                                }
                                                                
                                                                // Notifica administradores (se currentUser for admin)
                                                                if (currentUser?.role === UserRole.ADMIN) {
                                                                    addNotification(
                                                                        `Novo chat atribuído - ${departmentName}`,
                                                                        `Chat de ${updatedChat.contactName} foi atribuído ao departamento ${departmentName}${assignedUser.id === currentUser?.id ? ' (atribuído a você)' : ` (atribuído a ${assignedUser.name})`}`,
                                                                        'info',
                                                                        true,
                                                                        true
                                                                    );
                                                                }
                                                                } else {
                                                                // Se não há usuário disponível, notifica administradores (se currentUser for admin)
                                                                if (currentUser?.role === UserRole.ADMIN) {
                                                                    addNotification(
                                                                        `Chat aguardando atendimento - ${departmentName}`,
                                                                        `Chat de ${updatedChat.contactName} foi direcionado para ${departmentName}, mas não há operadores disponíveis`,
                                                                        'warning',
                                                                        true,
                                                                        true
                                                                    );
                                                                }
                                                            }
                                                } else if (updatedChat.messages.filter(m => m.sender === 'user').length === 1 && !updatedChat.departmentSelectionSent) {
                                                    // Primeira mensagem sem departamento: envia seleção
                                                    sendDepartmentSelectionMessage(apiConfig, updatedChat.contactNumber, departments)
                                                        .then(sent => {
                                                                    if (sent) {
                                                                        handleUpdateChat({
                                                                            ...updatedChat,
                                                                            awaitingDepartmentSelection: true,
                                                                            departmentSelectionSent: true
                                                                        });
                                                            }
                                                        }).catch(err => console.error('[App] Erro ao enviar seleção de setores:', err));
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
                                            
                                            // Se a mensagem já existir, usa as mensagens do chat atual
                                            // Se não existir, updatedMessages já foi definido acima
                                            // Se updatedMessages não foi definido (mensagem já existe), usa chat.messages
                                            const finalMessages = updatedMessages !== undefined ? updatedMessages : chat.messages;
                                            
                                            // PRIORIDADE ABSOLUTA: Status do banco NUNCA é alterado via Socket.IO
                                            // EXCEÇÃO: Se chat estava fechado e recebeu mensagem do cliente, reabre para 'pending'
                                            let finalStatus = updatedChat.status;
                                            let finalAssignedTo = updatedChat.assignedTo;
                                            let finalDepartmentId = updatedChat.departmentId;
                                            
                                            // Se chat estava fechado e recebeu mensagem do cliente, atualiza status para pending
                                            // EXCEÇÃO: Se está aguardando avaliação e a mensagem é uma avaliação (1-5), não reabre (já tratado acima)
                                            // Esta verificação deve ser executada SEMPRE que uma mensagem do usuário chegar em um chat fechado,
                                            // independentemente de a mensagem já existir ou não
                                            if (wasClosed && isUserMessage && !(chat.awaitingRating && /^[1-5]$/.test(mapped.content?.trim() || ''))) {
                                                console.log(`[App] 🔄 Chat fechado ${chat.id} recebeu mensagem do cliente, reabrindo...`);
                                                finalStatus = 'pending';
                                                finalAssignedTo = undefined;
                                                finalDepartmentId = null;
                                                
                                                // Salva IMEDIATAMENTE no banco para evitar que syncChats sobrescreva com status 'closed'
                                                // Usa Promise para garantir que seja salvo antes de syncChats rodar
                                                (async () => {
                                                    try {
                                                        // Atualiza status no banco IMEDIATAMENTE
                                                        await apiService.updateChatStatus(chat.id, 'pending', undefined, null);
                                                        console.log(`[App] ✅ Chat ${chat.id} reaberto e salvo no banco IMEDIATAMENTE`);
                                                        
                                                        // Depois de salvar, envia mensagem de seleção de departamento se necessário
                                                        // Verifica se já foi enviada pela lógica anterior para evitar duplicação
                                                        const contactNumber = updatedChat.contactNumber || (chat.id ? chat.id.split('@')[0] : null);
                                                        const needsDepartmentSelection = contactNumber && contactNumber.length >= 10 && 
                                                                                        departments.length > 0 && 
                                                                                        !updatedChat.departmentId &&
                                                                                        !updatedChat.departmentSelectionSent;
                                                        
                                                        if (needsDepartmentSelection) {
                                                            console.log(`[App] 📤 [DEBUG] Socket.IO: Chat reaberto - Enviando mensagem de seleção de departamento para ${chat.id} (número: ${contactNumber})`);
                                                            const sent = await sendDepartmentSelectionMessage(apiConfig, contactNumber, departments);
                                                            if (sent) {
                                                                console.log(`[App] ✅ [DEBUG] Socket.IO: Mensagem de seleção de departamento enviada para ${chat.id}`);
                                                                // Atualiza chat com departmentSelectionSent
                                                                handleUpdateChat({
                                                                    ...updatedChat,
                                                                    status: 'pending',
                                                                    assignedTo: undefined,
                                                                    departmentId: null,
                                                                    endedAt: undefined,
                                                                    departmentSelectionSent: true,
                                                                    awaitingDepartmentSelection: true,
                                                                    messages: finalMessages
                                                                });
                                                            }
                                                        } else {
                                                            // Apenas atualiza status sem enviar mensagem (já foi enviada ou não é necessário)
                                                            handleUpdateChat({
                                                                ...updatedChat,
                                                                status: 'pending',
                                                                assignedTo: undefined,
                                                                departmentId: null,
                                                                endedAt: undefined,
                                                                messages: finalMessages
                                                            });
                                                        }
                                                    } catch (error) {
                                                        console.error(`[App] ❌ Erro ao reabrir chat ${chat.id} no banco:`, error);
                                                        // Em caso de erro, ainda tenta atualizar localmente
                                                        handleUpdateChat({
                                                            ...updatedChat,
                                                            status: finalStatus,
                                                            assignedTo: finalAssignedTo,
                                                            departmentId: finalDepartmentId,
                                                            endedAt: undefined,
                                                            messages: finalMessages
                                                        });
                                                    }
                                                })();
                                            }
                                                
                                            return {
                                                ...updatedChat,
                                                messages: finalMessages,
                                                lastMessage: mapped.type === 'text' ? mapped.content : `📷 ${mapped.type}`,
                                                lastMessageTime: mapped.timestamp,
                                                unreadCount: mapped.sender === 'user' ? (updatedChat.unreadCount || 0) + 1 : updatedChat.unreadCount,
                                                // Status: se estava fechado e recebeu mensagem, muda para pending (será salvo no banco)
                                                status: finalStatus,
                                                assignedTo: finalAssignedTo,
                                                departmentId: finalDepartmentId,
                                                endedAt: wasClosed && isUserMessage ? undefined : updatedChat.endedAt
                                            };
                                            } else {
                                                // Mensagem já existe - processa lógica de reabertura se necessário
                                                const finalMessages = chat.messages;
                                                let finalStatus = chat.status;
                                                let finalAssignedTo = chat.assignedTo;
                                                let finalDepartmentId = chat.departmentId;
                                                
                                                // Se chat estava fechado e recebeu mensagem do cliente, atualiza status para pending
                                                if (wasClosed && isUserMessage && !(chat.awaitingRating && /^[1-5]$/.test(mapped.content?.trim() || ''))) {
                                                    console.log(`[App] 🔄 Chat fechado ${chat.id} recebeu mensagem do cliente (mensagem já existe), reabrindo...`);
                                                    finalStatus = 'pending';
                                                    finalAssignedTo = undefined;
                                                    finalDepartmentId = null;
                                                    
                                                    // Salva IMEDIATAMENTE no banco para evitar que syncChats sobrescreva com status 'closed'
                                                    // Usa Promise para garantir que seja salvo antes de syncChats rodar
                                                    (async () => {
                                                        try {
                                                            // Atualiza status no banco IMEDIATAMENTE
                                                            await apiService.updateChatStatus(chat.id, 'pending', undefined, null);
                                                            console.log(`[App] ✅ Chat ${chat.id} reaberto e salvo no banco IMEDIATAMENTE (mensagem já existia)`);
                                                            
                                                            // Depois de salvar, envia mensagem de seleção de departamento se necessário
                                                            // Verifica se já foi enviada pela lógica anterior para evitar duplicação
                                                            const contactNumber = chat.contactNumber || (chat.id ? chat.id.split('@')[0] : null);
                                                            const needsDepartmentSelection = contactNumber && contactNumber.length >= 10 && 
                                                                                            departments.length > 0 && 
                                                                                            !chat.departmentId &&
                                                                                            !chat.departmentSelectionSent;
                                                            
                                                            if (needsDepartmentSelection) {
                                                                console.log(`[App] 📤 [DEBUG] Socket.IO: Chat reaberto (mensagem já existia) - Enviando mensagem de seleção de departamento para ${chat.id} (número: ${contactNumber})`);
                                                                const sent = await sendDepartmentSelectionMessage(apiConfig, contactNumber, departments);
                                                                if (sent) {
                                                                    console.log(`[App] ✅ [DEBUG] Socket.IO: Mensagem de seleção de departamento enviada para ${chat.id} (mensagem já existia)`);
                                                                    // Atualiza chat com departmentSelectionSent
                                                                    handleUpdateChat({
                                                                        ...chat,
                                                                        status: 'pending',
                                                                        assignedTo: undefined,
                                                                        departmentId: null,
                                                                        endedAt: undefined,
                                                                        departmentSelectionSent: true,
                                                                        awaitingDepartmentSelection: true,
                                                                        messages: finalMessages
                                                                    });
                                                                }
                                                            } else {
                                                                // Apenas atualiza status sem enviar mensagem (já foi enviada ou não é necessário)
                                                                handleUpdateChat({
                                                                    ...chat,
                                                                    status: 'pending',
                                                                    assignedTo: undefined,
                                                                    departmentId: null,
                                                                    endedAt: undefined,
                                                                    messages: finalMessages
                                                                });
                                                            }
                                                        } catch (error) {
                                                            console.error(`[App] ❌ Erro ao reabrir chat ${chat.id} no banco (mensagem já existia):`, error);
                                                            // Em caso de erro, ainda tenta atualizar localmente
                                                            handleUpdateChat({
                                                                ...chat,
                                                                status: finalStatus,
                                                                assignedTo: finalAssignedTo,
                                                                departmentId: finalDepartmentId,
                                                                endedAt: undefined,
                                                                messages: finalMessages
                                                            });
                                                        }
                                                    })();
                                                }
                                                
                                                return {
                                                    ...chat,
                                                    messages: finalMessages,
                                                    lastMessage: mapped.type === 'text' ? mapped.content : `📷 ${mapped.type}`,
                                                    lastMessageTime: mapped.timestamp,
                                                    unreadCount: mapped.sender === 'user' ? (chat.unreadCount || 0) + 1 : chat.unreadCount,
                                                    status: finalStatus,
                                                    assignedTo: finalAssignedTo,
                                                    departmentId: finalDepartmentId,
                                                    endedAt: wasClosed && isUserMessage ? undefined : chat.endedAt
                                                };
                                            }
                                        }
                            return chat;
                        });
                        
                        if (chatUpdated) {
                            console.log('[App] ✅ Chats atualizados com nova mensagem via Socket.IO');
                            
                            // Salva o chat atualizado no banco imediatamente para evitar que syncChats sobrescreva
                            // Encontra o chat atualizado e salva
                            const updatedChat = updatedChats.find(c => {
                                const chatJid = normalizeJid(c.id);
                                const messageJid = normalizeJid(remoteJid);
                                return chatJid === messageJid;
                            });
                            
                            if (updatedChat && currentUser) {
                                // Salva no banco de forma assíncrona para não bloquear a UI
                                handleUpdateChat(updatedChat).catch(err => {
                                    console.error(`[App] ❌ Erro ao salvar chat após mensagem via Socket.IO:`, err);
                                });
                            }
                        }
                        
                        return updatedChats;
                    });
                    
                    // Se o chat não existia antes e é uma mensagem do usuário, cria o chat novo
                    if (!chatExistsBefore && mapped && mapped.sender === 'user') {
                        console.log(`[App] 🔍 [DEBUG] Socket.IO: Chat novo detectado - remoteJid=${remoteJid}, criando chat...`);
                        
                        // Extrai número do JID
                        const contactNumber = remoteJid.split('@')[0]?.replace(/\D/g, '') || '';
                        
                        if (contactNumber.length >= 10) {
                            // Cria novo chat
                            const newChat: Chat = {
                                id: remoteJid,
                                contactName: messageData?.pushName || messageData?.key?.pushName || contactNumber,
                                contactNumber: contactNumber,
                                contactAvatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(messageData?.pushName || messageData?.key?.pushName || contactNumber)}`,
                                departmentId: null,
                                unreadCount: 1,
                                lastMessage: mapped.type === 'text' ? mapped.content : `📷 ${mapped.type}`,
                                lastMessageTime: mapped.timestamp || new Date(),
                                status: 'pending',
                                messages: [mapped],
                                assignedTo: undefined,
                                departmentSelectionSent: false,
                                awaitingDepartmentSelection: false
                            };
                            
                            // Adiciona o chat ao estado
                            setChats(currentChats => {
                                // Verifica se já não foi adicionado (evita duplicatas)
                                const alreadyExists = currentChats.some(c => {
                                    if (!c || !c.id) return false;
                                    const chatJid = normalizeJid(c.id);
                                    const messageJid = normalizeJid(remoteJid);
                                    return chatJid === messageJid || 
                                           (c.contactNumber && typeof c.contactNumber === 'string' && 
                                            c.contactNumber.replace(/\D/g, '') === contactNumber);
                                });
                                if (alreadyExists) {
                                    return currentChats;
                                }
                                return [newChat, ...currentChats];
                            });
                            
                            // Envia mensagem de seleção de departamento se houver departamentos configurados
                            if (departments.length > 0) {
                                console.log(`[App] 📤 [DEBUG] Socket.IO: Chat novo sem departamento - Enviando mensagem de seleção de departamento para ${remoteJid} (número: ${contactNumber})`);
                                sendDepartmentSelectionMessage(apiConfig, contactNumber, departments)
                                    .then(sent => {
                                        if (sent) {
                                            // Adiciona mensagem de sistema
                                            const systemMessage: Message = {
                                                id: `sys_dept_selection_new_${Date.now()}`,
                                                content: 'department_selection_sent - Mensagem de seleção de departamento enviada',
                                                sender: 'system',
                                                timestamp: new Date(),
                                                status: MessageStatus.READ,
                                                type: 'text'
                                            };
                                            
                                            handleUpdateChat({
                                                ...newChat,
                                                departmentSelectionSent: true,
                                                awaitingDepartmentSelection: true,
                                                messages: [...newChat.messages, systemMessage]
                                            });
                                            console.log(`[App] ✅ [DEBUG] Socket.IO: Mensagem de seleção de departamento enviada para novo chat ${remoteJid}`);
                                        } else {
                                            console.error(`[App] ❌ [DEBUG] Socket.IO: Falha ao enviar mensagem de seleção de departamento para novo chat ${remoteJid}`);
                                        }
                                    })
                                    .catch(err => {
                                        console.error(`[App] ❌ [DEBUG] Socket.IO: Erro ao enviar mensagem de seleção de departamento para novo chat:`, err);
                                    });
                            } else {
                                console.warn(`[App] ⚠️ [DEBUG] Socket.IO: Não enviando mensagem de seleção - NENHUM DEPARTAMENTO CONFIGURADO para novo chat ${remoteJid}`);
                            }
                        } else {
                            console.warn(`[App] ⚠️ [DEBUG] Socket.IO: Não foi possível criar chat novo - número inválido: ${contactNumber} (remoteJid: ${remoteJid})`);
                        }
                    }
                }
                } catch (err) {
                    console.error('[App] ❌ Erro ao processar mensagem Socket.IO:', err);
                }
            };
            
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
                                        const updatedMessages = (chat.messages && Array.isArray(chat.messages)) ? chat.messages.map(msg => {
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
                                        }) : [];
                                        
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
  const normalizePhoneForMatch = (phone: string | undefined | null): string => {
    // Valida se o telefone é válido antes de processar
    if (!phone || typeof phone !== 'string') {
      return '';
    }
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
          // Sempre atualiza o nome se o contato tiver um nome válido
          // Só não atualiza se o chat já tiver um nome melhor (mais longo) que não seja apenas o número
          const hasValidContactName = match.name && match.name.trim() && match.name.trim().length > 0;
          const chatNameIsNumber = chat.contactName === chat.contactNumber || 
                                   (chat.contactNumber && chat.contactName === chat.contactNumber.replace(/\D/g, '')) ||
                                   (chat.contactName && /^\d+$/.test(chat.contactName));
          const shouldUpdateName = hasValidContactName && (chatNameIsNumber || !chat.contactName || chat.contactName.trim().length === 0);
          const shouldUpdateAvatar = match.avatar && match.avatar !== chat.contactAvatar;
          
          if (shouldUpdateName || shouldUpdateAvatar) {
            hasUpdates = true;
            const updatedChat = { 
              ...chat, 
              contactName: shouldUpdateName ? match.name.trim() : chat.contactName, 
              contactAvatar: shouldUpdateAvatar ? match.avatar : chat.contactAvatar,
              // clientCode é preservado automaticamente (não é sobrescrito)
            };
            
            // Salva no banco se o nome ou avatar foi atualizado
            if (shouldUpdateName || shouldUpdateAvatar) {
              handleUpdateChat(updatedChat);
            }
            
            return updatedChat;
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

  const handleLogin = async (user: User) => {
    setCurrentUser(user);
    // Salva usuário apenas se não estiver configurado para usar apenas PostgreSQL
    if (!storageService.getUseOnlyPostgreSQL()) {
      localStorage.setItem('zapflow_user', SecurityService.encrypt(JSON.stringify(user)));
    }
    
    // Carrega configurações do backend após login
    try {
      const backendConfig = await loadConfigFromBackend();
      if (backendConfig) {
        setApiConfig(backendConfig);
        console.log('[App] ✅ Configurações carregadas do banco de dados');
      } else {
        console.log('[App] ℹ️ Nenhuma configuração encontrada no banco de dados, usando padrão');
      }
    } catch (error) {
      console.error('[App] ❌ Erro ao carregar configurações do backend:', error);
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
    // Usa requestAnimationFrame para garantir que o clique seja processado antes da atualização
    // Isso evita que re-renderizações constantes interfiram com os cliques
    requestAnimationFrame(() => {
      setCurrentView(view);
      setIsMobileMenuOpen(false);
    });
  };

  const handleUpdateChat = async (updatedChat: Chat) => {
    console.log('[App] 🔍 [DEBUG] handleUpdateChat CHAMADO:', {
      chatId: updatedChat.id,
      status: updatedChat.status,
      assignedTo: updatedChat.assignedTo,
      departmentId: updatedChat.departmentId,
      hasCurrentUser: !!currentUser
    });
    
    const chatExists = chats.some(c => c.id === updatedChat.id);

    if (chatExists) {
        const oldChat = chats.find(c => c.id === updatedChat.id);
        
        console.log('[App] 🔍 [DEBUG] handleUpdateChat - Chat existente encontrado:', {
          oldStatus: oldChat?.status,
          newStatus: updatedChat.status,
          oldAssignedTo: oldChat?.assignedTo,
          newAssignedTo: updatedChat.assignedTo,
          oldDepartmentId: oldChat?.departmentId,
          newDepartmentId: updatedChat.departmentId
        });
        
        // Verifica se status, assignedTo, departmentId, contactName ou contactAvatar mudaram - se sim, salva no banco
        const statusChanged = oldChat && oldChat.status !== updatedChat.status;
        const assignedToChanged = oldChat && oldChat.assignedTo !== updatedChat.assignedTo;
        const departmentIdChanged = oldChat && oldChat.departmentId !== updatedChat.departmentId;
        const contactNameChanged = oldChat && oldChat.contactName !== updatedChat.contactName;
        const contactAvatarChanged = oldChat && oldChat.contactAvatar !== updatedChat.contactAvatar;
        
        // Verifica se as mensagens mudaram (novas mensagens foram adicionadas)
        const messagesChanged = oldChat && (
          updatedChat.messages.length !== oldChat.messages.length ||
          (updatedChat.messages.length > 0 && oldChat.messages.length > 0 &&
           updatedChat.messages[updatedChat.messages.length - 1].id !== oldChat.messages[oldChat.messages.length - 1].id)
        );
        
        console.log('[App] 🔍 [DEBUG] handleUpdateChat - Mudanças detectadas:', {
          statusChanged,
          assignedToChanged,
          departmentIdChanged,
          contactNameChanged,
          contactAvatarChanged,
          messagesChanged,
          oldMsgCount: oldChat?.messages.length,
          newMsgCount: updatedChat.messages.length,
          willSave: !!(currentUser && (statusChanged || assignedToChanged || departmentIdChanged || contactNameChanged || contactAvatarChanged || messagesChanged))
        });
        
        // Se as mensagens mudaram, salva o chat completo (incluindo mensagens)
        if (currentUser && messagesChanged) {
          try {
            console.log('[App] 🔍 [DEBUG] handleUpdateChat - Salvando chat completo com mensagens no banco:', {
              chatId: updatedChat.id,
              msgCount: updatedChat.messages.length
            });
            // Salva o chat completo usando saveData para incluir as mensagens
            await apiService.saveData('chats', updatedChat.id, updatedChat);
            console.log(`[App] ✅ [DEBUG] Chat completo salvo no banco: ${updatedChat.contactName} (${updatedChat.messages.length} mensagens)`);
          } catch (error) {
            console.error(`[App] ❌ [DEBUG] Erro ao salvar chat completo no banco:`, error);
          }
        }
        
        // Salva no banco se status, assignedTo, departmentId, contactName ou contactAvatar mudaram
        // (mas não se já salvou o chat completo acima para evitar duplicação)
        if (currentUser && (statusChanged || assignedToChanged || departmentIdChanged || contactNameChanged || contactAvatarChanged) && !messagesChanged) {
          try {
            console.log('[App] 🔍 [DEBUG] handleUpdateChat - Salvando apenas status/metadados no banco:', {
              chatId: updatedChat.id,
              status: updatedChat.status,
              assignedTo: updatedChat.assignedTo,
              departmentId: updatedChat.departmentId,
              contactName: updatedChat.contactName,
              contactAvatar: updatedChat.contactAvatar,
              statusChanged,
              assignedToChanged,
              departmentIdChanged,
              contactNameChanged,
              contactAvatarChanged
            });
            await apiService.updateChatStatus(
              updatedChat.id,
              updatedChat.status,
              updatedChat.assignedTo,
              updatedChat.departmentId || null,
              updatedChat.contactName,
              updatedChat.contactAvatar
            );
            console.log(`[App] ✅ [DEBUG] Chat ${updatedChat.contactName} salvo no banco: status=${updatedChat.status}, assignedTo=${updatedChat.assignedTo}, contactName=${updatedChat.contactName}`);
          } catch (error) {
            console.error(`[App] ❌ [DEBUG] Erro ao salvar chat no banco:`, error);
          }
        } else if (currentUser && (statusChanged || assignedToChanged || departmentIdChanged || contactNameChanged || contactAvatarChanged) && messagesChanged) {
          // Se tanto mensagens quanto status/metadados mudaram, já salvou o chat completo acima
          // Mas ainda precisa atualizar status via updateChatStatus para garantir consistência
          try {
            await apiService.updateChatStatus(
              updatedChat.id,
              updatedChat.status,
              updatedChat.assignedTo,
              updatedChat.departmentId || null,
              updatedChat.contactName,
              updatedChat.contactAvatar
            );
          } catch (error) {
            console.error(`[App] ❌ [DEBUG] Erro ao atualizar status após salvar chat completo:`, error);
          }
        } else if (!messagesChanged && !statusChanged && !assignedToChanged && !departmentIdChanged && !contactNameChanged && !contactAvatarChanged) {
          console.log('[App] 🔍 [DEBUG] handleUpdateChat - NÃO salvou no banco (nenhuma mudança detectada):', {
            chatId: updatedChat.id,
            hasUser: !!currentUser
          });
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
                    // Função para gerar chave única de mensagem
                    const getMessageKey = (msg: Message): string => {
                        // PRIORIDADE 1: Usa whatsappMessageId se disponível (mais confiável)
                        if (msg.whatsappMessageId) {
                            return `whatsapp_${msg.whatsappMessageId}`;
                        }
                        // PRIORIDADE 2: Usa id se disponível
                        if (msg.id) {
                            return `id_${msg.id}`;
                        }
                        // PRIORIDADE 3: Gera chave baseada em timestamp + conteúdo + sender
                        const timestamp = msg.timestamp?.getTime() || Date.now();
                        const content = msg.content?.substring(0, 50) || '';
                        const sender = msg.sender || 'unknown';
                        return `gen_${timestamp}_${sender}_${content}`;
                    };
                    
                    // Função para verificar se mensagens são duplicadas
                    const isDuplicate = (msg1: Message, msg2: Message): boolean => {
                        // Se ambas têm whatsappMessageId e são iguais, são duplicatas
                        if (msg1.whatsappMessageId && msg2.whatsappMessageId) {
                            return msg1.whatsappMessageId === msg2.whatsappMessageId;
                        }
                        // Se ambas têm id e são iguais, são duplicatas
                        if (msg1.id && msg2.id) {
                            return msg1.id === msg2.id;
                        }
                        // Se têm mesmo timestamp, conteúdo e sender, são duplicatas
                        const time1 = msg1.timestamp?.getTime() || 0;
                        const time2 = msg2.timestamp?.getTime() || 0;
                        if (time1 === time2 && time1 !== 0) {
                            const content1 = msg1.content?.trim() || '';
                            const content2 = msg2.content?.trim() || '';
                            const sender1 = msg1.sender || '';
                            const sender2 = msg2.sender || '';
                            if (content1 === content2 && content1 !== '' && sender1 === sender2) {
                                return true;
                            }
                        }
                        return false;
                    };
                    
                    const messageMap = new Map<string, Message>();
                    
                    // Adiciona mensagens existentes primeiro
                    c.messages.forEach(msg => {
                        const key = getMessageKey(msg);
                        messageMap.set(key, msg);
                    });
                    
                    // Adiciona/atualiza com mensagens novas (prioriza novas se forem mais recentes)
                    updatedChat.messages.forEach(msg => {
                        const key = getMessageKey(msg);
                        const existing = messageMap.get(key);
                        
                        if (!existing) {
                            // Verifica se não é duplicata de outra mensagem no map
                            let isDup = false;
                            for (const existingMsg of messageMap.values()) {
                                if (isDuplicate(msg, existingMsg)) {
                                    isDup = true;
                                    // Se a nova mensagem tem mais informações (whatsappMessageId), substitui
                                    if (msg.whatsappMessageId && !existingMsg.whatsappMessageId) {
                                        const existingKey = getMessageKey(existingMsg);
                                        messageMap.delete(existingKey);
                                        messageMap.set(key, msg);
                                    }
                                    break;
                                }
                            }
                            if (!isDup) {
                                messageMap.set(key, msg);
                            }
                        } else if (msg.timestamp && existing.timestamp) {
                            // Se a nova for mais recente, substitui
                            if (msg.timestamp.getTime() > existing.timestamp.getTime()) {
                                messageMap.set(key, msg);
                            }
                            // Se a nova tem whatsappMessageId e a existente não, substitui
                            else if (msg.whatsappMessageId && !existing.whatsappMessageId) {
                                messageMap.set(key, msg);
                            }
                        } else if (msg.whatsappMessageId && !existing.whatsappMessageId) {
                            // Nova tem whatsappMessageId, existente não - substitui
                            messageMap.set(key, msg);
                        }
                    });
                    
                    // Ordena por timestamp, respeitando ordem cronológica real
                    // SEMPRE usa o timestamp real para garantir ordem correta de envio/recebimento
                    const mergedMessages = Array.from(messageMap.values()).sort((a, b) => {
                        const timeA = a.timestamp?.getTime() || 0;
                        const timeB = b.timestamp?.getTime() || 0;
                        const timeDiff = timeA - timeB;
                        
                        // PRIORIDADE 1: Se timestamps são diferentes, usa timestamp real (ordem cronológica)
                        if (timeDiff !== 0) {
                            return timeDiff;
                        }
                        
                        // PRIORIDADE 2: Se timestamps são idênticos, usa whatsappMessageId para desempate
                        // Isso garante ordem estável mesmo quando timestamps são idênticos
                        if (a.whatsappMessageId && b.whatsappMessageId) {
                            return a.whatsappMessageId.localeCompare(b.whatsappMessageId);
                        }
                        if (a.whatsappMessageId && !b.whatsappMessageId) {
                            return -1; // Mensagem com whatsappMessageId vem antes
                        }
                        if (!a.whatsappMessageId && b.whatsappMessageId) {
                            return 1; // Mensagem com whatsappMessageId vem antes
                        }
                        
                        // PRIORIDADE 3: Se timestamps são idênticos, usa ordem de inserção (_sortOrder)
                        // Isso garante que mensagens com mesmo timestamp mantenham a ordem de chegada
                        const orderA = (a as any)._sortOrder ?? 0;
                        const orderB = (b as any)._sortOrder ?? 0;
                        if (orderA !== orderB) {
                            return orderA - orderB;
                        }
                        
                        // PRIORIDADE 4: Se tudo é igual, usa ID para desempate (ordem estável)
                        if (a.id && b.id) {
                            return a.id.localeCompare(b.id);
                        }
                        
                        // PRIORIDADE 5: Se tudo é igual, mantém ordem original (estável)
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
    
    // Se usuário está logado, salva no backend
    if (currentUser) {
      try {
        const saved = await saveConfigToBackend(newConfig);
        if (saved) {
          addNotification('Configurações salvas', 'As configurações foram salvas com sucesso no banco de dados.', 'success');
        } else {
          console.warn('[App] ⚠️ Falha ao salvar configurações no backend');
          addNotification('Aviso', 'Falha ao salvar configurações no banco de dados.', 'warning');
        }
      } catch (err) {
        console.error('[App] ❌ Erro ao salvar configurações no backend:', err);
        addNotification('Erro', 'Erro ao salvar configurações no banco de dados.', 'error');
      }
    } else {
      // Fallback para localStorage se não estiver logado (temporário)
      try {
        const saved = await storageService.save('config', newConfig);
        if (saved) {
          addNotification('Configurações salvas', 'As configurações foram salvas localmente.', 'success');
        } else {
          console.warn('[App] ⚠️ Falha ao salvar configurações');
          addNotification('Aviso', 'As configurações podem não ter sido salvas completamente.', 'warning');
        }
      } catch (err) {
        console.error('[App] Erro ao salvar configurações:', err);
        addNotification('Erro', 'Erro ao salvar configurações. Tente novamente.', 'error');
      }
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
            try {
              localStorage.setItem('zapflow_user', SecurityService.encrypt(JSON.stringify(updatedCurrentUser)));
    } catch (e) {
              console.error('[App] Erro ao salvar usuário no localStorage:', e);
            }
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
              updatedUser.password, // Se houver senha, atualiza
              updatedUser.departmentId // Adiciona departmentId
            );
            if (result.success && result.user) {
              // Atualiza o estado com os dados retornados da API
              const updatedUserFromApi: User = {
                ...updatedUser,
                id: result.user.id.toString(),
                name: result.user.name,
                email: result.user.email || updatedUser.email,
                role: result.user.role as UserRole,
                departmentId: result.user.departmentId || updatedUser.departmentId
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
        
        // Atualiza chats com o novo contato
        updateChatsWithContacts([{
          id: result.data.id,
          name: result.data.name,
          phone: result.data.phone,
          email: result.data.email,
          avatar: result.data.avatar,
          source: result.data.source as 'manual' | 'google' | 'csv',
          lastSync: result.data.lastSync ? new Date(result.data.lastSync) : undefined
        }]);
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
    if (!contact.phone || typeof contact.phone !== 'string') {
      console.error('[handleStartChatFromContact] Número de telefone inválido:', contact.phone);
      alert('Número de telefone inválido. Por favor, verifique o contato.');
      return;
    }
    const contactNumber = contact.phone.replace(/\D/g, '');
    
    if (!contactNumber || contactNumber.length < 8) {
      console.error('[handleStartChatFromContact] Número de telefone inválido:', contact.phone);
      alert('Número de telefone inválido. Por favor, verifique o contato.');
      return;
    }
    
    // Verifica se já existe chat com esse número
    const existingChat = chats.find(c => {
      const chatNumber = (c.contactNumber && typeof c.contactNumber === 'string') ? c.contactNumber.replace(/\D/g, '') : '';
      return chatNumber && (chatNumber === contactNumber || 
             (chatNumber.length >= 8 && contactNumber.length >= 8 && 
              chatNumber.slice(-8) === contactNumber.slice(-8)));
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
    if (!contactList || contactList.length === 0) return;
    
    setChats(currentChats => {
      const updatedChats = currentChats.map(chat => {
        if (!chat.contactNumber) return chat;
        
        const chatPhone = normalizePhoneForMatch(chat.contactNumber);
        const match = contactList.find(c => {
          if (!c.phone) return false;
          const cPhone = normalizePhoneForMatch(c.phone);
          // Match exato ou match pelos últimos 8-11 dígitos (para números com/sem DDI)
          return cPhone === chatPhone || 
                 (cPhone.length >= 8 && chatPhone.length >= 8 && 
                  (cPhone.slice(-8) === chatPhone.slice(-8) || 
                   cPhone.slice(-9) === chatPhone.slice(-9) ||
                   cPhone.slice(-10) === chatPhone.slice(-10) ||
                   cPhone.slice(-11) === chatPhone.slice(-11)));
        });
        
        if (match && match.name && match.name.trim()) {
          // Verifica se precisa atualizar
          const chatNameIsNumber = chat.contactName === chat.contactNumber || 
                                   (chat.contactNumber && chat.contactName === chat.contactNumber.replace(/\D/g, '')) ||
                                   (chat.contactName && /^\d+$/.test(chat.contactName)) ||
                                   !chat.contactName ||
                                   chat.contactName.trim().length === 0;
          
          const shouldUpdateName = chatNameIsNumber;
          const shouldUpdateAvatar = match.avatar && match.avatar !== chat.contactAvatar;
          
          if (shouldUpdateName || shouldUpdateAvatar) {
            const updatedChat = { 
              ...chat, 
              contactName: shouldUpdateName ? match.name.trim() : chat.contactName, 
              contactAvatar: shouldUpdateAvatar ? match.avatar : chat.contactAvatar,
              // clientCode é preservado automaticamente (não é sobrescrito)
            };
            
            // Salva no banco se o nome ou avatar foi atualizado
            if (shouldUpdateName || shouldUpdateAvatar) {
              handleUpdateChat(updatedChat);
            }
            
            return updatedChat;
          }
        }
        return chat;
      });
      
      return updatedChats;
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

  // Se o backend não estiver disponível, mostra tela de erro
  if (backendAvailable === false) {
    return <BackendConnectionError backendUrl={getBackendUrl()} />;
  }

  // Se ainda está verificando o backend, mostra loading
  if (backendAvailable === null) {
    return (
      <div className="min-h-screen bg-dark-charcoal flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#00E0D1] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-300">Verificando conexão com o backend...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login users={users} onLogin={handleLogin} />;
  }

  const renderContent = () => {
    if (!canAccess(currentView)) return <div className="p-8 text-red-500">Acesso não autorizado.</div>;

    switch (currentView) {
      case 'dashboard':
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 md:p-6">
            <div className="bg-[#16191F] p-6 rounded-xl shadow-lg neon-border hover-glow transition-all hover:border-[#00E0D1]/50 group">
              <div className="flex items-center gap-4 mb-4">
                 <div className="p-3 bg-gradient-to-br from-[#0074FF]/30 to-[#0074FF]/10 text-[#0074FF] rounded-xl border border-[#0074FF]/20 group-hover:glow-blue transition-all">
                   <MessageSquare size={24} strokeWidth={2} />
                 </div>
                 <div className="flex-1">
                   <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Meus Chats Ativos</p>
                   <h3 className="text-3xl font-tech bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] bg-clip-text text-transparent">{filteredChats.filter(c => c.status === 'open').length}</h3>
                 </div>
              </div>
            </div>
            {currentUser.role === UserRole.ADMIN && (
                <>
                <div className="bg-[#16191F] p-6 rounded-xl shadow-lg neon-border hover-glow transition-all hover:border-[#00E0D1]/50 group">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-orange-500/20 text-orange-400 rounded-xl border border-orange-500/20 group-hover:border-orange-400/40 transition-all">
                      <Users size={24} strokeWidth={2} />
                    </div>
                    <div className="flex-1">
                      <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Aguardando Triagem</p>
                      <h3 className="text-3xl font-tech text-slate-200">{chats.filter(c => !c.departmentId && c.status !== 'closed').length}</h3>
                    </div>
                </div>
                </div>
                <div className="bg-[#16191F] p-6 rounded-xl shadow-lg neon-border hover-glow transition-all hover:border-[#00E0D1]/50 group">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-gradient-to-br from-[#00E0D1]/30 to-[#00C3FF]/10 text-[#00E0D1] rounded-xl border border-[#00E0D1]/20 group-hover:glow-cyan transition-all">
                      <Smartphone size={24} strokeWidth={2} />
                    </div>
                    <div className="flex-1">
                      <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Status Conexão</p>
                      <h3 className="text-2xl font-tech bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] bg-clip-text text-transparent">{apiConfig.isDemo ? 'Modo Simulação' : 'Modo Real'}</h3>
                    </div>
                </div>
                </div>
                {!apiConfig.isDemo && (
                <div className="bg-[#16191F] p-6 rounded-xl shadow-lg neon-border hover-glow transition-all hover:border-[#00E0D1]/50 group">
                <div className="flex items-center gap-4 mb-2">
                    <div className={`p-3 rounded-xl border transition-all ${
                        wsStatus === 'connected' ? 'bg-gradient-to-br from-[#00E0D1]/30 to-[#00C3FF]/10 text-[#00E0D1] border-[#00E0D1]/20 group-hover:glow-cyan' :
                        wsStatus === 'connecting' ? 'bg-amber-500/20 text-amber-400 border-amber-500/20' :
                        wsStatus === 'failed' ? 'bg-red-500/20 text-red-400 border-red-500/20' :
                        'bg-slate-500/20 text-slate-400 border-slate-500/20'
                    }`}>
                        {wsStatus === 'connected' ? <MessageSquare size={24} strokeWidth={2} /> :
                         wsStatus === 'connecting' ? <MessageSquare size={24} strokeWidth={2} className="animate-pulse" /> :
                         <MessageSquare size={24} strokeWidth={2} />}
                    </div>
                    <div className="flex-1">
                        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Tempo Real (Socket.IO)</p>
                        <div className="flex items-center gap-2">
                            <h3 className={`text-2xl font-tech ${
                                wsStatus === 'connected' ? 'bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] bg-clip-text text-transparent' :
                                wsStatus === 'connecting' ? 'text-amber-400' :
                                wsStatus === 'failed' ? 'text-red-400' :
                                'text-slate-400'
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
                                    className="text-xs px-3 py-1 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] rounded-lg hover:from-[#00B0E6] hover:to-[#00C8B8] font-medium transition-all"
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
            <div className="col-span-1 md:col-span-3 bg-[#16191F] p-6 rounded-xl shadow-lg neon-border mt-4">
              <h3 className="text-lg font-futuristic text-slate-200 mb-4">Olá, {currentUser.name} ({currentUser.role === 'ADMIN' ? 'Administrador' : 'Agente'})</h3>
              <p className="text-slate-400">
                {currentUser.role === 'ADMIN' ? "Você tem acesso total ao sistema." : `Você está visualizando os atendimentos do setor: ${departments.find(d => d.id === currentUser.departmentId)?.name || 'Nenhum'}.`}
                {currentUser.role === 'AGENT' && currentUser.allowGeneralConnection && <span className="block mt-2 font-medium text-[#00E0D1]">Você tem permissão para acessar a Triagem (Geral).</span>}
              </p>
            </div>
            {upcomingHolidays.length > 0 && (
              <div className="col-span-1 md:col-span-3 bg-[#16191F] p-6 rounded-xl shadow-lg neon-border mt-4">
                <div className="flex items-center gap-3 mb-4 circuit-line pb-4">
                  <div className="p-2 bg-gradient-to-br from-[#0074FF]/30 to-[#0074FF]/10 text-[#0074FF] rounded-xl border border-[#0074FF]/20">
                    <Flag size={20} strokeWidth={2} />
                  </div>
                  <h3 className="text-lg font-futuristic text-slate-200">Próximos Feriados</h3>
                </div>
                <div className="space-y-2">
                  {upcomingHolidays.map((holiday, index) => {
                    // Parse da data sem problemas de timezone (YYYY-MM-DD)
                    const [year, month, day] = holiday.date.split('-').map(Number);
                    const holidayDate = new Date(year, month - 1, day);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    holidayDate.setHours(0, 0, 0, 0);
                    const daysUntil = Math.ceil((holidayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const isToday = daysUntil === 0;
                    const isTomorrow = daysUntil === 1;
                    const isNational = holiday.type === 'national';
                    const isMunicipal = holiday.type === 'municipal';
                    
                    return (
                      <div
                        key={`${holiday.date}-${holiday.name}-${holiday.type}-${holiday.city || ''}-${index}`}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          isToday
                            ? 'bg-[#00E0D1]/10 border-[#00E0D1]/30'
                            : isTomorrow
                            ? 'bg-[#0074FF]/10 border-[#0074FF]/30'
                            : 'bg-[#111316] border-[#0D0F13]'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <Calendar className={isToday ? 'text-[#00E0D1]' : isTomorrow ? 'text-[#0074FF]' : 'text-slate-400'} size={18} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-slate-200">{holiday.name}</p>
                              {isNational && (
                                <span className="px-2 py-0.5 bg-[#0074FF]/20 text-[#0074FF] rounded text-xs font-semibold">
                                  Nacional
                                </span>
                              )}
                              {isMunicipal && (
                                <span className="px-2 py-0.5 bg-[#00E0D1]/20 text-[#00E0D1] rounded text-xs font-semibold">
                                  {holiday.city ? `${holiday.city}` : 'Municipal'}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-400">
                              {holidayDate.toLocaleDateString('pt-BR', { 
                                weekday: 'long', 
                                day: 'numeric', 
                                month: 'long' 
                              })}
                              {holiday.city && holiday.state && (
                                <span className="ml-2 text-xs text-slate-500">
                                  ({holiday.city}, {holiday.state})
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          {isToday ? (
                            <span className="px-3 py-1 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] rounded-full text-xs font-semibold">
                              Hoje
                            </span>
                          ) : isTomorrow ? (
                            <span className="px-3 py-1 bg-[#0074FF] text-white rounded-full text-xs font-semibold">
                              Amanhã
                            </span>
                          ) : (
                            <span className="text-sm text-slate-300 font-medium">
                              Em {daysUntil} {daysUntil === 1 ? 'dia' : 'dias'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 border-t border-[#0D0F13]">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleViewChange('holidays');
                    }}
                    className="text-sm text-[#00E0D1] hover:text-[#00C3FF] font-medium flex items-center gap-1 transition-colors"
                  >
                    Ver todos os feriados
                    <ChevronRight size={16} strokeWidth={2} />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      case 'chat':
        return <div className="h-full md:p-4"><ChatInterface chats={filteredChats} departments={departments} currentUser={currentUser} onUpdateChat={handleUpdateChat} apiConfig={apiConfig} quickReplies={quickReplies} workflows={workflows} contacts={contacts} forceSelectChatId={forceSelectChatId} isViewActive={currentView === 'chat'} /></div>;
      case 'reports': return <ReportsDashboard chats={chats} departments={departments} />;
      case 'contacts': return <Contacts contacts={contacts} onSyncGoogle={handleSyncGoogleContacts} onImportCSV={handleImportCSVContacts} onAddContact={handleAddContact} onStartChat={handleStartChatFromContact} clientId={apiConfig.googleClientId} />;
      case 'chatbot': return <ChatbotSettings config={chatbotConfig} onSave={handleUpdateChatbotConfig} />;
      case 'holidays': return <Holidays />;
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
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleViewChange(view);
        }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all relative group ${currentView === view ? 'bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] shadow-lg shadow-[#00C3FF]/30 font-medium' : 'hover:bg-[#0D0F13] text-slate-300 hover:text-[#00E0D1]'} ${isSidebarCollapsed ? 'justify-center' : ''}`}
        title={isSidebarCollapsed ? label : ''}
    >
        {currentView === view && (
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#00C3FF] to-[#00E0D1] rounded-r-full glow-cyan"></div>
        )}
        <Icon size={20} className={`flex-shrink-0 ${currentView === view ? '' : 'group-hover:text-[#00E0D1] transition-colors'}`} strokeWidth={currentView === view ? 2.5 : 2} /> 
        {!isSidebarCollapsed && <span className={`truncate ${currentView === view ? 'font-semibold' : ''}`}>{label}</span>}
    </button>
  );

  return (
    <div className="flex h-screen bg-dark-charcoal font-sans overflow-hidden">
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
        {notifications.map(n => (
          <div key={n.id} className={`min-w-[300px] max-w-sm p-4 rounded-lg shadow-xl border-l-4 bg-[#16191F] animate-in slide-in-from-right flex items-start gap-3 ${n.type === 'info' ? 'border-[#0074FF]' : n.type === 'warning' ? 'border-orange-500' : 'border-[#00E0D1]'}`}>
             <div className={`mt-1 ${n.type === 'info' ? 'text-[#0074FF]' : n.type === 'warning' ? 'text-orange-500' : 'text-[#00E0D1]'}`}>
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

      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#0D0F13] z-40 flex items-center justify-between px-4 shadow-md flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] rounded-lg flex items-center justify-center text-[#0D0F13] font-bold">Z</div>
          <span className="text-xl font-bold text-white tracking-tight">Zentria</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-white p-2 hover:bg-[#0D0F13] rounded-lg">{isMobileMenuOpen ? <X /> : <Menu />}</button>
      </div>

      {isMobileMenuOpen && <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setIsMobileMenuOpen(false)} />}

      <aside className={`fixed md:static inset-y-0 left-0 z-50 bg-[#0D0F13] flex flex-col h-full transform transition-all duration-300 ease-in-out flex-shrink-0 ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full'} md:translate-x-0 shadow-xl md:shadow-none ${isSidebarCollapsed ? 'md:w-20' : 'md:w-64'} border-r border-[#111316]`}>
        <div className={`hidden md:flex p-6 border-b border-[#111316] items-center gap-3 flex-shrink-0 circuit-line ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}>
          <div className="w-10 h-10 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] rounded-lg flex items-center justify-center text-[#0D0F13] font-tech text-lg flex-shrink-0 glow-gradient circuit-animated">Z</div>
          {!isSidebarCollapsed && <span className="text-xl font-futuristic text-white tracking-tight animate-in fade-in">Zentria</span>}
        </div>
        
        <div className={`p-4 bg-[#0D0F13]/50 flex items-center gap-3 border-b border-[#0D0F13] mt-16 md:mt-0 flex-shrink-0 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
            <img src={currentUser.avatar} alt="User" className="w-8 h-8 rounded-full border border-slate-600 flex-shrink-0 object-cover"/>
            {!isSidebarCollapsed && <div className="overflow-hidden animate-in fade-in"><p className="text-sm font-semibold text-white truncate">{currentUser.name}</p><p className="text-xs text-slate-400 truncate capitalize">{currentUser.role === 'ADMIN' ? 'Administrador' : 'Agente'}</p></div>}
        </div>

        <nav className="flex-1 py-4 px-3 space-y-2 overflow-y-auto custom-scrollbar overflow-x-hidden">
          <SidebarItem view="dashboard" icon={LayoutDashboard} label="Dashboard" />
          <SidebarItem view="chat" icon={MessageSquare} label="Atendimento" />
          <SidebarItem view="contacts" icon={ContactIcon} label="Contatos" />
          <SidebarItem view="holidays" icon={Calendar} label="Feriados" />
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

      <main className="flex-1 flex flex-col h-full relative min-w-0 bg-transparent">
         <div className={`flex-1 w-full pt-16 md:pt-0 ${currentView === 'chat' ? 'overflow-hidden' : 'overflow-y-auto'}`}>{renderContent()}</div>
      </main>
    </div>
  );
};

export default App;