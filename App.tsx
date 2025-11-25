
import React, { useState, useEffect, useMemo } from 'react';
import { Chat, Department, ViewState, ApiConfig, User, UserRole, QuickReply, Workflow } from './types';
import { INITIAL_CHATS, INITIAL_DEPARTMENTS, INITIAL_USERS, INITIAL_QUICK_REPLIES, INITIAL_WORKFLOWS } from './constants';
import Login from './components/Login';
import ChatInterface from './components/ChatInterface';
import Connection from './components/Connection';
import DepartmentSettings from './components/DepartmentSettings';
import UserSettings from './components/UserSettings';
import Settings from './components/Settings';
import QuickMessageSettings from './components/QuickMessageSettings';
import WorkflowSettings from './components/WorkflowSettings';
import ReportsDashboard from './components/ReportsDashboard';
import { MessageSquare, Settings as SettingsIcon, Smartphone, Users, LayoutDashboard, LogOut, ShieldCheck, Menu, X, Zap, BarChart, ListChecks } from 'lucide-react';

const loadConfig = (): ApiConfig => {
  const saved = localStorage.getItem('zapflow_config');
  if (saved) return JSON.parse(saved);
  return {
    baseUrl: '', 
    apiKey: '',
    instanceName: 'zapflow_main',
    isDemo: false 
  };
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Application Data State
  const [chats, setChats] = useState<Chat[]>(INITIAL_CHATS);
  const [departments, setDepartments] = useState<Department[]>(INITIAL_DEPARTMENTS);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>(INITIAL_QUICK_REPLIES);
  const [workflows, setWorkflows] = useState<Workflow[]>(INITIAL_WORKFLOWS);
  const [apiConfig, setApiConfig] = useState<ApiConfig>(loadConfig());

  useEffect(() => {
    localStorage.setItem('zapflow_config', JSON.stringify(apiConfig));
  }, [apiConfig]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    if (user.role === UserRole.AGENT) {
        setCurrentView('chat');
    } else {
        setCurrentView('dashboard');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('dashboard');
    setIsMobileMenuOpen(false);
  };

  const handleViewChange = (view: ViewState) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
  };

  const handleUpdateChat = (updatedChat: Chat) => {
    setChats(chats.map(c => c.id === updatedChat.id ? updatedChat : c));
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
    if (view === 'settings' || view === 'users' || view === 'connections' || view === 'departments' || view === 'reports' || view === 'workflows') return false;
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
             />
          </div>
        );
      case 'reports':
          return <ReportsDashboard chats={chats} departments={departments} />;
      case 'connections':
        return <Connection config={apiConfig} onNavigateToSettings={() => setCurrentView('settings')} />;
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

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">
      
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
        fixed md:static inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col h-full transform transition-transform duration-300 ease-in-out flex-shrink-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 shadow-xl md:shadow-none
      `}>
        <div className="hidden md:flex p-6 border-b border-slate-800 items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold">Z</div>
          <span className="text-xl font-bold text-white tracking-tight">ZapFlow</span>
        </div>
        
        <div className="p-4 bg-slate-800/50 flex items-center gap-3 border-b border-slate-800 mt-16 md:mt-0 flex-shrink-0">
            <img src={currentUser.avatar} alt="User" className="w-8 h-8 rounded-full border border-slate-600 flex-shrink-0 object-cover"/>
            <div className="overflow-hidden">
                <p className="text-sm font-semibold text-white truncate">{currentUser.name}</p>
                <p className="text-xs text-slate-400 truncate capitalize">{currentUser.role === 'ADMIN' ? 'Administrador' : 'Agente'}</p>
            </div>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-2 overflow-y-auto custom-scrollbar">
          <button 
            onClick={() => handleViewChange('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${currentView === 'dashboard' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
          >
            <LayoutDashboard size={20} /> Dashboard
          </button>
          
          <button 
            onClick={() => handleViewChange('chat')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${currentView === 'chat' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
          >
            <MessageSquare size={20} /> Atendimento
          </button>
          
          {currentUser.role === UserRole.ADMIN && (
            <>
                <div className="pt-4 pb-2 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Administração
                </div>

                <button 
                    onClick={() => handleViewChange('reports')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${currentView === 'reports' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
                >
                    <BarChart size={20} /> Relatórios
                </button>

                <button 
                    onClick={() => handleViewChange('workflows')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${currentView === 'workflows' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
                >
                    <ListChecks size={20} /> Fluxos (SOP)
                </button>

                <button 
                    onClick={() => handleViewChange('departments')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${currentView === 'departments' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
                >
                    <Users size={20} /> Departamentos
                </button>

                <button 
                    onClick={() => handleViewChange('users')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${currentView === 'users' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
                >
                    <ShieldCheck size={20} /> Usuários
                </button>

                <button 
                    onClick={() => handleViewChange('connections')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${currentView === 'connections' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
                >
                    <Smartphone size={20} /> Conexões
                </button>

                <button 
                    onClick={() => handleViewChange('settings')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${currentView === 'settings' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
                >
                    <SettingsIcon size={20} /> Configurações
                </button>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800 flex-shrink-0">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors w-full px-2"
          >
            <LogOut size={18} /> Sair
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
