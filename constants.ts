
import { Chat, Department, MessageStatus, QuickReply, User, UserRole, Workflow, Contact, ChatbotConfig } from './types';

export const INITIAL_DEPARTMENTS: Department[] = [
  { id: 'dept_1', name: 'Comercial', description: 'Vendas e novos negócios', color: 'bg-blue-500' },
  { id: 'dept_2', name: 'Suporte Técnico', description: 'Resolução de problemas', color: 'bg-orange-500' },
  { id: 'dept_3', name: 'Financeiro', description: 'Cobranças e faturamento', color: 'bg-green-600' },
];

export const INITIAL_USERS: User[] = [
  {
    id: 'user_admin',
    name: 'Administrador',
    email: 'admin@piekas.com',
    password: '123',
    role: UserRole.ADMIN,
    avatar: 'https://ui-avatars.com/api/?name=Admin&background=0D9488&color=fff',
    allowGeneralConnection: true
  }
];

export const INITIAL_QUICK_REPLIES: QuickReply[] = [];

export const INITIAL_WORKFLOWS: Workflow[] = [];

// Inicia vazio para produção
export const INITIAL_CHATS: Chat[] = [];

export const MOCK_GOOGLE_CONTACTS: Contact[] = [];

export const INITIAL_CHATBOT_CONFIG: ChatbotConfig = {
    isEnabled: false,
    awayMessage: "Olá! No momento estamos fechados. Nosso horário de atendimento é de Segunda a Sexta das 09:00 às 18:00.",
    greetingMessage: "Olá! Bem-vindo ao nosso atendimento.",
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
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6/l0HlHSZ4l8yZ4z6z6/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6/3o7TKSjRrfIPjeiVyM/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6/26tPplGWjN0xLygi4/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6/xT5LMHxhOfscxPfIfm/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6bXN6/QMHoU66sBXqqLqYvGO/giphy.gif',
];
