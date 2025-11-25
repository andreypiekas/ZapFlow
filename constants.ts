
import { Chat, Department, MessageStatus, QuickReply, User, UserRole, Workflow, Contact, ChatbotConfig } from './types';

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
    allowGeneralConnection: true
  }
];

export const INITIAL_QUICK_REPLIES: QuickReply[] = [
  { id: 'qr_1', title: 'Boas vindas', content: 'Olá! Como posso ajudar você hoje?' },
  { id: 'qr_2', title: 'Aguarde um momento', content: 'Estou verificando suas informações, só um momento por favor.' },
  { id: 'qr_3', title: 'Pix', content: 'Nossa chave Pix é: financeiro@zapflow.com.br' },
];

export const INITIAL_WORKFLOWS: Workflow[] = [
  {
    id: 'wf_1',
    title: 'Atualizar Boleto Vencido',
    steps: [
      { id: 's1', title: 'Solicitar CPF/CNPJ do cliente' },
      { id: 's2', title: 'Gerar boleto atualizado no sistema' },
      { id: 's3', title: 'Enviar arquivo PDF no chat' },
      { id: 's4', title: 'Confirmar recebimento com cliente' }
    ]
  },
  {
    id: 'wf_2',
    title: 'Triagem e Encaminhamento',
    steps: [
      { id: 's1', title: 'Identificar necessidade do cliente' },
      { id: 's2', title: 'Coletar dados cadastrais básicos' },
      { id: 's3', title: 'Encaminhar para Financeiro', targetDepartmentId: 'dept_3' }
    ]
  }
];

export const INITIAL_CHATS: Chat[] = [
  {
    id: 'chat_1',
    contactName: 'Carlos Silva',
    clientCode: '1005',
    contactNumber: '+55 11 99999-9999',
    contactAvatar: 'https://picsum.photos/200/200?random=2',
    departmentId: 'dept_1',
    tags: ['VIP', 'Recorrente'],
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
    clientCode: '2042',
    contactNumber: '+55 21 98888-8888',
    contactAvatar: 'https://picsum.photos/200/200?random=3',
    departmentId: null, // Triagem
    tags: ['Novo Lead'],
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

export const MOCK_GOOGLE_CONTACTS: Contact[] = [
    { id: 'gc_1', name: 'Carlos da Silva (Google)', phone: '+55 11 99999-9999', source: 'google', email: 'carlos@gmail.com' },
    { id: 'gc_2', name: 'Mariana Costa Lead', phone: '+55 21 98888-8888', source: 'google' },
    { id: 'gc_3', name: 'CEO Tech Solutions', phone: '+55 31 97777-7777', source: 'google', email: 'ceo@tech.com' },
    { id: 'gc_4', name: 'Fornecedor A', phone: '+55 41 91234-5678', source: 'google' },
    { id: 'gc_5', name: 'Novo Cliente Google', phone: '+55 11 90000-0000', source: 'google' }
];

export const INITIAL_CHATBOT_CONFIG: ChatbotConfig = {
    isEnabled: false,
    awayMessage: "Olá! No momento estamos fechados. Nosso horário de atendimento é de Segunda a Sexta das 09:00 às 18:00. Deixe sua mensagem e retornaremos em breve.",
    greetingMessage: "Olá! Bem-vindo ao ZapFlow. Digite o número da opção desejada: 1. Comercial 2. Suporte",
    businessHours: [
        { dayOfWeek: 0, isOpen: false, openTime: '09:00', closeTime: '18:00' }, // Dom
        { dayOfWeek: 1, isOpen: true, openTime: '09:00', closeTime: '18:00' },  // Seg
        { dayOfWeek: 2, isOpen: true, openTime: '09:00', closeTime: '18:00' },
        { dayOfWeek: 3, isOpen: true, openTime: '09:00', closeTime: '18:00' },
        { dayOfWeek: 4, isOpen: true, openTime: '09:00', closeTime: '18:00' },
        { dayOfWeek: 5, isOpen: true, openTime: '09:00', closeTime: '18:00' },
        { dayOfWeek: 6, isOpen: false, openTime: '09:00', closeTime: '12:00' }, // Sab
    ]
};

export const AVAILABLE_TAGS = [
    { name: 'VIP', color: 'bg-purple-100 text-purple-700' },
    { name: 'Novo Lead', color: 'bg-blue-100 text-blue-700' },
    { name: 'Recorrente', color: 'bg-green-100 text-green-700' },
    { name: 'Inadimplente', color: 'bg-red-100 text-red-700' },
    { name: 'Aguardando', color: 'bg-orange-100 text-orange-700' },
];

export const EMOJIS = ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠️','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾'];

export const STICKERS = [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6/l0HlHSZ4l8yZ4z6z6/giphy.gif', // Cat typing
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6/3o7TKSjRrfIPjeiVyM/giphy.gif', // Confused Travolta
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6/26tPplGWjN0xLygi4/giphy.gif', // Success Kid
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6/xT5LMHxhOfscxPfIfm/giphy.gif', // Homer bush
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6/QMHoU66sBXqqLqYvGO/giphy.gif', // Fine dog
];
