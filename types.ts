
export enum UserRole {
  ALUNO = 'student',
  PROFESSOR = 'professor',
  ADMIN = 'admin',
  SUPERADMIN = 'superadmin'
}

export const BeltColor = {
  BRANCA: 'white',
  AZUL: 'blue',
  ROXA: 'purple',
  MARROM: 'brown',
  PRETA: 'black',
  CINZA_BRANCA: 'gray-white',
  CINZA: 'gray',
  CINZA_PRETA: 'gray-black',
  AMARELA_BRANCA: 'yellow-white',
  AMARELA: 'yellow',
  AMARELA_PRETA: 'yellow-black',
  LARANJA_BRANCA: 'orange-white',
  LARANJA: 'orange',
  LARANJA_PRETA: 'orange-black',
  VERDE_BRANCA: 'green-white',
  VERDE: 'green',
  VERDE_PRETA: 'green-black',
} as const;

export type BeltColor = typeof BeltColor[keyof typeof BeltColor];
export type KidsCategory = 'level_infantil';
export type VideoSourceKind = 'youtube' | 'external' | 'upload';
export type VideoOriginKind = 'fight' | 'submission';

export interface UserVideo {
  id: string;
  title: string;
  url: string;
  date: string;
  sourceKind: VideoSourceKind;
  origin: VideoOriginKind;
}

export interface User {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  cpf?: string;
  role: UserRole;
  avatar?: string;
  belt: BeltColor;
  grade: number;
  stripes: number; // 0-4
  status?: 'active' | 'invited' | 'suspended';
  classesToNextStripe: number;
  totalClassesToNextBelt: number;
  currentStripeProgress: number;
  currentBeltProgress: number;
  attendanceCount: number;
  attendanceCountBonus?: number;
  lastGraduation: string;
  branchId: string;
  type: 'Adulto' | 'Kids';
  kidsCategory?: KidsCategory;
  isCompetitor?: boolean;
  phone?: string;
  birthDate?: string;
  startDate?: string;
  lastStripeDate?: string;
  trainingStartDate?: string;
  lastGraduationDateOverride?: string;
  lastStripeDateOverride?: string;
  videos?: UserVideo[];
}

export interface Branch {
  id: string;
  name: string;
  location: string;
  commissionBalance: number;
}

export interface ClassInstance {
  id: string;
  name: string;
  level: string;
  time: string;
  mat: string;
  capacity: number;
  enrolled: number;
  allowedBelts: BeltColor[];
  requiredStripes: number;
  date: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  vendor: string;
  category: string;
  image: string;
  variations?: { size: string[]; color: string[] };
}

export interface Order {
  id: string;
  userId: string;
  branchId: string;
  items: { productId: string; quantity: number; price: number }[];
  total: number;
  commission: number;
  status: 'Pendente' | 'Pago' | 'Enviado' | 'Entregue';
  createdAt: string;
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  date: string;
  branchId: string;
}
