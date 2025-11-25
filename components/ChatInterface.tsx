import React, { useState, useEffect, useRef } from 'react';
import { Send, MoreVertical, Paperclip, Search, MessageSquare, Bot, ArrowRightLeft, Check, CheckCheck, Mic, X, File as FileIcon, Image as ImageIcon, Play, Pause, Square, Trash2 } from 'lucide-react';
import { Chat, Department, Message, MessageStatus, User, ApiConfig, MessageType } from '../types';
import { generateSmartReply } from '../services/geminiService';
import { sendRealMessage, sendRealMediaMessage, blobToBase64 } from '../services/whatsappService';

interface ChatInterfaceProps {
  chats: Chat[];
  departments: Department[];
  currentUser: User;
  onUpdateChat: (chat: Chat) => void;
  apiConfig: ApiConfig;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ chats, departments, currentUser, onUpdateChat, apiConfig }) => {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [filterText, setFilterText] = useState('');
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // File & Media States
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);

  const selectedChat = chats.find(c => c.id === selectedChatId);

  const filteredChats = chats.filter(chat => 
    chat.contactName.toLowerCase().includes(filterText.toLowerCase()) ||
    chat.contactNumber.includes(filterText)
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [selectedChat?.messages]);

  // --- DRAG AND DROP HANDLERS ---
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // --- FILE HANDLING ---
  const handleFileSelect = (file: File) => {
    if (!file) return;
    
    // Check size (limit to 16MB for demo)
    if (file.size > 16 * 1024 * 1024) {
      alert("Arquivo muito grande. Limite de 16MB.");
      return;
    }

    setSelectedFile(file);

    // Create preview if it's an image
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setFilePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const clearAttachment = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- AUDIO RECORDING ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Erro ao acessar microfone:", err);
      // Tratamento para ambientes sem HTTPS ou permissões bloqueadas
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
          alert("Acesso ao microfone negado. Por favor, permita o acesso nas configurações do navegador.");
      } else {
          alert("Não foi possível acessar o microfone. Verifique se seu dispositivo possui um microfone conectado ou se o site possui permissão (HTTPS necessário).");
      }
    }
  };

  const stopRecording = (shouldSend: boolean) => {
    if (!mediaRecorderRef.current) return;

    mediaRecorderRef.current.onstop = async () => {
      if (shouldSend && selectedChat) {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' }); // webm/mp3 dependendo do browser
        await sendMediaMessage(audioBlob, 'audio');
      }
      
      // Cleanup
      const tracks = mediaRecorderRef.current?.stream.getTracks();
      tracks?.forEach(track => track.stop());
      mediaRecorderRef.current = null;
    };

    mediaRecorderRef.current.stop();
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setRecordingTime(0);
  };

  const cancelRecording = () => {
    stopRecording(false);
  };

  // --- SENDING LOGIC ---
  const sendMediaMessage = async (blob: Blob | File, type: 'image' | 'audio' | 'document' | 'video') => {
    if (!selectedChat) return;
    setIsSending(true);

    const base64Preview = await blobToBase64(blob);

    const newMessage: Message = {
      id: `m_${Date.now()}`,
      content: type === 'audio' ? 'Áudio' : (inputText || (type === 'image' ? 'Imagem' : 'Arquivo')),
      sender: 'agent',
      timestamp: new Date(),
      status: MessageStatus.SENT,
      type: type,
      mediaUrl: base64Preview, // Para demo, usamos base64 como URL
      mimeType: blob.type,
      fileName: selectedFile?.name
    };

    updateChatWithNewMessage(newMessage);

    // Send to API
    const success = await sendRealMediaMessage(apiConfig, selectedChat.contactNumber, blob, inputText, type, selectedFile?.name);
    
    finalizeMessageStatus(newMessage, success);
    
    setIsSending(false);
    clearAttachment();
    setInputText('');
  };

  const handleSendMessage = async () => {
    if (!selectedChat) return;

    // Se tiver arquivo selecionado, envia como mídia
    if (selectedFile) {
        const type = selectedFile.type.startsWith('image/') ? 'image' : 
                     selectedFile.type.startsWith('video/') ? 'video' : 'document';
        await sendMediaMessage(selectedFile, type);
        return;
    }

    if (!inputText.trim()) return;
    setIsSending(true);

    const newMessage: Message = {
      id: `m_${Date.now()}`,
      content: inputText,
      sender: 'agent',
      timestamp: new Date(),
      status: MessageStatus.SENT,
      type: 'text'
    };

    updateChatWithNewMessage(newMessage);

    const success = await sendRealMessage(apiConfig, selectedChat.contactNumber, inputText);
    
    finalizeMessageStatus(newMessage, success);
    setIsSending(false);
    setInputText('');
  };

  // Helpers for optimistic UI updates
  const updateChatWithNewMessage = (msg: Message) => {
    if (!selectedChat) return;
    const updatedChat = {
      ...selectedChat,
      messages: [...selectedChat.messages, msg],
      lastMessage: msg.type === 'text' ? msg.content : `📷 ${msg.type}`,
      lastMessageTime: new Date(),
      status: 'open' as const
    };
    onUpdateChat(updatedChat);
  };

  const finalizeMessageStatus = (msg: Message, success: boolean) => {
    if (!selectedChat) return;
    // Precisamos buscar o chat atualizado do estado (pode ter mudado se user digitou rapido)
    // Para simplificar aqui, vamos assumir o selectedChat atual
    // Num app real usariamos um gerenciador de estado global mais robusto
    if (success) {
       // Atualiza status localmente
       // Nota: A lógica real de atualização viria via webhook/socket
    }
  };

  const handleTransfer = (deptId: string) => {
    if (!selectedChat) return;
    const updatedChat = {
      ...selectedChat,
      departmentId: deptId,
      messages: [
        ...selectedChat.messages,
        {
          id: `sys_${Date.now()}`,
          content: `Atendimento transferido para ${departments.find(d => d.id === deptId)?.name}`,
          sender: 'system' as const,
          timestamp: new Date(),
          status: MessageStatus.READ,
          type: 'text' as const
        }
      ]
    };
    onUpdateChat(updatedChat);
    setIsTransferModalOpen(false);
  };

  const handleGenerateAI = async () => {
    if (!selectedChat) return;
    setIsGeneratingAI(true);
    const suggestion = await generateSmartReply(selectedChat.messages, selectedChat.contactName);
    setInputText(suggestion);
    setIsGeneratingAI(false);
  };

  const getDepartmentName = (id: string | null) => {
    if (!id) return 'Sem Departamento';
    return departments.find(d => d.id === id)?.name || 'Desconhecido';
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- RENDER MESSAGE CONTENT ---
  const renderMessageContent = (msg: Message) => {
    if (msg.type === 'image' && msg.mediaUrl) {
      return (
        <div className="flex flex-col">
          <img 
            src={msg.mediaUrl} 
            alt="Imagem enviada" 
            className="rounded-lg max-w-full sm:max-w-sm mb-1 object-cover max-h-64 cursor-pointer hover:opacity-95" 
            onClick={() => window.open(msg.mediaUrl, '_blank')}
          />
          {msg.content && msg.content !== 'Imagem' && (
             <p className="text-sm mt-1">{msg.content}</p>
          )}
        </div>
      );
    }

    if (msg.type === 'audio' && msg.mediaUrl) {
      return (
        <div className="flex items-center gap-2 min-w-[200px]">
           <audio controls src={msg.mediaUrl} className="w-full h-8" />
        </div>
      );
    }

    if (msg.type === 'document') {
       return (
           <div className="flex items-center gap-3 bg-black/5 p-3 rounded-lg">
               <div className="bg-white p-2 rounded-full text-emerald-600">
                   <FileIcon size={20} />
               </div>
               <div className="flex-1 overflow-hidden">
                   <p className="text-sm font-medium truncate">{msg.fileName || 'Documento'}</p>
                   <p className="text-xs opacity-70 uppercase">{msg.mimeType?.split('/')[1] || 'FILE'}</p>
               </div>
               {msg.mediaUrl && (
                  <a href={msg.mediaUrl} download={msg.fileName} className="p-2 text-emerald-700 hover:bg-emerald-100 rounded-full">
                      <ArrowRightLeft className="rotate-90" size={16} />
                  </a>
               )}
           </div>
       );
    }

    return <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{msg.content}</p>;
  };

  return (
    <div className="flex h-full bg-white rounded-lg shadow-sm overflow-hidden border border-slate-200">
      {/* Sidebar List */}
      <div className="w-1/3 border-r border-slate-200 flex flex-col bg-slate-50">
        <div className="p-4 bg-white border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar conversas..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {filteredChats.map(chat => (
            <div 
              key={chat.id}
              onClick={() => setSelectedChatId(chat.id)}
              className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-emerald-50 transition-colors ${selectedChatId === chat.id ? 'bg-emerald-50 border-emerald-200' : ''}`}
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-3">
                  <img src={chat.contactAvatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <h3 className="font-semibold text-slate-800 text-sm">{chat.contactName}</h3>
                    <p className="text-xs text-slate-500">{chat.contactNumber}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block whitespace-nowrap">
                    {chat.lastMessageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {chat.unreadCount > 0 && (
                    <span className="inline-block bg-emerald-500 text-white text-xs px-2 py-0.5 rounded-full mt-1">
                      {chat.unreadCount}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center mt-2">
                <div className="flex items-center gap-1 text-slate-600 max-w-[180px]">
                    {chat.messages[chat.messages.length -1]?.type === 'image' && <ImageIcon size={12} />}
                    {chat.messages[chat.messages.length -1]?.type === 'audio' && <Mic size={12} />}
                    <p className="text-sm truncate">{chat.lastMessage}</p>
                </div>
                {chat.departmentId && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600`}>
                    {getDepartmentName(chat.departmentId)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area with Drag & Drop */}
      <div 
        className="flex-1 flex flex-col bg-[#e5ddd5] relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && selectedChat && (
          <div className="absolute inset-0 z-50 bg-emerald-600/10 backdrop-blur-sm border-4 border-emerald-500 border-dashed m-4 rounded-xl flex items-center justify-center">
             <div className="bg-white p-8 rounded-full shadow-xl animate-bounce">
                <FileIcon size={48} className="text-emerald-600" />
             </div>
             <p className="absolute mt-32 text-emerald-800 font-bold text-xl">Solte o arquivo para enviar</p>
          </div>
        )}

        {selectedChat ? (
          <>
            {/* Header */}
            <div className="h-16 bg-emerald-700 flex items-center justify-between px-4 text-white shadow-sm z-10">
              <div className="flex items-center gap-3">
                <img src={selectedChat.contactAvatar} alt="" className="w-10 h-10 rounded-full bg-white" />
                <div>
                  <h2 className="font-semibold">{selectedChat.contactName}</h2>
                  <p className="text-xs opacity-90 text-emerald-100">
                    {getDepartmentName(selectedChat.departmentId)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsTransferModalOpen(true)}
                  className="p-2 hover:bg-emerald-600 rounded-full transition-colors tooltip relative group"
                  title="Transferir Setor"
                >
                  <ArrowRightLeft size={20} />
                </button>
                <button className="p-2 hover:bg-emerald-600 rounded-full transition-colors">
                  <MoreVertical size={20} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat' }}>
              {selectedChat.messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-start' : msg.sender === 'system' ? 'justify-center' : 'justify-end'}`}>
                  {msg.sender === 'system' ? (
                     <div className="bg-emerald-100 text-emerald-800 text-xs px-3 py-1 rounded-full shadow-sm my-2">
                        {msg.content}
                     </div>
                  ) : (
                    <div className={`max-w-[70%] rounded-lg px-2 py-2 shadow-sm relative ${
                      msg.sender === 'user' ? 'bg-white rounded-tl-none' : 'bg-emerald-100 rounded-tr-none'
                    }`}>
                      {/* Render Content Based on Type */}
                      <div className="px-2 pt-1">
                        {renderMessageContent(msg)}
                      </div>

                      <div className="flex justify-end items-center gap-1 mt-1 pr-2 pb-1">
                        <span className="text-[10px] text-slate-500">
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {msg.sender === 'agent' && (
                          msg.status === MessageStatus.READ ? <CheckCheck size={14} className="text-blue-500" /> : <Check size={14} className="text-slate-400" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-slate-100 p-3 relative z-20">
              
              {/* Attachment Preview Area */}
              {selectedFile && (
                <div className="bg-slate-200 p-3 rounded-t-lg border-b border-slate-300 flex items-center justify-between animate-in slide-in-from-bottom-2">
                   <div className="flex items-center gap-3 overflow-hidden">
                      {filePreview ? (
                        <img src={filePreview} className="w-12 h-12 object-cover rounded-md border border-white" alt="Preview" />
                      ) : (
                        <div className="w-12 h-12 bg-white rounded-md flex items-center justify-center text-emerald-600"><FileIcon /></div>
                      )}
                      <div>
                         <p className="text-sm font-semibold truncate max-w-[200px] text-slate-800">{selectedFile.name}</p>
                         <p className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                   </div>
                   <button onClick={clearAttachment} className="p-1 hover:bg-slate-300 rounded-full text-slate-500">
                      <X size={20} />
                   </button>
                </div>
              )}

              {/* AI Badge */}
              {isGeneratingAI && (
                <div className="absolute -top-10 left-4 bg-emerald-600 text-white text-xs px-3 py-1 rounded-full animate-pulse flex items-center gap-2">
                   <Bot size={12} /> Gemini AI gerando resposta...
                </div>
              )}
              
              <div className="flex items-center gap-2">
                
                {/* File Input */}
                <input 
                   type="file" 
                   ref={fileInputRef}
                   className="hidden" 
                   onChange={(e) => e.target.files && e.target.files.length > 0 && handleFileSelect(e.target.files[0])}
                />

                {isRecording ? (
                    // Recording UI
                    <div className="flex-1 flex items-center gap-4 bg-white px-4 py-3 rounded-full shadow-sm animate-in fade-in">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-slate-700 font-mono font-medium min-w-[50px]">{formatTime(recordingTime)}</span>
                        <div className="flex-1 text-xs text-slate-400">Gravando áudio...</div>
                        
                        <button 
                          onClick={cancelRecording} 
                          className="p-2 text-red-500 hover:bg-red-50 rounded-full"
                          title="Cancelar"
                        >
                            <Trash2 size={20} />
                        </button>
                        <button 
                           onClick={() => stopRecording(true)} 
                           className="p-2 bg-emerald-500 text-white rounded-full hover:bg-emerald-600"
                           title="Enviar Áudio"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                ) : (
                    // Standard Input UI
                    <>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className={`p-2 rounded-full transition-colors ${selectedFile ? 'text-emerald-600 bg-emerald-100' : 'text-slate-500 hover:bg-slate-200'}`}
                        >
                            <Paperclip size={20} />
                        </button>
                        
                        <div className="flex-1 relative">
                            <input 
                            type="text" 
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder={selectedFile ? "Adicione uma legenda..." : "Digite uma mensagem"}
                            disabled={isSending}
                            className={`w-full px-4 py-3 rounded-lg border-none focus:ring-0 outline-none bg-white shadow-sm pr-10 ${selectedFile ? 'rounded-tl-none rounded-tr-none' : ''}`}
                            />
                            {!inputText && !selectedFile && (
                                <button 
                                    onClick={handleGenerateAI}
                                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-purple-600 hover:text-purple-700 hover:bg-purple-50 p-1.5 rounded-full transition-colors"
                                    title="Sugerir resposta com IA"
                                >
                                <Bot size={18} />
                                </button>
                            )}
                        </div>

                        {inputText || selectedFile ? (
                            <button 
                                onClick={handleSendMessage}
                                disabled={isSending}
                                className="p-3 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 shadow-md transition-transform hover:scale-105 active:scale-95 disabled:bg-slate-400 disabled:scale-100"
                            >
                                <Send size={20} />
                            </button>
                        ) : (
                            <button 
                                onClick={startRecording}
                                className="p-3 bg-slate-200 text-slate-600 rounded-full hover:bg-slate-300 shadow-sm transition-transform hover:scale-105 active:scale-95"
                            >
                                <Mic size={20} />
                            </button>
                        )}
                    </>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50 border-b-8 border-emerald-500">
            <div className="bg-emerald-100 p-6 rounded-full mb-4">
               <MessageSquare size={48} className="text-emerald-600" />
            </div>
            <h2 className="text-xl font-medium text-slate-700">ZapFlow Manager</h2>
            <p className="mt-2 text-sm">Selecione uma conversa para iniciar o atendimento</p>
            <p className="mt-1 text-xs text-slate-400">Envie mensagens, áudios e arquivos facilmente.</p>
          </div>
        )}
      </div>

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-96 p-6 animate-in zoom-in duration-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Transferir Atendimento</h3>
            <p className="text-sm text-slate-500 mb-4">Selecione o departamento para transferir o cliente <b>{selectedChat?.contactName}</b>.</p>
            
            <div className="space-y-2 mb-6">
              {departments.map(dept => (
                <button
                  key={dept.id}
                  onClick={() => handleTransfer(dept.id)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all flex items-center justify-between group"
                >
                  <span className="font-medium text-slate-700 group-hover:text-emerald-700">{dept.name}</span>
                  <div className={`w-3 h-3 rounded-full ${dept.color}`} />
                </button>
              ))}
            </div>
            
            <button 
              onClick={() => setIsTransferModalOpen(false)}
              className="w-full py-2 text-slate-500 hover:text-slate-700 font-medium text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatInterface;