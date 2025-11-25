import { Chat, Department, MessageStatus, QuickReply, User, UserRole } from './types';

export const INITIAL_DEPARTMENTS: Department[] = [
  { id: 'dept_1', name: 'Comercial', description: 'Vendas e novos negócios', color: 'bg-blue-500' },
  { id: 'dept_2', name: 'Suporte Técnico', description: 'Resolução de problemas e bugs', color: 'bg-orange-500' },
  { id: 'dept_3', name: 'Financeiro', description: 'Cobranças e faturamento', color: 'bg-green-600' },
];

export const INITIAL_USERS: User[] = [
  {
    id: 'user_1',
    name: 'Admin Master',
    email: 'admin@hostgator.com',
    password: '123',
    role: UserRole.ADMIN,
    avatar: 'https://picsum.photos/200/200?random=1',
    allowGeneralConnection: true
  },
  {
    id: 'user_2',
    name: 'João Vendas',
    email: 'joao@zapflow.com.br',
    password: '123',
    role: UserRole.AGENT,
    departmentId: 'dept_1',
    avatar: 'https://picsum.photos/200/200?random=50',
    allowGeneralConnection: false
  },
  {
    id: 'user_3',
    name: 'Maria Suporte',
    email: 'maria@zapflow.com.br',
    password: '123',
    role: UserRole.AGENT,
    departmentId: 'dept_2',
    avatar: 'https://picsum.photos/200/200?random=60',
    allowGeneralConnection: true // Exemplo: Suporte pode ver triagem
  }
];

export const INITIAL_QUICK_REPLIES: QuickReply[] = [
  { id: 'qr_1', title: 'Boas vindas', content: 'Olá! Como posso ajudar você hoje?' },
  { id: 'qr_2', title: 'Aguarde um momento', content: 'Estou verificando suas informações, só um momento por favor.' },
  { id: 'qr_3', title: 'Pix', content: 'Nossa chave Pix é: financeiro@zapflow.com.br' },
];

export const INITIAL_CHATS: Chat[] = [
  {
    id: 'chat_1',
    contactName: 'Carlos Silva',
    contactNumber: '+55 11 99999-9999',
    contactAvatar: 'https://picsum.photos/200/200?random=2',
    departmentId: 'dept_1',
    unreadCount: 2,
    lastMessage: 'Gostaria de saber os planos disponíveis.',
    lastMessageTime: new Date(new Date().getTime() - 1000 * 60 * 5),
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
    departmentId: null, // Triagem
    unreadCount: 1,
    lastMessage: 'Meu boleto venceu, como atualizo?',
    lastMessageTime: new Date(new Date().getTime() - 1000 * 60 * 30),
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
    departmentId: 'dept_2',
    unreadCount: 0,
    lastMessage: 'Reiniciei o modem e funcionou.',
    lastMessageTime: new Date(new Date().getTime() - 1000 * 60 * 60 * 2),
    status: 'open',
    messages: [
      { id: 'm4', content: 'Estou sem internet.', sender: 'user', timestamp: new Date(Date.now() - 7200000), status: MessageStatus.READ },
      { id: 'm5', content: 'Já tentou reiniciar o modem?', sender: 'agent', timestamp: new Date(Date.now() - 7100000), status: MessageStatus.READ },
      { id: 'm6', content: 'Reiniciei o modem e funcionou.', sender: 'user', timestamp: new Date(Date.now() - 7000000), status: MessageStatus.READ },
    ]
  },
  // Dados simulados para relatórios (Chats finalizados)
  {
    id: 'chat_old_1',
    contactName: 'Roberto Alves',
    contactNumber: '+55 41 99999-1111',
    contactAvatar: 'https://picsum.photos/200/200?random=10',
    departmentId: 'dept_1',
    unreadCount: 0,
    lastMessage: 'Obrigado pelo atendimento!',
    lastMessageTime: new Date(new Date().getTime() - 1000 * 60 * 60 * 24),
    status: 'closed',
    rating: 5,
    endedAt: new Date(new Date().getTime() - 1000 * 60 * 60 * 24),
    messages: []
  },
  {
    id: 'chat_old_2',
    contactName: 'Julia Pires',
    contactNumber: '+55 11 98888-2222',
    contactAvatar: 'https://picsum.photos/200/200?random=11',
    departmentId: 'dept_2',
    unreadCount: 0,
    lastMessage: 'Resolvido.',
    lastMessageTime: new Date(new Date().getTime() - 1000 * 60 * 60 * 48),
    status: 'closed',
    rating: 4,
    endedAt: new Date(new Date().getTime() - 1000 * 60 * 60 * 48),
    messages: []
  },
    {
    id: 'chat_old_3',
    contactName: 'Mercado Local',
    contactNumber: '+55 11 97777-3333',
    contactAvatar: 'https://picsum.photos/200/200?random=12',
    departmentId: 'dept_3',
    unreadCount: 0,
    lastMessage: 'Ok, aguardo o boleto.',
    lastMessageTime: new Date(new Date().getTime() - 1000 * 60 * 60 * 5),
    status: 'closed',
    rating: 5,
    endedAt: new Date(new Date().getTime() - 1000 * 60 * 60 * 5),
    messages: []
  }
];