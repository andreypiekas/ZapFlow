import React, { useMemo, useState } from 'react';
import { Sticker, User } from '../types';
import { Image as ImageIcon, Trash2, RefreshCw } from 'lucide-react';
import { apiService } from '../services/apiService';

interface StickersSettingsProps {
  stickers: Sticker[];
  currentUser: User;
  onChanged: (stickers: Sticker[]) => void;
}

const StickersSettings: React.FC<StickersSettingsProps> = ({ stickers, currentUser, onChanged }) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const [busy, setBusy] = useState(false);

  const normalized = useMemo(() => {
    return (stickers || []).map((s) => ({
      ...s,
      createdAt: s.createdAt ? new Date(s.createdAt as any) : undefined
    }));
  }, [stickers]);

  const refresh = async () => {
    setBusy(true);
    try {
      const res = await apiService.getStickers(500);
      if (res.success && Array.isArray(res.data)) {
        onChanged(res.data as any);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    const ok = window.confirm('Remover este sticker da biblioteca?');
    if (!ok) return;
    setBusy(true);
    try {
      const res = await apiService.deleteSticker(id);
      if (!res.success) throw new Error(res.error || 'Erro ao deletar sticker');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-futuristic text-slate-200 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-[#0074FF]/30 to-[#0074FF]/10 text-[#0074FF] rounded-xl border border-[#0074FF]/20">
              <ImageIcon size={24} strokeWidth={2} />
            </div>
            Stickers
          </h2>
          <p className="text-slate-400 mt-1">
            Stickers recebidos no WhatsApp são salvos automaticamente (sem duplicar quando houver base64/sha256).
          </p>
        </div>

        <button
          onClick={refresh}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-[#00E0D1]/10 text-[#00E0D1] hover:bg-[#00E0D1]/20 border border-[#00E0D1]/20 flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      {!isAdmin && (
        <div className="bg-[#16191F] rounded-xl shadow-lg neon-border p-6 text-slate-300 mb-6">
          Apenas administradores podem remover stickers. Você pode visualizar e usar os stickers no chat.
        </div>
      )}

      <div className="bg-[#16191F] rounded-xl shadow-lg neon-border p-6">
        {normalized.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum sticker salvo ainda.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {normalized.map((s) => {
              const src = (s as any).dataUrl || (s as any).mediaUrl;
              if (!src || typeof src !== 'string') return null;
              return (
                <div key={s.id} className="relative group rounded-lg overflow-hidden border border-[#0D0F13] bg-[#0D0F13]">
                  <img src={src} alt="Sticker" className="w-full h-28 object-contain p-2" />
                  <div className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] text-slate-400 bg-black/40 flex items-center justify-between">
                    <span className="truncate">{(s.createdAt instanceof Date) ? s.createdAt.toLocaleString() : ''}</span>
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(s.id)}
                        disabled={busy}
                        className="text-red-300 hover:text-red-200 disabled:opacity-60"
                        title="Remover"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StickersSettings;

