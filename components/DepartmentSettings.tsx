
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
           <h2 className="text-2xl font-bold text-slate-800">Departamentos</h2>
           <p className="text-slate-500">Organize seus atendimentos por áreas da empresa.</p>
        </div>
        {!isFormOpen && (
            <button 
            onClick={handleAddNewClick}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors shadow-sm"
            >
            <Plus size={18} /> Novo Departamento
            </button>
        )}
      </div>

      {isFormOpen && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-emerald-100 mb-6 animate-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800">{editingId ? 'Editar Departamento' : 'Adicionar Departamento'}</h3>
            <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nome da Área</label>
              <input 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Financeiro"
                className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
              <input 
                 value={desc}
                 onChange={(e) => setDesc(e.target.value)}
                 placeholder="Breve descrição da função"
                 className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={handleCloseForm} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Cancelar</button>
            <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 flex items-center gap-2 text-sm font-medium">
                <Check size={16} /> {editingId ? 'Atualizar' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {departments.map((dept) => (
          <div key={dept.id} className="bg-white p-5 rounded-lg shadow-sm border border-slate-200 flex items-center justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg ${dept.color} flex items-center justify-center text-white shrink-0`}>
                <Layers size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">{dept.name}</h3>
                <p className="text-slate-500 text-sm">{dept.description}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => handleEditClick(dept)}
                className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded transition-colors" 
                title="Editar"
              >
                <Edit2 size={18} />
              </button>
              <button 
                onClick={() => onDelete(dept.id)}
                className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded transition-colors"
                title="Remover"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
        {departments.length === 0 && (
            <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                <Layers className="mx-auto mb-2 opacity-30" size={32} />
                <p>Nenhum departamento cadastrado.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default DepartmentSettings;
