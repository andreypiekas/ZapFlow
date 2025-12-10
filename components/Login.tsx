
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { User as UserIcon, Lock } from 'lucide-react';
import { apiService } from '../services/apiService';

interface LoginProps {
  users: User[];
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ users, onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Tenta fazer login via API primeiro
      try {
        const response = await apiService.login(email, password);
        if (response.user) {
          // Converte o usuário da API para o formato esperado
          const user: User = {
            id: response.user.id.toString(),
            username: response.user.username,
            name: response.user.name,
            email: response.user.email || email,
            role: response.user.role as UserRole,
            password: '' // Não armazena senha
          };
          onLogin(user);
          setIsLoading(false);
          return;
        }
      } catch (apiError: any) {
        // Se a API não estiver disponível ou falhar, tenta login local
        if (apiError.message && !apiError.message.includes('Failed to fetch')) {
          setError(apiError.message || 'Credenciais inválidas');
          setIsLoading(false);
          return;
        }
        // Se for erro de rede, continua para login local
      }

      // Fallback: login local (compatibilidade)
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);

      if (user) {
        onLogin(user);
      } else {
        setError('Credenciais inválidas. Verifique email e senha.');
      }
    } catch (err) {
      setError('Erro ao fazer login. Tente novamente.');
      console.error('[Login] Erro:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111316] flex items-center justify-center p-4">
      <div className="bg-[#16191F] rounded-lg shadow-2xl overflow-hidden w-full max-w-md flex flex-col border border-[#0D0F13]">
        <div className="bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#0D0F13] mb-4">
            <svg className="w-10 h-10" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 30 L80 30 L80 35 L25 35 L25 65 L80 65 L80 70 L20 70 Z" fill="url(#gradient)" stroke="url(#gradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00C3FF" />
                  <stop offset="100%" stopColor="#00E0D1" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#0D0F13]">Zentria Manager</h1>
          <p className="text-[#0D0F13]/80 mt-2">Plataforma de Gestão Multi-Setor</p>
        </div>
        
        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon size={18} className="text-slate-500" />
                </div>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[#111316] border border-[#0D0F13] text-slate-200 rounded-md focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none transition-colors placeholder:text-slate-500"
                  placeholder="seu@email.com"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-slate-500" />
                </div>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[#111316] border border-[#0D0F13] text-slate-200 rounded-md focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none transition-colors placeholder:text-slate-500"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-900/20 text-red-400 text-sm rounded-md border border-red-800/50">
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-[#0D0F13] font-semibold py-3 px-4 rounded-md transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#00C3FF]/20"
            >
              {isLoading ? 'Entrando...' : 'Entrar na Plataforma'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            <p>Desenvolvido por Andrey Gheno Piekas • Versão 1.2.0 (Production)</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
