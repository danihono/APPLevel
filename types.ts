
export enum UserRole {
  ALUNO = 'student',
  PROFESSOR = 'professor',
  ADMIN = 'admin',
  SUPERADMIN = 'superadmin'
}

export enum BeltColor {
  BRANCA = 'Branca',
  AZUL = 'Azul',
  ROXA = 'Roxa',
  MARROM = 'Marrom',
  PRETA = 'Preta'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  belt: BeltColor;
  stripes: number; // 0-4
  classesToNextStripe: number;
  totalClassesToNextBelt: number;
  currentStripeProgress: number;
  currentBeltProgress: number;
  lastGraduation: string;
  branchId: string;
  type: 'Adulto' | 'Kids';
  birthDate?: string;
  startDate?: string;
  lastStripeDate?: string;
  videos?: { id: string; title: string; url: string; date: string }[];
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
