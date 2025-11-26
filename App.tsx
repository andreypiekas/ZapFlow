
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

// Carregar usuário salvo na sessão
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
  
  // Application Data State
  const [chats, setChats] = useState<Chat[]>(INITIAL_CHATS);
  const [departments, setDepartments] = useState<Department[]>(INITIAL_DEPARTMENTS);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>(INITIAL_QUICK_REPLIES);
  const [workflows, setWorkflows] = useState<Workflow[]>(INITIAL_WORKFLOWS);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [chatbotConfig, setChatbotConfig] = useState<ChatbotConfig>(INITIAL_CHATBOT_CONFIG);
  const [apiConfig, setApiConfig] = useState<ApiConfig>(loadConfig());

  // Notification State
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    localStorage.setItem('zapflow_config', JSON.stringify(apiConfig));
  }, [apiConfig]);

  // Redirecionar para chat se for agente ao carregar sessão
  useEffect(() => {
    if (currentUser && currentUser.role === UserRole.AGENT && currentView === 'dashboard') {
        setCurrentView('chat');
    }
  }, []);

  const addNotification = (title: string, message: string, type: 'info' | 'warning' | 'success' = 'info') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, title, message, type }]);
    
    // Auto dismiss after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('zapflow_user', JSON.stringify(user)); // Salvar sessão
    
    if (user.role === UserRole.AGENT) {
        setCurrentView('chat');
    } else {
        setCurrentView('dashboard');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('zapflow_user'); // Limpar sessão
    setCurrentUser(null);
    setCurrentView('dashboard');
    setIsMobileMenuOpen(false);
  };

  const handleViewChange = (view: ViewState) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
  };

  const handleUpdateChat = (updatedChat: Chat) => {
    // Verifica se o chat já existe
    const chatExists = chats.some(c => c.id === updatedChat.id);

    if (chatExists) {
        // Lógica de Notificação para Novas Mensagens
        const oldChat = chats.find(c => c.id === updatedChat.id);
        
        if (oldChat && currentUser) {
            const newMsgCount = updatedChat.messages.length;
            const oldMsgCount = oldChat.messages.length;
            
            // Se houve nova mensagem
            if (newMsgCount > oldMsgCount) {
                const lastMsg = updatedChat.messages[updatedChat.messages.length - 1];
                
                // Só notifica se for mensagem do usuário (cliente)
                if (lastMsg.sender === 'user') {
                    
                    // Cenário 1: Chat atribuído a mim
                    if (updatedChat.assignedTo === currentUser.id) {
                        addNotification(
                            `Nova mensagem de ${updatedChat.contactName}`,
                            lastMsg.content.length > 50 ? lastMsg.content.substring(0, 50) + '...' : lastMsg.content,
                            'info'
                        );
                        
                        // Tocar som de notificação (opcional)
                        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                        audio.play().catch(e => console.log('Audio autoplay blocked'));
                    }
                    
                    // Cenário 2: Chat na Triagem (sem departamento) e usuário tem permissão para ver
                    else if (!updatedChat.departmentId && currentUser.allowGeneralConnection) {
                        addNotification(
                            `Novo chamado na Triagem`,
                            `${updatedChat.contactName}: ${lastMsg.content}`,
                            'warning'
                        );
                        
                        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                        audio.play().catch(e => console.log('Audio autoplay blocked'));
                    }
                }
            }
        }
        setChats(chats.map(c => c.id === updatedChat.id ? updatedChat : c));
    } else {
        // Adiciona novo chat ao topo da lista
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
                // If no real contacts (e.g. demo mode or empty), use mock
                if (apiConfig.isDemo) {
                   newContacts = MOCK_GOOGLE_CONTACTS.map(c => ({...c, lastSync: new Date()}));
                }
            }
            
            // For now, simply replace the google contacts list
            // In a real DB we would upsert based on ID
            setContacts(newContacts);
            
            // Atualiza nomes nos chats existentes (Basic Fuzzy Matching on Phone)
            const updatedChats = chats.map(chat => {
                const chatPhone = chat.contactNumber.replace(/\D/g, '');
                
                // Find contact where phone ends with same last 8 digits (loose matching)
                const match = newContacts.find(c => {
                    const cPhone = c.phone.replace(/\D/g, '');
                    return cPhone === chatPhone || (cPhone.length > 8 && chatPhone.endsWith(cPhone.slice(-8)));
                });

                if (match) {
                    return { 
                        ...chat, 
                        contactName: match.name, 
                        contactAvatar: match.avatar || chat.contactAvatar 
                    };
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

  // --- Access Control & Filtering Logic ---
  const filteredChats = useMemo(() => {
    if (!currentUser) return [];
    
    // Admins see everything
    if (currentUser.role === UserRole.ADMIN) {
      return chats;
    }
    
    // Agents see chats from their department OR chats without department if they have permission
    if (currentUser.role === UserRole.AGENT) {
       return chats.filter(chat => {
          // 1. Chat belongs to user's department
          const matchesDepartment = chat.departmentId === currentUser.departmentId;
          // 2. Chat has NO department and user is allowed to see General
          const matchesGeneral = !chat.departmentId && currentUser.allowGeneralConnection;

          return matchesDepartment || matchesGeneral;
       });
    }
    
    return [];
  }, [chats, currentUser]);

  const canAccess = (view: ViewState): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === UserRole.ADMIN) return true;
    if (view === 'settings' || view === 'users' || view === 'connections' || view === 'departments' || view === 'reports' || view === 'workflows' || view === 'contacts' || view === 'chatbot') return false;
    return true;
  };

  if (!currentUser) {
    return <Login users={users} onLogin={handleLogin} />;
  }

  const renderContent = () => {
    if (!canAccess(currentView)) {
        return <div className="p-8 text-red-500">Acesso não autorizado.</div>;
    }

    switch (currentView) {
      case 'dashboard':
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 md:p-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <div className="flex items-center gap-4 mb-4">
                 <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><MessageSquare /></div>
                 <div>
                   <p className="text-slate-500 text-sm">Meus Chats Ativos</p>
                   <h3 className="text-2xl font-bold text-slate-800">
                     {filteredChats.filter(c => c.status === 'open').length}
                   </h3>
                 </div>
              </div>
            </div>
            
            {currentUser.role === UserRole.ADMIN && (
                <>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-orange-100 text-orange-600 rounded-lg"><Users /></div>
                    <div>
                    <p className="text-slate-500 text-sm">Aguardando Triagem</p>
                    <h3 className="text-2xl font-bold text-slate-800">{chats.filter(c => !c.departmentId).length}</h3>
                    </div>
                </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-green-100 text-green-600 rounded-lg"><Smartphone /></div>
                    <div>
                    <p className="text-slate-500 text-sm">Status Conexão</p>
                    <h3 className="text-2xl font-bold text-emerald-600">{apiConfig.isDemo ? 'Modo Simulação' : 'Modo Real'}</h3>
                    </div>
                </div>
                </div>
                </>
            )}

            <div className="col-span-1 md:col-span-3 bg-white p-6 rounded-lg shadow-sm border border-slate-200 mt-4">
              <h3 className="text-lg font-bold text-slate-800 mb-4">
                Olá, {currentUser.name} ({currentUser.role === UserRole.ADMIN ? 'Administrador' : 'Agente'})
              </h3>
              <p className="text-slate-600">
                {currentUser.role === UserRole.ADMIN 
                    ? "Você tem acesso total ao sistema. Utilize o menu lateral para gerenciar departamentos, usuários e conexões."
                    : `Você está visualizando os atendimentos do setor: ${departments.find(d => d.id === currentUser.departmentId)?.name || 'Nenhum'}.`
                }
                {currentUser.role === UserRole.AGENT && currentUser.allowGeneralConnection && (
                    <span className="block mt-2 font-medium text-emerald-600">Você também tem permissão para acessar a Triagem (Geral).</span>
                )}
              </p>
            </div>
          </div>
        );
      case 'chat':
        return (
          <div className="h-full md:p-4">
             <ChatInterface 
                chats={filteredChats} 
                departments={departments} 
                currentUser={currentUser} 
                onUpdateChat={handleUpdateChat}
                apiConfig={apiConfig}
                quickReplies={quickReplies}
                workflows={workflows}
                contacts={contacts}
             />
          </div>
        );
      case 'reports':
          return <ReportsDashboard chats={chats} departments={departments} />;
      case 'contacts':
          return <Contacts contacts={contacts} onSyncGoogle={handleSyncGoogleContacts} clientId={apiConfig.googleClientId} />;
      case 'chatbot':
          return <ChatbotSettings config={chatbotConfig} onSave={handleUpdateChatbotConfig} />;
      case 'connections':
        return <Connection config={apiConfig} onNavigateToSettings={() => setCurrentView('settings')} onUpdateConfig={handleSaveConfig} />;
      case 'departments':
        return <DepartmentSettings departments={departments} onAdd={handleAddDepartment} onUpdate={handleUpdateDepartment} onDelete={handleDeleteDepartment} />;
      case 'workflows':
        return <WorkflowSettings workflows={workflows} departments={departments} onAdd={handleAddWorkflow} onUpdate={handleUpdateWorkflow} onDelete={handleDeleteWorkflow} />;
      case 'users':
        return <UserSettings users={users} departments={departments} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} />;
      case 'settings':
        return (
           <div className="p-4 space-y-6 overflow-y-auto h-full">
              <Settings config={apiConfig} onSave={handleSaveConfig} />
              <QuickMessageSettings quickReplies={quickReplies} onAdd={handleAddQuickReply} onUpdate={handleUpdateQuickReply} onDelete={handleDeleteQuickReply} />
           </div>
        );
      default:
        return <div className="p-8">Página não encontrada</div>;
    }
  };

  // Helper to render sidebar items
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
      
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
        {notifications.map(n => (
          <div 
            key={n.id} 
            className={`
                min-w-[300px] max-w-sm p-4 rounded-lg shadow-xl border-l-4 bg-white animate-in slide-in-from-right flex items-start gap-3
                ${n.type === 'info' ? 'border-blue-500' : n.type === 'warning' ? 'border-orange-500' : 'border-emerald-500'}
            `}
          >
             <div className={`mt-1 ${n.type === 'info' ? 'text-blue-500' : n.type === 'warning' ? 'text-orange-500' : 'text-emerald-500'}`}>
                {n.type === 'info' ? <Info size={20} /> : n.type === 'warning' ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
             </div>
             <div className="flex-1">
                <h4 className="font-bold text-slate-800 text-sm">{n.title}</h4>
                <p className="text-sm text-slate-600 mt-1 line-clamp-2">{n.message}</p>
             </div>
             <button onClick={() => removeNotification(n.id)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
             </button>
          </div>
        ))}
      </div>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-slate-900 z-40 flex items-center justify-between px-4 shadow-md flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold">Z</div>
          <span className="text-xl font-bold text-white tracking-tight">ZapFlow</span>
        </div>
        <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="text-white p-2 hover:bg-slate-800 rounded-lg"
        >
            {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-50 bg-slate-900 flex flex-col h-full transform transition-all duration-300 ease-in-out flex-shrink-0
        ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full'} md:translate-x-0 shadow-xl md:shadow-none
        ${isSidebarCollapsed ? 'md:w-20' : 'md:w-64'}
      `}>
        <div className={`hidden md:flex p-6 border-b border-slate-800 items-center gap-3 flex-shrink-0 ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}>
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0">Z</div>
          {!isSidebarCollapsed && <span className="text-xl font-bold text-white tracking-tight animate-in fade-in">ZapFlow</span>}
        </div>
        
        <div className={`p-4 bg-slate-800/50 flex items-center gap-3 border-b border-slate-800 mt-16 md:mt-0 flex-shrink-0 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
            <img src={currentUser.avatar} alt="User" className="w-8 h-8 rounded-full border border-slate-600 flex-shrink-0 object-cover"/>
            {!isSidebarCollapsed && (
                <div className="overflow-hidden animate-in fade-in">
                    <p className="text-sm font-semibold text-white truncate">{currentUser.name}</p>
                    <p className="text-xs text-slate-400 truncate capitalize">{currentUser.role === 'ADMIN' ? 'Administrador' : 'Agente'}</p>
                </div>
            )}
        </div>

        <nav className="flex-1 py-4 px-3 space-y-2 overflow-y-auto custom-scrollbar overflow-x-hidden">
          <SidebarItem view="dashboard" icon={LayoutDashboard} label="Dashboard" />
          <SidebarItem view="chat" icon={MessageSquare} label="Atendimento" />
          <SidebarItem view="contacts" icon={ContactIcon} label="Contatos" />

          {currentUser.role === UserRole.ADMIN && (
            <>
                <div className={`pt-4 pb-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider ${isSidebarCollapsed ? 'text-center' : ''}`}>
                    {isSidebarCollapsed ? 'Admin' : 'Administração'}
                </div>

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
            {/* Collapse Button (Desktop Only) */}
            <button 
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="hidden md:flex items-center justify-center p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition-colors w-full"
                title={isSidebarCollapsed ? "Expandir Menu" : "Recolher Menu"}
            >
                {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>

            <button 
                onClick={handleLogout}
                className={`flex items-center gap-2 text-slate-400 hover:text-white transition-colors w-full px-2 py-2 rounded hover:bg-slate-800 ${isSidebarCollapsed ? 'justify-center' : ''}`}
                title="Sair"
            >
                <LogOut size={18} /> 
                {!isSidebarCollapsed && <span>Sair</span>}
            </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full relative min-w-0 bg-slate-100">
         <div className={`flex-1 w-full pt-16 md:pt-0 ${currentView === 'chat' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
            {renderContent()}
         </div>
      </main>
    </div>
  );
};

export default App;
