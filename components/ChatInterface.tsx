import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MoreVertical, Paperclip, Search, MessageSquare, Bot, ArrowRightLeft, Check, CheckCheck, Mic, X, File as FileIcon, Image as ImageIcon, Play, Pause, Square, Trash2, ArrowLeft, Zap, CheckCircle, ThumbsUp, Edit3, Save, ListChecks, ArrowRight, ChevronDown, ChevronUp, UserPlus, Lock, RefreshCw, Smile, Tag, Plus, Clock, User as UserIcon, AlertTriangle } from 'lucide-react';
import { Chat, Department, Message, MessageStatus, User, ApiConfig, MessageType, QuickReply, Workflow, ActiveWorkflow, Contact } from '../types';
import { generateSmartReply } from '../services/geminiService';
import { sendRealMessage, sendRealMediaMessage, blobToBase64 } from '../services/whatsappService';
import { AVAILABLE_TAGS, EMOJIS, STICKERS } from '../constants';

interface ChatInterfaceProps {
  chats: Chat[];
  departments: Department[];
  currentUser: User;
  onUpdateChat: (chat: Chat) => void;
  apiConfig: ApiConfig;
  quickReplies?: QuickReply[];
  workflows?: Workflow[];
  contacts?: Contact[];
  forceSelectChatId?: string | null; // Força a seleção de um chat específico
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ chats, departments, currentUser, onUpdateChat, apiConfig, quickReplies = [], workflows = [], contacts = [], forceSelectChatId }) => {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  
  // Força a seleção de um chat quando forceSelectChatId é fornecido
  useEffect(() => {
    if (forceSelectChatId && chats.some(c => c.id === forceSelectChatId)) {
      setSelectedChatId(forceSelectChatId);
    }
  }, [forceSelectChatId, chats]);
  
  // Helper function para extrair número válido do chat
  const getValidPhoneNumber = (chat: Chat): string => {
    console.log(`[NumberDebug] Iniciando busca para chat ID: ${chat.id}, contactNumber: ${chat.contactNumber}, mensagens: ${chat.messages.length}`);
    
    // PRIMEIRO: Tenta extrair do ID do chat se for um JID válido (número completo)
    let targetNumber = '';
    if (chat.id.includes('@') && !chat.id.includes('@g.us') && !chat.id.includes('@lid') && !chat.id.startsWith('chat_') && !chat.id.includes('cmin')) {
        const jidFromId = chat.id.split('@')[0];
        const jidDigits = jidFromId.replace(/\D/g, '').length;
        // Aceita números com 10-14 dígitos (números muito longos podem ser IDs de lista de difusão)
        // Números de telefone válidos: 10-13 dígitos (com DDI), máximo 14 para casos especiais
        if (jidDigits >= 10 && jidDigits <= 14) {
            targetNumber = jidFromId.replace(/\D/g, '');
            console.log(`[NumberFix] Número encontrado no ID do chat: ${targetNumber} de ${chat.id}`);
        } else if (jidDigits > 14) {
            console.log(`[NumberFix] Ignorando número muito longo (provavelmente ID de lista): ${jidFromId} (${jidDigits} dígitos)`);
        }
    }
    
    // SEGUNDO: Tenta extrair das mensagens (fonte mais confiável)
    const targetDigits = targetNumber.replace(/\D/g, '').length;
    if (!targetNumber || targetDigits < 10) {
        const allMessages = chat.messages.filter(m => m.author);
        console.log(`[NumberDebug] Procurando em ${allMessages.length} mensagens com author`);
        
        // Procura em TODAS as mensagens (user e agent) pelo número mais completo
        for (const msg of allMessages.reverse()) {
            if (msg.author) {
                const realJid = msg.author;
                // Ignora JIDs de listas de difusão (@lid) e grupos (@g.us)
                if (realJid.includes('@lid') || realJid.includes('@g.us')) {
                    console.log(`[NumberDebug] Ignorando JID de lista/grupo: ${realJid}`);
                    continue;
                }
                const realNumber = realJid.includes('@') ? realJid.split('@')[0] : realJid;
                const realDigits = realNumber.replace(/\D/g, '').length;
                
                console.log(`[NumberDebug] Mensagem author: ${msg.author} -> número: ${realNumber} (${realDigits} dígitos)`);
                
                // Se encontrar um número válido (10-14 dígitos) e for mais completo que o atual, usa ele
                // Números muito longos (>14 dígitos) podem ser IDs de lista de difusão
                if (realDigits >= 10 && realDigits <= 14 && realDigits > targetDigits) {
                    targetNumber = realNumber.replace(/\D/g, '');
                    console.log(`[NumberFix] Número encontrado nas mensagens: ${targetNumber} de ${msg.author}`);
                    break;
                } else if (realDigits > 14) {
                    console.log(`[NumberDebug] Ignorando número muito longo nas mensagens: ${realNumber} (${realDigits} dígitos)`);
                }
            }
        }
    }
    
    // TERCEIRO: Se não encontrou nas mensagens, verifica contactNumber (mas ignora IDs gerados)
    const currentTargetDigits = targetNumber.replace(/\D/g, '').length;
    if (!targetNumber || currentTargetDigits < 10) {
        // Ignora contactNumber se for um ID gerado (contém letras ou é muito curto)
        const contactDigitsStr = chat.contactNumber?.replace(/\D/g, '') || '';
        const contactIsValid = chat.contactNumber && 
                               !chat.contactNumber.includes('cmin') && 
                               !chat.contactNumber.startsWith('chat_') &&
                               /^\d+$/.test(contactDigitsStr) &&
                               contactDigitsStr.length >= 10;
        
        if (contactIsValid) {
            const contactDigits = contactDigitsStr.length;
            const currentDigits = currentTargetDigits || 0;
            
            // Usa contactNumber se for mais completo
            if (contactDigits > currentDigits) {
                targetNumber = chat.contactNumber.replace(/\D/g, '');
                console.log(`[NumberFix] Usando contactNumber válido: ${targetNumber}`);
            }
        }
    }
    
    // QUARTO: Se ainda não tiver, tenta extrair do ID do chat (se for número puro)
    const finalTargetDigits = targetNumber.replace(/\D/g, '').length;
    if (!targetNumber || finalTargetDigits < 10) {
        // Ignora JIDs de listas de difusão (@lid) e grupos (@g.us)
        if (!chat.id.includes('@lid') && !chat.id.includes('@g.us')) {
            let idFromChatId = chat.id.split('@')[0];
            const idDigits = idFromChatId.replace(/\D/g, '');
            const idIsValidNumber = /^\d+$/.test(idDigits) && 
                                    idDigits.length >= 10 &&
                                    idDigits.length <= 14 && // Números muito longos podem ser IDs de lista
                                    !idFromChatId.includes('cmin') &&
                                    !idFromChatId.startsWith('chat_');
            
            if (idIsValidNumber) {
                targetNumber = idFromChatId.replace(/\D/g, '');
                console.log(`[NumberFix] Usando ID do chat (número puro): ${targetNumber}`);
            } else if (idDigits > 14) {
                console.log(`[NumberFix] Ignorando ID do chat muito longo (provavelmente ID de lista): ${idFromChatId} (${idDigits} dígitos)`);
            }
        }
    }
    
    // ÚLTIMO RECURSO: Se ainda não tiver número válido, tenta usar contactNumber mesmo que curto (mas só se for número válido)
    const lastTargetDigits = targetNumber.replace(/\D/g, '').length;
    if ((!targetNumber || lastTargetDigits < 10) && chat.contactNumber) {
        const contactDigits = chat.contactNumber.replace(/\D/g, '').length;
        const contactIsNumber = /^\d+$/.test(chat.contactNumber.replace(/\D/g, ''));
        const contactIsGenerated = chat.contactNumber.includes('cmin') || chat.contactNumber.startsWith('chat_');
        
        // Só usa se for um número (não ID gerado) e tiver pelo menos 10 dígitos
        if (contactIsNumber && !contactIsGenerated && contactDigits >= 10) {
            targetNumber = chat.contactNumber.replace(/\D/g, '');
            console.log(`[NumberFix] Usando contactNumber válido: ${targetNumber} (${contactDigits} dígitos)`);
        } else {
            console.error(`[NumberError] Não foi possível encontrar número válido! Chat ID: ${chat.id}, contactNumber: ${chat.contactNumber} (${contactDigits} dígitos, gerado: ${contactIsGenerated})`);
            console.error(`[NumberError] Mensagens: ${chat.messages.length}, Authors: ${chat.messages.filter(m => m.author).length}`);
            // Retorna string vazia para indicar erro - não deve tentar enviar
            return '';
        }
    }
    
    // Validação final: não permite envio com número inválido
    // Aceita números com 10-14 dígitos (formatPhoneForApi adiciona DDI 55 se necessário)
    // Números muito longos (>14 dígitos) são provavelmente IDs de lista de difusão
    const finalDigits = targetNumber.replace(/\D/g, '').length;
    if (!targetNumber || finalDigits < 10 || finalDigits > 14) {
        console.error(`[NumberError] Número inválido para envio: ${targetNumber} (${finalDigits} dígitos). Números válidos têm 10-14 dígitos.`);
        return '';
    }
    
    return targetNumber;
  };
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null); // Mensagem que está sendo respondida
  const [filterText, setFilterText] = useState('');
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Resizable Sidebar State
  const [listWidth, setListWidth] = useState(380); // Default width in pixels
  const [isResizing, setIsResizing] = useState(false);

  // Tabs: 'todo' (Inbox/User replied), 'waiting' (Agent replied), 'closed'
  const [activeTab, setActiveTab] = useState<'todo' | 'waiting' | 'closed'>('todo');
  
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showWorkflowsMenu, setShowWorkflowsMenu] = useState(false);
  const [isFinishingModalOpen, setIsFinishingModalOpen] = useState(false);
  const [isWorkflowCollapsed, setIsWorkflowCollapsed] = useState(false);
  
  // New Features States
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [messageSearchTerm, setMessageSearchTerm] = useState('');

  // New Chat Modal
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatInput, setNewChatInput] = useState('');

  // Options Menu
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  // Contact Editing States
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editContactName, setEditContactName] = useState('');
  const [editClientCode, setEditClientCode] = useState('');
  
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

  // Derived States for Assignment
  const isAssigned = !!selectedChat?.assignedTo;
  const isAssignedToMe = selectedChat?.assignedTo === currentUser.id;
  
  // Validation Logic
  const isLID = selectedChat?.id?.includes('@lid');
  const isGroup = selectedChat?.id?.includes('@g.us');
  
  // Sync editing state with selected chat
  // Usa apenas selectedChatId como dependência para evitar resetar o modo de edição
  // quando o objeto chat é atualizado (ex: após salvar alterações)
  useEffect(() => {
    if (selectedChat) {
      // Reseta o modo de edição apenas quando um chat diferente é selecionado
      setIsEditingContact(false);
      
      // Atualiza os valores de edição com os dados do chat selecionado
      setEditContactName(selectedChat.contactName);
      setEditClientCode(selectedChat.clientCode || '');
      
      setShowOptionsMenu(false); 
      setMessageSearchTerm('');
      setShowSearch(false);
      
      // Zera a contagem de mensagens não lidas quando o chat é selecionado/visualizado
      if (selectedChat.unreadCount > 0) {
        const updatedChat = {
          ...selectedChat,
          unreadCount: 0
        };
        onUpdateChat(updatedChat);
        console.log(`[ChatInterface] ✅ Contagem de mensagens não lidas zerada para chat ${selectedChat.contactName}`);
      }
    }
  }, [selectedChatId]); // Usa apenas selectedChatId para evitar resetar quando o objeto chat é atualizado

  // Logic: Filter by Tab AND Search + SORTING
  const filteredChats = chats
    .filter(chat => {
        // 1. Common Search Filter (Applied to all tabs)
        const matchesSearch = chat.contactName.toLowerCase().includes(filterText.toLowerCase()) ||
                              chat.contactNumber.includes(filterText) ||
                              (chat.clientCode && chat.clientCode.includes(filterText));
        
        if (!matchesSearch) return false;

        // 2. Tab Logic
        const isClosed = chat.status === 'closed';
        const hasMessages = chat.messages.length > 0;
        const lastSender = hasMessages ? chat.messages[chat.messages.length - 1].sender : 'system';
        
        // Logic: Agent replied = Waiting. User replied (or new) = To Do.
        const isWaitingForCustomer = lastSender === 'agent' || lastSender === 'system';
        
        // Chats sem departamento (aguardando triagem) devem aparecer em "Aguardando"
        const isAwaitingTriage = chat.departmentId === null && !chat.assignedTo;
        
        // Chats atribuídos ao usuário atual ou com departamento atribuído
        const isAssigned = chat.assignedTo === currentUser.id || (chat.departmentId !== null && chat.departmentId !== undefined);

        // Aba "Finalizados": apenas chats com status 'closed'
        if (activeTab === 'closed') {
            return isClosed;
        }

        // Chats fechados NÃO devem aparecer em outras abas
        if (isClosed) {
            return false;
        }

        // Apenas chats abertos ou pendentes aparecem nas outras abas
        if (chat.status === 'open' || chat.status === 'pending') {
            if (activeTab === 'waiting') {
                // "Aguardando Triagem": Chats sem departamento E sem atribuição
                // (mesmo que tenham mensagens não lidas - aguardam triagem antes de serem assumidos)
                return isAwaitingTriage;
            }
            if (activeTab === 'todo') {
                // "A Fazer": Apenas chats atribuídos (com departamento ou assignedTo)
                // Chats reabertos sem atribuição ficam em "Aguardando" até serem assumidos
                return isAssigned;
            }
        }
        
        return false;
    })
    .sort((a, b) => {
        // Sort by Last Message Time (Descending - Newest First)
        const timeA = new Date(a.lastMessageTime).getTime();
        const timeB = new Date(b.lastMessageTime).getTime();
        return timeB - timeA;
    });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Atualiza o chat selecionado quando o array de chats é atualizado
  useEffect(() => {
    if (selectedChatId) {
      const updatedChat = chats.find(c => c.id === selectedChatId);
      if (updatedChat && updatedChat.messages.length !== selectedChat?.messages.length) {
        // Chat foi atualizado com novas mensagens - força re-render
        // O selectedChat já é derivado, então isso deve funcionar automaticamente
        // Mas garantimos que o scroll aconteça
        setTimeout(() => scrollToBottom(), 100);
      }
    }
  }, [chats, selectedChatId]);

  useEffect(() => {
    scrollToBottom();
  }, [selectedChat?.messages, messageSearchTerm]);

  // --- RESIZE HANDLER LOGIC ---
  const startResizing = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      setListWidth((prevWidth) => {
          const newWidth = prevWidth + e.movementX;
          if (newWidth < 250) return 250; // Min width
          if (newWidth > 600) return 600; // Max width
          return newWidth;
      });
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);


  // --- NEW CHAT LOGIC ---
  const handleStartNewChat = (contact?: Contact) => {
      let contactNumber = '';
      let contactName = '';
      let avatar = 'https://ui-avatars.com/api/?background=random&color=fff&name=NC';

      if (contact) {
          contactNumber = contact.phone.replace(/\D/g, '');
          contactName = contact.name;
          avatar = contact.avatar || avatar;
      } else {
          // Input manual
          const cleaned = newChatInput.replace(/\D/g, '');
          if (cleaned.length < 10) {
              alert('Número inválido. Digite DDD + Número (ex: 11999999999).');
              return;
          }
          contactNumber = cleaned;
          contactName = newChatInput; // Use input as name initially or format number
      }

      // Check if chat exists
      const existingChat = chats.find(c => c.contactNumber.replace(/\D/g, '') === contactNumber);
      
      if (existingChat) {
          setSelectedChatId(existingChat.id);
          setIsNewChatModalOpen(false);
          setNewChatInput('');
          return;
      }

      // Create new chat
      // Usa o número como parte do ID para facilitar merge com Evolution API
      // Formato: número@s.whatsapp.net (padrão WhatsApp)
      const chatId = contactNumber.includes('@') ? contactNumber : `${contactNumber}@s.whatsapp.net`;
      
      const newChat: Chat = {
          id: chatId,
          contactName: contactName || contactNumber,
          contactNumber: contactNumber,
          contactAvatar: avatar,
          departmentId: null,
          unreadCount: 0,
          lastMessage: '',
          lastMessageTime: new Date(),
          status: 'open',
          messages: [],
          assignedTo: currentUser.id // Auto assign to creator
      };

      onUpdateChat(newChat);
      setSelectedChatId(newChat.id);
      setIsNewChatModalOpen(false);
      setNewChatInput('');
  };

  const suggestedContacts = newChatInput.length > 0 
    ? contacts.filter(c => c.name.toLowerCase().includes(newChatInput.toLowerCase()) || c.phone.includes(newChatInput))
    : [];

  // --- CONTACT EDITING ---
  const handleSaveContactInfo = () => {
    if (!selectedChat) return;
    
    const updatedChat: Chat = {
        ...selectedChat,
        contactName: editContactName,
        clientCode: editClientCode
    };
    onUpdateChat(updatedChat);
    setIsEditingContact(false);
  };

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
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' });
        await sendMediaMessage(audioBlob, 'audio');
      }
      
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
      mediaUrl: base64Preview, 
      mimeType: blob.type,
      fileName: selectedFile?.name
    };

    updateChatWithNewMessage(newMessage);

    const targetNumber = getValidPhoneNumber(selectedChat);
    
    // Valida se tem número válido antes de enviar (>=10 dígitos, formatPhoneForApi adiciona DDI se necessário)
    const targetDigits = targetNumber.replace(/\D/g, '').length;
    if (!targetNumber || targetDigits < 10) {
        alert('Erro: Não foi possível encontrar um número de telefone válido para este contato. Aguarde a sincronização ou verifique as configurações.');
        setIsSending(false);
        return;
    }

    const success = await sendRealMediaMessage(apiConfig, targetNumber, blob, inputText, type, selectedFile?.name);
    
    finalizeMessageStatus(newMessage, success);
    
    setIsSending(false);
    clearAttachment();
    setInputText('');
  };

  const handleSendMessage = async () => {
    if (!selectedChat) return;

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
      type: 'text',
      replyTo: replyingTo ? {
        id: replyingTo.id,
        content: replyingTo.content,
        sender: replyingTo.sender,
        whatsappMessageId: replyingTo.whatsappMessageId
      } : undefined
    };

    updateChatWithNewMessage(newMessage);

    const targetNumber = getValidPhoneNumber(selectedChat);
    console.log("[NumberDebug] Número final para envio:", targetNumber);

    // Valida se tem número válido antes de enviar (>=10 dígitos, formatPhoneForApi adiciona DDI se necessário)
    const targetDigits = targetNumber.replace(/\D/g, '').length;
    if (!targetNumber || targetDigits < 10) {
        alert('Erro: Não foi possível encontrar um número de telefone válido para este contato. Aguarde a sincronização ou verifique as configurações.');
        setIsSending(false);
        return;
    }

    // Envia com referência à mensagem original se for uma resposta
    // Prioriza o ID real do WhatsApp, senão usa o ID interno
    // Passa também o objeto raw completo (necessário para Evolution API)
    const replyToId = replyingTo?.whatsappMessageId || replyingTo?.id;
    const replyToRaw = replyingTo?.rawMessage;
    console.log(`[handleSendMessage] Respondendo à mensagem: ${replyToId} (whatsappId: ${replyingTo?.whatsappMessageId}, id: ${replyingTo?.id}, hasRaw: ${!!replyToRaw})`);
    
    try {
        const success = await sendRealMessage(apiConfig, targetNumber, inputText, replyToId, replyToRaw);
        
        if (!success) {
            // Se retornou false mas não lançou erro, mostra mensagem genérica
            alert('Erro ao enviar mensagem. Verifique a conexão e tente novamente.');
        }
        
        finalizeMessageStatus(newMessage, success);
    } catch (error: any) {
        console.error('[handleSendMessage] Erro ao enviar:', error);
        // Mostra mensagem específica se disponível, senão mostra genérica
        const errorMessage = error?.message || 'Erro ao enviar mensagem. Verifique a conexão e tente novamente.';
        alert(errorMessage);
        finalizeMessageStatus(newMessage, false);
    } finally {
        setIsSending(false);
        setInputText('');
        setReplyingTo(null); // Limpa a resposta após enviar
        setShowQuickReplies(false);
        setShowEmojiPicker(false);
    }
  };

  const handleReplyToMessage = (message: Message) => {
    setReplyingTo(message);
    // Foca no input (se houver referência)
    const inputElement = document.querySelector('textarea[placeholder*="Digite"]') as HTMLTextAreaElement;
    if (inputElement) {
      setTimeout(() => inputElement.focus(), 100);
    }
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleSendSticker = async (url: string) => {
      if (!selectedChat) return;
      setIsSending(true);
      
      const newMessage: Message = {
        id: `m_${Date.now()}`,
        content: 'Sticker',
        sender: 'agent',
        timestamp: new Date(),
        status: MessageStatus.SENT,
        type: 'sticker',
        mediaUrl: url
      };

      updateChatWithNewMessage(newMessage);
      
      const targetNumber = getValidPhoneNumber(selectedChat);
      
      // Valida se tem número válido antes de enviar (>=10 dígitos, formatPhoneForApi adiciona DDI se necessário)
      const targetDigits = targetNumber.replace(/\D/g, '').length;
      if (!targetNumber || targetDigits < 10) {
          alert('Erro: Não foi possível encontrar um número de telefone válido para este contato. Aguarde a sincronização ou verifique as configurações.');
          setIsSending(false);
          return;
      }

      // In real API, download blob and send
      await sendRealMessage(apiConfig, targetNumber, "[Sticker Enviado]"); 
      
      setIsSending(false);
      setShowEmojiPicker(false);
  };

  const updateChatWithNewMessage = (msg: Message) => {
    if (!selectedChat) return;
    const updatedChat = {
      ...selectedChat,
      messages: [...selectedChat.messages, msg],
      lastMessage: msg.type === 'text' ? msg.content : `📷 ${msg.type}`,
      lastMessageTime: new Date(), // This updates timestamp for sorting
      status: 'open' as const,
      unreadCount: 0 // Reset unread if agent sends
    };
    onUpdateChat(updatedChat);
  };

  // For testing/Demo purposes
  const simulateCustomerReply = () => {
     if (!selectedChat) return;
     const reply: Message = {
        id: `m_${Date.now()}`,
        content: "Obrigado pelo retorno. Pode me enviar mais detalhes?",
        sender: 'user',
        timestamp: new Date(),
        status: MessageStatus.DELIVERED,
        type: 'text'
     };
     
     const updatedChat = {
        ...selectedChat,
        messages: [...selectedChat.messages, reply],
        lastMessage: reply.content,
        lastMessageTime: new Date(),
        unreadCount: selectedChat.unreadCount + 1
     };
     
     onUpdateChat(updatedChat);
     setShowOptionsMenu(false);
  };

  const finalizeMessageStatus = (msg: Message, success: boolean) => {
    if (!selectedChat) return;
    
    if (!success) {
        // Find message and set to ERROR
        const updatedMessages = selectedChat.messages.map(m => 
            m.id === msg.id ? { ...m, status: MessageStatus.ERROR } : m
        );
        
        const updatedChat = {
            ...selectedChat,
            messages: updatedMessages
        };
        onUpdateChat(updatedChat);
    }
  };

  const handleTransfer = (deptId: string) => {
    if (!selectedChat) return;
    const updatedChat = {
      ...selectedChat,
      departmentId: deptId,
      assignedTo: undefined, // Clear assignment on transfer
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

  const handleFinishChat = (withSurvey: boolean) => {
    if (!selectedChat) return;

    const endMessage = withSurvey 
      ? 'Atendimento finalizado. Enviamos uma pesquisa de satisfação para o cliente.' 
      : 'Atendimento finalizado pelo agente.';

    const updatedChat: Chat = {
      ...selectedChat,
      status: 'closed',
      endedAt: new Date(),
      rating: undefined, // Será preenchido quando o cliente responder
      awaitingRating: withSurvey ? true : false, // Marca como aguardando avaliação se pesquisa foi enviada
      assignedTo: undefined, // Clear assignment on close
      activeWorkflow: undefined, // Clear workflow on finish
      messages: [
        ...selectedChat.messages,
        {
          id: `sys_${Date.now()}`,
          content: endMessage,
          sender: 'system' as const,
          timestamp: new Date(),
          status: MessageStatus.READ,
          type: 'text' as const
        }
      ]
    };
    
    // Atualiza o chat
    onUpdateChat(updatedChat);
    
    // Muda automaticamente para a aba "Finalizados" quando um chat é finalizado
    // Isso garante que o chat saia da aba atual (todo/waiting) e apareça em "Finalizados"
    setActiveTab('closed');
    
    if (withSurvey) {
        const targetNumber = getValidPhoneNumber(selectedChat);
        
        // Valida se tem número válido antes de enviar (>=10 dígitos, formatPhoneForApi adiciona DDI se necessário)
        const targetDigits = targetNumber.replace(/\D/g, '').length;
        if (targetNumber && targetDigits >= 10) {
            sendRealMessage(apiConfig, targetNumber, "Por favor, avalie nosso atendimento de 1 a 5 estrelas.");
        } else {
            console.warn('[NumberWarning] Não foi possível enviar pesquisa: número inválido');
        }
    }

    setIsFinishingModalOpen(false);
    // Mantém o chat selecionado para que o usuário veja que foi finalizado
    // setSelectedChatId(null); // Comentado para manter o chat visível na aba Finalizados
  };

  const handleGenerateAI = async () => {
    if (!selectedChat) return;
    setIsGeneratingAI(true);
    const suggestion = await generateSmartReply(selectedChat.messages, selectedChat.contactName);
    setInputText(suggestion);
    setIsGeneratingAI(false);
  };

  // --- ASSIGNMENT & GREETING LOGIC ---
  const handleAssumeChat = () => {
      if (!selectedChat) return;
      const updatedChat: Chat = {
          ...selectedChat,
          assignedTo: currentUser.id,
          status: 'open',
          messages: [
              ...selectedChat.messages,
              {
                  id: `sys_${Date.now()}`,
                  content: `Atendimento assumido por ${currentUser.name}`,
                  sender: 'system',
                  timestamp: new Date(),
                  status: MessageStatus.READ,
                  type: 'text'
              }
          ]
      };
      onUpdateChat(updatedChat);
  };

  const getSmartGreeting = () => {
      const hour = new Date().getHours();
      let greeting = 'Bom dia';
      if (hour >= 12 && hour < 18) greeting = 'Boa tarde';
      if (hour >= 18) greeting = 'Boa noite';
      
      const firstName = currentUser.name.split(' ')[0];
      return `${greeting}, sou ${firstName} e darei sequência no seu atendimento.`;
  };

  // Verifica se a saudação já foi enviada pelo agente atual
  const hasGreetingBeenSent = () => {
      if (!selectedChat) return false;
      
      const firstName = currentUser.name.split(' ')[0];
      // Padrão da saudação: contém "sou [nome]" e "darei sequência"
      const greetingPattern = new RegExp(`sou\\s+${firstName}\\s+e\\s+darei\\s+sequência`, 'i');
      
      // Verifica se há alguma mensagem do agente que corresponde ao padrão da saudação
      return selectedChat.messages.some(msg => 
          msg.sender === 'agent' && 
          msg.type === 'text' &&
          greetingPattern.test(msg.content)
      );
  };

  const handleInsertGreeting = () => {
      setInputText(getSmartGreeting());
  };

  // --- WORKFLOW LOGIC ---
  const handleStartWorkflow = (wf: Workflow) => {
    if (!selectedChat) return;
    const activeWf: ActiveWorkflow = {
        workflowId: wf.id,
        completedStepIds: []
    };
    onUpdateChat({ ...selectedChat, activeWorkflow: activeWf });
    setShowWorkflowsMenu(false);
  };

  const handleToggleStep = (stepId: string, isTransfer?: boolean, targetDept?: string) => {
    if (!selectedChat || !selectedChat.activeWorkflow) return;
    
    const currentCompleted = selectedChat.activeWorkflow.completedStepIds;
    let newCompleted;

    if (currentCompleted.includes(stepId)) {
        newCompleted = currentCompleted.filter(id => id !== stepId);
    } else {
        newCompleted = [...currentCompleted, stepId];
        // If it's a transfer step and not already done
        if (isTransfer && targetDept) {
            handleTransfer(targetDept);
        }
    }

    onUpdateChat({
        ...selectedChat,
        activeWorkflow: {
            ...selectedChat.activeWorkflow,
            completedStepIds: newCompleted
        }
    });
  };

  const handleCancelWorkflow = () => {
    if (!selectedChat) return;
    onUpdateChat({ ...selectedChat, activeWorkflow: undefined });
  };

  // --- TAG LOGIC ---
  const handleAddTag = (tagName: string) => {
      if (!selectedChat) return;
      const currentTags = selectedChat.tags || [];
      if (!currentTags.includes(tagName)) {
          onUpdateChat({ ...selectedChat, tags: [...currentTags, tagName] });
      }
      setShowTagMenu(false);
  };

  const handleRemoveTag = (tagName: string) => {
      if (!selectedChat || !selectedChat.tags) return;
      onUpdateChat({ ...selectedChat, tags: selectedChat.tags.filter(t => t !== tagName) });
  };

  const activeWorkflowDef = selectedChat?.activeWorkflow 
     ? workflows.find(w => w.id === selectedChat.activeWorkflow!.workflowId) 
     : null;

  const getDepartmentName = (id: string | null) => {
    if (!id) return 'Sem Departamento';
    return departments.find(d => d.id === id)?.name || 'Desconhecido';
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderMessageContent = (msg: Message) => {
    // Search Highlight
    const content = msg.content;
    const highlight = messageSearchTerm.trim();
    
    const highlightedContent = (text: string) => {
        if (!highlight || !text) return text;
        const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
        return (
            <>
                {parts.map((part, i) => 
                    part.toLowerCase() === highlight.toLowerCase() 
                        ? <span key={i} className="bg-yellow-200 text-slate-800">{part}</span> 
                        : part
                )}
            </>
        );
    };

    if (msg.type === 'sticker' && msg.mediaUrl) {
        return <img src={msg.mediaUrl} alt="Sticker" className="w-32 h-32 object-contain" />;
    }

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
             <p className="text-sm mt-1">{highlightedContent(msg.content)}</p>
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
    return <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{highlightedContent(msg.content)}</p>;
  };

  const displayedMessages = selectedChat?.messages.filter(msg => {
      if (!messageSearchTerm) return true;
      if (msg.content.toLowerCase().includes(messageSearchTerm.toLowerCase())) return true;
      return false;
  }) || [];

  return (
    <div className={`flex h-full bg-white md:rounded-lg shadow-sm overflow-hidden md:border border-slate-200 ${isResizing ? 'select-none' : ''}`}>
      
      {/* Sidebar List (Resizable) */}
      <div 
        className={`flex-col bg-slate-50 border-r border-slate-200 ${selectedChatId ? 'hidden md:flex' : 'flex'}`}
        style={{ width: selectedChatId ? listWidth : '100%' }} // On mobile, if no chat selected, it takes full width
      >
        {/* Header da Sidebar */}
        <div className="p-4 bg-white border-b border-slate-200 space-y-3">
           <div className="flex items-center gap-2 mb-2">
                <div className="flex flex-1 bg-slate-100 p-1 rounded-lg">
                    <button 
                        onClick={() => setActiveTab('todo')}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all flex justify-center items-center gap-1 ${activeTab === 'todo' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        A Fazer
                    </button>
                    <button 
                        onClick={() => setActiveTab('waiting')}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all flex justify-center items-center gap-1 ${activeTab === 'waiting' ? 'bg-white shadow text-amber-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Clock size={12} /> Aguardando
                    </button>
                    <button 
                        onClick={() => setActiveTab('closed')}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all flex justify-center items-center gap-1 ${activeTab === 'closed' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Finalizados
                    </button>
                </div>
                <button 
                    onClick={() => setIsNewChatModalOpen(true)}
                    className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm"
                    title="Novo Atendimento"
                >
                    <Plus size={18} />
                </button>
           </div>

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
          {filteredChats.length === 0 ? (
             <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                <CheckCircle size={32} className="opacity-20"/>
                {activeTab === 'todo' && "Tudo limpo! Você não tem conversas pendentes."}
                {activeTab === 'waiting' && "Nenhuma conversa aguardando resposta do cliente."}
                {activeTab === 'closed' && "Nenhuma conversa finalizada encontrada."}
             </div>
          ) : (
             filteredChats.map(chat => (
            <div 
              key={chat.id}
              onClick={() => setSelectedChatId(chat.id)}
              className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-emerald-50 transition-colors ${selectedChatId === chat.id ? 'bg-emerald-50 border-emerald-200' : ''}`}
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-3">
                  <img src={chat.contactAvatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1">
                      {chat.contactName}
                      {chat.clientCode && (
                          <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1 rounded">#{chat.clientCode}</span>
                      )}
                    </h3>
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
                  {chat.status === 'closed' && chat.rating && (
                     <span className="flex items-center gap-0.5 text-[10px] text-yellow-500 mt-1 justify-end">
                        <ThumbsUp size={10} /> {chat.rating}
                     </span>
                  )}
                </div>
              </div>
              
              {/* TAGS PREVIEW */}
              {chat.tags && chat.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                      {chat.tags.map(tag => {
                          const tagDef = AVAILABLE_TAGS.find(t => t.name === tag);
                          return (
                            <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded-full ${tagDef ? tagDef.color : 'bg-slate-200'}`}>
                                {tag}
                            </span>
                          );
                      })}
                  </div>
              )}

              <div className="flex justify-between items-center mt-2">
                <div className="flex items-center gap-1 text-slate-600 max-w-[180px]">
                    {chat.messages[chat.messages.length -1]?.type === 'image' && <ImageIcon size={12} />}
                    {chat.messages[chat.messages.length -1]?.type === 'audio' && <Mic size={12} />}
                    {chat.messages[chat.messages.length -1]?.sender === 'agent' && <ArrowRight size={12} className="text-slate-400"/>}
                    <p className="text-sm truncate">{chat.lastMessage}</p>
                </div>
                <div className="flex gap-1">
                    {!chat.assignedTo && chat.status !== 'closed' && (
                         <span className={`text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 flex items-center gap-0.5`}>
                           <UserPlus size={10} /> Livre
                         </span>
                    )}
                    {chat.departmentId && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600`}>
                        {getDepartmentName(chat.departmentId)}
                    </span>
                    )}
                </div>
              </div>
            </div>
          )))}
        </div>
      </div>
      
      {/* Resizer Handle */}
      {selectedChatId && (
        <div
            className="hidden md:block w-1 bg-slate-200 hover:bg-emerald-500 cursor-col-resize z-20 transition-colors"
            onMouseDown={startResizing}
        />
      )}

      {/* Main Chat Area */}
      <div 
        className={`
           flex-1 flex-col bg-[#e5ddd5] relative
           ${selectedChatId ? 'flex' : 'hidden md:flex'}
        `}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && selectedChat && isAssignedToMe && (
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
            <div className="bg-emerald-700 shadow-sm z-10 shrink-0">
                <div className="h-16 flex items-center justify-between px-2 md:px-4 text-white">
                    <div className="flex items-center gap-2 md:gap-3 flex-1">
                        <button 
                        onClick={() => setSelectedChatId(null)}
                        className="md:hidden p-1 text-white hover:bg-white/10 rounded-full"
                        >
                        <ArrowLeft size={24} />
                        </button>

                        <img src={selectedChat.contactAvatar} alt="" className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white" />
                        
                        {/* Contact Info / Editing Mode */}
                        <div className="flex-1 overflow-hidden">
                            {isEditingContact ? (
                                <div className="flex items-center gap-2 animate-in fade-in">
                                    <input 
                                        value={editContactName}
                                        onChange={(e) => setEditContactName(e.target.value)}
                                        className="bg-white/10 border border-white/30 text-white rounded px-2 py-1 text-sm outline-none focus:border-white w-full max-w-[200px]"
                                        placeholder="Nome do Contato"
                                    />
                                    <input 
                                        value={editClientCode}
                                        onChange={(e) => setEditClientCode(e.target.value)}
                                        className="bg-white/10 border border-white/30 text-white rounded px-2 py-1 text-sm outline-none focus:border-white w-24 font-mono"
                                        placeholder="Código"
                                    />
                                    <button onClick={handleSaveContactInfo} className="p-1 hover:bg-emerald-600 rounded text-emerald-200 hover:text-white" title="Salvar">
                                        <Save size={16} />
                                    </button>
                                    <button onClick={() => setIsEditingContact(false)} className="p-1 hover:bg-red-500/50 rounded text-red-200 hover:text-white" title="Cancelar">
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col group cursor-pointer" onClick={() => setIsEditingContact(true)}>
                                    <div className="flex items-center gap-2">
                                        <h2 className="font-semibold text-sm md:text-base truncate max-w-[150px] md:max-w-none">
                                            {selectedChat.contactName}
                                        </h2>
                                        {selectedChat.clientCode && (
                                            <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded font-mono text-emerald-50">
                                                | COD: {selectedChat.clientCode}
                                            </span>
                                        )}
                                        <Edit3 size={12} className="opacity-0 group-hover:opacity-50 text-white" />
                                    </div>
                                    <p className="text-xs opacity-90 text-emerald-100 truncate flex items-center gap-1">
                                        {getDepartmentName(selectedChat.departmentId)} 
                                        {!isAssigned && selectedChat.status === 'open' && " • Aguardando Atendimento"}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1 md:gap-2 relative">
                         {/* Search Toggle */}
                        <button onClick={() => setShowSearch(!showSearch)} className={`p-2 rounded-full transition-colors ${showSearch ? 'bg-white text-emerald-700' : 'hover:bg-emerald-600'}`}>
                            <Search size={20} />
                        </button>

                        {/* Tag Menu */}
                        <div className="relative">
                            <button onClick={() => setShowTagMenu(!showTagMenu)} className="p-2 hover:bg-emerald-600 rounded-full transition-colors" title="Adicionar Tag">
                                <Tag size={20} />
                            </button>
                            {showTagMenu && (
                                <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 origin-top-right text-slate-700">
                                    <div className="px-3 py-2 text-xs font-bold text-slate-500 border-b border-slate-100 mb-1">ADICIONAR TAG</div>
                                    {AVAILABLE_TAGS.map(tag => (
                                        <button 
                                            key={tag.name}
                                            onClick={() => handleAddTag(tag.name)}
                                            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm flex items-center gap-2"
                                        >
                                            <div className={`w-3 h-3 rounded-full ${tag.color.split(' ')[0]}`}></div>
                                            {tag.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {selectedChat.status === 'open' && isAssignedToMe && (
                            <>
                                <button 
                                    onClick={() => setIsFinishingModalOpen(true)}
                                    className="p-2 hover:bg-red-600/20 bg-black/10 rounded-full transition-colors tooltip relative group mr-1"
                                    title="Finalizar Atendimento"
                                >
                                    <CheckCircle size={20} />
                                </button>
                                <button 
                                    onClick={() => setIsTransferModalOpen(true)}
                                    className="p-2 hover:bg-emerald-600 rounded-full transition-colors tooltip relative group"
                                    title="Transferir Setor"
                                >
                                    <ArrowRightLeft size={20} />
                                </button>
                            </>
                        )}
                        <button 
                            onClick={() => setShowOptionsMenu(!showOptionsMenu)}
                            className="p-2 hover:bg-emerald-600 rounded-full transition-colors"
                        >
                        <MoreVertical size={20} />
                        </button>

                        {/* Dropdown Menu */}
                        {showOptionsMenu && (
                            <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 origin-top-right text-slate-700">
                                <button 
                                    onClick={simulateCustomerReply}
                                    className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-2 text-sm border-b border-slate-100"
                                >
                                    <RefreshCw size={16} className="text-blue-500" /> Simular Resposta do Cliente
                                </button>
                                <button className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-2 text-sm">
                                <Lock size={16} /> Bloquear Contato
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* TAGS LIST & SEARCH BAR */}
                {( (selectedChat.tags && selectedChat.tags.length > 0) || showSearch ) && (
                    <div className="px-4 pb-2 flex items-center justify-between gap-4">
                        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                            {selectedChat.tags?.map(tag => {
                                const tagDef = AVAILABLE_TAGS.find(t => t.name === tag);
                                return (
                                    <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 ${tagDef ? tagDef.color : 'bg-slate-200'}`}>
                                        {tag}
                                        <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-600"><X size={10} /></button>
                                    </span>
                                );
                            })}
                        </div>
                        
                        {showSearch && (
                             <div className="flex items-center bg-emerald-800/30 rounded px-2 py-1 flex-1 max-w-[200px] animate-in slide-in-from-right">
                                <input 
                                    autoFocus
                                    value={messageSearchTerm}
                                    onChange={(e) => setMessageSearchTerm(e.target.value)}
                                    placeholder="Buscar na conversa..."
                                    className="bg-transparent border-none text-white text-xs placeholder-emerald-200 outline-none w-full"
                                />
                                <button onClick={() => {setShowSearch(false); setMessageSearchTerm('')}} className="text-emerald-200 hover:text-white"><X size={12}/></button>
                             </div>
                        )}
                    </div>
                )}
            </div>

            {/* Active Workflow Panel */}
            {activeWorkflowDef && (
                <div className="bg-white border-b border-emerald-200 shadow-sm z-10 shrink-0">
                    <div className="flex justify-between items-center p-3 bg-emerald-50">
                        <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
                            <ListChecks size={18} />
                            <span>Fluxo: {activeWorkflowDef.title}</span>
                            <span className="text-xs bg-emerald-200 px-2 py-0.5 rounded-full">
                                {selectedChat.activeWorkflow!.completedStepIds.length} / {activeWorkflowDef.steps.length}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsWorkflowCollapsed(!isWorkflowCollapsed)} className="text-emerald-700 hover:bg-emerald-200 p-1 rounded">
                                {isWorkflowCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                            </button>
                            <button onClick={handleCancelWorkflow} className="text-red-400 hover:text-red-600 p-1 rounded">
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                    
                    {!isWorkflowCollapsed && (
                        <div className="p-3 bg-white max-h-40 overflow-y-auto space-y-2">
                            {activeWorkflowDef.steps.map(step => {
                                const isCompleted = selectedChat.activeWorkflow!.completedStepIds.includes(step.id);
                                return (
                                    <div key={step.id} className={`flex items-center gap-3 p-2 rounded border ${isCompleted ? 'bg-emerald-50 border-emerald-100' : 'border-slate-100 hover:bg-slate-50'}`}>
                                        <button 
                                            onClick={() => handleToggleStep(step.id, !!step.targetDepartmentId, step.targetDepartmentId)}
                                            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white'}`}
                                        >
                                            {isCompleted && <Check size={12} />}
                                        </button>
                                        <div className="flex-1 text-sm text-slate-700">
                                            <span className={isCompleted ? 'line-through opacity-70' : ''}>{step.title}</span>
                                            {step.targetDepartmentId && (
                                                <span className="block text-xs text-blue-500 flex items-center gap-1 mt-0.5">
                                                    <ArrowRight size={10} /> Transferir para {getDepartmentName(step.targetDepartmentId)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat' }}>
              {displayedMessages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-start' : msg.sender === 'system' ? 'justify-center' : 'justify-end'}`}>
                  {msg.sender === 'system' ? (
                     <div className="bg-emerald-100 text-emerald-800 text-xs px-3 py-1 rounded-full shadow-sm my-2">
                        {msg.content}
                     </div>
                  ) : (
                    <div 
                      className={`max-w-[85%] md:max-w-[70%] rounded-lg px-2 py-2 shadow-sm relative group ${
                        msg.sender === 'user' ? 'bg-white rounded-tl-none' : 'bg-emerald-100 rounded-tr-none'
                      }`}
                      onDoubleClick={() => msg.sender !== 'system' && handleReplyToMessage(msg)}
                    >
                      {/* Mensagem citada (se for uma resposta) */}
                      {msg.replyTo && (
                        <div className={`mb-1 px-2 py-1 border-l-3 ${
                          msg.replyTo.sender === 'user' ? 'border-blue-400 bg-blue-50' : 'border-emerald-400 bg-emerald-50'
                        } rounded text-xs`}>
                          <div className="font-medium text-slate-600">
                            {msg.replyTo.sender === 'user' ? selectedChat?.contactName : currentUser.name}
                          </div>
                          <div className="text-slate-500 truncate">
                            {msg.replyTo.content.length > 50 ? msg.replyTo.content.substring(0, 50) + '...' : msg.replyTo.content}
                          </div>
                        </div>
                      )}
                      
                      <div className="px-2 pt-1">
                        {renderMessageContent(msg)}
                      </div>

                      <div className="flex justify-between items-center gap-1 mt-1 pr-2 pb-1">
                        <button
                          onClick={() => handleReplyToMessage(msg)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-black/5 rounded"
                          title="Responder"
                        >
                          <ArrowRightLeft size={12} className="text-slate-500" />
                        </button>
                        <div className="flex items-center gap-1 ml-auto">
                          <span className="text-[10px] text-slate-500">
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {msg.sender === 'agent' && (
                            msg.status === MessageStatus.READ ? <CheckCheck size={14} className="text-blue-500" /> : 
                            msg.status === MessageStatus.DELIVERED ? <CheckCheck size={14} className="text-slate-400" /> :
                            msg.status === MessageStatus.ERROR ? <span title="Falha ao enviar"><AlertTriangle size={14} className="text-red-500" /></span> :
                            <Check size={14} className="text-slate-400" />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area or Assume Button */}
            {selectedChat.status === 'open' ? (
                <>
                {isAssigned && !isAssignedToMe ? (
                     <div className="p-4 bg-slate-100 text-center border-t border-slate-200">
                        <p className="text-slate-500 text-sm flex items-center justify-center gap-2">
                            <Lock size={16} /> 
                            Este atendimento está sendo realizado por outro agente.
                        </p>
                        <p className="text-xs text-slate-400 mt-1">Modo apenas visualização.</p>
                     </div>
                ) : !isAssigned ? (
                    <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-col items-center justify-center gap-3">
                        <p className="text-slate-600 font-medium">Este chat ainda não possui um responsável.</p>
                        <button 
                            onClick={handleAssumeChat}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-bold shadow-md transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                        >
                            <UserPlus size={20} /> ASSUMIR ATENDIMENTO
                        </button>
                    </div>
                ) : (
                    <div className="bg-slate-100 p-2 md:p-3 relative z-20">
                    
                        {/* Greeting Shortcut - Shows if assigned to me, no text yet, and greeting hasn't been sent */}
                        {isAssignedToMe && !inputText && !hasGreetingBeenSent() && (
                            <div className="absolute bottom-full left-0 w-full flex justify-center pb-2 pointer-events-none">
                                <button 
                                    onClick={handleInsertGreeting}
                                    className="pointer-events-auto bg-emerald-600 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg hover:bg-emerald-700 transition-transform hover:-translate-y-1 animate-in slide-in-from-bottom-2 flex items-center gap-1"
                                >
                                    👋 Enviar Saudação Inicial
                                </button>
                            </div>
                        )}

                        {/* Quick Replies Menu */}
                        {showQuickReplies && (
                            <div className="absolute bottom-full left-0 mb-2 ml-2 w-64 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-2 z-50">
                                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 text-xs font-bold text-slate-500 flex justify-between items-center">
                                    <span>Respostas Rápidas</span>
                                    <button onClick={() => setShowQuickReplies(false)}><X size={14} /></button>
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                    {quickReplies.map(qr => (
                                        <button 
                                            key={qr.id}
                                            onClick={() => { setInputText(qr.content); setShowQuickReplies(false); }}
                                            className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm text-slate-700 border-b border-slate-50 last:border-0"
                                        >
                                            <span className="font-bold block text-emerald-600 text-xs mb-0.5">{qr.title}</span>
                                            <span className="truncate block">{qr.content}</span>
                                        </button>
                                    ))}
                                    {quickReplies.length === 0 && <p className="p-3 text-xs text-slate-400">Nenhuma mensagem cadastrada.</p>}
                                </div>
                            </div>
                        )}

                        {/* Workflows Menu */}
                        {showWorkflowsMenu && (
                            <div className="absolute bottom-full left-10 mb-2 w-72 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-2 z-50">
                                <div className="bg-emerald-50 px-3 py-2 border-b border-emerald-100 text-xs font-bold text-emerald-700 flex justify-between items-center">
                                    <span className="flex items-center gap-2"><ListChecks size={14}/> Iniciar Fluxo de Atendimento</span>
                                    <button onClick={() => setShowWorkflowsMenu(false)}><X size={14} /></button>
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                    {workflows.map(wf => (
                                        <button 
                                            key={wf.id}
                                            onClick={() => handleStartWorkflow(wf)}
                                            className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm text-slate-700 border-b border-slate-50 last:border-0"
                                        >
                                            <span className="font-semibold block text-slate-800">{wf.title}</span>
                                            <span className="text-xs text-slate-500">{wf.steps.length} etapas</span>
                                        </button>
                                    ))}
                                    {workflows.length === 0 && <p className="p-3 text-xs text-slate-400">Nenhum fluxo cadastrado.</p>}
                                </div>
                            </div>
                        )}

                        {/* Emojis & Stickers Picker */}
                        {showEmojiPicker && (
                            <div className="absolute bottom-full left-0 mb-2 ml-10 w-72 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-2 z-50">
                                <div className="flex border-b border-slate-100">
                                    <div className="flex-1 p-2 text-center text-xs font-bold text-slate-500 bg-slate-50">EMOJIS & FIGURINHAS</div>
                                    <button onClick={() => setShowEmojiPicker(false)} className="p-2 text-slate-400 hover:text-slate-600"><X size={14} /></button>
                                </div>
                                <div className="p-2 max-h-60 overflow-y-auto custom-scrollbar">
                                    <div className="mb-2">
                                        <p className="text-[10px] font-bold text-slate-400 mb-1">EMOJIS</p>
                                        <div className="grid grid-cols-8 gap-1">
                                            {EMOJIS.map(emoji => (
                                                <button key={emoji} onClick={() => setInputText(prev => prev + emoji)} className="hover:bg-slate-100 rounded text-lg p-1">
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 mb-1">FIGURINHAS (STICKERS)</p>
                                        <div className="grid grid-cols-4 gap-2">
                                            {STICKERS.map((sticker, idx) => (
                                                <img 
                                                    key={idx} 
                                                    src={sticker} 
                                                    alt="Sticker" 
                                                    className="w-full h-auto cursor-pointer hover:opacity-80 rounded"
                                                    onClick={() => handleSendSticker(sticker)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Reply Preview Area */}
                        {replyingTo && (
                            <div className="bg-slate-200 p-3 rounded-t-lg border-b border-slate-300 flex items-center justify-between animate-in slide-in-from-bottom-2">
                                <div className="flex items-center gap-3 overflow-hidden flex-1">
                                    <div className={`w-0.5 h-10 rounded ${
                                        replyingTo.sender === 'user' ? 'bg-blue-400' : 'bg-emerald-400'
                                    }`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold text-slate-700">
                                            {replyingTo.sender === 'user' ? selectedChat?.contactName : currentUser.name}
                                        </div>
                                        <div className="text-xs text-slate-500 truncate">
                                            {replyingTo.content.length > 60 ? replyingTo.content.substring(0, 60) + '...' : replyingTo.content}
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleCancelReply} 
                                    className="p-1 hover:bg-slate-300 rounded-full text-slate-500 flex-shrink-0"
                                    title="Cancelar resposta"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        )}

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
                                    <p className="text-sm font-semibold truncate max-w-[150px] text-slate-800">{selectedFile.name}</p>
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
                        
                        <div className="flex items-center gap-1 md:gap-2">
                            
                            {/* File Input */}
                            <input 
                            type="file" 
                            ref={fileInputRef}
                            className="hidden" 
                            onChange={(e) => e.target.files && e.target.files.length > 0 && handleFileSelect(e.target.files[0])}
                            />

                            {isRecording ? (
                                // Recording UI
                                <div className="flex-1 flex items-center gap-2 md:gap-4 bg-white px-2 md:px-4 py-3 rounded-full shadow-sm animate-in fade-in">
                                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                                    <span className="text-slate-700 font-mono font-medium min-w-[40px] text-sm">{formatTime(recordingTime)}</span>
                                    <div className="flex-1 text-xs text-slate-400 truncate">Gravando...</div>
                                    
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
                                        onClick={() => setShowQuickReplies(!showQuickReplies)}
                                        className="p-2 rounded-full text-slate-500 hover:bg-slate-200 transition-colors flex-shrink-0"
                                        title="Mensagens Rápidas"
                                    >
                                        <Zap size={20} />
                                    </button>
                                    <button 
                                        onClick={() => setShowWorkflowsMenu(!showWorkflowsMenu)}
                                        className={`p-2 rounded-full transition-colors flex-shrink-0 ${showWorkflowsMenu || activeWorkflowDef ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 hover:bg-slate-200'}`}
                                        title="Fluxos de Atendimento"
                                    >
                                        <ListChecks size={20} />
                                    </button>
                                    <button 
                                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                        className={`p-2 rounded-full transition-colors flex-shrink-0 ${showEmojiPicker ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 hover:bg-slate-200'}`}
                                        title="Emojis e Figurinhas"
                                    >
                                        <Smile size={20} />
                                    </button>
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className={`p-2 rounded-full transition-colors flex-shrink-0 ${selectedFile ? 'text-emerald-600 bg-emerald-100' : 'text-slate-500 hover:bg-slate-200'}`}
                                    >
                                        <Paperclip size={20} />
                                    </button>
                                    
                                    <div className="flex-1 relative">
                                        <input 
                                        type="text" 
                                        value={inputText}
                                        onChange={(e) => setInputText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                        placeholder={selectedFile ? "Legenda..." : replyingTo ? "Digite sua resposta..." : "Mensagem"}
                                        disabled={isSending}
                                        className={`w-full px-4 py-3 rounded-lg border-none focus:ring-0 outline-none bg-white shadow-sm pr-10 text-sm ${selectedFile || replyingTo ? 'rounded-tl-none rounded-tr-none' : ''}`}
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
                                            className="p-3 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 shadow-md transition-transform hover:scale-105 active:scale-95 disabled:bg-slate-400 disabled:scale-100 flex-shrink-0"
                                        >
                                            <Send size={20} />
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={startRecording}
                                            className="p-3 bg-slate-200 text-slate-600 rounded-full hover:bg-slate-300 shadow-sm transition-transform hover:scale-105 active:scale-95 flex-shrink-0"
                                        >
                                            <Mic size={20} />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
                </>
            ) : (
              <div className="p-4 bg-slate-100 text-center text-slate-500 text-sm border-t border-slate-200">
                Esta conversa foi finalizada.
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50 border-b-8 border-emerald-500">
            <div className="bg-emerald-100 p-6 rounded-full mb-4">
               <MessageSquare size={48} className="text-emerald-600" />
            </div>
            <h2 className="text-xl font-medium text-slate-700">ZapFlow Manager</h2>
            <p className="mt-2 text-sm">Selecione uma conversa para iniciar o atendimento</p>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {isNewChatModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 animate-in zoom-in duration-200">
             <div className="flex justify-between items-center mb-4">
                 <h3 className="text-lg font-bold text-slate-800">Iniciar Novo Atendimento</h3>
                 <button onClick={() => setIsNewChatModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
             </div>
             
             <div className="space-y-4">
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Buscar Contato ou Digitar Número</label>
                    <input 
                        autoFocus
                        value={newChatInput}
                        onChange={(e) => setNewChatInput(e.target.value)}
                        placeholder="Nome ou 55 + DDD + Número"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                 </div>

                 {/* Suggestions List */}
                 {newChatInput.length > 0 && suggestedContacts.length > 0 && (
                     <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                         {suggestedContacts.map(contact => (
                             <button
                                key={contact.id}
                                onClick={() => handleStartNewChat(contact)}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex items-center gap-2"
                             >
                                <img src={contact.avatar || 'https://ui-avatars.com/api/?name=' + contact.name} className="w-6 h-6 rounded-full" />
                                <div>
                                    <p className="text-sm font-medium text-slate-800">{contact.name}</p>
                                    <p className="text-xs text-slate-500">{contact.phone}</p>
                                </div>
                             </button>
                         ))}
                     </div>
                 )}
                 
                 <div className="pt-2">
                    <button 
                        onClick={() => handleStartNewChat()}
                        className="w-full bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        disabled={newChatInput.length < 3}
                    >
                        Iniciar Conversa
                    </button>
                 </div>
             </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 animate-in zoom-in duration-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Transferir Atendimento</h3>
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

      {/* Finishing Modal */}
      {isFinishingModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 animate-in zoom-in duration-200">
             <div className="text-center mb-6">
                 <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={32} />
                 </div>
                 <h3 className="text-lg font-bold text-slate-800">Finalizar Atendimento?</h3>
                 <p className="text-sm text-slate-500 mt-2">Deseja enviar uma pesquisa de satisfação para o cliente?</p>
             </div>
             
             <div className="space-y-3">
                <button 
                  onClick={() => handleFinishChat(true)}
                  className="w-full py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 flex items-center justify-center gap-2"
                >
                   <ThumbsUp size={18} /> Finalizar e enviar pesquisa
                </button>
                <button 
                  onClick={() => handleFinishChat(false)}
                  className="w-full py-3 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200"
                >
                   Apenas finalizar
                </button>
                <button 
                  onClick={() => setIsFinishingModalOpen(false)}
                  className="w-full py-2 text-slate-400 text-sm hover:underline"
                >
                   Cancelar
                </button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ChatInterface;