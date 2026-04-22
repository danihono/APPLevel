
import { UserRole, BeltColor, User, Branch, ClassInstance, Product } from './types';

export const COLORS = {
  GOLD: '#D4AF37',
  DARK: '#0A0A0A',
  WHITE: '#FFFFFF',
  GRAY_LIGHT: '#F2F2F2',
  GRAY_MEDIUM: '#CCCCCC',
  RED: '#E53935'
};

export const MOCK_BRANCHES: Branch[] = [
  { id: 'b1', name: 'LEVEL JJ - Matriz', location: 'São Paulo, SP', commissionBalance: 1250.40 },
  { id: 'b2', name: 'LEVEL JJ - Barra', location: 'Rio de Janeiro, RJ', commissionBalance: 840.15 }
];

export const MOCK_USER: User = {
  id: 'u1',
  name: 'Marcus "Buchecha" Almeida',
  email: 'marcus@leveljj.com',
  role: UserRole.ALUNO,
  avatar: 'https://picsum.photos/id/64/200/200',
  belt: BeltColor.AZUL,
  grade: 2,
  stripes: 2,
  status: 'active',
  classesToNextStripe: 5,
  totalClassesToNextBelt: 65,
  currentStripeProgress: 30, // 5 of 30
  currentBeltProgress: 150, // 65 of 150
  lastGraduation: '2023-12-15',
  branchId: 'b1',
  type: 'Adulto'
};

export const MOCK_CLASSES: ClassInstance[] = [
  { id: 'c1', name: 'Fundamentals', level: 'Iniciante', time: '07:00', mat: 'Tatame A', capacity: 30, enrolled: 12, allowedBelts: [BeltColor.BRANCA, BeltColor.AZUL], requiredStripes: 0, date: '2024-05-20' },
  { id: 'c2', name: 'Advanced No-Gi', level: 'Avançado', time: '12:00', mat: 'Tatame B', capacity: 20, enrolled: 18, allowedBelts: [BeltColor.AZUL, BeltColor.ROXA, BeltColor.MARROM, BeltColor.PRETA], requiredStripes: 2, date: '2024-05-20' },
  { id: 'c3', name: 'Kids 1', level: 'Infantil', time: '17:00', mat: 'Tatame A', capacity: 15, enrolled: 5, allowedBelts: [BeltColor.BRANCA], requiredStripes: 0, date: '2024-05-21' }
];

export const MOCK_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Kimono LEVEL Ultra-Light', price: 450.00, vendor: 'LEVEL Brand', category: 'Equipamento', image: 'https://picsum.photos/id/10/300/300', variations: { size: ['A0', 'A1', 'A2', 'A3'], color: ['Branco', 'Azul', 'Preto'] } },
  { id: 'p2', name: 'Rashguard No-Gi 2024', price: 180.00, vendor: 'LEVEL Brand', category: 'Vestuário', image: 'https://picsum.photos/id/20/300/300', variations: { size: ['S', 'M', 'L', 'XL'], color: ['Preto/Dourado'] } },
  { id: 'p3', name: 'Faixa Premium Algodão', price: 85.00, vendor: 'LEVEL Brand', category: 'Acessórios', image: 'https://picsum.photos/id/30/300/300' }
];
