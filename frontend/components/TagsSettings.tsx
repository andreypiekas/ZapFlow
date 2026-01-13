import React, { useMemo, useState } from 'react';
import { Tag as TagType, User } from '../types';
import { Plus, Save, Trash2, Tag } from 'lucide-react';
import { apiService } from '../services/apiService';

interface TagsSettingsProps {
  tags: TagType[];
  currentUser: User;
  onChanged: (tags: TagType[]) => void;
}

const DEFAULT_COLOR = 'bg-blue-100 text-blue-700';

const TagsSettings: React.FC<TagsSettingsProps> = ({ tags, currentUser, onChanged }) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => {
    return (tags || []).slice().sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
  }, [tags]);

  const refresh = async () => {
    const res = await apiService.getTags();
    if (res.success && Array.isArray(res.data)) {
      onChanged(res.data as any);
    }
  };

  const handleCreate = async () => {
    if (!isAdmin) return;
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await apiService.createTag(name, newColor || DEFAULT_COLOR);
      if (!res.success) throw new Error(res.error || 'Erro ao criar tag');
      setNewName('');
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string, name: string, color: string) => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const res = await apiService.updateTag(id, name.trim(), color || DEFAULT_COLOR);
      if (!res.success) throw new Error(res.error || 'Erro ao atualizar tag');
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    const ok = window.confirm('Remover esta tag? Ela continuará aparecendo em chats antigos como texto, mas não ficará disponível para seleção.');
    if (!ok) return;
    setSaving(true);
    try {
      const res = await apiService.deleteTag(id);
      if (!res.success) throw new Error(res.error || 'Erro ao deletar tag');
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-futuristic text-slate-200 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 text-[#00E0D1] rounded-xl border border-[#00E0D1]/20">
              <Tag size={24} strokeWidth={2} />
            </div>
            Tags
          </h2>
          <p className="text-slate-400 mt-1">Gerencie as tags usadas para classificar atendimentos.</p>
        </div>
      </div>

      {!isAdmin && (
        <div className="bg-[#16191F] rounded-xl shadow-lg neon-border p-6 text-slate-300">
          Apenas administradores podem gerenciar tags. Você pode visualizar as tags disponíveis nos chats.
        </div>
      )}

      {isAdmin && (
        <div className="bg-[#16191F] rounded-xl shadow-lg neon-border p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome da tag (ex.: VIP)"
              className="px-4 py-3 border border-[#0D0F13] bg-[#111316] text-slate-200 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none"
            />
            <input
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              placeholder="Classes Tailwind (ex.: bg-blue-100 text-blue-700)"
              className="px-4 py-3 border border-[#0D0F13] bg-[#111316] text-slate-200 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none"
            />
            <button
              onClick={handleCreate}
              disabled={saving}
              className="bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] px-6 py-2 rounded-lg flex items-center justify-center gap-2 font-medium transition-all shadow-lg glow-gradient disabled:opacity-60"
            >
              <Plus size={18} strokeWidth={2.5} /> Criar
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Dica: use classes Tailwind como <span className="font-mono">bg-purple-100 text-purple-700</span>.
          </p>
        </div>
      )}

      <div className="bg-[#16191F] rounded-xl shadow-lg neon-border p-6">
        <div className="space-y-3">
          {sorted.map((t) => (
            <TagRow
              key={t.id}
              tag={t}
              canEdit={isAdmin}
              onSave={handleUpdate}
              onDelete={handleDelete}
              saving={saving}
            />
          ))}
          {sorted.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma tag cadastrada.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const TagRow: React.FC<{
  tag: TagType;
  canEdit: boolean;
  saving: boolean;
  onSave: (id: string, name: string, color: string) => void;
  onDelete: (id: string) => void;
}> = ({ tag, canEdit, saving, onSave, onDelete }) => {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-lg border border-[#0D0F13] bg-[#111316]">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`text-xs px-2 py-1 rounded-full border ${tag.color || DEFAULT_COLOR}`}>
          {tag.name}
        </span>
        {!canEdit && <span className="text-xs text-slate-500">({tag.color})</span>}
      </div>

      {canEdit && (
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-3 py-2 border border-[#0D0F13] bg-[#0D0F13] text-slate-200 rounded-lg outline-none w-full md:w-56"
          />
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="px-3 py-2 border border-[#0D0F13] bg-[#0D0F13] text-slate-200 rounded-lg outline-none w-full md:w-72 font-mono text-xs"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSave(tag.id, name, color)}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#00E0D1]/20 text-[#00E0D1] hover:bg-[#00E0D1]/30 border border-[#00E0D1]/20 flex items-center gap-2 disabled:opacity-60"
              title="Salvar"
            >
              <Save size={16} /> Salvar
            </button>
            <button
              onClick={() => onDelete(tag.id)}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 flex items-center gap-2 disabled:opacity-60"
              title="Deletar"
            >
              <Trash2 size={16} /> Remover
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default TagsSettings;

