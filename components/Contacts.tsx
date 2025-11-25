
import React, { useState } from 'react';
import { Contact } from '../types';
import { RefreshCw, Search, Mail, User as UserIcon, Check, Loader2 } from 'lucide-react';

interface ContactsProps {
  contacts: Contact[];
  onSyncGoogle: () => Promise<void>;
}

const Contacts: React.FC<ContactsProps> = ({ contacts, onSyncGoogle }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const handleSync = async () => {
    setIsSyncing(true);
    await onSyncGoogle();
    setIsSyncing(false);
  };

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
             <UserIcon className="text-emerald-600" /> Contatos
           </h2>
           <p className="text-slate-500">Gerencie sua agenda e sincronize com o Google Contacts.</p>
        </div>
        <button 
          onClick={handleSync}
          disabled={isSyncing}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-medium disabled:opacity-70"
        >
          {isSyncing ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
          {isSyncing ? 'Sincronizando...' : 'Sincronizar Google Contacts'}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        {/* Search Bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50">
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Buscar por nome, telefone ou email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
            </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Nome</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Telefone</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Email</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Origem</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Última Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredContacts.map(contact => (
                <tr key={contact.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs">
                          {contact.name.charAt(0)}
                      </div>
                      <span className="font-medium text-slate-800">{contact.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-mono text-sm">{contact.phone}</td>
                  <td className="px-6 py-4 text-slate-600 text-sm">
                      {contact.email ? (
                          <span className="flex items-center gap-1"><Mail size={14} className="text-slate-400"/> {contact.email}</span>
                      ) : '-'}
                  </td>
                  <td className="px-6 py-4">
                    {contact.source === 'google' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                             Google
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            Manual
                        </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                      {contact.lastSync ? contact.lastSync.toLocaleDateString() + ' ' + contact.lastSync.toLocaleTimeString() : '-'}
                  </td>
                </tr>
              ))}
              {filteredContacts.length === 0 && (
                  <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-400">
                          Nenhum contato encontrado.
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Contacts;
