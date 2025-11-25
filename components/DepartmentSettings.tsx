import React, { useState } from 'react';
import { Department } from '../types';
import { Layers, Plus, Trash2, Edit2 } from 'lucide-react';

interface DepartmentSettingsProps {
  departments: Department[];
  onAdd: (dept: Department) => void;
  onDelete: (id: string) => void;
}

const DepartmentSettings: React.FC<DepartmentSettingsProps> = ({ departments, onAdd, onDelete }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const handleAdd = () => {
    if (!newName) return;
    const newDept: Department = {
      id: `dept_${Date.now()}`,
      name: newName,
      description: newDesc,
      color: 'bg-indigo-500' // Default color
    };
    onAdd(newDept);
    setNewName('');
    setNewDesc('');
    setIsAdding(false);
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">Departamentos</h2>
           <p className="text-slate-500">Organize seus atendimentos por áreas da empresa.</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-colors shadow-sm"
        >
          <Plus size={18} /> Novo Departamento
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-emerald-100 mb-6 animate-in slide-in-from-top-4">
          <h3 className="font-semibold text-slate-800 mb-4">Adicionar Departamento</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nome da Área</label>
              <input 
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Financeiro"
                className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
              <input 
                 value={newDesc}
                 onChange={(e) => setNewDesc(e.target.value)}
                 placeholder="Breve descrição da função"
                 className="w-full px-4 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700">Cancelar</button>
            <button onClick={handleAdd} className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700">Salvar</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {departments.map((dept) => (
          <div key={dept.id} className="bg-white p-5 rounded-lg shadow-sm border border-slate-200 flex items-center justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg ${dept.color} flex items-center justify-center text-white`}>
                <Layers size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">{dept.name}</h3>
                <p className="text-slate-500 text-sm">{dept.description}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors" title="Editar">
                <Edit2 size={18} />
              </button>
              <button 
                onClick={() => onDelete(dept.id)}
                className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                title="Remover"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DepartmentSettings;