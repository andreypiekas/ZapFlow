import React, { useState, useRef } from 'react';
import { User, Department, UserRole } from '../types';
import { UserPlus, Trash2, Edit2, Shield, User as UserIcon, Check, Camera, Upload } from 'lucide-react';
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
  const [departmentId, setDepartmentId] = useState<string>('');
  const [avatar, setAvatar] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setName(user.name);
      setEmail(user.email);
      setPassword(user.password || '');
      setRole(user.role);
      setDepartmentId(user.departmentId || '');
      setAvatar(user.avatar);
    } else {
      setEditingUser(null);
      setName('');
      setEmail('');
      setPassword('');
      setRole(UserRole.AGENT);
      setDepartmentId('');
      setAvatar(`https://picsum.photos/200/200?random=${Date.now()}`);
    }
    setIsModalOpen(true);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const file = e.target.files[0];
        // Limite simples de tamanho (2MB)
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
    
    const userData: User = {
      id: editingUser ? editingUser.id : `user_${Date.now()}`,
      name,
      email,
      password,
      role,
      avatar: avatar,
      departmentId: role === UserRole.ADMIN ? undefined : departmentId || undefined
    };

    if (editingUser) {
      onUpdateUser(userData);
    } else {
      onAddUser(userData);
    }
    setIsModalOpen(false);
  };

  const getDepartmentName = (id?: string) => {
    if (!id) return 'Todos (Admin)';
    return departments.find(d => d.id === id)?.name || 'Sem Departamento';
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">Gestão de Usuários</h2>
           <p className="text-slate-500">Cadastre usuários, defina senhas e atribua departamentos.</p>
        </div>
        <button 
          onClick={() => openModal()}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-md flex items-center gap-2 transition-colors shadow-sm font-medium"
        >
          <UserPlus size={18} /> Novo Usuário
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Usuário</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Função</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Departamento</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full object-cover border border-slate-200" />
                    <div>
                      <h4 className="font-medium text-slate-800">{user.name}</h4>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {user.role === UserRole.ADMIN ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200">
                      <Shield size={12} /> Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                      <UserIcon size={12} /> Agente
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {user.role === UserRole.ADMIN ? (
                    <span className="text-slate-400 italic">Acesso Total</span>
                  ) : (
                    getDepartmentName(user.departmentId)
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => openModal(user)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={() => onDeleteUser(user.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
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

              <div className="grid grid-cols-2 gap-4">
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Departamento</label>
                  <select 
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    disabled={role === UserRole.ADMIN}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">Selecione...</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                  {role === UserRole.ADMIN && (
                    <p className="text-[10px] text-slate-400 mt-1">Admins têm acesso a todos setores.</p>
                  )}
                </div>
              </div>

              <div className="pt-4 flex gap-3 justify-end">
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
                  <Check size={18} /> Salvar Usuário
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