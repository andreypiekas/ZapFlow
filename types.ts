
export enum UserRole {
  ADMIN = 'ADMIN',
  AGENT = 'AGENT'
}

export enum MessageStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ'
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
  source: 'manual' | 'google';
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
}

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  isDemo: boolean;
}

export type ViewState = 'dashboard' | 'chat' | 'connections' | 'departments' | 'settings' | 'users' | 'reports' | 'workflows' | 'contacts' | 'chatbot';
