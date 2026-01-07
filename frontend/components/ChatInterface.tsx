import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, MoreVertical, Paperclip, Search, MessageSquare, Bot, ArrowRightLeft, Check, CheckCheck, Mic, X, File as FileIcon, Image as ImageIcon, Play, Pause, Square, Trash2, ArrowLeft, Zap, CheckCircle, ThumbsUp, Edit3, Save, ListChecks, ArrowRight, ChevronDown, ChevronUp, UserPlus, Lock, RefreshCw, Smile, Tag, Plus, Clock, User as UserIcon, AlertTriangle, Eye } from 'lucide-react';
import { Chat, Department, Message, MessageStatus, User, ApiConfig, MessageType, QuickReply, Workflow, ActiveWorkflow, Contact } from '../types';
import { generateSmartReply } from '../services/geminiService';
import { sendRealMessage, sendRealMessageWithId, sendRealMediaMessageWithId, blobToBase64, sendRealContact, sendDepartmentSelectionMessage, fetchMediaUrlByMessageId } from '../services/whatsappService';
import { deleteChat as deleteChatApi, loadUserData, fetchLinkPreview, LinkPreview } from '../services/apiService';
import { AVAILABLE_TAGS, EMOJIS, STICKERS } from '../constants';

interface ChatInterfaceProps {
  chats: Chat[];
  departments: Department[];
  currentUser: User;
  onUpdateChat: (chat: Chat) => void;
  onAddContact?: (contact: Contact) => Promise<void> | void;
  apiConfig: ApiConfig;
  quickReplies?: QuickReply[];
  workflows?: Workflow[];
  contacts?: Contact[];
  forceSelectChatId?: string | null; // Força a seleção de um chat específico
  isViewActive?: boolean; // Indica se a view de chats está ativa
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ chats, departments, currentUser, onUpdateChat, onAddContact, apiConfig, quickReplies = [], workflows = [], contacts = [], forceSelectChatId, isViewActive = true }) => {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  
  // Ref para rastrear o último forceSelectChatId processado
  const lastForceSelectRef = useRef<string | null>(null);
  
  // Força a seleção de um chat quando forceSelectChatId é fornecido
  useEffect(() => {
    if (forceSelectChatId && forceSelectChatId !== lastForceSelectRef.current) {
      lastForceSelectRef.current = forceSelectChatId;
      
      // Verifica se o chat existe na lista
      const chatExists = chats.some(c => c.id === forceSelectChatId);
      if (chatExists) {
        console.log(`[ForceSelect] ✅ Selecionando chat: ${forceSelectChatId}`);
        setSelectedChatId(forceSelectChatId);
      } else {
        // Se o chat ainda não existe, tenta novamente após um pequeno delay
        // Isso é útil quando um novo chat é criado e ainda não está na lista
        console.log(`[ForceSelect] ⏳ Chat ${forceSelectChatId} não encontrado, tentando novamente em 200ms...`);
        const timeoutId1 = setTimeout(() => {
          const chatExistsAfterDelay = chats.some(c => c.id === forceSelectChatId);
          if (chatExistsAfterDelay) {
            console.log(`[ForceSelect] ✅ Chat ${forceSelectChatId} encontrado após delay, selecionando...`);
            setSelectedChatId(forceSelectChatId);
          } else {
            console.log(`[ForceSelect] ⚠️ Chat ${forceSelectChatId} ainda não encontrado, tentando novamente em 500ms...`);
            // Tenta mais uma vez após um delay maior
            const timeoutId2 = setTimeout(() => {
              const chatExistsAfterLongDelay = chats.some(c => c.id === forceSelectChatId);
              if (chatExistsAfterLongDelay) {
                console.log(`[ForceSelect] ✅ Chat ${forceSelectChatId} encontrado após delay longo, selecionando...`);
                setSelectedChatId(forceSelectChatId);
              } else {
                console.log(`[ForceSelect] ❌ Chat ${forceSelectChatId} não encontrado após múltiplas tentativas`);
              }
            }, 500);
            
            return () => clearTimeout(timeoutId2);
          }
        }, 200);
        
        return () => clearTimeout(timeoutId1);
      }
    }
  }, [forceSelectChatId, chats]);
  
  // Garante que o chat selecionado não seja deselecionado quando a lista de chats é atualizada
  useEffect(() => {
    if (selectedChatId && !chats.some(c => c.id === selectedChatId)) {
      // Se o chat selecionado não existe mais na lista, não faz nada
      // (não deseleciona, pois pode ser que o chat ainda esteja sendo carregado)
      // Log removido para produção
    }
  }, [chats, selectedChatId]);
  
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
            } else if (idDigits.length > 14) {
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
  // Força re-render pontual para permitir retries de mídia (quando o webhook salva base64 alguns segundos depois)
  const [mediaRetryTick, setMediaRetryTick] = useState(0);
  
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
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);
  const [isDeletingChat, setIsDeletingChat] = useState(false);

  // New Chat Modal
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatInput, setNewChatInput] = useState('');

  // Options Menu
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  // Contact Editing States
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editContactName, setEditContactName] = useState('');
  const [editClientCode, setEditClientCode] = useState('');

  // User Info Panel (WhatsApp Web style)
  const [isUserInfoOpen, setIsUserInfoOpen] = useState(false);
  const [userInfoTab, setUserInfoTab] = useState<'media' | 'links' | 'docs'>('media');
  const [addContactStatus, setAddContactStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Forward (Encaminhar)
  const [messageMenu, setMessageMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [forwardSearchTerm, setForwardSearchTerm] = useState('');
  const [forwardSelected, setForwardSelected] = useState<Record<string, boolean>>({});
  const [isForwarding, setIsForwarding] = useState(false);
  
  // File & Media States
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Media Viewer (Lightbox) - estilo WhatsApp Web
  type ImageViewerState = { url: string; fileName?: string } | null;
  const [imageViewer, setImageViewer] = useState<ImageViewerState>(null);
  type PdfViewerState = { url: string; fileName?: string } | null;
  const [pdfViewer, setPdfViewer] = useState<PdfViewerState>(null);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  type VideoViewerState = { url: string; fileName?: string } | null;
  const [videoViewer, setVideoViewer] = useState<VideoViewerState>(null);

  const closeImageViewer = useCallback(() => setImageViewer(null), []);
  const openImageViewer = useCallback((url: string, fileName?: string) => {
    if (!url) return;
    setImageViewer({ url, fileName });
  }, []);

  const closePdfViewer = useCallback(() => setPdfViewer(null), []);
  const openPdfViewer = useCallback((url: string, fileName?: string) => {
    if (!url) return;
    setPdfViewer({ url, fileName });
  }, []);
  const closeVideoViewer = useCallback(() => setVideoViewer(null), []);
  const openVideoViewer = useCallback((url: string, fileName?: string) => {
    if (!url) return;
    setVideoViewer({ url, fileName });
  }, []);

  // Download robusto (evita navegar para data: no top frame). Para data URLs, converte em Blob + blob: URL.
  const downloadFromUrl = useCallback((url: string | undefined, fileName?: string) => {
    if (!url) return;
    const name = (fileName && fileName.trim()) ? fileName.trim() : 'arquivo';

    const clickAnchor = (href: string, downloadName?: string) => {
      const a = document.createElement('a');
      a.href = href;
      if (downloadName) a.download = downloadName;
      a.target = '_blank';
      a.rel = 'noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    try {
      if (url.startsWith('data:')) {
        const match = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
        const mimeType = (match?.[1] || 'application/octet-stream').trim();
        const isBase64 = !!match?.[2];
        const dataPart = match?.[3] || '';

        let blob: Blob;
        if (isBase64) {
          const binary = atob(dataPart);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          blob = new Blob([bytes], { type: mimeType });
        } else {
          blob = new Blob([decodeURIComponent(dataPart)], { type: mimeType });
        }

        const objectUrl = URL.createObjectURL(blob);
        clickAnchor(objectUrl, name);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
        return;
      }

      clickAnchor(url, name);
    } catch {
      // Fallback: tenta abrir em nova aba
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch {
        // noop
      }
    }
  }, []);

  const downloadImageViewer = useCallback(() => {
    if (!imageViewer?.url) return;
    downloadFromUrl(imageViewer.url, imageViewer.fileName || 'imagem');
  }, [imageViewer, downloadFromUrl]);

  const downloadPdfViewer = useCallback(() => {
    if (!pdfViewer?.url) return;
    downloadFromUrl(pdfViewer.url, pdfViewer.fileName || 'documento.pdf');
  }, [pdfViewer, downloadFromUrl]);

  const downloadVideoViewer = useCallback(() => {
    if (!videoViewer?.url) return;
    downloadFromUrl(videoViewer.url, videoViewer.fileName || 'video.mp4');
  }, [videoViewer, downloadFromUrl]);

  useEffect(() => {
    if (!imageViewer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeImageViewer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [imageViewer, closeImageViewer]);

  useEffect(() => {
    if (!pdfViewer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePdfViewer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pdfViewer, closePdfViewer]);

  useEffect(() => {
    if (!videoViewer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeVideoViewer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [videoViewer, closeVideoViewer]);

  useEffect(() => {
    if (!isUserInfoOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Se algum viewer estiver aberto, deixa ele tratar primeiro
        if (imageViewer || pdfViewer || videoViewer) return;
        setIsUserInfoOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isUserInfoOpen, imageViewer, pdfViewer, videoViewer]);

  // Para evitar bloqueios/erros com data: em iframes/embeds, converte PDF data URL em blob: URL no viewer.
  useEffect(() => {
    if (!pdfViewer?.url) {
      setPdfViewerUrl(null);
      return;
    }

    const url = pdfViewer.url;
    if (!url.startsWith('data:')) {
      setPdfViewerUrl(url);
      return;
    }

    let objectUrl: string | null = null;
    try {
      const match = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
      const mimeType = (match?.[1] || 'application/pdf').trim();
      const isBase64 = !!match?.[2];
      const dataPart = match?.[3] || '';

      let blob: Blob;
      if (isBase64) {
        const binary = atob(dataPart);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: mimeType });
      } else {
        blob = new Blob([decodeURIComponent(dataPart)], { type: mimeType });
      }

      objectUrl = URL.createObjectURL(blob);
      setPdfViewerUrl(objectUrl);
    } catch {
      setPdfViewerUrl(url);
    }

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdfViewer?.url]);

  // Link Preview cache (URL -> preview)
  type LinkPreviewState = { status: 'loading' | 'ready' | 'error'; data?: LinkPreview };
  const [linkPreviews, setLinkPreviews] = useState<Record<string, LinkPreviewState>>({});
  const linkPreviewStateRef = useRef<Record<string, LinkPreviewState>>({});
  const linkPreviewInFlight = useRef<Set<string>>(new Set());

  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Contact Selection States
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const isAtBottomRef = useRef(true);
  const dragCounter = useRef(0);
  const justReturnedToViewRef = useRef(false);

  const selectedChat = chats.find(c => c.id === selectedChatId);

  // Gera um ID local realmente único para evitar colisões quando o usuário envia muitas mensagens rapidamente.
  // Colisões de ID fazem mensagens "sumirem" (React key + dedupe/merge).
  const generateLocalMessageId = (): string => {
    try {
      const uuid = (globalThis as any)?.crypto?.randomUUID?.();
      if (uuid) return `m_${uuid}`;
    } catch {}
    return `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  // Derived States for Assignment
  const isAssigned = !!selectedChat?.assignedTo;
  const isAssignedToMe = selectedChat?.assignedTo === currentUser.id;

  useEffect(() => {
    linkPreviewStateRef.current = linkPreviews;
  }, [linkPreviews]);
  
  // Validation Logic
  const isLID = selectedChat?.id?.includes('@lid');
  const isGroup = selectedChat?.id?.includes('@g.us');
  
  // Ref para rastrear o último selectedChatId processado neste useEffect
  const lastProcessedChatIdRef = useRef<string | null>(null);
  
  // Sync editing state with selected chat
  // Usa apenas selectedChatId como dependência para evitar resetar o modo de edição
  // quando o objeto chat é atualizado (ex: após salvar alterações)
  useEffect(() => {
    // Só processa se o selectedChatId mudou (não apenas quando o objeto chat é atualizado)
    if (selectedChatId && selectedChatId !== lastProcessedChatIdRef.current) {
      lastProcessedChatIdRef.current = selectedChatId;
      
      if (selectedChat) {
        // Reseta o modo de edição apenas quando um chat diferente é selecionado
        setIsEditingContact(false);
        
        // Atualiza os valores de edição com os dados do chat selecionado
        setEditContactName(selectedChat.contactName);
        setEditClientCode(selectedChat.clientCode || '');
        
        setShowOptionsMenu(false); 
        setMessageSearchTerm('');
        setShowSearch(false);
        setIsUserInfoOpen(false);
        setUserInfoTab('media');
        setAddContactStatus('idle');
        
        // Zera a contagem de mensagens não lidas quando o chat é selecionado/visualizado
        if (selectedChat.unreadCount > 0) {
          const updatedChat = {
            ...selectedChat,
            unreadCount: 0
          };
          onUpdateChat(updatedChat);
          // Log removido para produção
        }
      } else {
        // Se o chat não foi encontrado, não faz nada (pode estar sendo carregado)
        // Log removido para produção
      }
    } else if (!selectedChatId) {
      // Se selectedChatId foi limpo, reseta o ref
      lastProcessedChatIdRef.current = null;
    }
  }, [selectedChatId, selectedChat]); // Inclui selectedChat para detectar quando o objeto é atualizado

  // Comportamento tipo WhatsApp Web:
  // Se o chat está aberto/visível na view de Atendimento, consideramos as mensagens como "lidas"
  // (evita contador subir no chat que o usuário está olhando).
  useEffect(() => {
    if (!selectedChatId || !selectedChat) return;
    if (!isViewActive) return;
    if ((selectedChat.unreadCount || 0) <= 0) return;

    onUpdateChat({
      ...selectedChat,
      unreadCount: 0
    });
  }, [selectedChatId, isViewActive, selectedChat?.messages?.length, selectedChat?.unreadCount]);

  const normalizePhoneForMatch = (phone: string | undefined | null) => {
    return String(phone || '').replace(/\D/g, '');
  };

  const isCurrentChatInContacts = (() => {
    if (!selectedChat) return false;
    const chatPhone = normalizePhoneForMatch(selectedChat.contactNumber);
    if (!chatPhone) return false;
    return (contacts || []).some(c => normalizePhoneForMatch(c.phone) === chatPhone);
  })();

  const handleOpenUserInfo = () => {
    if (!selectedChat) return;
    setIsUserInfoOpen(true);
    setAddContactStatus('idle');
  };

  const handleAddChatToContacts = async () => {
    if (!selectedChat || isCurrentChatInContacts) return;
    if (!onAddContact) {
      setAddContactStatus('error');
      return;
    }

    try {
      setAddContactStatus('loading');
      await onAddContact({
        id: 'new',
        name: selectedChat.contactName || selectedChat.contactNumber,
        phone: selectedChat.contactNumber,
        avatar: selectedChat.contactAvatar,
        source: 'manual'
      });
      setAddContactStatus('success');
    } catch (e) {
      setAddContactStatus('error');
    }
  };

  const openForwardModal = (msg: Message) => {
    if (!msg) return;
    setForwardingMessage(msg);
    setIsForwardModalOpen(true);
    setForwardSearchTerm('');
    setForwardSelected({});
    setIsForwarding(false);
  };

  const closeForwardModal = () => {
    setIsForwardModalOpen(false);
    setForwardingMessage(null);
    setForwardSearchTerm('');
    setForwardSelected({});
    setIsForwarding(false);
  };

  const forwardSelectedChatIds = useMemo(
    () => Object.keys(forwardSelected).filter(id => !!forwardSelected[id]),
    [forwardSelected]
  );

  const forwardDestinationChats = useMemo(() => {
    const term = forwardSearchTerm.trim().toLowerCase();
    return (chats && Array.isArray(chats) ? chats : [])
      .filter(c => c && c.id && c.id !== selectedChatId)
      .filter(c => {
        if (!term) return true;
        const name = (c.contactName || '').toLowerCase();
        const number = (c.contactNumber || '').toLowerCase();
        const code = (c.clientCode || '').toLowerCase();
        return name.includes(term) || number.includes(term) || code.includes(term);
      })
      .sort((a, b) => {
        const ta = a.lastMessageTime ? new Date(a.lastMessageTime as any).getTime() : 0;
        const tb = b.lastMessageTime ? new Date(b.lastMessageTime as any).getTime() : 0;
        return tb - ta;
      });
  }, [chats, forwardSearchTerm, selectedChatId]);

  const toggleForwardDestination = (chatId: string) => {
    setForwardSelected(prev => ({ ...prev, [chatId]: !prev[chatId] }));
  };

  const appendMessageToChatById = (chatId: string, msg: Message): Chat | undefined => {
    const chat = (chats && Array.isArray(chats)) ? chats.find(c => c.id === chatId) : undefined;
    if (!chat) return undefined;
    const updatedChat: Chat = {
      ...chat,
      messages: [...(chat.messages || []), msg],
      lastMessage: msg.type === 'text' || !msg.type ? msg.content : `📎 ${msg.type}`,
      lastMessageTime: new Date(),
      status: 'open',
      unreadCount: 0
    };
    onUpdateChat(updatedChat);
    return updatedChat;
  };

  const patchMessageInChatSnapshot = (chat: Chat | undefined, messageId: string, patch: Partial<Message>) => {
    if (!chat) return;
    const updatedChat = {
      ...chat,
      messages: (chat.messages || []).map(m => (m.id === messageId ? { ...m, ...patch } : m))
    };
    onUpdateChat(updatedChat);
  };

  const markMessageErrorInChatSnapshot = (chat: Chat | undefined, messageId: string) => {
    patchMessageInChatSnapshot(chat, messageId, { status: MessageStatus.ERROR });
  };

  const pickForwardCaption = (msg: Message): string => {
    const c = (msg.content || '').trim();
    if (!c) return '';
    if (msg.type === 'image' && c === 'Imagem') return '';
    if (msg.type === 'video' && c === 'Vídeo') return '';
    if (msg.type === 'audio' && (c === 'Áudio' || c === 'Audio')) return '';
    if (msg.type === 'document' && (c === 'Arquivo' || c === 'Documento')) return '';
    if (msg.type === 'sticker' && c === 'Sticker') return '';
    return c;
  };

  const dataUrlToBlob = (dataUrl: string): Blob | null => {
    const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!match) return null;
    const mimeType = (match[1] || 'application/octet-stream').trim();
    const isBase64 = !!match[2];
    const dataPart = match[3] || '';

    try {
      if (isBase64) {
        const binary = atob(dataPart);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType });
      }
      return new Blob([decodeURIComponent(dataPart)], { type: mimeType });
    } catch {
      return null;
    }
  };

  const blobFromUrl = async (url: string): Promise<Blob | null> => {
    if (!url) return null;
    if (url.startsWith('data:')) {
      return dataUrlToBlob(url);
    }
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  };

  const handleConfirmForward = async () => {
    if (!selectedChat) return;
    if (!forwardingMessage) return;
    if (forwardSelectedChatIds.length === 0) return;

    setIsForwarding(true);
    const failures: string[] = [];

    for (const destChatId of forwardSelectedChatIds) {
      const destChat = (chats && Array.isArray(chats)) ? chats.find(c => c.id === destChatId) : undefined;
      if (!destChat) continue;

      const targetNumber = getValidPhoneNumber(destChat);
      const targetDigits = targetNumber.replace(/\D/g, '').length;
      if (!targetNumber || targetDigits < 10) {
        failures.push(`${destChat.contactName || destChat.contactNumber || destChat.id}: número inválido`);
        continue;
      }

      const original = forwardingMessage;
      const forwardedFromMessageId = original.whatsappMessageId || original.id;

      // Tipo para envio (sticker vira image)
      const originalType = (original.type || 'text') as MessageType;
      const sendMediaType: 'image' | 'video' | 'audio' | 'document' | null =
        originalType === 'image' ? 'image'
          : originalType === 'video' ? 'video'
          : originalType === 'audio' ? 'audio'
          : originalType === 'document' ? 'document'
          : originalType === 'sticker' ? 'image'
          : null;

      // Mensagem local (sempre sender=agent)
      const localId = `fwd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const localMsg: Message = {
        id: localId,
        content: original.content || '',
        sender: 'agent',
        timestamp: new Date(),
        status: MessageStatus.SENT,
        type: originalType === 'sticker' ? 'image' : (originalType === 'text' ? 'text' : originalType),
        mediaUrl: original.mediaUrl,
        mimeType: original.mimeType,
        fileName: original.fileName,
        fileSize: original.fileSize,
        forwarded: true,
        forwardedFromChatId: selectedChat.id,
        forwardedFromMessageId
      };

      // Se for mídia e não tiver mediaUrl, tenta pegar do raw
      if (sendMediaType && !localMsg.mediaUrl && original.rawMessage) {
        const rawCandidate = findMediaUrlInRaw(original.rawMessage, sendMediaType);
        if (rawCandidate) {
          localMsg.mediaUrl = rawCandidate;
        }
      }

      // Normaliza URL para render/uso
      const finalLocalMediaUrl = localMsg.mediaUrl ? getMediaUrl(localMsg.mediaUrl, localMsg.mimeType, localMsg.type) : undefined;
      if (finalLocalMediaUrl) {
        localMsg.mediaUrl = finalLocalMediaUrl;
      }

      const chatSnapshotAfterLocalAdd = appendMessageToChatById(destChatId, localMsg);

      try {
        if (!sendMediaType) {
          // Texto
          const messageContent = original.content || '';
          let messageToSend = messageContent;
          if (currentUser.name) {
            messageToSend = formatMessageHeader(destChat) + messageContent;
          }

          const result = await sendRealMessageWithId(apiConfig, targetNumber, messageToSend);
          if (result.success && result.messageId) {
            patchMessageInChatSnapshot(chatSnapshotAfterLocalAdd, localId, {
              whatsappMessageId: result.messageId,
              rawMessage: (result.raw ?? localMsg.rawMessage)
            });
          } else {
            failures.push(`${destChat.contactName || destChat.contactNumber || destChat.id}: falha ao enviar`);
            markMessageErrorInChatSnapshot(chatSnapshotAfterLocalAdd, localId);
          }
          continue;
        }

        // Mídia
        const captionRaw = pickForwardCaption(original);
        let captionToSend = captionRaw;
        if (captionToSend && currentUser.name) {
          captionToSend = formatMessageHeader(destChat) + captionToSend;
        }

        const mediaUrlForFetch = finalLocalMediaUrl;
        if (!mediaUrlForFetch) {
          failures.push(`${destChat.contactName || destChat.contactNumber || destChat.id}: mídia sem URL/base64`);
          markMessageErrorInChatSnapshot(chatSnapshotAfterLocalAdd, localId);
          continue;
        }

        const blob = await blobFromUrl(mediaUrlForFetch);
        if (!blob) {
          failures.push(`${destChat.contactName || destChat.contactNumber || destChat.id}: não foi possível obter a mídia (CORS/URL)`);
          markMessageErrorInChatSnapshot(chatSnapshotAfterLocalAdd, localId);
          continue;
        }

        const fileName =
          original.fileName ||
          (sendMediaType === 'document' ? 'documento' : sendMediaType === 'audio' ? 'audio' : sendMediaType === 'video' ? 'video' : 'imagem');

        const result = await sendRealMediaMessageWithId(apiConfig, targetNumber, blob, captionToSend, sendMediaType, fileName);
        if (result.success && result.messageId) {
          patchMessageInChatSnapshot(chatSnapshotAfterLocalAdd, localId, {
            whatsappMessageId: result.messageId,
            rawMessage: (result.raw ?? localMsg.rawMessage)
          });
        } else {
          failures.push(`${destChat.contactName || destChat.contactNumber || destChat.id}: falha ao enviar mídia`);
          markMessageErrorInChatSnapshot(chatSnapshotAfterLocalAdd, localId);
        }
      } catch (e: any) {
        failures.push(`${destChat.contactName || destChat.contactNumber || destChat.id}: erro inesperado`);
        markMessageErrorInChatSnapshot(chatSnapshotAfterLocalAdd, localId);
      }
    }

    setIsForwarding(false);
    closeForwardModal();

    if (failures.length > 0) {
      alert(`Alguns encaminhamentos falharam:\n- ${failures.slice(0, 8).join('\n- ')}${failures.length > 8 ? '\n- ...' : ''}`);
    }
  };

  // Logic: Filter by Tab AND Search + SORTING
  const filteredChats = (chats && Array.isArray(chats) ? chats : [])
    .filter(chat => {
        // Garante que o chat existe e é válido
        if (!chat || !chat.id) return false;
        // 1. Common Search Filter (Applied to all tabs)
        const matchesSearch = (chat.contactName || '').toLowerCase().includes(filterText.toLowerCase()) ||
                              (chat.contactNumber || '').includes(filterText) ||
                              (chat.clientCode && chat.clientCode.includes(filterText));
        
        if (!matchesSearch) return false;

        // 2. Tab Logic
        const isClosed = chat.status === 'closed';
        const hasMessages = chat.messages && Array.isArray(chat.messages) && chat.messages.length > 0;
        const lastSender = hasMessages && chat.messages ? chat.messages[chat.messages.length - 1].sender : 'system';
        
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

  const scrollToBottom = (force: boolean = false, instant: boolean = false) => {
    // Se force=true, sempre faz scroll (usado quando volta para o chat)
    // Caso contrário, só faz scroll se o usuário estiver no final (ou muito próximo)
    if (force || isAtBottomRef.current) {
      const behavior = (force && instant) ? "auto" : "smooth";
      messagesEndRef.current?.scrollIntoView({ behavior });
      if (force) {
        // Atualiza o estado para indicar que está no final
        isAtBottomRef.current = true;
      }
    }
  };

  // Verifica se o usuário está no final do scroll
  const checkIfAtBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return false;
    
    const threshold = 100; // Considera "no final" se estiver a 100px do final
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    isAtBottomRef.current = isAtBottom;
    return isAtBottom;
  };

  // Event listener para detectar scroll manual do usuário
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      isUserScrollingRef.current = true;
      checkIfAtBottom();
      
      // Reset flag após um tempo para permitir scroll automático novamente
      setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 150);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [selectedChatId]);

  // Atualiza o chat selecionado quando o array de chats é atualizado
  useEffect(() => {
    if (selectedChatId) {
      const updatedChat = chats.find(c => c.id === selectedChatId);
      const updatedMessages = updatedChat?.messages || [];
      const selectedMessages = selectedChat?.messages || [];
      if (updatedChat && updatedMessages.length !== selectedMessages.length) {
        // Chat foi atualizado com novas mensagens
        // Só faz scroll se o usuário estiver no final
        setTimeout(() => {
          checkIfAtBottom();
          scrollToBottom();
        }, 100);
      }
    }
  }, [chats, selectedChatId]);

  useEffect(() => {
    // Quando o chat selecionado muda, sempre vai para o final
    if (selectedChatId) {
      isAtBottomRef.current = true;
      // Usa scroll instantâneo quando muda de chat para garantir que vai para o final imediatamente
      setTimeout(() => scrollToBottom(true, true), 100);
      // Scroll adicional após delay maior como fallback
      setTimeout(() => scrollToBottom(true, true), 300);
    }
  }, [selectedChatId]);

  // Detecta quando o usuário volta para a aba/página (troca de tela do navegador)
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Quando a página volta a ficar visível e há um chat selecionado
      if (!document.hidden && selectedChatId && isViewActive) {
        // Marca que acabou de voltar para a view (para forçar scroll quando mensagens mudarem)
        justReturnedToViewRef.current = true;
        
        // Força scroll para o final após delays progressivos para garantir que o DOM está atualizado
        // Primeiro scroll instantâneo após um pequeno delay
        setTimeout(() => {
          isAtBottomRef.current = true;
          scrollToBottom(true, true); // instant = true para scroll imediato
        }, 100);
        
        // Segundo scroll após um delay maior para garantir que mensagens foram renderizadas
        setTimeout(() => {
          isAtBottomRef.current = true;
          scrollToBottom(true, true);
        }, 300);
        
        // Terceiro scroll após delay ainda maior como fallback
        setTimeout(() => {
          isAtBottomRef.current = true;
          scrollToBottom(true, true);
        }, 500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [selectedChatId, isViewActive]);

  // Detecta quando volta para a view de chats dentro da aplicação
  const prevIsViewActiveRef = useRef(isViewActive);
  useEffect(() => {
    // Se a view estava inativa e agora está ativa, e há um chat selecionado
    if (!prevIsViewActiveRef.current && isViewActive && selectedChatId) {
      // Marca que acabou de voltar para a view (para forçar scroll quando mensagens mudarem)
      justReturnedToViewRef.current = true;
      
      // Força scroll para o final após delays progressivos para garantir que o DOM está renderizado
      // Primeiro scroll instantâneo após um pequeno delay
      setTimeout(() => {
        isAtBottomRef.current = true;
        scrollToBottom(true, true); // instant = true para scroll imediato
      }, 100);
      
      // Segundo scroll após um delay maior para garantir que mensagens foram renderizadas
      setTimeout(() => {
        isAtBottomRef.current = true;
        scrollToBottom(true, true);
      }, 300);
      
      // Terceiro scroll após delay ainda maior como fallback
      setTimeout(() => {
        isAtBottomRef.current = true;
        scrollToBottom(true, true);
      }, 500);
    }
    prevIsViewActiveRef.current = isViewActive;
  }, [isViewActive, selectedChatId]);

  useEffect(() => {
    // Quando mensagens mudam, só faz scroll se estiver no final
    checkIfAtBottom();
    scrollToBottom();
    
    // Se acabou de voltar para a view e há mensagens, força scroll para o final (apenas uma vez)
    if (isViewActive && selectedChatId && selectedChat?.messages && selectedChat.messages.length > 0 && justReturnedToViewRef.current) {
      // Usa um delay para garantir que as mensagens foram renderizadas
      setTimeout(() => {
        // Só força se ainda estiver na view ativa (não mudou de tela)
        if (isViewActive) {
          isAtBottomRef.current = true;
          scrollToBottom(true, true);
        }
        // Reseta a flag após fazer scroll
        justReturnedToViewRef.current = false;
      }, 200);
    }
  }, [selectedChat?.messages, messageSearchTerm, isViewActive, selectedChatId]);

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
      const existingChat = chats.find(c => {
        if (!c.contactNumber || typeof c.contactNumber !== 'string') return false;
        return c.contactNumber.replace(/\D/g, '') === contactNumber;
      });
      
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
  // Função auxiliar para formatar cabeçalho com nome e departamento
  const formatMessageHeader = (chat?: Chat): string => {
    if (!currentUser.name) return '';
    const userDepartmentId = currentUser.departmentId || chat?.departmentId || selectedChat?.departmentId;
    const userDepartment = userDepartmentId 
      ? departments.find(d => d.id === userDepartmentId)
      : null;
    return userDepartment 
      ? `${currentUser.name} - ${userDepartment.name}:\n`
      : `${currentUser.name}:\n`;
  };

  const sendMediaMessage = async (blob: Blob | File, type: 'image' | 'audio' | 'document' | 'video') => {
    if (!selectedChat) return;
    setIsSending(true);

    // `blobToBase64` retorna APENAS o base64 puro (sem prefixo data:...).
    // Para renderizar no <img>/<audio> precisamos de um Data URL completo.
    const base64Preview = await blobToBase64(blob);
    const previewMimeType = (blob as any)?.type || 'application/octet-stream';
    const previewDataUrl = `data:${previewMimeType};base64,${base64Preview}`;

    const newMessage: Message = {
      id: generateLocalMessageId(),
      content: type === 'audio' ? 'Áudio' : (inputText || (type === 'image' ? 'Imagem' : 'Arquivo')),
      sender: 'agent',
      timestamp: new Date(),
      status: MessageStatus.SENT,
      type: type,
      mediaUrl: previewDataUrl,
      mimeType: previewMimeType,
      fileName: selectedFile?.name,
      fileSize: typeof (blob as any)?.size === 'number' ? (blob as any).size : undefined
    };

    const chatSnapshotAfterLocalAdd = updateChatWithNewMessage(newMessage);

    const targetNumber = getValidPhoneNumber(selectedChat);
    
    // Valida se tem número válido antes de enviar (>=10 dígitos, formatPhoneForApi adiciona DDI se necessário)
    const targetDigits = targetNumber.replace(/\D/g, '').length;
    if (!targetNumber || targetDigits < 10) {
        alert('Erro: Não foi possível encontrar um número de telefone válido para este contato. Aguarde a sincronização ou verifique as configurações.');
        setIsSending(false);
        return;
    }

    // Formata legenda com nome e departamento se houver legenda
    let captionToSend = inputText || '';
    if (captionToSend && currentUser.name) {
      captionToSend = formatMessageHeader() + captionToSend;
    }

    try {
      const fileName =
        selectedFile?.name ||
        (type === 'audio' ? 'audio.ogg' : type === 'image' ? 'image.jpg' : 'file');

      const result = await sendRealMediaMessageWithId(apiConfig, targetNumber, blob, captionToSend, type, fileName);
      const success = result.success;

      // CRÍTICO: Atualiza a mensagem local com o whatsappMessageId real
      // Isso evita duplicação na UI quando chega confirmação via Socket.IO/API (sem URL)
      if (success && result.messageId && chatSnapshotAfterLocalAdd) {
        const patchedChat = {
          ...chatSnapshotAfterLocalAdd,
          messages: chatSnapshotAfterLocalAdd.messages.map(m => {
            if (m.id === newMessage.id) {
              return {
                ...m,
                whatsappMessageId: result.messageId,
                rawMessage: (result.raw ?? m.rawMessage)
              };
            }
            return m;
          })
        };
        onUpdateChat(patchedChat);
      }

      if (!success) {
        alert(result.error || 'Erro ao enviar mídia. Verifique a conexão e tente novamente.');
      }

      finalizeMessageStatus(newMessage, success);
    } catch (error: any) {
      console.error('[sendMediaMessage] Erro ao enviar mídia:', error);
      alert(error?.message || 'Erro ao enviar mídia. Verifique a conexão e tente novamente.');
      finalizeMessageStatus(newMessage, false);
    } finally {
      setIsSending(false);
      clearAttachment();
      setInputText('');
    }
  };

  const handleSendContact = async (contact: Contact) => {
    if (!selectedChat) return;

    const targetNumber = getValidPhoneNumber(selectedChat);
    const targetDigits = targetNumber.replace(/\D/g, '').length;
    if (!targetNumber || targetDigits < 10) {
        alert('Erro: Não foi possível encontrar um número de telefone válido para este contato.');
        return;
    }

    setIsSending(true);
    try {
        const success = await sendRealContact(
            apiConfig,
            targetNumber,
            contact.name,
            contact.phone,
            contact.email
        );

        if (success) {
            // Cria mensagem local indicando que um contato foi enviado
            const newMessage: Message = {
                id: generateLocalMessageId(),
                content: `📇 Contato enviado: ${contact.name}`,
                sender: 'agent',
                timestamp: new Date(),
                status: MessageStatus.SENT,
                type: 'text'
            };
            updateChatWithNewMessage(newMessage);
            setIsContactModalOpen(false);
            setContactSearchTerm('');
        } else {
            alert('Erro ao enviar contato. Tente novamente.');
        }
    } catch (error) {
        console.error('[handleSendContact] Erro:', error);
        alert('Erro ao enviar contato. Tente novamente.');
    } finally {
        setIsSending(false);
    }
  };

  const handleDeleteChat = async () => {
    if (!chatToDelete) return;
    
    setIsDeletingChat(true);
    try {
      const result = await deleteChatApi(chatToDelete.id);
      
      if (result.success) {
        // Remove o chat da lista local
        const updatedChats = chats.filter(c => c.id !== chatToDelete.id);
        // Atualiza o estado no componente pai (se necessário)
        // Se o chat deletado estava selecionado, deseleciona
        if (selectedChatId === chatToDelete.id) {
          setSelectedChatId(null);
        }
        // Fecha o modal
        setChatToDelete(null);
        // Recarrega a página ou atualiza a lista de chats
        window.location.reload(); // Recarrega para garantir que o chat seja removido
      } else {
        alert(`Erro ao deletar chat: ${result.error || 'Erro desconhecido'}`);
      }
    } catch (error: any) {
      console.error('[ChatInterface] Erro ao deletar chat:', error);
      alert(`Erro ao deletar chat: ${error?.message || 'Erro desconhecido'}`);
    } finally {
      setIsDeletingChat(false);
    }
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

    // Salva o conteúdo ANTES de limpar o input
    const messageContent = inputText;
    
    // Limpa o input IMEDIATAMENTE após salvar o conteúdo
    setInputText('');
    setReplyingTo(null); // Limpa a resposta também
    
    // Formata mensagem com nome e departamento para envio ao WhatsApp
    let messageToSend = messageContent;
    if (currentUser.name) {
      messageToSend = formatMessageHeader() + messageContent;
    }
    
    const newMessage: Message = {
      id: generateLocalMessageId(),
      content: messageContent, // Mantém conteúdo original na mensagem local (sem nome/departamento)
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

    const chatSnapshotAfterLocalAdd = updateChatWithNewMessage(newMessage);

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
        // Envia mensagem formatada com nome e departamento ao WhatsApp
        const result = await sendRealMessageWithId(apiConfig, targetNumber, messageToSend, replyToId, replyToRaw);
        const success = result.success;

        // CRÍTICO: Atualiza a mensagem local com o whatsappMessageId real
        // Isso evita duplicação na UI quando chega confirmação via Socket.IO/API
        if (success && result.messageId && chatSnapshotAfterLocalAdd) {
            const patchedChat = {
                ...chatSnapshotAfterLocalAdd,
                messages: chatSnapshotAfterLocalAdd.messages.map(m => {
                    if (m.id === newMessage.id) {
                        return {
                            ...m,
                            whatsappMessageId: result.messageId,
                            rawMessage: (result.raw ?? m.rawMessage)
                        };
                    }
                    return m;
                })
            };
            onUpdateChat(patchedChat);
        }
        
        if (!success) {
            // Se retornou false mas não lançou erro, mostra mensagem genérica
            alert('Erro ao enviar mensagem. Verifique a conexão e tente novamente.');
        }
        
        finalizeMessageStatus(newMessage, success);
        
        // Se a mensagem foi enviada com sucesso e o chat não tem departamento, envia mensagem de seleção
        // MAS apenas se o chat ainda não foi assumido por um operador (status: 'pending' ou sem assignedTo)
        if (success && selectedChat && !selectedChat.departmentId && !selectedChat.departmentSelectionSent && departments.length > 0 && 
            (selectedChat.status === 'pending' || !selectedChat.assignedTo)) {
            // console.log(`[ChatInterface] 📤 Chat sem departamento após envio de mensagem - Enviando mensagem de seleção de departamento para ${selectedChat.id}`);
            sendDepartmentSelectionMessage(apiConfig, targetNumber, departments)
                .then(sent => {
                    if (sent) {
                        // Adiciona mensagem de sistema
                        const systemMessage: Message = {
                            id: `sys_dept_selection_send_${Date.now()}`,
                            content: 'department_selection_sent - Mensagem de seleção de departamento enviada',
                            sender: 'system',
                            timestamp: new Date(),
                            status: MessageStatus.READ,
                            type: 'text'
                        };
                        
                        onUpdateChat({
                            ...selectedChat,
                            departmentSelectionSent: true,
                            awaitingDepartmentSelection: true,
                            messages: [...(selectedChat.messages || []), systemMessage]
                        });
                        // console.log(`[ChatInterface] ✅ Mensagem de seleção de departamento enviada para ${selectedChat.id}`);
                        } else {
                        // console.error(`[ChatInterface] ❌ Falha ao enviar mensagem de seleção de departamento para ${selectedChat.id}`);
                    }
                })
                .catch(err => {
                    // console.error(`[ChatInterface] ❌ Erro ao enviar mensagem de seleção de departamento:`, err);
                });
        }
    } catch (error: any) {
        console.error('[handleSendMessage] Erro ao enviar:', error);
        // Mostra mensagem específica se disponível, senão mostra genérica
        const errorMessage = error?.message || 'Erro ao enviar mensagem. Verifique a conexão e tente novamente.';
        alert(errorMessage);
        // Se der erro, restaura o texto no input para o usuário poder tentar novamente
        setInputText(messageContent);
        finalizeMessageStatus(newMessage, false);
    } finally {
        setIsSending(false);
        // Input já foi limpo no início, não precisa limpar novamente (exceto em caso de erro)
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
        id: generateLocalMessageId(),
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

  const updateChatWithNewMessage = (msg: Message): Chat | undefined => {
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
    return updatedChat;
  };

  // For testing/Demo purposes
  const simulateCustomerReply = () => {
     if (!selectedChat) return;
     const reply: Message = {
        id: generateLocalMessageId(),
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
    // Log de debug comentado - descomente se necessário para análise
    // console.log('[ChatInterface] 🔍 [DEBUG] handleTransfer chamado para chat:', {
    //   chatId: selectedChat.id,
    //   currentDepartmentId: selectedChat.departmentId,
    //   newDepartmentId: deptId
    // });
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
    // console.log('[ChatInterface] 🔍 [DEBUG] handleTransfer - Chamando onUpdateChat com:', {
    //   chatId: updatedChat.id,
    //   departmentId: updatedChat.departmentId,
    //   assignedTo: updatedChat.assignedTo
    // });
    onUpdateChat(updatedChat);
    setIsTransferModalOpen(false);
  };

  const handleFinishChat = (withSurvey: boolean) => {
    if (!selectedChat) return;

    // Log de debug comentado - descomente se necessário para análise
    // console.log('[ChatInterface] 🔍 [DEBUG] handleFinishChat chamado para chat:', {
    //   chatId: selectedChat.id,
    //   currentStatus: selectedChat.status,
    //   currentAssignedTo: selectedChat.assignedTo,
    //   withSurvey
    // });

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
    
    // console.log('[ChatInterface] 🔍 [DEBUG] handleFinishChat - Chamando onUpdateChat com:', {
    //   chatId: updatedChat.id,
    //   status: updatedChat.status,
    //   assignedTo: updatedChat.assignedTo
    // });
    
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
    const suggestion = await generateSmartReply(
      selectedChat.messages, 
      selectedChat.contactName,
      apiConfig.geminiApiKey
    );
    setInputText(suggestion);
    setIsGeneratingAI(false);
  };

  // --- ASSIGNMENT & GREETING LOGIC ---
  const handleAssumeChat = () => {
      if (!selectedChat) return;
      // Log de debug comentado - descomente se necessário para análise
      // console.log('[ChatInterface] 🔍 [DEBUG] handleAssumeChat chamado para chat:', {
      //   chatId: selectedChat.id,
      //   currentStatus: selectedChat.status,
      //   currentAssignedTo: selectedChat.assignedTo,
      //   newAssignedTo: currentUser.id
      // });
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
      // console.log('[ChatInterface] 🔍 [DEBUG] handleAssumeChat - Chamando onUpdateChat com:', {
      //   chatId: updatedChat.id,
      //   status: updatedChat.status,
      //   assignedTo: updatedChat.assignedTo
      // });
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

  const normalizePreviewUrl = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    // Evita Mixed Content: se a página está em HTTPS, assume HTTPS para URLs sem protocolo (ex.: www.exemplo.com)
    try {
      if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
        return `https://${trimmed}`;
      }
    } catch {
      // ignore
    }

    return `http://${trimmed}`;
  };

  const extractUrls = (text: string | undefined): string[] => {
    if (!text) return [];
    const matches = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi);
    if (!matches) return [];
    const urls: string[] = [];
    for (const raw of matches) {
      const normalized = normalizePreviewUrl(raw);
      if (normalized) urls.push(normalized);
    }
    // Dedupe mantendo ordem
    return Array.from(new Set(urls));
  };

  const extractFirstUrl = (text: string | undefined): string | null => {
    if (!text) return null;
    const match = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
    if (!match) return null;
    return normalizePreviewUrl(match[1]);
  };

  const formatFileSize = (size?: number | null): string | null => {
    if (!size || size <= 0) return null;
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = size;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value = value / 1024;
      unitIndex++;
    }
    const formatted = value >= 10 ? Math.round(value).toString() : value.toFixed(1);
    return `${formatted} ${units[unitIndex]}`;
  };

  const getStatusLabel = (msg: Message): string | null => {
    switch (msg.status) {
      case MessageStatus.SENT:
        return 'Enviado';
      case MessageStatus.DELIVERED:
        return 'Entregue';
      case MessageStatus.READ:
        return 'Lido';
      case MessageStatus.ERROR:
        return 'Erro';
      default:
        return 'Enviando...';
    }
  };

  const isValidUrl = (url: any): url is string => {
    return typeof url === 'string' && url.trim().length > 0;
  };

  const findMediaUrlInRaw = (
    rawMsg: any,
    mediaType: 'image' | 'video' | 'document' | 'audio'
  ): string | undefined => {
    if (!rawMsg) return undefined;

    const priorityProps =
      mediaType === 'image'
        ? ['imageMessage', 'message', 'media']
        : mediaType === 'video'
        ? ['videoMessage', 'imageMessage', 'message', 'media']
        : mediaType === 'audio'
        ? ['audioMessage', 'message', 'media']
        : ['documentMessage', 'messageDocument', 'message', 'media'];

    const possibleUrls: (string | undefined)[] = [
      rawMsg?.message?.[`${mediaType}Message`]?.url,
      rawMsg?.message?.[`${mediaType}Message`]?.mediaUrl,
      rawMsg?.message?.[`${mediaType}Message`]?.directPath,
      rawMsg?.[`${mediaType}Message`]?.url,
      rawMsg?.[`${mediaType}Message`]?.mediaUrl,
      rawMsg?.[`${mediaType}Message`]?.directPath,
      rawMsg?.message?.url,
      rawMsg?.message?.mediaUrl,
      rawMsg?.url,
      rawMsg?.mediaUrl,
      (rawMsg as any)?.data?.message?.[`${mediaType}Message`]?.url,
      (rawMsg as any)?.data?.message?.[`${mediaType}Message`]?.mediaUrl,
      (rawMsg as any)?.data?.[`${mediaType}Message`]?.url,
      (rawMsg as any)?.data?.[`${mediaType}Message`]?.mediaUrl
    ];

    for (const url of possibleUrls) {
      if (isValidUrl(url)) return url;
    }

    const visited = new Set<any>();
    const recurse = (obj: any, depth = 0, maxDepth = 5): string | undefined => {
      if (!obj || depth > maxDepth) return undefined;
      if (visited.has(obj)) return undefined;
      visited.add(obj);

      if (isValidUrl(obj.url)) return obj.url;
      if (isValidUrl(obj.mediaUrl)) return obj.mediaUrl;
      if (isValidUrl(obj.directPath)) return obj.directPath;

      if (Array.isArray(obj)) {
        for (const item of obj) {
          const found = recurse(item, depth + 1, maxDepth);
          if (found) return found;
        }
        return undefined;
      }

      if (typeof obj === 'object') {
        for (const key of priorityProps) {
          if (obj[key]) {
            const found = recurse(obj[key], depth + 1, maxDepth);
            if (found) return found;
          }
        }
        for (const key in obj) {
          if (obj.hasOwnProperty(key) && !priorityProps.includes(key)) {
            const value = obj[key];
            if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof RegExp)) {
              const found = recurse(value, depth + 1, maxDepth);
              if (found) return found;
            }
          }
        }
      }
      return undefined;
    };

    return recurse(rawMsg);
  };

  const scheduleMediaFetch = (msg: Message, mediaType: 'image' | 'video' | 'document' | 'audio') => {
    const rawMsg = msg.rawMessage;
    const messageId =
      msg.whatsappMessageId ||
      rawMsg?.key?.id ||
      rawMsg?.data?.key?.id ||
      rawMsg?.message?.key?.id;
    const remoteJid =
      rawMsg?.key?.remoteJid ||
      rawMsg?.key?.remoteJidAlt ||
      rawMsg?.data?.key?.remoteJid ||
      rawMsg?.data?.key?.remoteJidAlt ||
      rawMsg?.message?.key?.remoteJid;

    if (!messageId || !remoteJid) return;

    const fetchKey = `${mediaType}_fetch_${messageId}`;
    const attemptsKey = `${mediaType}_fetchAttempts_${messageId}`;
    const attemptsSoFar = Number((window as any)[attemptsKey] || 0);
    const maxAttempts = 6;

    if (attemptsSoFar >= maxAttempts) return;
    if ((window as any)[fetchKey]) return;

    (window as any)[fetchKey] = true;
    (window as any)[attemptsKey] = attemptsSoFar + 1;
    let foundAny = false;

    const patchChatMedia = (mediaUrl?: string, mimeType?: string) => {
      const chat = chats.find(c => c.id === (selectedChatId || ''));
      if (!chat) return;
      const idx = chat.messages.findIndex(
        m => m.id === msg.id || m.whatsappMessageId === messageId
      );
      if (idx >= 0) {
        const updatedMessages = [...chat.messages];
        updatedMessages[idx] = {
          ...updatedMessages[idx],
          mediaUrl: mediaUrl ?? updatedMessages[idx].mediaUrl,
          mimeType: mimeType ?? updatedMessages[idx].mimeType
        };
        onUpdateChat({ ...chat, messages: updatedMessages });
      }
    };

    loadUserData<{ messageId: string; dataUrl: string; mimeType?: string }>('webhook_messages', messageId)
      .then(webhookData => {
        if (webhookData?.dataUrl) {
          foundAny = true;
          msg.mediaUrl = webhookData.dataUrl;
          if (webhookData.mimeType) msg.mimeType = webhookData.mimeType;
          patchChatMedia(webhookData.dataUrl, webhookData.mimeType);
          return null;
        }

        if (apiConfig.baseUrl && apiConfig.apiKey) {
          return fetchMediaUrlByMessageId(apiConfig, messageId, remoteJid, mediaType);
        }
        return null;
      })
      .then(url => {
        if (url && !msg.mediaUrl) {
          foundAny = true;
          msg.mediaUrl = url;
          patchChatMedia(url);
        }
      })
      .catch(error => {
        console.error('[ChatInterface] Erro ao buscar mídia via messageId:', error);
      })
      .finally(() => {
        const delay = foundAny ? 60000 : 4000;
        setTimeout(() => {
          delete (window as any)[fetchKey];
          if (foundAny) {
            delete (window as any)[attemptsKey];
          } else {
            setMediaRetryTick(t => t + 1);
          }
        }, delay);
      });
  };

  const ensureLinkPreview = useCallback((rawUrl: string) => {
    const normalized = normalizePreviewUrl(rawUrl);
    if (!normalized) return;

    const current = linkPreviewStateRef.current[normalized];
    if (current && (current.status === 'ready' || current.status === 'error' || current.status === 'loading')) {
      return;
    }
    if (linkPreviewInFlight.current.has(normalized)) return;

    linkPreviewInFlight.current.add(normalized);
    setLinkPreviews(prev => ({ ...prev, [normalized]: { status: 'loading' } }));

    fetchLinkPreview(normalized)
      .then(data => {
        setLinkPreviews(prev => ({ ...prev, [normalized]: { status: 'ready', data } }));
      })
      .catch(error => {
        console.error('[LinkPreview] Erro ao obter preview:', error);
        setLinkPreviews(prev => ({ ...prev, [normalized]: { status: 'error' } }));
      })
      .finally(() => {
        linkPreviewInFlight.current.delete(normalized);
      });
  }, []);

  useEffect(() => {
    if (!selectedChat) return;
    const urls = new Set<string>();

    selectedChat.messages.forEach(msg => {
      if ((msg.type === 'text' || !msg.type) && msg.content) {
        extractUrls(msg.content).forEach(u => urls.add(u));
      }
    });

    urls.forEach(url => ensureLinkPreview(url));
  }, [selectedChat, ensureLinkPreview]);

  // Helper para transformar URL relativa em absoluta se necessário
  const getMediaUrl = (url: string | undefined, mimeTypeHint?: string, mediaTypeHint?: Message['type']): string | undefined => {
    if (!url) return undefined;

    const trimmed = String(url).trim();

    // WhatsApp "directPath" (CDN) costuma vir como /v/... ou /mms/... e NÃO deve ser concatenado com apiConfig.baseUrl.
    // Ex.: /v/t62.7119-24/... -> https://mmg.whatsapp.net/v/t62.7119-24/...
    if (trimmed.startsWith('mmg.whatsapp.net/')) {
      return `https://${trimmed}`;
    }
    if (trimmed.startsWith('/v/') || trimmed.startsWith('/mms/')) {
      return `https://mmg.whatsapp.net${trimmed}`;
    }
    if (trimmed.startsWith('v/') || trimmed.startsWith('mms/')) {
      return `https://mmg.whatsapp.net/${trimmed}`;
    }

    // Se parece ser base64 puro (sem prefixo data:), converte para Data URL.
    // Isso evita o browser tentar fazer GET /<base64> na Evolution API.
    const maybeBase64 = trimmed.replace(/\s/g, '');
    const isLikelyBase64 =
      maybeBase64.length > 200 &&
      !maybeBase64.startsWith('data:') &&
      !maybeBase64.startsWith('http://') &&
      !maybeBase64.startsWith('https://') &&
      !maybeBase64.startsWith('/') &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(maybeBase64);

    const guessMimeTypeFromBase64 = (b64: string): string | undefined => {
      const head = b64.substring(0, 20);
      if (head.startsWith('/9j/')) return 'image/jpeg';
      if (head.startsWith('iVBORw0KGgo')) return 'image/png';
      if (head.startsWith('R0lGOD')) return 'image/gif';
      if (head.startsWith('UklGR')) return 'image/webp';
      if (head.startsWith('JVBERi0')) return 'application/pdf';
      if (head.startsWith('AAAAIGZ0eXB') || head.startsWith('AAAAHGZ0eXB')) return 'video/mp4';
      return undefined;
    };

    if (isLikelyBase64) {
      const mime =
        (mimeTypeHint && mimeTypeHint.trim()) ||
        guessMimeTypeFromBase64(maybeBase64) ||
        (mediaTypeHint === 'image' ? 'image/jpeg'
          : mediaTypeHint === 'video' ? 'video/mp4'
          : mediaTypeHint === 'audio' ? 'audio/ogg; codecs=opus'
          : 'application/octet-stream');
      return `data:${mime};base64,${maybeBase64}`;
    }

    // Se é uma URL base64 (data:image/, data:video/, etc.), retorna como está
    if (trimmed.startsWith('data:')) {
      return trimmed;
    }

    // Se já é uma URL absoluta (http:// ou https://), retorna como está
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      // Se é uma URL da Evolution API e temos API key, adiciona como query parameter
      // Evolution API pode requerer autenticação para acessar mídia
      if (apiConfig.baseUrl && trimmed.includes(apiConfig.baseUrl.replace(/^https?:\/\//, '').split(':')[0]) && apiConfig.apiKey) {
        const urlObj = new URL(trimmed);
        urlObj.searchParams.set('apikey', apiConfig.apiKey);
        return urlObj.toString();
      }
      return trimmed;
    }

    // Se é uma URL relativa e temos baseUrl configurado, transforma em absoluta
    if (apiConfig.baseUrl && !trimmed.startsWith('/')) {
      // Remove trailing slash do baseUrl se houver
      const baseUrl = apiConfig.baseUrl.replace(/\/$/, '');
      // Remove leading slash da URL se houver
      const cleanUrl = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed;
      const finalUrl = `${baseUrl}/${cleanUrl}`;
      // Adiciona API key se disponível
      if (apiConfig.apiKey) {
        const urlObj = new URL(finalUrl);
        urlObj.searchParams.set('apikey', apiConfig.apiKey);
        const authenticatedUrl = urlObj.toString();
        // console.log('[ChatInterface] getMediaUrl: URL relativa transformada com autenticação:', authenticatedUrl.substring(0, 100));
        return authenticatedUrl;
      }
      // console.log('[ChatInterface] getMediaUrl: URL relativa transformada:', finalUrl.substring(0, 100));
      return finalUrl;
    }

    // Se começa com /, adiciona baseUrl
    if (trimmed.startsWith('/') && apiConfig.baseUrl) {
      const baseUrl = apiConfig.baseUrl.replace(/\/$/, '');
      const finalUrl = `${baseUrl}${trimmed}`;
      // Adiciona API key se disponível
      if (apiConfig.apiKey) {
        const urlObj = new URL(finalUrl);
        urlObj.searchParams.set('apikey', apiConfig.apiKey);
        const authenticatedUrl = urlObj.toString();
        // console.log('[ChatInterface] getMediaUrl: URL com / transformada com autenticação:', authenticatedUrl.substring(0, 100));
        return authenticatedUrl;
      }
      // console.log('[ChatInterface] getMediaUrl: URL com / transformada:', finalUrl.substring(0, 100));
      return finalUrl;
    }

    // Retorna como está se não conseguir transformar
    // console.warn('[ChatInterface] getMediaUrl: Não foi possível transformar URL, retornando como está:', trimmed.substring(0, 100));
    return trimmed;
  };

  // Coleções para o painel de Informações do usuário (Mídia / Links / Docs)
  const userInfoData = useMemo(() => {
    const empty = { media: [] as Message[], docs: [] as Message[], links: [] as { url: string; host: string; timestamp: Date }[] };
    if (!selectedChat) return empty;
    const msgs = (selectedChat.messages && Array.isArray(selectedChat.messages)) ? selectedChat.messages : [];

    const media = msgs.filter(m => m && (m.type === 'image' || m.type === 'video' || m.type === 'audio' || m.type === 'sticker'));
    const docs = msgs.filter(m => m && m.type === 'document');

    const linkMap = new Map<string, { url: string; host: string; timestamp: Date }>();
    for (const msg of msgs) {
      if (!msg?.content) continue;
      const urls = extractUrls(msg.content);
      if (!urls.length) continue;
      const ts = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp as any);
      for (const url of urls) {
        const existing = linkMap.get(url);
        if (!existing || ts.getTime() > existing.timestamp.getTime()) {
          let host = url;
          try { host = new URL(url).hostname; } catch {}
          linkMap.set(url, { url, host, timestamp: ts });
        }
      }
    }
    const links = Array.from(linkMap.values()).sort((a, b) => (b.timestamp?.getTime?.() || 0) - (a.timestamp?.getTime?.() || 0));

    return { media, docs, links };
  }, [selectedChat, mediaRetryTick]);

  // Função utilitária para normalizar conteúdo de mensagens do agente (remove cabeçalho)
  // CRÍTICO: O frontend renderiza o nome do agente separadamente, então o conteúdo NUNCA deve ter o cabeçalho
  // Esta função remove TODOS os padrões de cabeçalho, incluindo duplicados como "Andrey:\nAndrey:\n"
  const normalizeMessageContent = (content: string | undefined, sender: string | undefined): string => {
    if (!content || sender !== 'agent') {
      return content || '';
    }
    let normalized = content;
    let previousLength = 0;
    
    // Loop que remove TODOS os cabeçalhos duplicados até não haver mais mudanças
    // Isso garante que "Andrey:\nAndrey:\n111" vire "111"
    while (normalized.length !== previousLength) {
      previousLength = normalized.length;
      
      // Remove padrão "Nome:\n" ou "Nome:\n\n" do início
      normalized = normalized.replace(/^[^:\n]+:\n+/g, '');
      
      // Remove padrão "Nome - Departamento:\n" ou "Nome - Departamento:\n\n" do início
      normalized = normalized.replace(/^[^:\n]+ - [^:\n]+:\n+/g, '');
      
      // Remove padrão "Nome: " (com espaço) do início
      normalized = normalized.replace(/^[^:\n]+:\s+/g, '');
    }
    
    // Remove qualquer espaço em branco no início após remover cabeçalhos
    return normalized.trim();
  };

  const renderMessageContent = (msg: Message) => {
    // CRÍTICO: Normaliza o conteúdo para mensagens do agente antes de renderizar
    // Isso garante que mesmo se o conteúdo tiver cabeçalho duplicado, ele será removido na UI
    const normalizedContent = normalizeMessageContent(msg.content, msg.sender);
    
    // Search Highlight
    const content = normalizedContent;
    const highlight = messageSearchTerm.trim();
    const isUserMessage = msg.sender === 'user';
    const statusLabel = getStatusLabel(msg);
    
    const highlightedContent = (text: string) => {
        if (!highlight || !text) return text;
        const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
        return (
            <>
                {parts.map((part, i) => 
                    part.toLowerCase() === highlight.toLowerCase() 
                        ? <span key={i} className={isUserMessage ? "bg-yellow-400 text-slate-900" : "bg-yellow-200 text-slate-800"}>{part}</span> 
                        : part
                )}
            </>
        );
    };

    if (msg.type === 'sticker') {
        let stickerUrl = msg.mediaUrl;
        if (!stickerUrl && msg.rawMessage) {
          stickerUrl = findMediaUrlInRaw(msg.rawMessage, 'image');
          if (stickerUrl) {
            msg.mediaUrl = stickerUrl;
          }
        }

        if (!stickerUrl) {
          // Melhor esforço: tenta resolver via webhook (base64) e/ou por messageId (como "image")
          scheduleMediaFetch(msg, 'image');
          return <span className="text-sm opacity-70">Sticker (URL não disponível)</span>;
        }

        const finalStickerUrl = getMediaUrl(stickerUrl, msg.mimeType, msg.type);
        if (!finalStickerUrl) {
          scheduleMediaFetch(msg, 'image');
          return <span className="text-sm opacity-70">Sticker (URL não disponível)</span>;
        }

        return (
          <img
            src={finalStickerUrl}
            alt="Sticker"
            className="w-32 h-32 object-contain"
            onError={(e) => {
              // console.error('[ChatInterface] Erro ao carregar sticker:', finalStickerUrl);
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        );
    }

    if (msg.type === 'image') {
      // Se não tem mediaUrl, tenta extrair do rawMessage como fallback
      let imageUrl = msg.mediaUrl;
      if (!imageUrl && msg.rawMessage) {
        const rawMsg = msg.rawMessage;
        
        // Log reduzido - apenas quando realmente não encontra URL
        
        // Função auxiliar para verificar se uma string é uma URL válida
        const isValidUrl = (url: any): url is string => {
          return typeof url === 'string' && url.length > 0 && url.trim().length > 0;
        };
        
        // Função auxiliar para buscar URL recursivamente em um objeto
        const findImageUrl = (obj: any, depth: number = 0, maxDepth: number = 5, visited: Set<any> = new Set()): string | undefined => {
          if (!obj || depth > maxDepth) return undefined;
          
          // Evita loops infinitos
          if (visited.has(obj)) return undefined;
          visited.add(obj);
          
          // Verifica propriedades diretas comuns
          if (isValidUrl(obj.url)) return obj.url;
          if (isValidUrl(obj.mediaUrl)) return obj.mediaUrl;
          if (isValidUrl(obj.directPath)) return obj.directPath;
          
          // Se é um array, itera pelos elementos
          if (Array.isArray(obj)) {
            for (const item of obj) {
              const url = findImageUrl(item, depth + 1, maxDepth, visited);
              if (url) return url;
            }
            return undefined;
          }
          
          // Se é um objeto, itera por todas as propriedades
          if (typeof obj === 'object') {
            // Primeiro verifica propriedades específicas conhecidas (prioridade)
            const priorityProps = ['imageMessage', 'message', 'media', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
            for (const prop of priorityProps) {
              if (obj[prop]) {
                const url = findImageUrl(obj[prop], depth + 1, maxDepth, visited);
                if (url) return url;
              }
            }
            
            // Depois itera por todas as outras propriedades
            for (const key in obj) {
              if (obj.hasOwnProperty(key) && !priorityProps.includes(key)) {
                // Ignora propriedades que não são objetos/arrays ou que são muito grandes
                const value = obj[key];
                if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof RegExp)) {
                  const url = findImageUrl(value, depth + 1, maxDepth, visited);
                  if (url) return url;
                }
              }
            }
          }
          
          return undefined;
        };
        
        // Tenta todas as possíveis localizações em ordem de prioridade antes da busca recursiva
        const possibleUrls = [
          rawMsg.message?.imageMessage?.url,
          rawMsg.message?.imageMessage?.mediaUrl,
          rawMsg.message?.imageMessage?.directPath,
          rawMsg.imageMessage?.url,
          rawMsg.imageMessage?.mediaUrl,
          rawMsg.imageMessage?.directPath,
          rawMsg.message?.url,
          rawMsg.message?.mediaUrl,
          rawMsg.url,
          rawMsg.mediaUrl,
          // Verifica também em estruturas aninhadas adicionais
          (rawMsg as any).data?.message?.imageMessage?.url,
          (rawMsg as any).data?.message?.imageMessage?.mediaUrl,
          (rawMsg as any).data?.imageMessage?.url,
          (rawMsg as any).data?.imageMessage?.mediaUrl
        ];
        
        // Encontra a primeira URL válida
        for (const url of possibleUrls) {
          if (isValidUrl(url)) {
            imageUrl = url;
            break;
          }
        }
        
        // Se não encontrou com caminhos diretos, tenta busca recursiva
        if (!imageUrl) {
          imageUrl = findImageUrl(rawMsg);
        }
        
        // Se encontrou URL, atualiza a mensagem (não persiste, apenas para exibição)
        if (imageUrl) {
          msg.mediaUrl = imageUrl;
        } else {
          // Log temporário para debug - quando não encontra URL mas há rawMessage
          const imageMsgObj = rawMsg?.message?.imageMessage || rawMsg?.imageMessage;
          
          // Log completo para debug - força exibição de todos os detalhes
          console.warn('[ChatInterface] ⚠️ Imagem sem URL no rawMessage:', {
            msgId: msg.id,
            msgType: msg.type,
            hasRawMessage: !!rawMsg,
            rawMsgKeys: rawMsg ? Object.keys(rawMsg).slice(0, 15) : [],
            hasMessage: !!rawMsg?.message,
            messageKeys: rawMsg?.message ? Object.keys(rawMsg.message).slice(0, 15) : [],
            hasImageMessage: !!imageMsgObj,
            imageMessageType: imageMsgObj ? typeof imageMsgObj : 'n/a',
            imageMessageIsEmpty: imageMsgObj ? Object.keys(imageMsgObj).length === 0 : true,
            imageMessageKeys: imageMsgObj && typeof imageMsgObj === 'object' ? Object.keys(imageMsgObj) : [],
            imageMessageContent: imageMsgObj ? JSON.stringify(imageMsgObj).substring(0, 500) : 'n/a',
            // Verifica valores específicos
            hasUrl: !!(imageMsgObj?.url),
            hasMediaUrl: !!(imageMsgObj?.mediaUrl),
            hasDirectPath: !!(imageMsgObj?.directPath),
            urlValue: imageMsgObj?.url ? imageMsgObj.url.substring(0, 100) : 'não encontrado',
            mediaUrlValue: imageMsgObj?.mediaUrl ? imageMsgObj.mediaUrl.substring(0, 100) : 'não encontrado',
            directPathValue: imageMsgObj?.directPath ? imageMsgObj.directPath.substring(0, 100) : 'não encontrado'
          });
          
          // Log adicional com estrutura completa para debug (força visualização no console)
          if (imageMsgObj) {
            console.log('[ChatInterface] 🔍 ESTRUTURA COMPLETA DO imageMessage:', imageMsgObj);
            console.log('[ChatInterface] 🔍 rawMessage COMPLETO:', rawMsg);
            
            // Verifica se há messageId ou key.id que possa ser usado para buscar a URL/base64
            // (alguns formatos podem encapsular key em data.key)
            const messageId =
              msg.whatsappMessageId ||
              rawMsg?.key?.id ||
              rawMsg?.data?.key?.id ||
              rawMsg?.message?.key?.id;
            const remoteJid =
              rawMsg?.key?.remoteJid ||
              rawMsg?.key?.remoteJidAlt ||
              rawMsg?.data?.key?.remoteJid ||
              rawMsg?.data?.key?.remoteJidAlt;
            if (messageId && remoteJid) {
              console.log('[ChatInterface] 🔍 Possível buscar URL usando:', {
                messageId,
                remoteJid,
                hasApiConfig: !!(apiConfig.baseUrl && apiConfig.apiKey)
              });
              
              // Tenta buscar URL/base64 da mídia usando messageId (async, não bloqueia renderização)
              // Usa uma flag para evitar múltiplas buscas simultâneas para a mesma mensagem,
              // mas permite retry rápido quando o webhook ainda não salvou o base64 no banco.
              const fetchKey = `fetch_${messageId}`;
              const attemptsKey = `fetchAttempts_${messageId}`;
              const attemptsSoFar = Number((window as any)[attemptsKey] || 0);
              const maxAttempts = 6;

              if (attemptsSoFar >= maxAttempts) {
                // Evita loop infinito se realmente não houver base64/URL disponível
                return;
              }

              if (!(window as any)[fetchKey]) {
                (window as any)[fetchKey] = true;
                (window as any)[attemptsKey] = attemptsSoFar + 1;

                let foundAny = false;

                // PRIORIDADE 1: Buscar base64 salvo pelo webhook no banco
                loadUserData<{ messageId: string; dataUrl: string; mimeType: string }>('webhook_messages', messageId)
                  .then(webhookData => {
                    if (webhookData?.dataUrl) {
                      foundAny = true;
                      console.log('[ChatInterface] ✅ Base64 encontrado no banco (webhook):', messageId);
                      msg.mediaUrl = webhookData.dataUrl;

                      // Atualiza o chat para forçar re-render
                      const chat = chats.find(c => c.id === (selectedChatId || ''));
                      if (chat) {
                        const messageIndex = chat.messages.findIndex(m => m.id === msg.id || m.whatsappMessageId === messageId);
                        if (messageIndex >= 0) {
                          const updatedMessages = [...chat.messages];
                          updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], mediaUrl: webhookData.dataUrl };
                          onUpdateChat({ ...chat, messages: updatedMessages });
                        }
                      }

                      return null; // Base64 encontrado, não precisa buscar URL
                    }

                    // PRIORIDADE 2: Buscar URL via Evolution API (se configurado)
                    if (apiConfig.baseUrl && apiConfig.apiKey) {
                      return fetchMediaUrlByMessageId(apiConfig, messageId, remoteJid, 'image');
                    }
                    return null;
                  })
                  .then(url => {
                    if (url && !msg.mediaUrl) {
                      foundAny = true;
                      console.log('[ChatInterface] ✅ URL encontrada via messageId:', url.substring(0, 100));
                      msg.mediaUrl = url;

                      // Tenta atualizar no chat para forçar re-render
                      const chat = chats.find(c => c.id === (selectedChatId || ''));
                      if (chat) {
                        const messageIndex = chat.messages.findIndex(m => m.id === msg.id || m.whatsappMessageId === messageId);
                        if (messageIndex >= 0) {
                          const updatedMessages = [...chat.messages];
                          updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], mediaUrl: url };
                          onUpdateChat({ ...chat, messages: updatedMessages });
                        }
                      }
                    } else if (!url && !msg.mediaUrl) {
                      console.log('[ChatInterface] ⚠️ URL/base64 ainda não disponível (provável atraso do webhook).');
                    }
                  })
                  .catch(error => {
                    console.error('[ChatInterface] Erro ao buscar URL/base64 via messageId:', error);
                  })
                  .finally(() => {
                    // Se não encontrou nada, libera rápido para permitir retry (webhook pode chegar depois).
                    // Se encontrou, mantém bloqueio por mais tempo para evitar spam.
                    const delay = foundAny ? 60000 : 4000;
                    setTimeout(() => {
                      delete (window as any)[fetchKey];
                      if (foundAny) {
                        // Sucesso: limpa contador de tentativas
                        delete (window as any)[attemptsKey];
                      } else {
                        // Força re-render para tentar novamente sem depender de outras atualizações do app
                        setMediaRetryTick(t => t + 1);
                      }
                    }, delay);
                  });
              }
            }
          }
        }
      }
      
      if (!imageUrl) {
        // Log temporário para debug - quando não tem URL após todas as tentativas
        // A URL será atualizada quando os dados completos chegarem via WebSocket
        return (
          <div className="flex flex-col">
            <div className="p-4 bg-slate-700/50 rounded-lg text-sm text-slate-300">
              Imagem (URL não disponível)
            </div>
            {msg.content && msg.content !== 'Imagem' && (
              <p className={`text-sm mt-1 ${isUserMessage ? 'text-white' : ''}`}>{highlightedContent(msg.content)}</p>
            )}
          </div>
        );
      }
      
      const finalImageUrl = getMediaUrl(imageUrl, msg.mimeType, msg.type);
      if (!finalImageUrl) {
        // Log removido - muito verboso para produção
        return (
          <div className="flex flex-col">
            <div className="p-4 bg-slate-700/50 rounded-lg text-sm text-slate-300">
              Imagem (URL não disponível)
            </div>
            {msg.content && msg.content !== 'Imagem' && (
              <p className={`text-sm mt-1 ${isUserMessage ? 'text-white' : ''}`}>{highlightedContent(msg.content)}</p>
            )}
          </div>
        );
      }
      
      // console.log('[ChatInterface] renderMessageContent: Renderizando imagem com URL:', finalImageUrl.substring(0, 100));
      
      return (
        <div className="flex flex-col">
          <img 
            src={finalImageUrl} 
            alt="Imagem enviada" 
            className="rounded-lg max-w-full sm:max-w-sm mb-1 object-cover max-h-64 cursor-pointer hover:opacity-95" 
            onClick={() => openImageViewer(finalImageUrl, msg.fileName)}
            onLoad={() => {
              // console.log('[ChatInterface] ✅ Imagem carregada com sucesso:', finalImageUrl.substring(0, 100));
            }}
            onError={(e) => {
              // console.error('[ChatInterface] ❌ Erro ao carregar imagem:', {
              //   imageUrl: finalImageUrl.substring(0, 100),
              //   msgId: msg.id,
              //   msgType: msg.type,
              //   msgSender: msg.sender,
              //   originalMediaUrl: msg.mediaUrl?.substring(0, 100),
              //   error: e
              // });
              // Substitui a imagem por uma mensagem de erro
              const imgElement = e.target as HTMLImageElement;
              const parent = imgElement.parentElement;
              if (parent) {
                parent.innerHTML = `
                  <div class="p-4 bg-slate-700/50 rounded-lg text-sm text-slate-300">
                    Erro ao carregar imagem<br/>
                    <span class="text-xs opacity-70">URL: ${finalImageUrl.substring(0, 50)}...</span>
                  </div>
                `;
              }
            }}
          />
          {msg.content && msg.content !== 'Imagem' && (
             <p className={`text-sm mt-1 ${isUserMessage ? 'text-white' : ''}`}>{highlightedContent(msg.content)}</p>
          )}
          {statusLabel && (
            <span className="text-[11px] text-slate-400 mt-1">{statusLabel}</span>
          )}
        </div>
      );
    }
    if (msg.type === 'video') {
      let videoUrl = msg.mediaUrl;
      if (!videoUrl && msg.rawMessage) {
        videoUrl = findMediaUrlInRaw(msg.rawMessage, 'video');
        if (videoUrl) {
          msg.mediaUrl = videoUrl;
        }
      }

      if (!videoUrl) {
        scheduleMediaFetch(msg, 'video');
        return (
          <div className="flex flex-col">
            <div className="p-4 bg-slate-700/50 rounded-lg text-sm text-slate-300">
              Vídeo (URL não disponível)
            </div>
            {msg.content && msg.content !== 'Vídeo' && (
              <p className={`text-sm mt-1 ${isUserMessage ? 'text-white' : ''}`}>{highlightedContent(msg.content)}</p>
            )}
          </div>
        );
      }

      const finalVideoUrl = getMediaUrl(videoUrl, msg.mimeType, msg.type);
      if (!finalVideoUrl) {
        return (
          <div className="flex flex-col">
            <div className="p-4 bg-slate-700/50 rounded-lg text-sm text-slate-300">
              Vídeo (URL não disponível)
            </div>
            {msg.content && msg.content !== 'Vídeo' && (
              <p className={`text-sm mt-1 ${isUserMessage ? 'text-white' : ''}`}>{highlightedContent(msg.content)}</p>
            )}
          </div>
        );
      }

      return (
        <div className="flex flex-col">
          <video
            controls
            className="rounded-lg max-w-full sm:max-w-sm mb-1 max-h-72 bg-black"
            src={finalVideoUrl}
          />
          {msg.content && msg.content !== 'Vídeo' && (
            <p className={`text-sm mt-1 ${isUserMessage ? 'text-white' : ''}`}>{highlightedContent(msg.content)}</p>
          )}
          {statusLabel && (
            <span className="text-[11px] text-slate-400 mt-1">{statusLabel}</span>
          )}
        </div>
      );
    }
    if (msg.type === 'audio') {
      let audioUrl = msg.mediaUrl;
      if (!audioUrl && msg.rawMessage) {
        audioUrl = findMediaUrlInRaw(msg.rawMessage, 'audio');
        if (audioUrl) {
          msg.mediaUrl = audioUrl;
        }
      }

      if (!audioUrl) {
        scheduleMediaFetch(msg, 'audio');
        return (
          <div className="flex flex-col">
            <div className="p-3 bg-slate-700/50 rounded-lg text-sm text-slate-300">
              Áudio (URL não disponível)
            </div>
            {statusLabel && (
              <span className="text-[11px] text-slate-400 mt-1">{statusLabel}</span>
            )}
          </div>
        );
      }

      const finalAudioUrl = getMediaUrl(audioUrl, msg.mimeType, msg.type);
      if (!finalAudioUrl) {
        scheduleMediaFetch(msg, 'audio');
        return <span className="text-sm opacity-70">Áudio (URL não disponível)</span>;
      }

      const sizeLabel = formatFileSize(msg.fileSize);
      const timeLabel = msg.timestamp ? msg.timestamp.toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : null;

      return (
        <div className="flex flex-col gap-1 min-w-[220px]">
          <audio
            controls
            src={finalAudioUrl}
            className="w-full h-9"
            onError={() => {
              // console.error('[ChatInterface] Erro ao carregar áudio:', finalAudioUrl);
            }}
          />
          <div className="text-[11px] text-slate-400 flex items-center justify-between leading-tight">
            <div className="flex items-center gap-2">
              {sizeLabel && <span>{sizeLabel}</span>}
              {timeLabel && <span>{timeLabel}</span>}
            </div>
            {statusLabel && <span className="whitespace-nowrap">{statusLabel}</span>}
          </div>
        </div>
      );
    }
    if (msg.type === 'document') {
       let docUrl = msg.mediaUrl;
       if (!docUrl && msg.rawMessage) {
         docUrl = findMediaUrlInRaw(msg.rawMessage, 'document');
         if (docUrl) {
           msg.mediaUrl = docUrl;
         }
       }
       if (!docUrl) {
         scheduleMediaFetch(msg, 'document');
       }
       const finalDocUrl = docUrl ? getMediaUrl(docUrl, msg.mimeType, msg.type) : undefined;
       const isPdf = ((msg.mimeType || '').toLowerCase().includes('pdf')) || ((msg.fileName || '').toLowerCase().endsWith('.pdf'));
       const sizeLabel = formatFileSize(msg.fileSize);
       const timeLabel = msg.timestamp ? msg.timestamp.toLocaleString([], { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : null;
       return (
           <div
             className={`flex items-center gap-3 p-3 rounded-lg ${isUserMessage ? 'bg-white/10' : 'bg-black/5'} ${isPdf && finalDocUrl ? 'cursor-pointer hover:opacity-95' : ''}`}
             title={isPdf && finalDocUrl ? 'Clique para visualizar' : undefined}
             onClick={() => {
               if (isPdf && finalDocUrl) openPdfViewer(finalDocUrl, msg.fileName || 'documento.pdf');
             }}
             onKeyDown={(e) => {
               if (e.key === 'Enter' && isPdf && finalDocUrl) openPdfViewer(finalDocUrl, msg.fileName || 'documento.pdf');
             }}
             role={isPdf && finalDocUrl ? 'button' : undefined}
             tabIndex={isPdf && finalDocUrl ? 0 : -1}
           >
               <div className={`p-2 rounded-full ${isUserMessage ? 'bg-white/20 text-white' : 'bg-white text-emerald-600'}`}>
                   <FileIcon size={20} />
               </div>
               <div className="flex-1 overflow-hidden">
                   <p className={`text-sm font-medium truncate ${isUserMessage ? 'text-white' : ''}`}>{msg.fileName || 'Documento'}</p>
                   <p className={`text-xs uppercase ${isUserMessage ? 'text-slate-300' : 'opacity-70'}`}>{msg.mimeType?.split('/')[1] || 'FILE'}</p>
               </div>
               <div className="flex flex-col items-end gap-1">
                 {finalDocUrl ? (
                    <div className="flex items-center gap-1">
                      {isPdf && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openPdfViewer(finalDocUrl, msg.fileName || 'documento.pdf');
                          }}
                          className={`p-2 rounded-full ${isUserMessage ? 'text-white hover:bg-white/20' : 'text-emerald-700 hover:bg-emerald-100'}`}
                          title="Visualizar"
                        >
                          <Eye size={16} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadFromUrl(finalDocUrl, msg.fileName || (isPdf ? 'documento.pdf' : 'documento'));
                        }}
                        className={`p-2 rounded-full ${isUserMessage ? 'text-white hover:bg-white/20' : 'text-emerald-700 hover:bg-emerald-100'}`}
                        title="Baixar"
                      >
                        <ArrowRightLeft className="rotate-90" size={16} />
                      </button>
                    </div>
                 ) : (
                    <span className="text-xs text-slate-400">URL não disponível</span>
                 )}
                 <div className="text-[11px] text-slate-400 flex flex-col items-end leading-tight">
                   {sizeLabel && <span>{sizeLabel}</span>}
                   {timeLabel && <span>{timeLabel}</span>}
                   {statusLabel && <span>{statusLabel}</span>}
                 </div>
               </div>
           </div>
       );
    }
    const linkUrl = extractFirstUrl(content);
    const normalizedLinkUrl = linkUrl ? normalizePreviewUrl(linkUrl) : null;
    const previewState = normalizedLinkUrl ? linkPreviews[normalizedLinkUrl] : undefined;
    let hostLabel = '';
    if (normalizedLinkUrl) {
      try {
        hostLabel = new URL(normalizedLinkUrl).hostname;
      } catch {
        hostLabel = normalizedLinkUrl;
      }
    }

    const linkPreviewCard = normalizedLinkUrl ? (
      <div className={`mt-2 rounded-lg border ${isUserMessage ? 'border-white/20 bg-white/5' : 'border-slate-200 bg-white'} overflow-hidden`}>
        <a href={normalizedLinkUrl} target="_blank" rel="noreferrer" className="flex gap-3 p-3 no-underline text-inherit">
          {previewState?.status === 'ready' && previewState.data ? (
            <>
              {previewState.data.image && (
                <img
                  src={previewState.data.image}
                  alt={previewState.data.title || hostLabel || 'Link'}
                  className="w-16 h-16 object-cover rounded-md flex-shrink-0 border border-slate-200/70"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="flex-1 min-w-0 space-y-1">
                {hostLabel && <p className="text-[11px] uppercase tracking-wide text-emerald-500 truncate">{hostLabel}</p>}
                {previewState.data.title && <p className="text-sm font-semibold text-slate-800 truncate">{previewState.data.title}</p>}
                {previewState.data.description && <p className="text-xs text-slate-500 line-clamp-2">{previewState.data.description}</p>}
                {!previewState.data.title && !previewState.data.description && (
                  <p className="text-xs text-slate-500 truncate">{normalizedLinkUrl}</p>
                )}
              </div>
            </>
          ) : previewState?.status === 'error' ? (
            <span className="text-xs text-red-500">Não foi possível gerar o preview</span>
          ) : (
            <span className="text-xs text-slate-500">Carregando preview...</span>
          )}
        </a>
      </div>
    ) : null;

    return (
      <div className="flex flex-col gap-2">
        <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isUserMessage ? 'text-white' : 'text-slate-800'}`}>{highlightedContent(msg.content)}</p>
        {linkPreviewCard}
      </div>
    );
  };

  const displayedMessages = selectedChat?.messages.filter(msg => {
      if (!messageSearchTerm) return true;
      if (msg.content.toLowerCase().includes(messageSearchTerm.toLowerCase())) return true;
      return false;
  }) || [];

  return (
    <div className={`flex h-full bg-[#111316] md:rounded-lg shadow-lg overflow-hidden md:border border-[#0D0F13] neon-border ${isResizing ? 'select-none' : ''}`}>
      
      {/* Sidebar List (Resizable) */}
      <div 
        className={`flex-col bg-[#16191F] border-r border-[#0D0F13] ${selectedChatId ? 'hidden md:flex' : 'flex'}`}
        style={{ width: selectedChatId ? listWidth : '100%' }} // On mobile, if no chat selected, it takes full width
      >
        {/* Header da Sidebar */}
        <div className="p-4 bg-[#0D0F13] border-b border-[#111316] space-y-3 circuit-line">
           <div className="flex items-center gap-2 mb-2">
                <div className="flex flex-1 bg-[#111316] p-1 rounded-lg border border-[#0D0F13]">
                    <button 
                        onClick={() => setActiveTab('todo')}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all flex justify-center items-center gap-1 ${activeTab === 'todo' ? 'bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] shadow-lg shadow-[#00C3FF]/20 font-semibold' : 'text-slate-400 hover:text-[#00E0D1]'}`}
                    >
                        A Fazer
                    </button>
                    <button 
                        onClick={() => setActiveTab('waiting')}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all flex justify-center items-center gap-1 ${activeTab === 'waiting' ? 'bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] shadow-lg shadow-[#00C3FF]/20 font-semibold' : 'text-slate-400 hover:text-[#00E0D1]'}`}
                    >
                        <Clock size={12} /> Aguardando
                    </button>
                    <button 
                        onClick={() => setActiveTab('closed')}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all flex justify-center items-center gap-1 ${activeTab === 'closed' ? 'bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] shadow-lg shadow-[#00C3FF]/20 font-semibold' : 'text-slate-400 hover:text-[#00E0D1]'}`}
                    >
                        Finalizados
                    </button>
                </div>
                <button 
                    onClick={() => setIsNewChatModalOpen(true)}
                    className="p-2 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] rounded-lg hover:from-[#00B0E6] hover:to-[#00C8B8] shadow-lg shadow-[#00C3FF]/20 transition-all glow-gradient"
                    title="Novo Atendimento"
                >
                    <Plus size={18} strokeWidth={2.5} />
                </button>
           </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={18} strokeWidth={2} />
            <input 
              type="text" 
              placeholder="Buscar conversas..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#111316] border border-[#0D0F13] text-slate-200 rounded-full text-sm focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none placeholder:text-slate-500"
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
              className={`p-4 border-b border-[#111316] cursor-pointer hover:bg-[#0D0F13] transition-all group ${selectedChatId === chat.id ? 'bg-[#0D0F13] border-l-2 border-l-[#00E0D1] glow-cyan' : ''}`}
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <img src={chat.contactAvatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-200 text-sm flex items-center gap-1">
                      <span className="truncate">{chat.contactName}</span>
                      {chat.clientCode && (
                          <span className="text-[10px] text-slate-400 font-mono bg-[#111316] border border-[#0D0F13] px-1.5 py-0.5 rounded flex-shrink-0">#{chat.clientCode}</span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400 truncate">{chat.contactNumber}</p>
                  </div>
                  {/* Botão de excluir - visível para admins em todos os chats (incluindo finalizados) */}
                  {currentUser.role === 'admin' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setChatToDelete(chat);
                      }}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors flex-shrink-0 ml-2 z-10 relative"
                      title="Excluir chat"
                      style={{ minWidth: '32px', minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <span className="text-xs text-slate-400 block whitespace-nowrap font-medium">
                    {chat.lastMessageTime && chat.lastMessageTime instanceof Date ? chat.lastMessageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
              {chat.tags && Array.isArray(chat.tags) && chat.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {(chat.tags && Array.isArray(chat.tags) ? chat.tags : []).map(tag => {
                          if (!tag || typeof tag !== 'string') return null;
                          const tagDef = AVAILABLE_TAGS.find(t => t.name === tag);
                          return (
                            <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${tagDef ? tagDef.color : 'bg-slate-500/20 text-slate-300 border-slate-500/30'}`}>
                              {tag}
                            </span>
                          );
                      })}
                  </div>
              )}

              <div className="flex justify-between items-center mt-2">
                <div className="flex items-center gap-1 text-slate-300 max-w-[180px]">
                    {chat.messages && Array.isArray(chat.messages) && chat.messages.length > 0 && chat.messages[chat.messages.length -1]?.type === 'image' && <ImageIcon size={12} strokeWidth={2} />}
                    {chat.messages && Array.isArray(chat.messages) && chat.messages.length > 0 && chat.messages[chat.messages.length -1]?.type === 'audio' && <Mic size={12} strokeWidth={2} />}
                    {chat.messages && Array.isArray(chat.messages) && chat.messages.length > 0 && chat.messages[chat.messages.length -1]?.sender === 'agent' && <ArrowRight size={12} className="text-slate-400" strokeWidth={2}/>}
                    <p className="text-sm truncate text-slate-300">{chat.lastMessage}</p>
                </div>
                <div className="flex gap-1">
                    {!chat.assignedTo && chat.status !== 'closed' && (
                         <span className={`text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center gap-0.5`}>
                           <UserPlus size={10} /> Livre
                         </span>
                    )}
                    {chat.departmentId && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/30`}>
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
           flex-1 flex-col bg-[#111316] relative
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
            <div className="bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] shadow-lg z-10 shrink-0 circuit-line">
                <div className="h-16 flex items-center justify-between px-2 md:px-4 text-[#0D0F13]">
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
                                <div className="flex items-start gap-2">
                                    <button
                                        type="button"
                                        onClick={handleOpenUserInfo}
                                        className="flex-1 min-w-0 text-left group"
                                        title="Abrir informações do usuário"
                                    >
                                        <div className="flex items-center gap-2">
                                            <h2 className="font-semibold text-sm md:text-base truncate max-w-[150px] md:max-w-none">
                                                {selectedChat.contactName}
                                            </h2>
                                            {selectedChat.clientCode && (
                                                <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded font-mono text-emerald-50 flex-shrink-0">
                                                    | COD: {selectedChat.clientCode}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs opacity-90 text-emerald-100 truncate flex items-center gap-1">
                                            {getDepartmentName(selectedChat.departmentId)} 
                                            {!isAssigned && (selectedChat.status === 'open' || selectedChat.status === 'pending') && " • Aguardando Atendimento"}
                                        </p>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setIsEditingContact(true); }}
                                        className="p-1 rounded hover:bg-white/10 text-white/80 hover:text-white transition-colors"
                                        title="Editar nome e código"
                                    >
                                        <Edit3 size={16} />
                                    </button>
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
                                    {(AVAILABLE_TAGS && Array.isArray(AVAILABLE_TAGS) ? AVAILABLE_TAGS : []).map(tag => (
                                        <button 
                                            key={tag.name}
                                            onClick={() => handleAddTag(tag.name)}
                                            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm flex items-center gap-2"
                                        >
                                            <div className={`w-3 h-3 rounded-full ${tag && tag.color && typeof tag.color === 'string' ? tag.color.split(' ')[0] : 'bg-slate-200'}`}></div>
                                            {tag.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {(selectedChat.status === 'open' || selectedChat.status === 'pending') && isAssignedToMe && (
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
                            {(selectedChat.tags && Array.isArray(selectedChat.tags) ? selectedChat.tags : []).map(tag => {
                                if (!tag || typeof tag !== 'string') return null;
                                const tagDef = (AVAILABLE_TAGS && Array.isArray(AVAILABLE_TAGS)) ? AVAILABLE_TAGS.find(t => t && t.name === tag) : undefined;
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
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 relative" style={{ 
              background: 'linear-gradient(135deg, #111316 0%, #0D0F13 100%)',
              backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0, 227, 209, 0.04) 1px, transparent 0)',
              backgroundSize: '40px 40px'
            }}>
              {displayedMessages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-start' : msg.sender === 'system' ? 'justify-center' : 'justify-end'}`}>
                  {msg.sender === 'system' ? (
                     <div className="bg-[#0074FF]/20 text-[#00E0D1] border border-[#0074FF]/30 text-xs px-3 py-1 rounded-full shadow-sm my-2 neon-border">
                        {msg.content}
                     </div>
                  ) : (
                    <div 
                      className={`max-w-[85%] md:max-w-[70%] rounded-lg px-4 py-3 shadow-lg relative group ${
                        msg.sender === 'user' ? 'bg-[#374151] text-white rounded-tl-none border border-[#4B5563]' : 'bg-gradient-to-r from-[#0074FF] to-[#00C3FF] text-white rounded-tr-none glow-blue'
                      }`}
                      onDoubleClick={() => msg.sender !== 'system' && handleReplyToMessage(msg)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        const menuWidth = 200;
                        const menuHeight = 96;
                        const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8);
                        const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8);
                        setMessageMenu({ msg, x, y });
                      }}
                      style={msg.sender === 'user' ? { 
                        backgroundColor: '#374151',
                        color: '#FFFFFF',
                        borderColor: '#4B5563'
                      } : {}}
                    >
                      {/* Mensagem citada (se for uma resposta) */}
                      {msg.replyTo && (
                        <div className={`mb-1 px-2 py-1 border-l-2 ${
                          msg.replyTo.sender === 'user' ? 'border-[#00E0D1] bg-[#00E0D1]/10' : 'border-[#0074FF] bg-[#0074FF]/20'
                        } rounded text-xs`}>
                          <div className={`font-medium ${msg.sender === 'user' ? 'text-slate-300' : 'text-slate-600'}`}>
                            {msg.replyTo.sender === 'user' ? selectedChat?.contactName : currentUser.name}
                          </div>
                          <div className={msg.sender === 'user' ? 'text-slate-200' : 'text-slate-500 truncate'}>
                            {msg.replyTo.content.length > 50 ? msg.replyTo.content.substring(0, 50) + '...' : msg.replyTo.content}
                          </div>
                        </div>
                      )}

                      {/* Encaminhada */}
                      {msg.forwarded && (
                        <div className="px-2 pt-1 pb-0.5">
                          <span className="text-[11px] italic text-white/80">Encaminhada</span>
                        </div>
                      )}
                      
                      {/* Nome e Setor para mensagens enviadas (agent) */}
                      {msg.sender === 'agent' && currentUser.name && (() => {
                        // Tenta usar o departamento do usuário primeiro, depois o do chat como fallback
                        const userDepartmentId = currentUser.departmentId || selectedChat?.departmentId;
                        const userDepartment = userDepartmentId 
                          ? departments.find(d => d.id === userDepartmentId)
                          : null;
                        return (
                          <div className="px-2 pt-1 pb-0.5">
                            <span className="font-bold text-white/90">
                              {currentUser.name}
                              {userDepartment && <> - {userDepartment.name}</>}
                              :
                            </span>
                          </div>
                        );
                      })()}
                      
                      <div className={`px-2 pt-1 ${msg.sender === 'user' ? 'text-white' : ''}`}>
                        {renderMessageContent(msg)}
                      </div>

                      <div className="flex justify-between items-center gap-1 mt-1 pr-2 pb-1">
                        <button
                          onClick={() => handleReplyToMessage(msg)}
                          className={`opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 rounded ${
                            msg.sender === 'user' ? 'hover:bg-white/10' : 'hover:bg-black/5'
                          }`}
                          title="Responder"
                        >
                          <ArrowRightLeft size={12} className={msg.sender === 'user' ? 'text-slate-200' : 'text-slate-500'} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const menuWidth = 200;
                            const menuHeight = 96;
                            const x = Math.min(rect.right, window.innerWidth - menuWidth - 8);
                            const y = Math.min(rect.bottom, window.innerHeight - menuHeight - 8);
                            setMessageMenu({ msg, x, y });
                          }}
                          className={`opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 rounded ${
                            msg.sender === 'user' ? 'hover:bg-white/10' : 'hover:bg-black/5'
                          }`}
                          title="Mais ações"
                        >
                          <MoreVertical size={12} className={msg.sender === 'user' ? 'text-slate-200' : 'text-slate-500'} />
                        </button>
                        <div className="flex items-center gap-1 ml-auto">
                          <span className={`text-[10px] font-medium ${msg.sender === 'user' ? 'text-slate-200' : 'text-slate-500'}`}>
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
            {selectedChat.status !== 'closed' ? (
                <>
                {isAssigned && !isAssignedToMe ? (
                     <div className="p-4 bg-[#0D0F13] text-center border-t border-[#111316]">
                        <p className="text-slate-300 text-sm flex items-center justify-center gap-2">
                            <Lock size={16} strokeWidth={2} /> 
                            Este atendimento está sendo realizado por outro agente.
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Modo apenas visualização.</p>
                     </div>
                ) : !isAssigned ? (
                    <div className="p-4 bg-[#0D0F13] border-t border-[#111316] flex flex-col items-center justify-center gap-3">
                        <p className="text-slate-300 font-medium">Este chat ainda não possui um responsável.</p>
                        <button 
                            onClick={handleAssumeChat}
                            className="bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] px-8 py-3 rounded-lg font-tech shadow-lg glow-gradient transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                        >
                            <UserPlus size={20} strokeWidth={2.5} /> ASSUMIR ATENDIMENTO
                        </button>
                    </div>
                ) : (
                    <div className="bg-[#0D0F13] border-t border-[#111316] p-2 md:p-3 relative z-20">
                    
                        {/* Greeting Shortcut - Shows if assigned to me, no text yet, and greeting hasn't been sent */}
                        {isAssignedToMe && !inputText && !hasGreetingBeenSent() && (
                            <div className="absolute bottom-full left-0 w-full flex justify-center pb-2 pointer-events-none">
                                <button 
                                    onClick={handleInsertGreeting}
                                    className="pointer-events-auto bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] text-xs font-tech px-4 py-1.5 rounded-full shadow-lg glow-gradient transition-all hover:-translate-y-1 hover:scale-105 animate-in slide-in-from-bottom-2 flex items-center gap-1"
                                >
                                    👋 Enviar Saudação Inicial
                                </button>
                            </div>
                        )}

                        {/* Quick Replies Menu */}
                        {showQuickReplies && (
                            <div className="absolute bottom-full left-0 mb-2 ml-2 w-64 bg-[#16191F] rounded-lg shadow-xl neon-border overflow-hidden animate-in slide-in-from-bottom-2 z-50">
                                <div className="bg-[#0D0F13] px-3 py-2 border-b border-[#111316] text-xs font-futuristic text-[#00E0D1] flex justify-between items-center circuit-line">
                                    <span>Respostas Rápidas</span>
                                    <button onClick={() => setShowQuickReplies(false)} className="text-slate-400 hover:text-[#00E0D1]"><X size={14} strokeWidth={2} /></button>
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                    {quickReplies.map(qr => (
                                        <button 
                                            key={qr.id}
                                            onClick={() => { setInputText(qr.content); setShowQuickReplies(false); }}
                                            className="w-full text-left px-3 py-2 hover:bg-[#111316] text-sm text-slate-300 border-b border-[#0D0F13] last:border-0 transition-colors"
                                        >
                                            <span className="font-bold block text-[#00E0D1] text-xs mb-0.5">{qr.title}</span>
                                            <span className="truncate block text-slate-400">{qr.content}</span>
                                        </button>
                                    ))}
                                    {quickReplies.length === 0 && <p className="p-3 text-xs text-slate-500">Nenhuma mensagem cadastrada.</p>}
                                </div>
                            </div>
                        )}

                        {/* Workflows Menu */}
                        {showWorkflowsMenu && (
                            <div className="absolute bottom-full left-10 mb-2 w-72 bg-[#16191F] rounded-lg shadow-xl neon-border overflow-hidden animate-in slide-in-from-bottom-2 z-50">
                                <div className="bg-gradient-to-r from-[#00C3FF]/20 to-[#00E0D1]/20 px-3 py-2 border-b border-[#00E0D1]/30 text-xs font-futuristic text-[#00E0D1] flex justify-between items-center circuit-line">
                                    <span className="flex items-center gap-2"><ListChecks size={14} strokeWidth={2}/> Iniciar Fluxo de Atendimento</span>
                                    <button onClick={() => setShowWorkflowsMenu(false)} className="text-slate-400 hover:text-[#00E0D1]"><X size={14} strokeWidth={2} /></button>
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                    {workflows.map(wf => (
                                        <button 
                                            key={wf.id}
                                            onClick={() => handleStartWorkflow(wf)}
                                            className="w-full text-left px-3 py-2 hover:bg-[#111316] text-sm text-slate-300 border-b border-[#0D0F13] last:border-0 transition-colors"
                                        >
                                            <span className="font-semibold block text-slate-200">{wf.title}</span>
                                            <span className="text-xs text-slate-500">{wf.steps.length} etapas</span>
                                        </button>
                                    ))}
                                    {workflows.length === 0 && <p className="p-3 text-xs text-slate-500">Nenhum fluxo cadastrado.</p>}
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
                            <div className="bg-[#16191F] p-3 rounded-t-lg border-b border-[#0D0F13] flex items-center justify-between animate-in slide-in-from-bottom-2 neon-border">
                                <div className="flex items-center gap-3 overflow-hidden flex-1">
                                    <div className={`w-0.5 h-10 rounded ${
                                        replyingTo.sender === 'user' ? 'bg-[#00E0D1]' : 'bg-[#0074FF]'
                                    }`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-semibold text-slate-200">
                                            {replyingTo.sender === 'user' ? selectedChat?.contactName : currentUser.name}
                                        </div>
                                        <div className="text-xs text-slate-400 truncate">
                                            {replyingTo.content.length > 60 ? replyingTo.content.substring(0, 60) + '...' : replyingTo.content}
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleCancelReply} 
                                    className="p-1 hover:bg-[#111316] rounded-full text-slate-400 hover:text-[#00E0D1] flex-shrink-0 transition-colors"
                                    title="Cancelar resposta"
                                >
                                    <X size={18} strokeWidth={2} />
                                </button>
                            </div>
                        )}

                        {/* Attachment Preview Area */}
                        {selectedFile && (
                            <div className="bg-[#16191F] p-3 rounded-t-lg border-b border-[#0D0F13] flex items-center justify-between animate-in slide-in-from-bottom-2 neon-border">
                            <div className="flex items-center gap-3 overflow-hidden">
                                {filePreview ? (
                                    <img src={filePreview} className="w-12 h-12 object-cover rounded-md border border-[#0D0F13]" alt="Preview" />
                                ) : (
                                    <div className="w-12 h-12 bg-[#0D0F13] rounded-md flex items-center justify-center text-[#00E0D1] border border-[#00E0D1]/20"><FileIcon strokeWidth={2} /></div>
                                )}
                                <div>
                                    <p className="text-sm font-semibold truncate max-w-[150px] text-slate-200">{selectedFile.name}</p>
                                    <p className="text-xs text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                                </div>
                            </div>
                            <button onClick={clearAttachment} className="p-1 hover:bg-[#111316] rounded-full text-slate-400 hover:text-[#00E0D1] transition-colors">
                                <X size={20} strokeWidth={2} />
                            </button>
                            </div>
                        )}

                        {/* AI Badge */}
                        {isGeneratingAI && (
                            <div className="absolute -top-10 left-4 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] text-xs px-3 py-1 rounded-full pulse-glow flex items-center gap-2 font-medium">
                            <Bot size={12} strokeWidth={2.5} /> Gemini AI gerando resposta...
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
                                <div className="flex-1 flex items-center gap-2 md:gap-4 bg-[#16191F] px-2 md:px-4 py-3 rounded-full shadow-sm animate-in fade-in neon-border">
                                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                                    <span className="text-slate-200 font-mono font-medium min-w-[40px] text-sm">{formatTime(recordingTime)}</span>
                                    <div className="flex-1 text-xs text-slate-400 truncate">Gravando...</div>
                                    
                                    <button 
                                    onClick={cancelRecording} 
                                    className="p-2 text-red-400 hover:bg-red-500/20 rounded-full transition-colors"
                                    title="Cancelar"
                                    >
                                        <Trash2 size={20} strokeWidth={2} />
                                    </button>
                                    <button 
                                    onClick={() => stopRecording(true)} 
                                    className="p-2 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] rounded-full hover:from-[#00B0E6] hover:to-[#00C8B8] shadow-lg glow-gradient transition-all"
                                    title="Enviar Áudio"
                                    >
                                        <Send size={18} strokeWidth={2.5} />
                                    </button>
                                </div>
                            ) : (
                                // Standard Input UI
                                <>
                                    <button 
                                        onClick={() => setShowQuickReplies(!showQuickReplies)}
                                        className="p-2 rounded-full text-slate-400 hover:text-[#00E0D1] hover:bg-[#111316] transition-colors flex-shrink-0"
                                        title="Mensagens Rápidas"
                                    >
                                        <Zap size={20} strokeWidth={2} />
                                    </button>
                                    <button 
                                        onClick={() => setShowWorkflowsMenu(!showWorkflowsMenu)}
                                        className={`p-2 rounded-full transition-colors flex-shrink-0 ${showWorkflowsMenu || activeWorkflowDef ? 'text-[#00E0D1] bg-[#00E0D1]/20' : 'text-slate-400 hover:text-[#00E0D1] hover:bg-[#111316]'}`}
                                        title="Fluxos de Atendimento"
                                    >
                                        <ListChecks size={20} strokeWidth={2} />
                                    </button>
                                    <button 
                                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                        className={`p-2 rounded-full transition-colors flex-shrink-0 ${showEmojiPicker ? 'text-[#00E0D1] bg-[#00E0D1]/20' : 'text-slate-400 hover:text-[#00E0D1] hover:bg-[#111316]'}`}
                                        title="Emojis e Figurinhas"
                                    >
                                        <Smile size={20} strokeWidth={2} />
                                    </button>
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className={`p-2 rounded-full transition-colors flex-shrink-0 ${selectedFile ? 'text-[#00E0D1] bg-[#00E0D1]/20' : 'text-slate-400 hover:text-[#00E0D1] hover:bg-[#111316]'}`}
                                    >
                                        <Paperclip size={20} strokeWidth={2} />
                                    </button>
                                    <button 
                                        onClick={() => setIsContactModalOpen(true)}
                                        className="p-2 rounded-full transition-colors flex-shrink-0 text-slate-400 hover:text-[#00E0D1] hover:bg-[#111316]"
                                        title="Enviar contato"
                                    >
                                        <UserIcon size={20} strokeWidth={2} />
                                    </button>
                                    
                                    <div className="flex-1 relative">
                                        <input 
                                        type="text" 
                                        value={inputText}
                                        onChange={(e) => setInputText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                        placeholder={selectedFile ? "Legenda..." : replyingTo ? "Digite sua resposta..." : "Mensagem"}
                                        disabled={isSending}
                                        className={`w-full px-4 py-3 rounded-lg border border-[#0D0F13] focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none bg-[#16191F] text-slate-200 shadow-sm pr-10 text-sm placeholder:text-slate-500 ${selectedFile || replyingTo ? 'rounded-tl-none rounded-tr-none' : ''}`}
                                        />
                                        {!inputText && !selectedFile && (
                                            <button 
                                                onClick={handleGenerateAI}
                                                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-[#00E0D1] hover:text-[#00C3FF] hover:bg-[#00E0D1]/10 p-1.5 rounded-full transition-colors"
                                                title="Sugerir resposta com IA"
                                            >
                                            <Bot size={18} strokeWidth={2} />
                                            </button>
                                        )}
                                    </div>

                                    {inputText || selectedFile ? (
                                        <button 
                                            onClick={handleSendMessage}
                                            disabled={isSending}
                                            className="p-3 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] rounded-full hover:from-[#00B0E6] hover:to-[#00C8B8] shadow-lg glow-gradient transition-all hover:scale-105 active:scale-95 disabled:from-slate-600 disabled:to-slate-600 disabled:scale-100 flex-shrink-0"
                                        >
                                            <Send size={20} strokeWidth={2.5} />
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={startRecording}
                                            className="p-3 bg-[#16191F] text-slate-400 border border-[#0D0F13] rounded-full hover:bg-[#111316] hover:text-[#00E0D1] hover:border-[#00E0D1]/30 shadow-sm transition-all hover:scale-105 active:scale-95 flex-shrink-0"
                                        >
                                            <Mic size={20} strokeWidth={2} />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
                </>
            ) : (
              <div className="p-4 bg-[#0D0F13] text-center text-slate-400 text-sm border-t border-[#111316]">
                Esta conversa foi finalizada.
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-[#111316] border-b-8 border-[#00E0D1]">
            <div className="bg-gradient-to-r from-[#00C3FF]/20 to-[#00E0D1]/20 p-6 rounded-full mb-4 glow-cyan">
               <MessageSquare size={48} className="text-[#00E0D1]" strokeWidth={2} />
            </div>
            <h2 className="text-xl font-medium text-slate-700">Zentria Manager</h2>
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

      {/* Contact Selection Modal */}
      {isContactModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 animate-in zoom-in duration-200 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">Enviar Contato</h3>
              <button 
                onClick={() => { setIsContactModalOpen(false); setContactSearchTerm(''); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="mb-4">
              <input
                type="text"
                value={contactSearchTerm}
                onChange={(e) => setContactSearchTerm(e.target.value)}
                placeholder="Buscar contato..."
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg">
              {contacts
                .filter(contact => 
                  contact.name.toLowerCase().includes(contactSearchTerm.toLowerCase()) ||
                  contact.phone.includes(contactSearchTerm)
                )
                .map(contact => (
                  <button
                    key={contact.id}
                    onClick={() => handleSendContact(contact)}
                    disabled={isSending}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <img 
                      src={contact.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}`} 
                      className="w-10 h-10 rounded-full"
                      alt={contact.name}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{contact.name}</p>
                      <p className="text-xs text-slate-500 truncate">{contact.phone}</p>
                      {contact.email && (
                        <p className="text-xs text-slate-400 truncate">{contact.email}</p>
                      )}
                    </div>
                  </button>
                ))}
              {contacts.filter(contact => 
                contact.name.toLowerCase().includes(contactSearchTerm.toLowerCase()) ||
                contact.phone.includes(contactSearchTerm)
              ).length === 0 && (
                <div className="p-4 text-center text-slate-400 text-sm">
                  {contactSearchTerm ? 'Nenhum contato encontrado' : 'Nenhum contato cadastrado'}
                </div>
              )}
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

      {/* Delete Chat Confirmation Modal */}
      {chatToDelete && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 animate-in zoom-in duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <Trash2 className="text-red-600" size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Excluir Chat</h3>
            </div>
            <p className="text-slate-600 mb-6">
              Tem certeza que deseja excluir o chat com <strong>{chatToDelete.contactName}</strong>?
              <br />
              <span className="text-sm text-slate-500 mt-2 block">
                Esta ação irá excluir o chat do banco de dados, da Evolution API e do WhatsApp. Esta ação não pode ser desfeita.
              </span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setChatToDelete(null)}
                disabled={isDeletingChat}
                className="flex-1 py-2 px-4 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteChat}
                disabled={isDeletingChat}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isDeletingChat ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Excluir
                  </>
                )}
              </button>
            </div>
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

      {/* Message Context Menu (Responder / Encaminhar) */}
      {messageMenu && (
        <>
          <div className="fixed inset-0 z-[75]" onMouseDown={() => setMessageMenu(null)} />
          <div
            className="fixed z-[76] w-52 rounded-lg border border-white/10 bg-[#111316] shadow-2xl overflow-hidden"
            style={{ left: messageMenu.x, top: messageMenu.y }}
          >
            <button
              onClick={() => {
                handleReplyToMessage(messageMenu.msg);
                setMessageMenu(null);
              }}
              className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-white/5 transition-colors"
            >
              Responder
            </button>
            <button
              onClick={() => {
                openForwardModal(messageMenu.msg);
                setMessageMenu(null);
              }}
              className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-white/5 transition-colors border-t border-white/10"
            >
              Encaminhar
            </button>
          </div>
        </>
      )}

      {/* Forward Modal */}
      {isForwardModalOpen && forwardingMessage && (
        <div
          className="absolute inset-0 z-[65] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeForwardModal();
          }}
        >
          <div className="w-full max-w-md bg-[#111316] border border-[#0D0F13] rounded-xl shadow-2xl overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between bg-[#0D0F13] border-b border-[#111316]">
              <h3 className="text-slate-200 font-semibold text-sm">Encaminhar mensagem</h3>
              <button
                onClick={closeForwardModal}
                className="p-2 rounded-full hover:bg-white/5 text-slate-200 transition-colors"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Prévia</div>
                <div className="rounded-lg border border-white/10 bg-[#16191F] p-3 text-sm text-slate-200">
                  {forwardingMessage.type && forwardingMessage.type !== 'text' ? (
                    <div className="flex items-center gap-2">
                      <FileIcon size={16} className="text-[#00E0D1]" />
                      <span className="capitalize">
                        {forwardingMessage.type}
                      </span>
                      {forwardingMessage.fileName && (
                        <span className="text-xs text-slate-400 truncate">• {forwardingMessage.fileName}</span>
                      )}
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{forwardingMessage.content}</span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Destinos</div>
                <input
                  value={forwardSearchTerm}
                  onChange={(e) => setForwardSearchTerm(e.target.value)}
                  placeholder="Buscar chats..."
                  className="w-full px-3 py-2 rounded-lg bg-[#0D0F13] border border-white/10 text-slate-200 text-sm outline-none focus:border-[#00E0D1]/60"
                />
              </div>

              <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-white/10 bg-[#0D0F13]">
                {forwardDestinationChats.length === 0 ? (
                  <div className="p-4 text-sm text-slate-400">Nenhum chat encontrado.</div>
                ) : (
                  forwardDestinationChats.map(c => {
                    const checked = !!forwardSelected[c.id];
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleForwardDestination(c.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0 text-left hover:bg-white/5 transition-colors ${
                          checked ? 'bg-white/5' : ''
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${checked ? 'bg-[#00E0D1] border-[#00E0D1] text-[#0D0F13]' : 'border-white/20 text-transparent'}`}>
                          <Check size={14} />
                        </div>
                        <img src={c.contactAvatar} alt="" className="w-8 h-8 rounded-full bg-white flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-200 font-medium truncate">
                            {c.contactName || c.contactNumber || c.id}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {c.contactNumber} {c.clientCode ? `• COD: ${c.clientCode}` : ''}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="px-4 py-3 flex items-center justify-between border-t border-[#111316] bg-[#0D0F13]">
              <div className="text-xs text-slate-400">
                {forwardSelectedChatIds.length} selecionado(s)
              </div>
              <button
                onClick={handleConfirmForward}
                disabled={forwardSelectedChatIds.length === 0 || isForwarding}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] hover:from-[#00B0E6] hover:to-[#00C8B8] disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed transition-colors"
              >
                {isForwarding ? 'Encaminhando...' : 'Encaminhar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Info Panel */}
      {isUserInfoOpen && selectedChat && (
        <div className="absolute inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onMouseDown={() => setIsUserInfoOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-full sm:w-[380px] bg-[#111316] border-l border-[#0D0F13] shadow-2xl flex flex-col">
            <div className="h-16 px-4 flex items-center justify-between bg-[#0D0F13] border-b border-[#111316]">
              <button
                onClick={() => setIsUserInfoOpen(false)}
                className="p-2 rounded-full hover:bg-[#111316] text-slate-200 transition-colors"
                title="Voltar"
              >
                <ArrowLeft size={20} />
              </button>
              <h3 className="text-slate-200 font-semibold text-sm">Informações do usuário</h3>
              <div className="w-10" />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center gap-3">
                <img
                  src={selectedChat.contactAvatar}
                  alt=""
                  className="w-12 h-12 rounded-full bg-white flex-shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-slate-200 font-semibold truncate">{selectedChat.contactName}</div>
                  <div className="text-xs text-slate-400 truncate">{selectedChat.contactNumber}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleAddChatToContacts}
                  disabled={isCurrentChatInContacts || addContactStatus === 'loading'}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-2 ${
                    isCurrentChatInContacts
                      ? 'bg-white/5 text-slate-400 border-white/10 cursor-not-allowed'
                      : addContactStatus === 'loading'
                      ? 'bg-white/10 text-slate-200 border-white/20 cursor-wait'
                      : 'bg-[#16191F] text-slate-200 border-white/10 hover:border-[#00E0D1]/50 hover:text-[#00E0D1]'
                  }`}
                  title={isCurrentChatInContacts ? 'Já está nos contatos' : 'Adicionar aos contatos'}
                >
                  <UserPlus size={16} />
                  {isCurrentChatInContacts
                    ? 'Nos contatos'
                    : addContactStatus === 'loading'
                    ? 'Adicionando...'
                    : addContactStatus === 'success'
                    ? 'Adicionado'
                    : addContactStatus === 'error'
                    ? 'Falhou'
                    : 'Adicionar'}
                </button>

                <button
                  onClick={() => {
                    setShowSearch(true);
                    setIsUserInfoOpen(false);
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-medium border bg-[#16191F] text-slate-200 border-white/10 hover:border-[#00E0D1]/50 hover:text-[#00E0D1] transition-colors flex items-center justify-center gap-2"
                  title="Pesquisar na conversa"
                >
                  <Search size={16} />
                  Pesquisar
                </button>
              </div>

              {/* Editar nome e código */}
              <div className="rounded-lg border border-[#0D0F13] bg-[#16191F] p-3 space-y-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Nome e código</div>
                <input
                  value={editContactName}
                  onChange={(e) => setEditContactName(e.target.value)}
                  className="w-full bg-[#0D0F13] border border-white/10 text-slate-200 rounded px-3 py-2 text-sm outline-none focus:border-[#00E0D1]/60"
                  placeholder="Nome do contato"
                />
                <input
                  value={editClientCode}
                  onChange={(e) => setEditClientCode(e.target.value)}
                  className="w-full bg-[#0D0F13] border border-white/10 text-slate-200 rounded px-3 py-2 text-sm outline-none focus:border-[#00E0D1]/60 font-mono"
                  placeholder="Código do cliente"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSaveContactInfo}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] hover:from-[#00B0E6] hover:to-[#00C8B8] transition-colors"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => {
                      setEditContactName(selectedChat.contactName);
                      setEditClientCode(selectedChat.clientCode || '');
                    }}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-white/10 bg-[#0D0F13] text-slate-200 hover:border-white/20 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-[#0D0F13] rounded-lg p-1 border border-white/10">
                <button
                  onClick={() => setUserInfoTab('media')}
                  className={`flex-1 text-xs font-semibold py-2 rounded-md transition-colors ${
                    userInfoTab === 'media' ? 'bg-white/10 text-[#00E0D1]' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  Mídia ({userInfoData.media.length})
                </button>
                <button
                  onClick={() => setUserInfoTab('links')}
                  className={`flex-1 text-xs font-semibold py-2 rounded-md transition-colors ${
                    userInfoTab === 'links' ? 'bg-white/10 text-[#00E0D1]' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  Links ({userInfoData.links.length})
                </button>
                <button
                  onClick={() => setUserInfoTab('docs')}
                  className={`flex-1 text-xs font-semibold py-2 rounded-md transition-colors ${
                    userInfoTab === 'docs' ? 'bg-white/10 text-[#00E0D1]' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  Docs ({userInfoData.docs.length})
                </button>
              </div>

              {/* Conteúdo das abas */}
              {userInfoTab === 'media' && (
                <div className="space-y-3">
                  {/* Grid de imagens / stickers / vídeos */}
                  <div className="grid grid-cols-3 gap-2">
                    {userInfoData.media
                      .filter(m => m.type === 'image' || m.type === 'sticker' || m.type === 'video')
                      .slice()
                      .reverse()
                      .map(m => {
                        const mediaType: 'image' | 'video' = m.type === 'video' ? 'video' : 'image';
                        let rawUrl = m.mediaUrl;
                        if (!rawUrl && m.rawMessage) {
                          rawUrl = findMediaUrlInRaw(m.rawMessage, mediaType);
                        }
                        const finalUrl = rawUrl ? getMediaUrl(rawUrl, m.mimeType, m.type) : undefined;
                        const key = m.id || m.whatsappMessageId || `${m.timestamp?.toString?.() || ''}_${Math.random()}`;

                        if (!finalUrl) {
                          return (
                            <button
                              key={key}
                              onClick={() => scheduleMediaFetch(m, mediaType)}
                              className="aspect-square rounded-lg border border-white/10 bg-[#16191F] flex flex-col items-center justify-center text-slate-400 hover:text-[#00E0D1] hover:border-[#00E0D1]/30 transition-colors"
                              title="Mídia sem URL (tentar buscar)"
                            >
                              {m.type === 'video' ? <Play size={18} /> : <ImageIcon size={18} />}
                              <span className="text-[10px] mt-1">Buscar</span>
                            </button>
                          );
                        }

                        if (m.type === 'video') {
                          return (
                            <button
                              key={key}
                              onClick={() => openVideoViewer(finalUrl, m.fileName)}
                              className="relative aspect-square rounded-lg overflow-hidden border border-white/10 bg-black hover:border-[#00E0D1]/30 transition-colors"
                              title="Abrir vídeo"
                            >
                              <video
                                src={finalUrl}
                                className="w-full h-full object-cover opacity-80"
                                muted
                                playsInline
                                preload="metadata"
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-9 h-9 rounded-full bg-black/50 border border-white/20 flex items-center justify-center">
                                  <Play size={18} className="text-white" />
                                </div>
                              </div>
                            </button>
                          );
                        }

                        return (
                          <button
                            key={key}
                            onClick={() => openImageViewer(finalUrl, m.fileName)}
                            className="aspect-square rounded-lg overflow-hidden border border-white/10 bg-black hover:border-[#00E0D1]/30 transition-colors"
                            title="Abrir imagem"
                          >
                            <img
                              src={finalUrl}
                              alt={m.fileName || 'Imagem'}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </button>
                        );
                      })}
                  </div>

                  {/* Áudios */}
                  {userInfoData.media.some(m => m.type === 'audio') && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Áudios</div>
                      {userInfoData.media
                        .filter(m => m.type === 'audio')
                        .slice()
                        .reverse()
                        .map(m => {
                          let rawUrl = m.mediaUrl;
                          if (!rawUrl && m.rawMessage) {
                            rawUrl = findMediaUrlInRaw(m.rawMessage, 'audio');
                          }
                          const finalUrl = rawUrl ? getMediaUrl(rawUrl, m.mimeType, m.type) : undefined;
                          const key = m.id || m.whatsappMessageId || `${m.timestamp?.toString?.() || ''}_${Math.random()}`;
                          return (
                            <div key={key} className="rounded-lg border border-white/10 bg-[#16191F] p-2">
                              {finalUrl ? (
                                <audio controls src={finalUrl} className="w-full h-9" />
                              ) : (
                                <button
                                  onClick={() => scheduleMediaFetch(m, 'audio')}
                                  className="w-full text-left text-sm text-slate-300 hover:text-[#00E0D1]"
                                >
                                  Áudio (buscar URL)
                                </button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {userInfoTab === 'links' && (
                <div className="space-y-2">
                  {userInfoData.links.length === 0 ? (
                    <div className="text-sm text-slate-400">Nenhum link encontrado.</div>
                  ) : (
                    userInfoData.links.map(item => {
                      const previewState = linkPreviews[item.url];
                      return (
                        <div key={item.url} className="rounded-lg border border-white/10 bg-[#16191F] overflow-hidden">
                          <a href={item.url} target="_blank" rel="noreferrer" className="block p-3 no-underline text-inherit hover:bg-white/5 transition-colors">
                            <div className="text-[11px] uppercase tracking-wide text-[#00E0D1] truncate">{item.host}</div>
                            {previewState?.status === 'ready' && previewState.data ? (
                              <div className="mt-2 flex gap-3">
                                {previewState.data.image && (
                                  <img
                                    src={previewState.data.image}
                                    alt={previewState.data.title || item.host}
                                    className="w-14 h-14 object-cover rounded-md flex-shrink-0 border border-white/10"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                )}
                                <div className="min-w-0">
                                  {previewState.data.title && (
                                    <div className="text-sm font-semibold text-slate-100 truncate">{previewState.data.title}</div>
                                  )}
                                  {previewState.data.description && (
                                    <div className="text-xs text-slate-400 line-clamp-2">{previewState.data.description}</div>
                                  )}
                                  {!previewState.data.title && !previewState.data.description && (
                                    <div className="text-xs text-slate-400 truncate">{item.url}</div>
                                  )}
                                </div>
                              </div>
                            ) : previewState?.status === 'error' ? (
                              <div className="text-xs text-red-400 mt-1">Não foi possível gerar o preview</div>
                            ) : (
                              <div className="text-xs text-slate-400 mt-1">Carregando preview...</div>
                            )}
                          </a>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {userInfoTab === 'docs' && (
                <div className="space-y-2">
                  {userInfoData.docs.length === 0 ? (
                    <div className="text-sm text-slate-400">Nenhum documento encontrado.</div>
                  ) : (
                    userInfoData.docs
                      .slice()
                      .reverse()
                      .map(m => {
                        let rawUrl = m.mediaUrl;
                        if (!rawUrl && m.rawMessage) {
                          rawUrl = findMediaUrlInRaw(m.rawMessage, 'document');
                        }
                        const finalUrl = rawUrl ? getMediaUrl(rawUrl, m.mimeType, m.type) : undefined;
                        const isPdf = ((m.mimeType || '').toLowerCase().includes('pdf')) || ((m.fileName || '').toLowerCase().endsWith('.pdf'));
                        const sizeLabel = formatFileSize(m.fileSize);
                        const key = m.id || m.whatsappMessageId || `${m.timestamp?.toString?.() || ''}_${Math.random()}`;

                        return (
                          <div key={key} className="rounded-lg border border-white/10 bg-[#16191F] p-3 flex items-center gap-3">
                            <div className="p-2 rounded-full bg-white/10 text-slate-200">
                              <FileIcon size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-slate-200 font-medium truncate">{m.fileName || 'Documento'}</div>
                              <div className="text-xs text-slate-400 truncate">
                                {(m.mimeType || 'FILE').toUpperCase()} {sizeLabel ? `• ${sizeLabel}` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {isPdf && finalUrl && (
                                <button
                                  onClick={() => openPdfViewer(finalUrl, m.fileName || 'documento.pdf')}
                                  className="p-2 rounded-full hover:bg-white/10 text-slate-200 hover:text-[#00E0D1] transition-colors"
                                  title="Visualizar"
                                >
                                  <Eye size={16} />
                                </button>
                              )}
                              {finalUrl ? (
                                <button
                                  onClick={() => downloadFromUrl(finalUrl, m.fileName || (isPdf ? 'documento.pdf' : 'documento'))}
                                  className="p-2 rounded-full hover:bg-white/10 text-slate-200 hover:text-[#00E0D1] transition-colors"
                                  title="Baixar"
                                >
                                  <ArrowRightLeft className="rotate-90" size={16} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => scheduleMediaFetch(m, 'document')}
                                  className="text-xs text-slate-400 hover:text-[#00E0D1]"
                                  title="Buscar URL"
                                >
                                  Buscar
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Media Viewer (Lightbox) */}
      {imageViewer && (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeImageViewer();
          }}
        >
          <div className="w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-3 text-white">
              <div className="text-sm font-medium truncate">
                {imageViewer.fileName || 'Imagem'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadImageViewer}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  title="Baixar"
                >
                  <ArrowRightLeft className="rotate-90" size={18} />
                </button>
                <button
                  onClick={closeImageViewer}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  title="Fechar (Esc)"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 rounded-lg bg-black/40 border border-white/10 overflow-auto flex items-center justify-center p-2">
              <img
                src={imageViewer.url}
                alt={imageViewer.fileName || 'Imagem'}
                className="max-h-[80vh] max-w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* PDF Viewer */}
      {pdfViewer && (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePdfViewer();
          }}
        >
          <div className="w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-3 text-white">
              <div className="text-sm font-medium truncate">
                {pdfViewer.fileName || 'Documento'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadPdfViewer}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  title="Baixar"
                >
                  <ArrowRightLeft className="rotate-90" size={18} />
                </button>
                <button
                  onClick={closePdfViewer}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  title="Fechar (Esc)"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 rounded-lg bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center">
              {pdfViewerUrl ? (
                <iframe
                  src={pdfViewerUrl}
                  title={pdfViewer.fileName || 'PDF'}
                  className="w-full h-[80vh] bg-white"
                />
              ) : (
                <div className="p-4 text-sm text-white/80">PDF indisponível para visualização</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Video Viewer */}
      {videoViewer && (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeVideoViewer();
          }}
        >
          <div className="w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-3 text-white">
              <div className="text-sm font-medium truncate">
                {videoViewer.fileName || 'Vídeo'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadVideoViewer}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  title="Baixar"
                >
                  <ArrowRightLeft className="rotate-90" size={18} />
                </button>
                <button
                  onClick={closeVideoViewer}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  title="Fechar (Esc)"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="flex-1 rounded-lg bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center">
              <video
                controls
                src={videoViewer.url}
                className="w-full h-[80vh] bg-black"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ChatInterface;