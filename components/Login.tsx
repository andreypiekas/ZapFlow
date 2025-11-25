import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { User as UserIcon, Lock } from 'lucide-react';

interface LoginProps {
  users: User[];
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ users, onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Find user by email and simple password check
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);

    if (user) {
      onLogin(user);
    } else {
      setError('Credenciais inválidas. Verifique email e senha.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl overflow-hidden w-full max-w-md flex flex-col">
        <div className="bg-emerald-600 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">ZapFlow Manager</h1>
          <p className="text-emerald-100 mt-2">Plataforma de Gestão Multi-Setor</p>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon size={18} className="text-slate-400" />
                </div>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  placeholder="seu@email.com"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-slate-400" />
                </div>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-md border border-red-100">
                {error}
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
            >
              Entrar na Plataforma
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100">
             <p className="text-xs font-bold text-slate-500 mb-2 text-center">Usuários de Teste:</p>
             <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 p-2 rounded border border-slate-200 cursor-pointer hover:bg-slate-100" onClick={() => {setEmail('admin@zapflow.com.br'); setPassword('123')}}>
                   <span className="block font-semibold text-emerald-600">Admin</span>
                   <span className="text-slate-500">admin@zapflow.com.br</span>
                   <span className="block text-slate-400">Senha: 123</span>
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200 cursor-pointer hover:bg-slate-100" onClick={() => {setEmail('joao@zapflow.com.br'); setPassword('123')}}>
                   <span className="block font-semibold text-blue-600">Comercial</span>
                   <span className="text-slate-500">joao@zapflow.com.br</span>
                   <span className="block text-slate-400">Senha: 123</span>
                </div>
             </div>
          </div>

          <div className="mt-6 text-center text-xs text-slate-400">
            <p>Hospedado em HostGator • Versão 1.1.0</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;