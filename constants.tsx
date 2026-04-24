
import { Product } from './types';

export const COLORS = {
  GOLD: '#D4AF37',
  DARK: '#0A0A0A',
  WHITE: '#FFFFFF',
  GRAY_LIGHT: '#F2F2F2',
  GRAY_MEDIUM: '#CCCCCC',
  RED: '#E53935'
};

export const MOCK_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Kimono LEVEL Ultra-Light', price: 450.00, vendor: 'LEVEL Brand', category: 'Equipamento', image: 'https://picsum.photos/id/10/300/300', variations: { size: ['A0', 'A1', 'A2', 'A3'], color: ['Branco', 'Azul', 'Preto'] } },
  { id: 'p2', name: 'Rashguard No-Gi 2024', price: 180.00, vendor: 'LEVEL Brand', category: 'Vestuário', image: 'https://picsum.photos/id/20/300/300', variations: { size: ['S', 'M', 'L', 'XL'], color: ['Preto/Dourado'] } },
  { id: 'p3', name: 'Faixa Premium Algodão', price: 85.00, vendor: 'LEVEL Brand', category: 'Acessórios', image: 'https://picsum.photos/id/30/300/300' }
];
