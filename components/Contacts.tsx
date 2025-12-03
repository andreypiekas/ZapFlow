import React, { useState, useRef } from 'react';
import { Contact } from '../types';
import { RefreshCw, Search, Mail, User as UserIcon, Check, Loader2, AlertTriangle, Upload, FileText, Plus, MessageSquare } from 'lucide-react';

// Declare Google Global
declare const google: any;

interface ContactsProps {
  contacts: Contact[];
  onSyncGoogle: (contacts?: Contact[]) => Promise<void>;
  onImportCSV: (contacts: Contact[]) => Promise<void>;
  onAddContact: (contact: Contact) => void;
  onStartChat: (contact: Contact) => void;
  clientId?: string;
}

const Contacts: React.FC<ContactsProps> = ({ contacts, onSyncGoogle, onImportCSV, onAddContact, onStartChat, clientId }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSync = async () => {
    setError(null);

    // 1. Validate Client ID
    if (!clientId) {
        setError('Google Client ID não configurado. Acesse Configurações.');
        return;
    }

    // 2. Check if GSI is loaded
    if (typeof google === 'undefined') {
        setError('Biblioteca do Google não carregada. Verifique sua conexão.');
        return;
    }

    setIsSyncing(true);

    try {
        const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/contacts.readonly',
            callback: async (tokenResponse: any) => {
                if (tokenResponse && tokenResponse.access_token) {
                    await fetchGoogleContacts(tokenResponse.access_token);
                } else {
                    setIsSyncing(false);
                }
            },
        });
        
        // Trigger Popup
        tokenClient.requestAccessToken();

    } catch (err) {
        console.error(err);
        setError('Erro ao iniciar autenticação Google.');
        setIsSyncing(false);
    }
  };

  const fetchGoogleContacts = async (accessToken: string) => {
      try {
          const response = await fetch(
              'https://people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers,emailAddresses,photos&pageSize=1000', 
              {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
              }
          );
          
          if (!response.ok) throw new Error('Falha ao buscar contatos na API People.');

          const data = await response.json();
          
          if (data.connections) {
              const mappedContacts: Contact[] = data.connections.map((person: any) => {
                  const name = person.names?.[0]?.displayName || 'Sem Nome';
                  const phone = person.phoneNumbers?.[0]?.value || '';
                  const email = person.emailAddresses?.[0]?.value;
                  const avatar = person.photos?.[0]?.url;
                  const resourceName = person.resourceName;

                  return {
                      id: resourceName || `g_${Date.now()}_${Math.random()}`,
                      name,
                      phone,
                      email,
                      avatar,
                      source: 'google',
                      lastSync: new Date()
                  } as Contact;
              }).filter((c: Contact) => c.phone); // Filter out contacts without phone

              await onSyncGoogle(mappedContacts);
          } else {
              // No connections found or empty
              await onSyncGoogle([]);
          }

      } catch (err) {
          console.error(err);
          setError('Erro ao baixar contatos do Google.');
      } finally {
          setIsSyncing(false);
      }
  };

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setError('Por favor, selecione um arquivo CSV válido.');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setError('O arquivo CSV deve ter pelo menos um cabeçalho e uma linha de dados.');
        setIsImporting(false);
        return;
      }

      // Detecta o separador (vírgula ou ponto e vírgula)
      const firstLine = lines[0];
      const separator = firstLine.includes(';') ? ';' : ',';
      
      // Parse do cabeçalho (case-insensitive)
      const headers = lines[0].split(separator).map(h => h.trim());
      const headersLower = headers.map(h => h.toLowerCase());
      
      // Encontra índices das colunas (suporta formato Google Contacts e outros)
      // Nome: First Name, Last Name, Name, Nome, etc.
      const firstNameIndex = headersLower.findIndex(h => h === 'first name' || h === 'nome');
      const lastNameIndex = headersLower.findIndex(h => h === 'last name' || h === 'sobrenome');
      const middleNameIndex = headersLower.findIndex(h => h === 'middle name' || h === 'nome do meio');
      const nameIndex = headersLower.findIndex(h => 
        (h.includes('nome') || h.includes('name')) && 
        !h.includes('first') && !h.includes('last') && !h.includes('middle') &&
        !h.includes('phonetic') && !h.includes('prefix') && !h.includes('suffix')
      );
      
      // Telefone: Phone 1, Phone 2, Phone, Telefone, etc.
      const phoneIndices: number[] = [];
      headersLower.forEach((h, idx) => {
        if ((h.includes('phone') || h.includes('telefone') || h.includes('celular') || h.includes('whatsapp')) &&
            !h.includes('label') && !h.includes('etiqueta')) {
          phoneIndices.push(idx);
        }
      });
      
      // Email
      const emailIndex = headersLower.findIndex(h => h.includes('email') || h.includes('e-mail'));
      
      // Valida se encontrou pelo menos nome e telefone
      const hasName = firstNameIndex !== -1 || lastNameIndex !== -1 || nameIndex !== -1;
      const hasPhone = phoneIndices.length > 0;
      
      if (!hasName || !hasPhone) {
        setError('O CSV deve conter colunas de Nome e Telefone. Formato Google Contacts suportado.');
        setIsImporting(false);
        return;
      }

      const importedContacts: Contact[] = [];
      
      // Processa cada linha (pula o cabeçalho)
      for (let i = 1; i < lines.length; i++) {
        // Parse mais robusto que lida com vírgulas dentro de campos entre aspas
        const values: string[] = [];
        let currentValue = '';
        let insideQuotes = false;
        
        for (let j = 0; j < lines[i].length; j++) {
          const char = lines[i][j];
          if (char === '"') {
            insideQuotes = !insideQuotes;
          } else if ((char === separator || char === '\r') && !insideQuotes) {
            values.push(currentValue.trim());
            currentValue = '';
          } else {
            currentValue += char;
          }
        }
        values.push(currentValue.trim()); // Último valor
        
        // Monta o nome completo
        let fullName = '';
        if (firstNameIndex !== -1 || lastNameIndex !== -1) {
          const firstName = firstNameIndex !== -1 ? (values[firstNameIndex] || '') : '';
          const middleName = middleNameIndex !== -1 ? (values[middleNameIndex] || '') : '';
          const lastName = lastNameIndex !== -1 ? (values[lastNameIndex] || '') : '';
          fullName = [firstName, middleName, lastName].filter(n => n).join(' ').trim();
        } else if (nameIndex !== -1) {
          fullName = values[nameIndex] || '';
        }
        
        // Tenta encontrar um telefone válido (prioriza Phone 1, depois Phone 2, etc.)
        let phone = '';
        for (const phoneIdx of phoneIndices) {
          const phoneValue = values[phoneIdx] || '';
          // Remove espaços, hífens, parênteses, mas mantém o + se presente
          const cleanPhone = phoneValue.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');
          // Verifica se tem pelo menos 8 dígitos (sem contar o +)
          if (cleanPhone.length >= 8) {
            phone = phoneValue.trim();
            break; // Usa o primeiro telefone válido encontrado
          }
        }
        
        const email = emailIndex >= 0 ? (values[emailIndex] || undefined) : undefined;
        
        // Valida se tem nome e telefone
        if (fullName && phone) {
          importedContacts.push({
            id: `csv_${Date.now()}_${i}_${Math.random()}`,
            name: fullName,
            phone: phone,
            email: email?.trim(),
            source: 'csv',
            lastSync: new Date()
          });
        }
      }

      if (importedContacts.length === 0) {
        setError('Nenhum contato válido encontrado no CSV. Verifique se os dados estão corretos.');
        setIsImporting(false);
        return;
      }

      await onImportCSV(importedContacts);
      
      // Limpa o input para permitir importar o mesmo arquivo novamente
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
    } catch (err) {
      console.error('Erro ao importar CSV:', err);
      setError('Erro ao processar o arquivo CSV. Verifique se o formato está correto.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleAddNewContact = () => {
    if (!newContactName.trim() || !newContactPhone.trim()) {
      setError('Nome e telefone são obrigatórios.');
      return;
    }

    const phoneDigits = newContactPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      setError('Telefone inválido. Digite DDD + Número (ex: 11999999999).');
      return;
    }

    const newContact: Contact = {
      id: `manual_${Date.now()}_${Math.random()}`,
      name: newContactName.trim(),
      phone: newContactPhone.trim(),
      email: newContactEmail.trim() || undefined,
      source: 'manual',
      lastSync: new Date()
    };

    onAddContact(newContact);
    setIsAddModalOpen(false);
    setNewContactName('');
    setNewContactPhone('');
    setNewContactEmail('');
    setError(null);
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
        
        <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="bg-slate-600 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-medium"
                >
                  <Plus size={20} />
                  Adicionar Contato
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportCSV}
                  accept=".csv"
                  className="hidden"
                  id="csv-import-input"
                />
                <label
                  htmlFor="csv-import-input"
                  className={`bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-medium cursor-pointer disabled:opacity-70 ${isImporting ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isImporting ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
                  {isImporting ? 'Importando...' : 'Importar CSV'}
                </label>
                <button 
                onClick={handleSync}
                disabled={isSyncing}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors shadow-sm font-medium disabled:opacity-70"
                >
                {isSyncing ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
                {isSyncing ? 'Sincronizando...' : 'Sincronizar Google Contacts'}
                </button>
            </div>
            {!clientId && (
                <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded border border-red-100 flex items-center gap-1">
                    <AlertTriangle size={10} /> Configure o Client ID nas Configurações
                </span>
            )}
        </div>
      </div>

      {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center gap-2 animate-in slide-in-from-top-2">
              <AlertTriangle size={20} />
              {error}
          </div>
      )}

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
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredContacts.map(contact => {
                const cleaned = contact.phone.replace(/\D/g, '');
                const isShort = cleaned.length > 0 && cleaned.length < 10;
                
                return (
                <tr key={contact.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {contact.avatar ? (
                          <img src={contact.avatar} alt={contact.name} className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs">
                            {contact.name.charAt(0)}
                        </div>
                      )}
                      <span className="font-medium text-slate-800">{contact.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-mono text-sm flex items-center gap-2">
                      {contact.phone}
                      {isShort && (
                          <span title="Número parece incompleto (sem DDD?)" className="text-amber-500 cursor-help"><AlertTriangle size={14}/></span>
                      )}
                  </td>
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
                    ) : contact.source === 'csv' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <FileText size={12} /> CSV
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            Manual
                        </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                      {contact.lastSync ? new Date(contact.lastSync).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => onStartChat(contact)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors"
                      title="Iniciar chat com este contato"
                    >
                      <MessageSquare size={14} />
                      Chat
                    </button>
                  </td>
                </tr>
              )})}
              {filteredContacts.length === 0 && (
                  <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                          Nenhum contato encontrado.
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal para Adicionar Contato */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-4">Adicionar Novo Contato</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Nome completo"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Telefone <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="11999999999"
                />
                <p className="text-xs text-slate-400 mt-1">Digite DDD + Número (ex: 11999999999)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email (opcional)
                </label>
                <input
                  type="email"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setNewContactName('');
                  setNewContactPhone('');
                  setNewContactEmail('');
                  setError(null);
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddNewContact}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Contacts;