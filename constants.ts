import { Chat, Department, MessageStatus, User, UserRole } from './types';

export const INITIAL_DEPARTMENTS: Department[] = [
  { id: 'dept_1', name: 'Comercial', description: 'Vendas e novos negócios', color: 'bg-blue-500' },
  { id: 'dept_2', name: 'Suporte Técnico', description: 'Resolução de problemas e bugs', color: 'bg-orange-500' },
  { id: 'dept_3', name: 'Financeiro', description: 'Cobranças e faturamento', color: 'bg-green-600' },
];

export const INITIAL_USERS: User[] = [
  {
    id: 'user_1',
    name: 'Admin Master',
    email: 'admin@zapflow.com.br',
    password: '123',
    role: UserRole.ADMIN,
    avatar: 'https://picsum.photos/200/200?random=1'
  },
  {
    id: 'user_2',
    name: 'João Vendas',
    email: 'joao@zapflow.com.br',
    password: '123',
    role: UserRole.AGENT,
    departmentId: 'dept_1', // Pertence ao Comercial
    avatar: 'https://picsum.photos/200/200?random=50'
  },
  {
    id: 'user_3',
    name: 'Maria Suporte',
    email: 'maria@zapflow.com.br',
    password: '123',
    role: UserRole.AGENT,
    departmentId: 'dept_2', // Pertence ao Suporte
    avatar: 'https://picsum.photos/200/200?random=60'
  }
];

// Mantendo compatibilidade com código antigo se necessário, mas preferir usar INITIAL_USERS
export const MOCK_USER: User = INITIAL_USERS[0];

export const INITIAL_CHATS: Chat[] = [
  {
    id: 'chat_1',
    contactName: 'Carlos Silva',
    contactNumber: '+55 11 99999-9999',
    contactAvatar: 'https://picsum.photos/200/200?random=2',
    departmentId: 'dept_1', // Comercial
    unreadCount: 2,
    lastMessage: 'Gostaria de saber os planos disponíveis.',
    lastMessageTime: new Date(new Date().getTime() - 1000 * 60 * 5), // 5 mins ago
    status: 'open',
    messages: [
      { id: 'm1', content: 'Olá, boa tarde!', sender: 'user', timestamp: new Date(Date.now() - 360000), status: MessageStatus.READ },
      { id: 'm2', content: 'Gostaria de saber os planos disponíveis.', sender: 'user', timestamp: new Date(Date.now() - 300000), status: MessageStatus.READ },
    ]
  },
  {
    id: 'chat_2',
    contactName: 'Mariana Costa',
    contactNumber: '+55 21 98888-8888',
    contactAvatar: 'https://picsum.photos/200/200?random=3',
    departmentId: null, // Sem departamento (Triagem)
    unreadCount: 1,
    lastMessage: 'Meu boleto venceu, como atualizo?',
    lastMessageTime: new Date(new Date().getTime() - 1000 * 60 * 30), // 30 mins ago
    status: 'pending',
    messages: [
      { id: 'm3', content: 'Meu boleto venceu, como atualizo?', sender: 'user', timestamp: new Date(Date.now() - 1800000), status: MessageStatus.DELIVERED },
    ]
  },
  {
    id: 'chat_3',
    contactName: 'Tech Solutions Ltda',
    contactNumber: '+55 31 97777-7777',
    contactAvatar: 'https://picsum.photos/200/200?random=4',
    departmentId: 'dept_2', // Suporte
    unreadCount: 0,
    lastMessage: 'Reiniciei o modem e funcionou.',
    lastMessageTime: new Date(new Date().getTime() - 1000 * 60 * 60 * 2), // 2 hours ago
    status: 'open',
    messages: [
      { id: 'm4', content: 'Estou sem internet.', sender: 'user', timestamp: new Date(Date.now() - 7200000), status: MessageStatus.READ },
      { id: 'm5', content: 'Já tentou reiniciar o modem?', sender: 'agent', timestamp: new Date(Date.now() - 7100000), status: MessageStatus.READ },
      { id: 'm6', content: 'Reiniciei o modem e funcionou.', sender: 'user', timestamp: new Date(Date.now() - 7000000), status: MessageStatus.READ },
    ]
  }
];