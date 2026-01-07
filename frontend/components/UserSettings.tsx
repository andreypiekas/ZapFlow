import React, { useState, useRef } from 'react';
import { User, Department, UserRole } from '../types';
import { UserPlus, Trash2, Edit2, Shield, User as UserIcon, Check, Camera, Upload, Eye } from 'lucide-react';
import { blobToBase64 } from '../services/whatsappService';

interface UserSettingsProps {
  users: User[];
  departments: Department[];
  onAddUser: (user: User) => void;
  onUpdateUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
}

const UserSettings: React.FC<UserSettingsProps> = ({ users, departments, onAddUser, onUpdateUser, onDeleteUser }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.AGENT);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [avatar, setAvatar] = useState('');
  const [allowGeneralConnection, setAllowGeneralConnection] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openModal = (user?: User) => {
    if (user) {
      // Busca o usuário mais recente do array para garantir que está atualizado
      const currentUser = users.find(u => u.id === user.id) || user;
      setEditingUser(currentUser);
      setName(currentUser.name);
      setEmail(currentUser.email);
      setPassword(currentUser.password || '');
      setRole(currentUser.role);
      const fromMulti = Array.isArray(currentUser.departmentIds) ? currentUser.departmentIds.filter(Boolean) : [];
      const fromSingle = currentUser.departmentId ? [currentUser.departmentId] : [];
      const merged = Array.from(new Set([...(fromMulti.length ? fromMulti : fromSingle)]));
      setDepartmentIds(merged);
      setAvatar(currentUser.avatar);
      setAllowGeneralConnection(currentUser.allowGeneralConnection || false);
    } else {
      setEditingUser(null);
      setName('');
      setEmail('');
      setPassword('');
      setRole(UserRole.AGENT);
      setDepartmentIds([]);
      setAvatar(`https://picsum.photos/200/200?random=${Date.now()}`);
      setAllowGeneralConnection(false);
    }
    setIsModalOpen(true);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const file = e.target.files[0];
        if (file.size > 2 * 1024 * 1024) {
          alert('A imagem deve ter no máximo 2MB.');
          return;
        }
        const base64 = await blobToBase64(file);
        setAvatar(base64);
      } catch (error) {
        console.error("Erro ao processar imagem", error);
        alert("Erro ao carregar a imagem.");
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedDepartmentIds =
      role === UserRole.ADMIN
        ? []
        : Array.from(new Set((departmentIds || []).map(String).map(s => s.trim()).filter(Boolean)));
    const primaryDepartmentId = normalizedDepartmentIds[0] || undefined;

    const userData: User = {
      id: editingUser ? editingUser.id : `user_${Date.now()}`,
      name,
      email,
      password,
      role,
      avatar: avatar,
      departmentId: role === UserRole.ADMIN ? undefined : primaryDepartmentId,
      departmentIds: role === UserRole.ADMIN ? [] : normalizedDepartmentIds,
      allowGeneralConnection
    };

    if (editingUser) {
      onUpdateUser(userData);
    } else {
      onAddUser(userData);
    }
    setIsModalOpen(false);
  };

  const getDepartmentName = (id?: string) => {
    if (!id) return 'Sem Departamento';
    return departments.find(d => d.id === id)?.name || 'Sem Departamento';
  };

  const getUserDepartmentLabel = (user: User): string => {
    if (user.role === UserRole.ADMIN) return 'Acesso Total';
    const ids = Array.isArray(user.departmentIds) && user.departmentIds.length
      ? user.departmentIds
      : (user.departmentId ? [user.departmentId] : []);
    const names = ids
      .map(id => getDepartmentName(id))
      .filter(Boolean);
    const uniqueNames = Array.from(new Set(names));
    return uniqueNames.length ? uniqueNames.join(', ') : 'Sem Departamento';
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
           <h2 className="text-2xl font-futuristic text-slate-200 flex items-center gap-3">
             <div className="p-2 bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 text-[#00E0D1] rounded-xl border border-[#00E0D1]/20">
               <UserIcon size={24} strokeWidth={2} />
             </div>
             Gestão de Usuários
           </h2>
           <p className="text-slate-400 mt-1">Cadastre usuários, defina senhas e atribua departamentos.</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] px-5 py-2.5 rounded-lg flex items-center gap-2 transition-all shadow-lg glow-gradient font-medium w-full md:w-auto justify-center"
        >
          <UserPlus size={18} strokeWidth={2.5} /> Novo Usuário
        </button>
      </div>

      <div className="bg-[#16191F] rounded-xl shadow-lg neon-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead className="bg-[#0D0F13] border-b border-[#111316]">
              <tr>
                <th className="px-6 py-4 text-xs font-futuristic text-slate-400 uppercase tracking-wider">Usuário</th>
                <th className="px-6 py-4 text-xs font-futuristic text-slate-400 uppercase tracking-wider">Função</th>
                <th className="px-6 py-4 text-xs font-futuristic text-slate-400 uppercase tracking-wider">Departamento</th>
                <th className="px-6 py-4 text-xs font-futuristic text-slate-400 uppercase tracking-wider">Permissões Extras</th>
                <th className="px-6 py-4 text-xs font-futuristic text-slate-400 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0D0F13]">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-[#111316] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full object-cover border border-[#0D0F13]" />
                      <div>
                        <h4 className="font-medium text-slate-200">{user.name}</h4>
                        <p className="text-xs text-slate-400">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {user.role === UserRole.ADMIN ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
                        <Shield size={12} strokeWidth={2} /> Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#0074FF]/20 text-[#0074FF] border border-[#0074FF]/30">
                        <UserIcon size={12} strokeWidth={2} /> Agente
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-300">
                    {user.role === UserRole.ADMIN ? (
                      <span className="text-slate-500 italic">Acesso Total</span>
                    ) : (
                      getUserDepartmentLabel(user)
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-300">
                    {user.allowGeneralConnection && (
                        <span className="inline-flex items-center gap-1 text-xs bg-slate-500/20 px-2 py-1 rounded text-slate-300 border border-slate-500/30">
                            <Eye size={12} strokeWidth={2} /> Ver Triagem/Geral
                        </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => openModal(user)}
                        className="p-2 text-slate-400 hover:text-[#00E0D1] bg-[#111316] hover:bg-[#00E0D1]/10 border border-[#0D0F13] hover:border-[#00E0D1]/30 rounded-lg transition-all"
                      >
                        <Edit2 size={18} strokeWidth={2} />
                      </button>
                      <button 
                        onClick={() => onDeleteUser(user.id)}
                        className="p-2 text-slate-400 hover:text-red-400 bg-[#111316] hover:bg-red-500/10 border border-[#0D0F13] hover:border-red-500/30 rounded-lg transition-all"
                        title="Excluir"
                      >
                        <Trash2 size={18} strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
              <h3 className="font-bold text-slate-800 text-lg">
                {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              
              {/* Avatar Upload */}
              <div className="flex flex-col items-center justify-center mb-4">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <img 
                    src={avatar} 
                    alt="Avatar Preview" 
                    className="w-24 h-24 rounded-full object-cover border-4 border-slate-100 group-hover:border-emerald-200 transition-all shadow-sm" 
                  />
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="text-white" size={24} />
                  </div>
                </div>
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-xs text-emerald-600 font-medium flex items-center gap-1 hover:underline"
                >
                  <Upload size={12} /> Alterar foto
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleAvatarChange}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                <input 
                  required
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Ex: Ana Silva"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email de Acesso</label>
                <input 
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="ana@empresa.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
                <input 
                  required={!editingUser}
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  placeholder={editingUser ? "Deixe em branco para manter" : "Defina uma senha"}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Função</label>
                  <select 
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                  >
                    <option value={UserRole.AGENT}>Agente</option>
                    <option value={UserRole.ADMIN}>Admin</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Departamentos</label>
                  <div className={`w-full px-3 py-2 border border-slate-300 rounded-lg bg-white ${role === UserRole.ADMIN ? 'bg-slate-100 text-slate-400' : ''}`}>
                    {role === UserRole.ADMIN ? (
                      <span className="text-sm text-slate-500">Admin possui acesso total (não precisa de departamentos).</span>
                    ) : departments.length === 0 ? (
                      <span className="text-sm text-slate-500">Nenhum departamento cadastrado.</span>
                    ) : (
                      <div className="max-h-32 overflow-y-auto space-y-2 pr-1">
                        {departments.map(dept => {
                          const checked = departmentIds.includes(dept.id);
                          return (
                            <label key={dept.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const isChecked = e.target.checked;
                                  setDepartmentIds(prev => {
                                    const next = new Set(prev);
                                    if (isChecked) next.add(dept.id);
                                    else next.delete(dept.id);
                                    return Array.from(next);
                                  });
                                }}
                                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                              />
                              <span className="truncate">{dept.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Opção para Visualizar Chats Gerais */}
              <div className="pt-2">
                 <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                    <input 
                        type="checkbox"
                        checked={allowGeneralConnection}
                        onChange={(e) => setAllowGeneralConnection(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                    <div>
                        <span className="block text-sm font-medium text-slate-700">Permitir visualizar chats sem departamento (Geral)</span>
                        <span className="block text-xs text-slate-500">Permite que o usuário veja e atenda conversas que ainda não foram triadas ou atribuídas.</span>
                    </div>
                 </label>
              </div>

              <div className="pt-4 flex gap-3 justify-end sticky bottom-0 bg-white border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium shadow-sm flex items-center gap-2"
                >
                  <Check size={18} /> Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserSettings;