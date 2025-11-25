export enum UserRole {
  ADMIN = 'ADMIN',
  AGENT = 'AGENT'
}

export enum MessageStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ'
}

export type MessageType = 'text' | 'image' | 'audio' | 'document' | 'video';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // In a real app, this would be hashed
  role: UserRole;
  avatar: string;
  departmentId?: string; // If null/undefined and role is AGENT, they might see nothing or unassigned
}

export interface Department {
  id: string;
  name: string;
  description: string;
  color: string;
}

export interface Message {
  id: string;
  content: string; // Caption for media or text content
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
  departmentId: string | null;
  unreadCount: number;
  lastMessage: string;
  lastMessageTime: Date;
  status: 'open' | 'pending' | 'closed';
  messages: Message[];
  assignedTo?: string; // User ID
}

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
  isDemo: boolean;
}

export type ViewState = 'dashboard' | 'chat' | 'connections' | 'departments' | 'settings' | 'users';