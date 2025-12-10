

export enum UserRole {
  ADMIN = 'ADMIN',
  AGENT = 'AGENT'
}

export enum MessageStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  ERROR = 'ERROR'
}

export type MessageType = 'text' | 'image' | 'audio' | 'document' | 'video' | 'sticker';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  avatar: string;
  departmentId?: string;
  allowGeneralConnection?: boolean; // Permite ver chats sem departamento
}

export interface Department {
  id: string;
  name: string;
  description: string;
  color: string;
}

export interface QuickReply {
  id: string;
  title: string;
  content: string;
}

// --- WORKFLOW TYPES ---
export interface WorkflowStep {
  id: string;
  title: string;
  targetDepartmentId?: string; // Se preenchido, sugere transferencia
}

export interface Workflow {
  id: string;
  title: string;
  steps: WorkflowStep[];
}

export interface ActiveWorkflow {
  workflowId: string;
  completedStepIds: string[];
}
// ----------------------

// --- NEW FEATURES TYPES ---

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatar?: string;
  source: 'manual' | 'google' | 'csv';
  lastSync?: Date;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface BusinessHours {
  dayOfWeek: number; // 0 = Domingo, 1 = Segunda...
  isOpen: boolean;
  openTime: string; // "09:00"
  closeTime: string; // "18:00"
}

export interface ChatbotConfig {
  isEnabled: boolean;
  businessHours: BusinessHours[];
  awayMessage: string;
  greetingMessage: string;
}

// -------------------------

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'agent' | 'system';
  timestamp: Date;
  status: MessageStatus;
  type?: MessageType;
  mediaUrl?: string;
  fileName?: string;
  mimeType?: string;
  author?: string; // Real JID (identificador único) de quem enviou, usado para correções
  whatsappMessageId?: string; // ID real da mensagem no WhatsApp (key.id)
  rawMessage?: any; // Objeto completo da mensagem da API (necessário para respostas)
  replyTo?: {
    id: string;
    content: string;
    sender: 'user' | 'agent' | 'system';
    whatsappMessageId?: string; // ID real do WhatsApp da mensagem original
  }; // Referência à mensagem que está sendo respondida
}

export interface Chat {
  id: string;
  contactName: string;
  contactNumber: string;
  contactAvatar: string;
  clientCode?: string;
  tags?: string[]; // Array of Tag IDs or Names
  departmentId: string | null;
  unreadCount: number;
  lastMessage: string;
  lastMessageTime: Date;
  status: 'open' | 'pending' | 'closed';
  messages: Message[];
  assignedTo?: string;
  rating?: number; // 1 to 5 stars
  endedAt?: Date;
  activeWorkflow?: ActiveWorkflow; // Fluxo ativo neste chat
  awaitingRating?: boolean; // Indica se está aguardando resposta de avaliação (1-5)
  awaitingDepartmentSelection?: boolean; // Indica se está aguardando seleção de setor pelo usuário
  departmentSelectionSent?: boolean; // Indica se a mensagem de seleção de setores já foi enviada
}

export interface ApiConfig {
  baseUrl: string;
  apiKey: string; // Token da instância (usado no campo 'token' do payload)
  authenticationApiKey?: string; // AUTHENTICATION_API_KEY do servidor (usado no header 'apikey' das requisições HTTP)
  instanceName: string;
  isDemo: boolean;
  googleClientId?: string; // Client ID for Google People API
  geminiApiKey?: string; // API Key do Google Gemini para respostas de IA
  holidayStates?: string[]; // Estados para buscar feriados municipais no dashboard
}

export type ViewState = 'dashboard' | 'chat' | 'connections' | 'departments' | 'settings' | 'users' | 'reports' | 'workflows' | 'contacts' | 'chatbot' | 'holidays';