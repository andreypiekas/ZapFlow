
import React, { useState } from 'react';
import { Department } from '../types';
import { Layers, Plus, Trash2, Edit2, Check, X } from 'lucide-react';

interface DepartmentSettingsProps {
  departments: Department[];
  onAdd: (dept: Department) => void;
  onUpdate: (dept: Department) => void;
  onDelete: (id: string) => void;
}

const DepartmentSettings: React.FC<DepartmentSettingsProps> = ({ departments, onAdd, onUpdate, onDelete }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const handleEditClick = (dept: Department) => {
    setName(dept.name);
    setDesc(dept.description);
    setEditingId(dept.id);
    setIsFormOpen(true);
  };

  const handleAddNewClick = () => {
    setName('');
    setDesc('');
    setEditingId(null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setName('');
    setDesc('');
  };

  const handleSave = () => {
    if (!name) return;

    if (editingId) {
        // Update existing
        const originalDept = departments.find(d => d.id === editingId);
        const updatedDept: Department = {
            id: editingId,
            name: name,
            description: desc,
            color: originalDept?.color || 'bg-indigo-500'
        };
        onUpdate(updatedDept);
    } else {
        // Add new
        const newDept: Department = {
            id: `dept_${Date.now()}`,
            name: name,
            description: desc,
            color: 'bg-indigo-500' // Default color
        };
        onAdd(newDept);
    }
    
    handleCloseForm();
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h2 className="text-2xl font-futuristic text-slate-200 flex items-center gap-3">
             <div className="p-2 bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 text-[#00E0D1] rounded-xl border border-[#00E0D1]/20">
               <Layers size={24} strokeWidth={2} />
             </div>
             Departamentos
           </h2>
           <p className="text-slate-400 mt-1">Organize seus atendimentos por áreas da empresa.</p>
        </div>
        {!isFormOpen && (
            <button 
            onClick={handleAddNewClick}
            className="bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg glow-gradient font-medium"
            >
            <Plus size={18} strokeWidth={2} /> Novo Departamento
            </button>
        )}
      </div>

      {isFormOpen && (
        <div className="bg-[#16191F] p-6 rounded-xl shadow-lg neon-border mb-6 animate-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-futuristic text-slate-200">{editingId ? 'Editar Departamento' : 'Adicionar Departamento'}</h3>
            <button onClick={handleCloseForm} className="text-slate-400 hover:text-[#00E0D1] transition-colors"><X size={18} strokeWidth={2} /></button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Nome da Área</label>
              <input 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Financeiro"
                className="w-full px-4 py-2 border border-[#0D0F13] bg-[#111316] text-slate-200 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Descrição</label>
              <input 
                 value={desc}
                 onChange={(e) => setDesc(e.target.value)}
                 placeholder="Breve descrição da função"
                 className="w-full px-4 py-2 border border-[#0D0F13] bg-[#111316] text-slate-200 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none placeholder:text-slate-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={handleCloseForm} className="px-4 py-2 text-slate-400 hover:text-slate-300 bg-[#111316] hover:bg-[#16191F] border border-[#0D0F13] rounded-lg text-sm transition-all">Cancelar</button>
            <button onClick={handleSave} className="px-4 py-2 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] rounded-lg transition-all shadow-lg glow-gradient flex items-center gap-2 text-sm font-medium">
                <Check size={16} strokeWidth={2.5} /> {editingId ? 'Atualizar' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {departments.map((dept) => (
          <div key={dept.id} className="bg-[#16191F] p-5 rounded-xl shadow-lg neon-border flex items-center justify-between hover:border-[#00E0D1]/50 transition-all">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${dept.color} flex items-center justify-center text-white shrink-0 border border-white/20`}>
                <Layers size={24} strokeWidth={2} />
              </div>
              <div>
                <h3 className="font-futuristic text-slate-200 text-lg">{dept.name}</h3>
                <p className="text-slate-400 text-sm">{dept.description}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => handleEditClick(dept)}
                className="p-2 text-slate-400 hover:text-[#00E0D1] bg-[#111316] hover:bg-[#00E0D1]/10 border border-[#0D0F13] hover:border-[#00E0D1]/30 rounded-lg transition-all" 
                title="Editar"
              >
                <Edit2 size={18} strokeWidth={2} />
              </button>
              <button 
                onClick={() => onDelete(dept.id)}
                className="p-2 text-slate-400 hover:text-red-400 bg-[#111316] hover:bg-red-500/10 border border-[#0D0F13] hover:border-red-500/30 rounded-lg transition-all"
                title="Remover"
              >
                <Trash2 size={18} strokeWidth={2} />
              </button>
            </div>
          </div>
        ))}
        {departments.length === 0 && (
            <div className="text-center py-10 text-slate-400 bg-[#0D0F13] rounded-xl border border-dashed border-[#111316]">
                <Layers className="mx-auto mb-2 opacity-30" size={32} strokeWidth={1.5} />
                <p>Nenhum departamento cadastrado.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default DepartmentSettings;
