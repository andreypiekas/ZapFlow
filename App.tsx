import React, { useState, useEffect, useMemo } from 'react';
import { Chat, Department, ViewState, ApiConfig, User, UserRole } from './types';
import { INITIAL_CHATS, INITIAL_DEPARTMENTS, INITIAL_USERS } from './constants';
import Login from './components/Login';
import ChatInterface from './components/ChatInterface';
import Connection from './components/Connection';
import DepartmentSettings from './components/DepartmentSettings';
import UserSettings from './components/UserSettings';
import Settings from './components/Settings';
import { MessageSquare, Settings as SettingsIcon, Smartphone, Users, LayoutDashboard, LogOut, ShieldCheck } from 'lucide-react';

// Initial config loading from local storage
const loadConfig = (): ApiConfig => {
  const saved = localStorage.getItem('zapflow_config');
  if (saved) return JSON.parse(saved);
  return {
    baseUrl: '', // User needs to fill this via Settings
    apiKey: '',
    instanceName: 'zapflow_main',
    isDemo: false 
  };
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  
  // Application Data State
  const [chats, setChats] = useState<Chat[]>(INITIAL_CHATS);
  const [departments, setDepartments] = useState<Department[]>(INITIAL_DEPARTMENTS);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [apiConfig, setApiConfig] = useState<ApiConfig>(loadConfig());

  // Save config whenever it changes
  useEffect(() => {
    localStorage.setItem('zapflow_config', JSON.stringify(apiConfig));
  }, [apiConfig]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    // If user is agent, default to chat view
    if (user.role === UserRole.AGENT) {
        setCurrentView('chat');
    } else {
        setCurrentView('dashboard');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('dashboard');
  };

  // --- Data Management Handlers ---

  const handleUpdateChat = (updatedChat: Chat) => {
    setChats(chats.map(c => c.id === updatedChat.id ? updatedChat : c));
  };

  const handleAddDepartment = (dept: Department) => {
    setDepartments([...departments, dept]);
  };

  const handleDeleteDepartment = (id: string) => {
    setDepartments(departments.filter(d => d.id !== id));
    // Optional: Reset chats that belonged to this department
    setChats(chats.map(c => c.departmentId === id ? { ...c, departmentId: null } : c));
  };

  const handleSaveConfig = (newConfig: ApiConfig) => {
    setApiConfig(newConfig);
  };

  // User CRUD Handlers
  const handleAddUser = (user: User) => setUsers([...users, user]);
  const handleUpdateUser = (updatedUser: User) => setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
  const handleDeleteUser = (id: string) => setUsers(users.filter(u => u.id !== id));

  // --- Access Control & Filtering Logic ---

  // Filter Chats based on User Role and Department
  const filteredChats = useMemo(() => {
    if (!currentUser) return [];
    
    // Admins see everything
    if (currentUser.role === UserRole.ADMIN) {
      return chats;
    }
    
    // Agents see only chats from their department
    if (currentUser.role === UserRole.AGENT) {
      if (!currentUser.departmentId) return []; // If agent has no dept, sees nothing (or could see unassigned)
      
      return chats.filter(chat => 
        chat.departmentId === currentUser.departmentId
      );
    }
    
    return [];
  }, [chats, currentUser]);

  // View Access Control
  const canAccess = (view: ViewState): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === UserRole.ADMIN) return true;
    
    // Agent restrictions
    if (view === 'settings' || view === 'users' || view === 'connections' || view === 'departments') return false;
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
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
              </p>
            </div>
          </div>
        );
      case 'chat':
        return (
          <div className="h-[calc(100vh-2rem)] p-4">
             <ChatInterface 
                chats={filteredChats} // Pass filtered chats
                departments={departments} 
                currentUser={currentUser} 
                onUpdateChat={handleUpdateChat}
                apiConfig={apiConfig}
             />
          </div>
        );
      case 'connections':
        return <Connection config={apiConfig} onNavigateToSettings={() => setCurrentView('settings')} />;
      case 'departments':
        return <DepartmentSettings departments={departments} onAdd={handleAddDepartment} onDelete={handleDeleteDepartment} />;
      case 'users':
        return <UserSettings users={users} departments={departments} onAddUser={handleAddUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} />;
      case 'settings':
        return <Settings config={apiConfig} onSave={handleSaveConfig} />;
      default:
        return <div className="p-8">Página não encontrada</div>;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-100 font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold">Z</div>
          <span className="text-xl font-bold text-white tracking-tight">ZapFlow</span>
        </div>
        
        {/* User Profile Mini */}
        <div className="p-4 bg-slate-800/50 flex items-center gap-3 border-b border-slate-800">
            <img src={currentUser.avatar} alt="User" className="w-8 h-8 rounded-full border border-slate-600"/>
            <div className="overflow-hidden">
                <p className="text-sm font-semibold text-white truncate">{currentUser.name}</p>
                <p className="text-xs text-slate-400 truncate capitalize">{currentUser.role === 'ADMIN' ? 'Administrador' : 'Agente'}</p>
            </div>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-2 overflow-y-auto">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${currentView === 'dashboard' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
          >
            <LayoutDashboard size={20} /> Dashboard
          </button>
          
          <button 
            onClick={() => setCurrentView('chat')}
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
                    onClick={() => setCurrentView('departments')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${currentView === 'departments' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
                >
                    <Users size={20} /> Departamentos
                </button>

                <button 
                    onClick={() => setCurrentView('users')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${currentView === 'users' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
                >
                    <ShieldCheck size={20} /> Usuários
                </button>

                <button 
                    onClick={() => setCurrentView('connections')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${currentView === 'connections' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
                >
                    <Smartphone size={20} /> Conexões
                </button>

                <button 
                    onClick={() => setCurrentView('settings')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${currentView === 'settings' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-slate-800'}`}
                >
                    <SettingsIcon size={20} /> Configurações
                </button>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors w-full px-2"
          >
            <LogOut size={18} /> Sair
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-64 overflow-y-auto h-screen">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;