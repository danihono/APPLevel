import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Edit3,
  FileDown,
  Filter,
  Package,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import DateField from '../components/DateField';
import type { FirestoreEntity } from '../services/firebase/data';
import { backendFunctions, type FinanceSaleItemPayload } from '../services/firebase/functions';
import {
  LEVEL_CATALOG_ID,
  type AcademyRecord,
  type FinanceExpenseRecord,
  type FinancePaymentRecord,
  type FinanceProductRecord,
  type FinanceRevenueRecord,
  type FinanceSaleItemRecord,
  type FinanceSaleRecord,
  type FinanceServiceRecord,
  type FinanceWithdrawalRecord,
  type InventoryMovementRecord,
  type UserRecord,
} from '../services/firebase/models';
import {
  buildFinanceReport,
  REPORT_BLOCK_LABELS,
  type ReportBlock,
} from '../services/reports/reportData';

type ControleTab = 'dashboard' | 'catalog' | 'list' | 'stock' | 'vales' | 'reports';
type CatalogMode = 'product' | 'service';
type ListType = 'all' | 'sale' | 'payment' | 'revenue' | 'expense' | 'stock' | 'withdrawal';
type SortMode = 'newest' | 'oldest' | 'value_desc' | 'value_asc';
type ActionMode = 'sale' | 'purchase' | null;

interface ControleTotalViewProps {
  academies: Array<FirestoreEntity<AcademyRecord>>;
  users: Array<FirestoreEntity<UserRecord>>;
  products: Array<FirestoreEntity<FinanceProductRecord>>;
  services: Array<FirestoreEntity<FinanceServiceRecord>>;
  sales: Array<FirestoreEntity<FinanceSaleRecord>>;
  saleItems: Array<FirestoreEntity<FinanceSaleItemRecord>>;
  payments: Array<FirestoreEntity<FinancePaymentRecord>>;
  revenues: Array<FirestoreEntity<FinanceRevenueRecord>>;
  expenses: Array<FirestoreEntity<FinanceExpenseRecord>>;
  inventoryMovements: Array<FirestoreEntity<InventoryMovementRecord>>;
  withdrawals: Array<FirestoreEntity<FinanceWithdrawalRecord>>;
  selectedAcademyId: string;
  onSelectAcademy: (academyId: string) => void;
}

interface ProductFormState {
  productId: string;
  name: string;
  category: string;
  description: string;
  purchasePrice: string;
  salePriceFilial: string;
  salePriceDiretoria: string;
  stockCurrent: string;
  stockMinimum: string;
  status: 'active' | 'inactive';
}

interface ServiceFormState {
  serviceId: string;
  academyId: string;
  name: string;
  category: string;
  description: string;
  cost: string;
  salePriceFilial: string;
  salePriceDiretoria: string;
  status: 'active' | 'inactive';
}

interface SaleItemFormState {
  type: 'product' | 'service';
  itemId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  beneficiaryName: string;
  beneficiaryUserId: string;
}

interface SaleFormState {
  // academyId continua sendo a filial compradora quando buyerType==='filial',
  // ou LEVEL_CATALOG_ID nos demais casos (diretoria/individuo). buyerAcademyId
  // espelha explicitamente a filial compradora (vazio nos outros casos).
  academyId: string;
  saleType: 'product' | 'service';
  buyerType: 'filial' | 'diretoria' | 'individuo';
  buyerAcademyId: string;
  customerId: string;
  customerName: string;
  sellerId: string;
  sellerName: string;
  saleDate: string;
  dueDate: string;
  notes: string;
  receivedAmount: string;
  paymentMethod: string;
  paymentDate: string;
  items: SaleItemFormState[];
}

interface PurchaseFormState {
  productId: string;
  quantity: string;
  supplier: string;
  notes: string;
}

interface TimelineEntry {
  id: string;
  type: ListType;
  title: string;
  subtitle: string;
  academyId: string;
  date: Date;
  value: number;
  status: string;
}

const paymentMethods = ['Pix', 'Cartao de credito', 'Cartao de debito', 'Dinheiro', 'Boleto', 'Transferencia'];
const productCategories = ['Kimono', 'Rashguard', 'Faixa', 'Camiseta', 'Short', 'Protecao', 'Outros'];
// Categorias de servicos disponiveis na UI. 'Certificado' liga a regra de
// beneficiario obrigatorio no item de venda.
const serviceCategories = ['Certificado', 'Mensalidade', 'Adesão', 'Seminário'];
const CERTIFICATE_CATEGORY = 'Certificado';

function toDate(value: { toDate?: () => Date; seconds?: number } | null | undefined): Date | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

function dateInputValue(date = new Date()): string {
  const offsetDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60_000));
  return offsetDate.toISOString().slice(0, 10);
}

function monthStartInputValue(date = new Date()): string {
  return dateInputValue(new Date(date.getFullYear(), date.getMonth(), 1));
}

function parseInputDate(value: string, endOfDay = false): Date {
  if (!value) {
    const fallback = new Date();
    if (endOfDay) fallback.setHours(23, 59, 59, 999);
    else fallback.setHours(0, 0, 0, 0);
    return fallback;
  }

  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(date.getTime()) ? parseInputDate('', endOfDay) : date;
}

function isWithin(date: Date | null, startValue: string, endValue: string): boolean {
  if (!date) return false;
  return date.getTime() >= parseInputDate(startValue).getTime()
    && date.getTime() <= parseInputDate(endValue, true).getTime();
}

function formatCurrency(value: number | undefined | null): string {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return safeValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(date: Date | null): string {
  return date ? date.toLocaleDateString('pt-BR') : '-';
}

function asNumber(value: string): number {
  const normalized = value.replace(',', '.').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function academyName(academies: Array<FirestoreEntity<AcademyRecord>>, academyId: string): string {
  if (academyId === LEVEL_CATALOG_ID) return 'Diretoria';
  return academies.find((academy) => academy.id === academyId)?.name ?? 'Filial';
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active': return 'Ativo';
    case 'inactive': return 'Inativo';
    case 'paid': return 'Pago';
    case 'partial': return 'Parcial';
    case 'pending': return 'Pendente';
    case 'cancelled': return 'Cancelado';
    case 'overdue': return 'Atrasado';
    case 'received': return 'Recebido';
    case 'reversed': return 'Revertido';
    default: return status || '-';
  }
}

function statusClass(status: string): string {
  if (status === 'paid' || status === 'received' || status === 'active') return 'app-badge app-badge--success';
  if (status === 'cancelled' || status === 'overdue' || status === 'inactive') return 'app-badge app-badge--danger';
  if (status === 'partial') return 'app-badge app-badge--gold';
  return 'app-badge app-badge--muted';
}

function initialProductForm(): ProductFormState {
  return {
    productId: '',
    name: '',
    category: 'Outros',
    description: '',
    purchasePrice: '',
    salePriceFilial: '',
    salePriceDiretoria: '',
    stockCurrent: '0',
    stockMinimum: '0',
    status: 'active',
  };
}

type ProductPriceFields = { salePrice?: number; salePriceFilial?: number; salePriceDiretoria?: number };

// Preco de venda para filiais (fallback: preco unico legado, depois diretoria).
function readProductSalePriceFilial(product: ProductPriceFields): number {
  if (typeof product.salePriceFilial === 'number') return product.salePriceFilial;
  if (typeof product.salePrice === 'number') return product.salePrice;
  if (typeof product.salePriceDiretoria === 'number') return product.salePriceDiretoria;
  return 0;
}

// Preco de venda para a diretoria (fallback: preco unico legado, depois filial).
function readProductSalePriceDiretoria(product: ProductPriceFields): number {
  if (typeof product.salePriceDiretoria === 'number') return product.salePriceDiretoria;
  if (typeof product.salePrice === 'number') return product.salePrice;
  if (typeof product.salePriceFilial === 'number') return product.salePriceFilial;
  return 0;
}

// Seleciona o preco conforme o comprador. Produtos so vao para filial/diretoria;
// qualquer outro caso ('individuo') usa o preco de filial.
function readProductSalePriceForBuyer(product: ProductPriceFields, buyerType: 'filial' | 'diretoria' | 'individuo'): number {
  return buyerType === 'diretoria'
    ? readProductSalePriceDiretoria(product)
    : readProductSalePriceFilial(product);
}

type ServicePriceFields = { salePrice?: number; salePriceFilial?: number; salePriceDiretoria?: number };

// Preco de venda de servico para filiais (fallback: preco unico legado, depois diretoria).
function readServiceSalePriceFilial(service: ServicePriceFields): number {
  if (typeof service.salePriceFilial === 'number') return service.salePriceFilial;
  if (typeof service.salePrice === 'number') return service.salePrice;
  if (typeof service.salePriceDiretoria === 'number') return service.salePriceDiretoria;
  return 0;
}

// Preco de venda de servico para a diretoria (fallback: preco unico legado, depois filial).
function readServiceSalePriceDiretoria(service: ServicePriceFields): number {
  if (typeof service.salePriceDiretoria === 'number') return service.salePriceDiretoria;
  if (typeof service.salePrice === 'number') return service.salePrice;
  if (typeof service.salePriceFilial === 'number') return service.salePriceFilial;
  return 0;
}

// Seleciona o preco do servico conforme o comprador. Diretoria usa o preco de
// diretoria; filial e individuo usam o preco de filial.
function readServiceSalePriceForBuyer(service: ServicePriceFields, buyerType: 'filial' | 'diretoria' | 'individuo'): number {
  return buyerType === 'diretoria'
    ? readServiceSalePriceDiretoria(service)
    : readServiceSalePriceFilial(service);
}

function initialServiceForm(academyId: string): ServiceFormState {
  return {
    serviceId: '',
    academyId,
    name: '',
    category: 'Mensalidade',
    description: '',
    cost: '',
    salePriceFilial: '',
    salePriceDiretoria: '',
    status: 'active',
  };
}

function initialSaleItem(): SaleItemFormState {
  return {
    type: 'product',
    itemId: '',
    quantity: '1',
    unitPrice: '',
    discount: '0',
    beneficiaryName: '',
    beneficiaryUserId: '',
  };
}

function initialSaleForm(academyId: string): SaleFormState {
  return {
    academyId,
    saleType: 'product',
    buyerType: 'filial',
    buyerAcademyId: academyId,
    customerId: '',
    customerName: '',
    sellerId: '',
    sellerName: '',
    saleDate: dateInputValue(),
    dueDate: '',
    notes: '',
    receivedAmount: '',
    paymentMethod: 'Pix',
    paymentDate: dateInputValue(),
    items: [initialSaleItem()],
  };
}

function initialPurchaseForm(): PurchaseFormState {
  return {
    productId: '',
    quantity: '',
    supplier: '',
    notes: '',
  };
}

const ControleTotalView: React.FC<ControleTotalViewProps> = ({
  academies,
  users,
  products,
  services,
  sales,
  saleItems,
  payments,
  revenues,
  expenses,
  inventoryMovements,
  withdrawals,
  selectedAcademyId,
  onSelectAcademy,
}) => {
  const defaultAcademyId = selectedAcademyId || academies[0]?.id || '';
  const [activeTab, setActiveTab] = useState<ControleTab>('dashboard');
  const [catalogMode, setCatalogMode] = useState<CatalogMode>('product');
  const [dashboardStart, setDashboardStart] = useState(monthStartInputValue());
  const [dashboardEnd, setDashboardEnd] = useState(dateInputValue());
  const [dashboardAcademyId, setDashboardAcademyId] = useState(selectedAcademyId);
  const [listStart, setListStart] = useState(dateInputValue());
  const [listEnd, setListEnd] = useState(dateInputValue());
  const [listAcademyId, setListAcademyId] = useState(selectedAcademyId);
  const [listType, setListType] = useState<ListType>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [productForm, setProductForm] = useState<ProductFormState>(() => initialProductForm());
  const [serviceForm, setServiceForm] = useState<ServiceFormState>(() => initialServiceForm(defaultAcademyId));
  const [saleForm, setSaleForm] = useState<SaleFormState>(() => initialSaleForm(defaultAcademyId));
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState>(() => initialPurchaseForm());
  const [stockAcademyId, setStockAcademyId] = useState('');
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});
  const [withdrawalDebtorId, setWithdrawalDebtorId] = useState('');
  const [withdrawalItems, setWithdrawalItems] = useState<Array<{ productId: string; quantity: string; unitValue: string }>>([{ productId: '', quantity: '1', unitValue: '' }]);
  const [withdrawalNotes, setWithdrawalNotes] = useState('');
  const [settleTarget, setSettleTarget] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState(paymentMethods[0]);
  const [settleDate, setSettleDate] = useState(dateInputValue());
  const [reportStart, setReportStart] = useState(monthStartInputValue());
  const [reportEnd, setReportEnd] = useState(dateInputValue());
  const [reportAcademyId, setReportAcademyId] = useState('');
  const [reportFormat, setReportFormat] = useState<'excel' | 'pdf'>('excel');
  const [reportBlocks, setReportBlocks] = useState<Record<ReportBlock, boolean>>({
    resumo: true,
    vendas: true,
    pagamentos: true,
    receitas: true,
    despesas: true,
    maisVendidos: true,
    vales: true,
  });
  const [reportBusy, setReportBusy] = useState(false);

  const students = useMemo(() => users.filter((user) => user.role === 'student'), [users]);
  const staff = useMemo(() => users.filter((user) => user.role === 'professor' || user.role === 'superadmin'), [users]);
  const withdrawalDebtors = useMemo(() => users.filter((user) => user.role === 'professor' || user.role === 'admin' || user.role === 'superadmin'), [users]);
  const valesEmAberto = useMemo(() => withdrawals.filter((item) => item.status !== 'cancelled').reduce((total, item) => total + (item.balanceDue ?? 0), 0), [withdrawals]);
  const salesById = useMemo(() => new Map(sales.map((sale) => [sale.id, sale])), [sales]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const serviceById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const dashboardMetrics = useMemo(() => {
    const academyFilter = dashboardAcademyId;
    const scopedSales = sales.filter((sale) => (
      (!academyFilter || sale.academyId === academyFilter)
      && isWithin(toDate(sale.saleDate ?? sale.createdAt), dashboardStart, dashboardEnd)
    ));
    const activeSaleIds = new Set(scopedSales.filter((sale) => sale.paymentStatus !== 'cancelled').map((sale) => sale.id));
    const scopedRevenues = revenues.filter((revenue) => (
      (!academyFilter || revenue.academyId === academyFilter)
      && revenue.status === 'received'
      && isWithin(toDate(revenue.receivedAt ?? revenue.createdAt), dashboardStart, dashboardEnd)
    ));
    const scopedExpenses = expenses.filter((expense) => (
      (!academyFilter || expense.academyId === academyFilter)
      && isWithin(toDate(expense.paidAt ?? expense.dueDate ?? expense.createdAt), dashboardStart, dashboardEnd)
    ));
    const scopedWithdrawals = withdrawals.filter((item) => (
      (!academyFilter || item.academyId === academyFilter)
      && item.status !== 'cancelled'
      && isWithin(toDate(item.withdrawnAt ?? item.createdAt), dashboardStart, dashboardEnd)
    ));
    const valesAbertos = scopedWithdrawals.reduce((total, item) => total + (item.balanceDue ?? 0), 0);
    const revenueTotal = scopedRevenues.reduce((total, revenue) => total + revenue.amount, 0);
    const expenseTotal = scopedExpenses.reduce((total, expense) => total + expense.amount, 0);
    const pendingTotal = scopedSales
      .filter((sale) => sale.paymentStatus === 'pending' || sale.paymentStatus === 'partial')
      .reduce((total, sale) => total + sale.balanceDue, 0);
    const lowStock = products.filter((product) => (
      product.status === 'active'
      && product.stockCurrent <= product.stockMinimum
    ));
    const cancelledSales = scopedSales.filter((sale) => sale.paymentStatus === 'cancelled');
    const ticketSales = scopedSales.filter((sale) => sale.paymentStatus !== 'cancelled');
    const topProducts = saleItems
      .filter((item) => item.type === 'product' && activeSaleIds.has(item.saleId))
      .reduce<Map<string, { name: string; quantity: number; total: number }>>((map, item) => {
        const current = map.get(item.itemId) ?? { name: item.itemName, quantity: 0, total: 0 };
        map.set(item.itemId, {
          name: item.itemName,
          quantity: current.quantity + item.quantity,
          total: current.total + item.total,
        });
        return map;
      }, new Map());
    const topServices = saleItems
      .filter((item) => item.type === 'service' && activeSaleIds.has(item.saleId))
      .reduce<Map<string, { name: string; quantity: number; total: number }>>((map, item) => {
        const current = map.get(item.itemId) ?? { name: item.itemName, quantity: 0, total: 0 };
        map.set(item.itemId, {
          name: item.itemName,
          quantity: current.quantity + item.quantity,
          total: current.total + item.total,
        });
        return map;
      }, new Map());
    // Ignora o sentinel da Central no ranking de "filiais com maior faturamento".
    const academyRevenue = scopedRevenues.reduce<Map<string, number>>((map, revenue) => {
      if (revenue.academyId === LEVEL_CATALOG_ID) return map;
      map.set(revenue.academyId, (map.get(revenue.academyId) ?? 0) + revenue.amount);
      return map;
    }, new Map());
    const filialSalesTotal = ticketSales
      .filter((sale) => sale.buyerType === 'filial')
      .reduce((total, sale) => total + sale.total, 0);
    const customerTotals = ticketSales.reduce<Map<string, number>>((map, sale) => {
      map.set(sale.customerName, (map.get(sale.customerName) ?? 0) + sale.total);
      return map;
    }, new Map());

    return {
      soldTotal: ticketSales.reduce((total, sale) => total + sale.total, 0),
      filialSalesTotal,
      revenueTotal,
      pendingTotal,
      valesAbertos,
      expenseTotal,
      grossProfit: ticketSales.reduce((total, sale) => {
        const items = saleItems.filter((item) => item.saleId === sale.id);
        const cost = items.reduce((sum, item) => sum + (item.unitCost * item.quantity), 0);
        return total + (sale.total - cost);
      }, 0),
      netProfit: revenueTotal - expenseTotal,
      averageTicket: ticketSales.length ? ticketSales.reduce((total, sale) => total + sale.total, 0) / ticketSales.length : 0,
      lowStock,
      cancelledSales,
      topProducts: [...topProducts.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
      topServices: [...topServices.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
      topAcademies: [...academyRevenue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      topCustomers: [...customerTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [dashboardAcademyId, dashboardEnd, dashboardStart, expenses, products, revenues, saleItems, sales, withdrawals]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return products.filter((product) => (
      !term || `${product.name} ${product.category}`.toLowerCase().includes(term)
    ));
  }, [products, searchTerm]);

  const filteredServices = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return services.filter((service) => (
      (!selectedAcademyId || service.academyId === selectedAcademyId)
      && (!term || service.name.toLowerCase().includes(term))
    ));
  }, [searchTerm, selectedAcademyId, services]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    const academyFilter = listAcademyId;
    const term = searchTerm.trim().toLowerCase();
    const entries: TimelineEntry[] = [];

    sales.forEach((sale) => {
      const buyerLabel = sale.buyerType === 'diretoria'
        ? 'Diretoria'
        : sale.buyerType === 'individuo'
          ? `Cliente: ${sale.customerName}`
          : `Comprador: ${academyName(academies, sale.buyerAcademyId ?? sale.academyId)}`;
      entries.push({
        id: `sale:${sale.id}`,
        type: 'sale',
        title: `Venda - ${sale.customerName}`,
        subtitle: `${buyerLabel} | ${statusLabel(sale.paymentStatus)}`,
        academyId: sale.academyId,
        date: toDate(sale.saleDate ?? sale.createdAt) ?? new Date(0),
        value: sale.total,
        status: sale.paymentStatus,
      });
    });

    payments.forEach((payment) => {
      const sale = salesById.get(payment.saleId);
      entries.push({
        id: `payment:${payment.id}`,
        type: 'payment',
        title: `Pagamento - ${sale?.customerName ?? payment.saleId}`,
        subtitle: `${academyName(academies, payment.academyId)} | ${payment.paymentMethod}`,
        academyId: payment.academyId,
        date: toDate(payment.paymentDate ?? payment.createdAt) ?? new Date(0),
        value: payment.amount,
        status: payment.status,
      });
    });

    revenues.forEach((revenue) => {
      entries.push({
        id: `revenue:${revenue.id}`,
        type: 'revenue',
        title: `Receita - ${revenue.category}`,
        subtitle: `${academyName(academies, revenue.academyId)} | ${revenue.description}`,
        academyId: revenue.academyId,
        date: toDate(revenue.receivedAt ?? revenue.createdAt) ?? new Date(0),
        value: revenue.amount,
        status: revenue.status,
      });
    });

    expenses.forEach((expense) => {
      entries.push({
        id: `expense:${expense.id}`,
        type: 'expense',
        title: `Despesa - ${expense.category}`,
        subtitle: `${academyName(academies, expense.academyId)} | ${expense.description}`,
        academyId: expense.academyId,
        date: toDate(expense.paidAt ?? expense.dueDate ?? expense.createdAt) ?? new Date(0),
        value: -expense.amount,
        status: expense.status,
      });
    });

    inventoryMovements.forEach((movement) => {
      entries.push({
        id: `stock:${movement.id}`,
        type: 'stock',
        title: `Estoque - ${movement.productName}`,
        subtitle: `${academyName(academies, movement.academyId)} | ${movement.quantityDelta > 0 ? '+' : ''}${movement.quantityDelta}`,
        academyId: movement.academyId,
        date: toDate(movement.createdAt) ?? new Date(0),
        value: movement.quantityDelta,
        status: movement.type,
      });
    });

    withdrawals.forEach((withdrawal) => {
      const itemsLabel = withdrawal.items.map((item) => `${item.quantity}x ${item.productName}`).join(', ');
      entries.push({
        id: `withdrawal:${withdrawal.id}`,
        type: 'withdrawal',
        title: `Vale - ${withdrawal.debtorName}`,
        subtitle: `${itemsLabel} | ${statusLabel(withdrawal.status)}`,
        academyId: withdrawal.academyId,
        date: toDate(withdrawal.withdrawnAt ?? withdrawal.createdAt) ?? new Date(0),
        value: -withdrawal.total,
        status: withdrawal.status,
      });
    });

    return entries
      .filter((entry) => (!academyFilter || entry.academyId === academyFilter))
      .filter((entry) => listType === 'all' || entry.type === listType)
      .filter((entry) => isWithin(entry.date, listStart, listEnd))
      .filter((entry) => !term || `${entry.title} ${entry.subtitle} ${entry.status}`.toLowerCase().includes(term))
      .sort((left, right) => {
        if (sortMode === 'oldest') return left.date.getTime() - right.date.getTime();
        if (sortMode === 'value_desc') return right.value - left.value;
        if (sortMode === 'value_asc') return left.value - right.value;
        return right.date.getTime() - left.date.getTime();
      });
  }, [academies, expenses, inventoryMovements, listAcademyId, listEnd, listStart, listType, payments, revenues, sales, salesById, searchTerm, sortMode, withdrawals]);

  // Produtos sao do catalogo global da Level. Servicos podem ser do catalogo
  // Central (vendaveis para qualquer filial - ex.: emissao de certificado) ou
  // por filial (estes so aparecem quando a filial compradora coincide).
  const availableProducts = products.filter((product) => product.status === 'active');
  const availableServices = services.filter((service) => (
    service.status === 'active'
    && (
      service.academyId === LEVEL_CATALOG_ID
      || (saleForm.buyerType === 'filial' && service.academyId === saleForm.buyerAcademyId)
    )
  ));
  const availablePurchaseProducts = useMemo(() => products.filter((product) => (
    product.status === 'active'
  )), [products]);
  const stockListProducts = useMemo(() => [...products]
    .sort((a, b) => a.name.localeCompare(b.name)),
  [products]);

  function productCatalogPrice(product: FinanceProductRecord): number {
    return readProductSalePriceForBuyer(product, saleForm.buyerType);
  }

  function selectedItemPrice(item: SaleItemFormState): number {
    if (item.unitPrice.trim()) return asNumber(item.unitPrice);
    if (item.type === 'product') {
      const product = productById.get(item.itemId);
      return product ? productCatalogPrice(product) : 0;
    }
    const service = serviceById.get(item.itemId);
    return service ? readServiceSalePriceForBuyer(service, saleForm.buyerType) : 0;
  }

  const salePreview = saleForm.items.reduce((totals, item) => {
    const quantity = asNumber(item.quantity);
    const unitPrice = selectedItemPrice(item);
    const discount = asNumber(item.discount);
    const subtotal = unitPrice * quantity;
    const total = Math.max(unitPrice - discount, 0) * quantity;
    return {
      subtotal: totals.subtotal + subtotal,
      discount: totals.discount + (discount * quantity),
      total: totals.total + total,
    };
  }, { subtotal: 0, discount: 0, total: 0 });

  async function runAction(label: string, action: () => Promise<void>) {
    setBusy(label);
    setFeedback('');
    try {
      await action();
      setFeedback('Operacao concluida.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Nao foi possivel concluir.');
    } finally {
      setBusy('');
    }
  }

  function updateSaleItem(index: number, patch: Partial<SaleItemFormState>) {
    setSaleForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  }

  function selectCustomer(userId: string) {
    const student = students.find((entry) => entry.id === userId);
    setSaleForm((current) => ({
      ...current,
      customerId: userId,
      customerName: student?.displayName ?? current.customerName,
    }));
  }

  function selectBuyerAcademy(buyerAcademyId: string) {
    const academy = academies.find((entry) => entry.id === buyerAcademyId);
    setSaleForm((current) => ({
      ...current,
      academyId: buyerAcademyId,
      buyerAcademyId,
      // Reseta itens cujo servico era da filial anterior - eles podem nao mais
      // estar disponiveis na nova filial compradora.
      items: current.items.map((item) => (
        item.type === 'service' ? { ...item, itemId: '' } : item
      )),
      // Auto-deriva customerName com o nome da filial compradora (continua
      // editavel como rotulo no formulario).
      customerName: academy?.name ?? current.customerName,
    }));
  }

  function selectSaleType(saleType: SaleFormState['saleType']) {
    setSaleForm((current) => {
      if (current.saleType === saleType) return current;
      // Ao trocar de produto<->servico, volta para comprador 'filial' como
      // default e zera itens (que sao especificos do tipo da venda).
      return {
        ...current,
        saleType,
        buyerType: 'filial',
        academyId: current.buyerAcademyId || current.academyId,
        items: [{ ...initialSaleItem(), type: saleType }],
        customerId: '',
        customerName: '',
      };
    });
  }

  function selectSaleBuyerType(buyerType: SaleFormState['buyerType']) {
    setSaleForm((current) => {
      if (current.buyerType === buyerType) return current;
      const enteringFilial = buyerType === 'filial';
      return {
        ...current,
        buyerType,
        academyId: enteringFilial ? (current.buyerAcademyId || current.academyId) : LEVEL_CATALOG_ID,
        // Servicos especificos de filial nao valem em vendas para Diretoria
        // ou Individuo - reseta o itemId.
        items: current.items.map((item) => (
          item.type === 'service' ? { ...item, itemId: '' } : item
        )),
        // Quando o comprador deixa de ser uma filial, limpa o customerName
        // herdado do nome da filial.
        customerName: enteringFilial ? current.customerName : (current.buyerType === 'filial' ? '' : current.customerName),
        customerId: enteringFilial ? current.customerId : '',
      };
    });
  }

  function selectBeneficiaryStudent(itemIndex: number, userId: string) {
    const student = students.find((entry) => entry.id === userId);
    updateSaleItem(itemIndex, {
      beneficiaryUserId: userId,
      beneficiaryName: student?.displayName ?? saleForm.items[itemIndex]?.beneficiaryName ?? '',
    });
  }

  function selectSeller(userId: string) {
    const seller = staff.find((entry) => entry.id === userId);
    setSaleForm((current) => ({
      ...current,
      sellerId: userId,
      sellerName: seller?.displayName ?? current.sellerName,
    }));
  }

  async function submitProduct(event: React.FormEvent) {
    event.preventDefault();
    await runAction('product', async () => {
      await backendFunctions.upsertFinanceProduct({
        productId: productForm.productId || undefined,
        name: productForm.name,
        category: productForm.category,
        description: productForm.description || undefined,
        purchasePrice: asNumber(productForm.purchasePrice),
        salePriceFilial: asNumber(productForm.salePriceFilial),
        salePriceDiretoria: asNumber(productForm.salePriceDiretoria),
        stockCurrent: asNumber(productForm.stockCurrent),
        stockMinimum: asNumber(productForm.stockMinimum),
        status: productForm.status,
      });
      setProductForm(initialProductForm());
    });
  }

  async function submitService(event: React.FormEvent) {
    event.preventDefault();
    await runAction('service', async () => {
      await backendFunctions.upsertFinanceService({
        serviceId: serviceForm.serviceId || undefined,
        academyId: serviceForm.academyId,
        name: serviceForm.name,
        category: serviceForm.category || undefined,
        description: serviceForm.description || undefined,
        cost: asNumber(serviceForm.cost),
        salePriceFilial: asNumber(serviceForm.salePriceFilial),
        salePriceDiretoria: asNumber(serviceForm.salePriceDiretoria),
        status: serviceForm.status,
      });
      setServiceForm(initialServiceForm(serviceForm.academyId));
    });
  }

  async function submitSale(event: React.FormEvent) {
    event.preventDefault();
    await runAction('sale', async () => {
      const items: FinanceSaleItemPayload[] = saleForm.items.map((item) => ({
        type: saleForm.saleType,
        itemId: item.itemId,
        quantity: asNumber(item.quantity),
        ...(item.unitPrice.trim() ? { unitPrice: asNumber(item.unitPrice) } : {}),
        discount: asNumber(item.discount),
        ...(item.beneficiaryName.trim() ? { beneficiaryName: item.beneficiaryName.trim() } : {}),
        ...(item.beneficiaryUserId ? { beneficiaryUserId: item.beneficiaryUserId } : {}),
      }));

      const isFilial = saleForm.buyerType === 'filial';
      await backendFunctions.createFinanceSale({
        academyId: isFilial ? saleForm.buyerAcademyId : LEVEL_CATALOG_ID,
        saleType: saleForm.saleType,
        buyerType: saleForm.buyerType,
        ...(isFilial ? { buyerAcademyId: saleForm.buyerAcademyId } : {}),
        customerId: saleForm.customerId || undefined,
        customerName: saleForm.customerName,
        sellerId: saleForm.sellerId || undefined,
        sellerName: saleForm.sellerName || undefined,
        saleDate: saleForm.saleDate,
        dueDate: saleForm.dueDate || undefined,
        notes: saleForm.notes || undefined,
        items,
        paymentMethod: saleForm.paymentMethod,
        receivedAmount: saleForm.receivedAmount ? asNumber(saleForm.receivedAmount) : undefined,
        paymentDate: saleForm.paymentDate || undefined,
      });
      setSaleForm(initialSaleForm(saleForm.buyerAcademyId));
    });
  }

  async function submitPurchase(event: React.FormEvent) {
    event.preventDefault();
    const quantity = asNumber(purchaseForm.quantity);
    if (!purchaseForm.productId || quantity <= 0) {
      setFeedback('Selecione um produto e informe uma quantidade maior que zero.');
      return;
    }
    await runAction('purchase', async () => {
      const supplierPart = purchaseForm.supplier.trim();
      const notesPart = purchaseForm.notes.trim();
      const reason = ['Compra', supplierPart, notesPart].filter(Boolean).join(' - ');
      await backendFunctions.adjustProductStock({
        productId: purchaseForm.productId,
        quantityDelta: quantity,
        reason,
      });
      setPurchaseForm(initialPurchaseForm());
    });
  }

  async function submitStockEdit(product: FirestoreEntity<FinanceProductRecord>) {
    const raw = stockEdits[product.id];
    if (raw === undefined || raw.trim() === '') return;
    const target = Number(raw.replace(',', '.'));
    if (!Number.isFinite(target) || target < 0) {
      setFeedback('Quantidade invalida.');
      return;
    }
    const delta = target - product.stockCurrent;
    if (delta === 0) return;
    await runAction(`stock-edit:${product.id}`, async () => {
      await backendFunctions.adjustProductStock({
        productId: product.id,
        quantityDelta: delta,
        reason: 'Ajuste manual',
      });
      setStockEdits((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
    });
  }

  const selectedReportBlocks = (Object.keys(reportBlocks) as ReportBlock[]).filter((block) => reportBlocks[block]);

  async function handleGenerateReport() {
    if (reportBusy) return;
    if (selectedReportBlocks.length === 0) {
      setFeedback('Selecione ao menos um bloco para o relatorio.');
      return;
    }
    setReportBusy(true);
    setFeedback('Gerando relatorio...');
    try {
      const report = buildFinanceReport({
        academies,
        sales,
        saleItems,
        payments,
        revenues,
        expenses,
        withdrawals,
        startValue: reportStart,
        endValue: reportEnd,
        academyId: reportAcademyId,
        blocks: selectedReportBlocks,
      });
      if (reportFormat === 'excel') {
        const { exportFinanceReportExcel } = await import('../services/reports/exportExcel');
        await exportFinanceReportExcel(report);
      } else {
        const { exportFinanceReportPdf } = await import('../services/reports/exportPdf');
        await exportFinanceReportPdf(report);
      }
      setFeedback('Relatorio gerado com sucesso.');
    } catch (error) {
      console.error('Falha ao gerar relatorio', error);
      setFeedback('Nao foi possivel gerar o relatorio.');
    } finally {
      setReportBusy(false);
    }
  }

  function submitWithdrawal(event: React.FormEvent) {
    event.preventDefault();
    if (!withdrawalDebtorId) {
      setFeedback('Selecione quem esta retirando.');
      return;
    }
    const items = withdrawalItems
      .filter((item) => item.productId && asNumber(item.quantity) > 0)
      .map((item) => ({
        productId: item.productId,
        quantity: asNumber(item.quantity),
        ...(item.unitValue.trim() ? { unitValue: asNumber(item.unitValue) } : {}),
      }));
    if (items.length === 0) {
      setFeedback('Adicione ao menos um produto com quantidade valida.');
      return;
    }
    void runAction('withdrawal', async () => {
      await backendFunctions.createStockWithdrawal({
        debtorUserId: withdrawalDebtorId,
        items,
        notes: withdrawalNotes.trim() || undefined,
      });
      setWithdrawalDebtorId('');
      setWithdrawalItems([{ productId: '', quantity: '1', unitValue: '' }]);
      setWithdrawalNotes('');
    });
  }

  function startSettle(withdrawal: FirestoreEntity<FinanceWithdrawalRecord>) {
    setSettleTarget(withdrawal.id);
    setSettleAmount(String(withdrawal.balanceDue ?? 0));
    setSettleMethod(paymentMethods[0]);
    setSettleDate(dateInputValue());
  }

  function submitSettle(withdrawalId: string) {
    const amount = asNumber(settleAmount);
    if (amount <= 0) {
      setFeedback('Informe um valor maior que zero.');
      return;
    }
    void runAction('settle', async () => {
      await backendFunctions.settleStockWithdrawal({
        withdrawalId,
        amount,
        paymentMethod: settleMethod,
        paymentDate: settleDate || undefined,
      });
      setSettleTarget('');
      setSettleAmount('');
    });
  }

  function cancelWithdrawal(withdrawalId: string) {
    void runAction('cancelVale', async () => {
      await backendFunctions.cancelStockWithdrawal({ withdrawalId });
    });
  }

  const renderAcademySelect = (
    value: string,
    onChange: (value: string) => void,
    includeAll = false,
    includeCentral = false,
  ) => (
    <select
      className="app-select"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {includeAll ? <option value="">Todas as filiais</option> : null}
      {includeCentral ? <option value={LEVEL_CATALOG_ID}>Diretoria (Catalogo Central)</option> : null}
      {academies.map((academy) => (
        <option key={academy.id} value={academy.id}>{academy.name}</option>
      ))}
    </select>
  );

  return (
    <div className="controle-total">
      <header className="controle-total__hero">
        <div>
          <span className="app-badge app-badge--gold">SUPERADMIN</span>
          <h2>Controle Total</h2>
          <p>{dashboardAcademyId ? academyName(academies, dashboardAcademyId) : 'Rede LEVEL JJ'}</p>
        </div>
      </header>

      <div className="app-segment app-segment--block controle-total__tabs" role="tablist" aria-label="Controle Total">
        <button type="button" role="tab" className={`app-segment__button ${activeTab === 'dashboard' ? 'is-active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <BarChart3 size={18} /> Dashboard Geral
        </button>
        <button type="button" role="tab" className={`app-segment__button ${activeTab === 'catalog' ? 'is-active' : ''}`} onClick={() => setActiveTab('catalog')}>
          <Package size={18} /> Produtos e Servicos
        </button>
        <button type="button" role="tab" className={`app-segment__button ${activeTab === 'list' ? 'is-active' : ''}`} onClick={() => setActiveTab('list')}>
          <Filter size={18} /> Lista
        </button>
        <button type="button" role="tab" className={`app-segment__button ${activeTab === 'stock' ? 'is-active' : ''}`} onClick={() => setActiveTab('stock')}>
          <Package size={18} /> Estoque
        </button>
        <button type="button" role="tab" className={`app-segment__button ${activeTab === 'vales' ? 'is-active' : ''}`} onClick={() => setActiveTab('vales')}>
          <ReceiptText size={18} /> Vales
        </button>
        <button type="button" role="tab" className={`app-segment__button ${activeTab === 'reports' ? 'is-active' : ''}`} onClick={() => setActiveTab('reports')}>
          <FileDown size={18} /> Relatorios
        </button>
      </div>

      {feedback ? <div className="app-toast controle-total__feedback">{feedback}</div> : null}

      {activeTab === 'dashboard' ? (
        <div className="controle-total__stack">
          <section className="app-panel app-panel-pad controle-total__filters">
            <label className="app-field">
              <span className="app-field__label">Filial</span>
              {renderAcademySelect(dashboardAcademyId, setDashboardAcademyId, true)}
            </label>
            <label className="app-field">
              <span className="app-field__label">Inicio</span>
              <DateField value={dashboardStart} onChange={setDashboardStart} />
            </label>
            <label className="app-field">
              <span className="app-field__label">Fim</span>
              <DateField value={dashboardEnd} onChange={setDashboardEnd} />
            </label>
          </section>

          <section className="controle-total__kpi-grid">
            {([
              ['Total vendido', dashboardMetrics.soldTotal, <ShoppingCart key="icon" size={18} />, 'sold'],
              ['Vendas para Filiais', dashboardMetrics.filialSalesTotal, <ShoppingCart key="icon" size={18} />, 'filial'],
              ['Total recebido', dashboardMetrics.revenueTotal, <DollarSign key="icon" size={18} />, 'received'],
              ['Total pendente', dashboardMetrics.pendingTotal, <CreditCard key="icon" size={18} />, 'pending'],
              ['Despesas', dashboardMetrics.expenseTotal, <ReceiptText key="icon" size={18} />, 'expense'],
              ['Lucro bruto', dashboardMetrics.grossProfit, <BarChart3 key="icon" size={18} />, 'gross'],
              ['Lucro liquido', dashboardMetrics.netProfit, <CheckCircle2 key="icon" size={18} />, 'net'],
              ['Ticket medio', dashboardMetrics.averageTicket, <ReceiptText key="icon" size={18} />, 'ticket'],
              ['Vales em aberto', dashboardMetrics.valesAbertos, <CreditCard key="icon" size={18} />, 'vale'],
              ['Estoque baixo', dashboardMetrics.lowStock.length, <AlertTriangle key="icon" size={18} />, 'stock'],
            ] as Array<[string, number, React.ReactNode, string]>).map(([label, value, icon, tone]) => (
              <article key={label} className={`controle-total__kpi-tile controle-total__kpi-tile--${tone}`}>
                <span className="controle-total__kpi-tile__icon" aria-hidden>{icon}</span>
                <div className="controle-total__kpi-tile__body">
                  <span className="controle-total__kpi-tile__label">{label}</span>
                  <strong className="controle-total__kpi-tile__value">
                    {label === 'Estoque baixo' ? String(value) : formatCurrency(value)}
                  </strong>
                </div>
              </article>
            ))}
          </section>

          <section className="controle-total__dashboard-grid">
            <article className="app-panel app-panel-pad">
              <h3>Produtos mais vendidos</h3>
              <div className="app-list">
                {dashboardMetrics.topProducts.map((entry) => (
                  <div key={entry.name} className="controle-total__rank-row">
                    <span>{entry.name}</span>
                    <strong>{entry.quantity} un. | {formatCurrency(entry.total)}</strong>
                  </div>
                ))}
                {dashboardMetrics.topProducts.length === 0 ? <div className="app-empty">Sem vendas no periodo.</div> : null}
              </div>
            </article>

            <article className="app-panel app-panel-pad">
              <h3>Servicos mais vendidos</h3>
              <div className="app-list">
                {dashboardMetrics.topServices.map((entry) => (
                  <div key={entry.name} className="controle-total__rank-row">
                    <span>{entry.name}</span>
                    <strong>{entry.quantity} | {formatCurrency(entry.total)}</strong>
                  </div>
                ))}
                {dashboardMetrics.topServices.length === 0 ? <div className="app-empty">Sem servicos vendidos.</div> : null}
              </div>
            </article>

            <article className="app-panel app-panel-pad">
              <h3>Filiais com maior faturamento</h3>
              <div className="app-list">
                {dashboardMetrics.topAcademies.map(([academyId, total]) => (
                  <div key={academyId} className="controle-total__rank-row">
                    <span>{academyName(academies, academyId)}</span>
                    <strong>{formatCurrency(total)}</strong>
                  </div>
                ))}
                {dashboardMetrics.topAcademies.length === 0 ? <div className="app-empty">Sem faturamento no periodo.</div> : null}
              </div>
            </article>

            <article className="app-panel app-panel-pad">
              <h3>Estoque baixo</h3>
              <div className="app-list">
                {dashboardMetrics.lowStock.slice(0, 6).map((product) => (
                  <div key={product.id} className="controle-total__rank-row">
                    <span>{product.name}</span>
                    <strong>{product.stockCurrent}/{product.stockMinimum}</strong>
                  </div>
                ))}
                {dashboardMetrics.lowStock.length === 0 ? <div className="app-empty">Nenhum alerta de estoque.</div> : null}
              </div>
            </article>
          </section>
        </div>
      ) : null}

      {activeTab === 'catalog' ? (
        <div className="controle-total__stack">
          <section className="app-panel app-panel-pad controle-total__filters">
            {catalogMode === 'service' ? (
              <label className="app-field">
                <span className="app-field__label">Filial ativa</span>
                {renderAcademySelect(selectedAcademyId || defaultAcademyId, (value) => {
                  onSelectAcademy(value);
                  setServiceForm((current) => ({ ...current, academyId: value }));
                })}
              </label>
            ) : null}
            <label className="app-field">
              <span className="app-field__label">Busca</span>
              <div className="app-search">
                <Search size={18} />
                <input className="app-input pl-11" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Nome ou categoria" />
              </div>
            </label>
            <div className="app-segment">
              <button type="button" className={`app-segment__button ${catalogMode === 'product' ? 'is-active' : ''}`} onClick={() => setCatalogMode('product')}>
                Produtos
              </button>
              <button type="button" className={`app-segment__button ${catalogMode === 'service' ? 'is-active' : ''}`} onClick={() => setCatalogMode('service')}>
                Servicos
              </button>
            </div>
          </section>

          {catalogMode === 'product' ? (
            <section className="controle-total__catalog-grid">
              <form onSubmit={submitProduct} className="app-panel app-panel-pad controle-total__form">
                <div className="controle-total__section-heading">
                  <h3>{productForm.productId ? 'Editar produto' : 'Cadastrar produto'}</h3>
                  {productForm.productId ? (
                    <button type="button" className="app-button app-button--ghost app-button--small" onClick={() => setProductForm(initialProductForm())}>
                      <X size={16} /> Limpar
                    </button>
                  ) : null}
                </div>
                <label className="app-field"><span className="app-field__label">Nome</span><input required className="app-input" value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Categoria</span><select className="app-select" value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))}>{productCategories.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
                <label className="app-field"><span className="app-field__label">Descricao</span><textarea className="app-textarea" value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} /></label>
                <div className="controle-total__mini-grid">
                  <label className="app-field"><span className="app-field__label">Preco de compra</span><input required className="app-input" inputMode="decimal" value={productForm.purchasePrice} onChange={(event) => setProductForm((current) => ({ ...current, purchasePrice: event.target.value }))} /></label>
                  <label className="app-field"><span className="app-field__label">Preco de venda (Filial)</span><input required className="app-input" inputMode="decimal" value={productForm.salePriceFilial} onChange={(event) => setProductForm((current) => ({ ...current, salePriceFilial: event.target.value }))} /></label>
                  <label className="app-field"><span className="app-field__label">Preco de venda (Diretoria)</span><input required className="app-input" inputMode="decimal" value={productForm.salePriceDiretoria} onChange={(event) => setProductForm((current) => ({ ...current, salePriceDiretoria: event.target.value }))} /></label>
                  <label className="app-field"><span className="app-field__label">Estoque atual</span><input className="app-input" inputMode="decimal" value={productForm.stockCurrent} onChange={(event) => setProductForm((current) => ({ ...current, stockCurrent: event.target.value }))} /></label>
                  <label className="app-field"><span className="app-field__label">Estoque minimo</span><input className="app-input" inputMode="decimal" value={productForm.stockMinimum} onChange={(event) => setProductForm((current) => ({ ...current, stockMinimum: event.target.value }))} /></label>
                </div>
                <label className="app-field"><span className="app-field__label">Status</span><select className="app-select" value={productForm.status} onChange={(event) => setProductForm((current) => ({ ...current, status: event.target.value as ProductFormState['status'] }))}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
                <button type="submit" disabled={busy === 'product'} className="app-button app-button--gold"><Package size={18} /> Salvar produto</button>
              </form>

              <section className="app-panel app-panel-pad">
                <h3>Produtos</h3>
                <div className="app-list">
                  {filteredProducts.map((product) => {
                    const lowStock = product.stockCurrent <= product.stockMinimum;
                    return (
                      <article key={product.id} className={`app-list-card controle-total__catalog-card ${lowStock ? 'is-low-stock' : ''}`}>
                        <div>
                          <strong>{product.name}</strong>
                          <p>{product.category}</p>
                          <div className="superadmin-chip-row">
                            <span className={statusClass(product.status)}>{statusLabel(product.status)}</span>
                            <span className={lowStock ? 'app-badge app-badge--danger' : 'app-badge app-badge--muted'}>Estoque {product.stockCurrent}/{product.stockMinimum}</span>
                            <span className="app-badge app-badge--muted">Compra {formatCurrency(product.purchasePrice)}</span>
                            <span className="app-badge app-badge--gold">Venda Filial {formatCurrency(readProductSalePriceFilial(product))}</span>
                            <span className="app-badge app-badge--gold">Venda Diretoria {formatCurrency(readProductSalePriceDiretoria(product))}</span>
                          </div>
                          {product.priceHistory && product.priceHistory.length > 0 ? (
                            <details className="controle-total__price-history">
                              <summary>Historico de precos ({product.priceHistory.length})</summary>
                              <ul>
                                {[...product.priceHistory].reverse().map((entry, entryIndex) => (
                                  <li key={entryIndex}>
                                    <span>{formatDate(toDate(entry.changedAt))}</span>
                                    <span>Compra {formatCurrency(entry.purchasePrice)} | Filial {formatCurrency(readProductSalePriceFilial(entry))} | Diretoria {formatCurrency(readProductSalePriceDiretoria(entry))}</span>
                                    {entry.changedBy ? <span>{userById.get(entry.changedBy)?.displayName ?? 'Usuario'}</span> : null}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : null}
                        </div>
                        <div className="controle-total__row-actions">
                          <button type="button" className="app-button app-button--ghost app-button--icon" title="Editar" onClick={() => setProductForm({
                            productId: product.id,
                            name: product.name,
                            category: product.category,
                            description: product.description ?? '',
                            purchasePrice: String(product.purchasePrice),
                            salePriceFilial: String(readProductSalePriceFilial(product)),
                            salePriceDiretoria: String(readProductSalePriceDiretoria(product)),
                            stockCurrent: String(product.stockCurrent),
                            stockMinimum: String(product.stockMinimum),
                            status: product.status,
                          })}><Edit3 size={17} /></button>
                          <button type="button" className="app-button app-button--danger app-button--icon" title="Excluir ou inativar" onClick={() => void runAction('delete-product', () => backendFunctions.deleteOrArchiveFinanceProduct({ productId: product.id }).then(() => undefined))}><Trash2 size={17} /></button>
                        </div>
                      </article>
                    );
                  })}
                  {filteredProducts.length === 0 ? <div className="app-empty">Nenhum produto encontrado.</div> : null}
                </div>
              </section>
            </section>
          ) : (
            <section className="controle-total__catalog-grid">
              <form onSubmit={submitService} className="app-panel app-panel-pad controle-total__form">
                <div className="controle-total__section-heading">
                  <h3>{serviceForm.serviceId ? 'Editar servico' : 'Cadastrar servico'}</h3>
                  {serviceForm.serviceId ? (
                    <button type="button" className="app-button app-button--ghost app-button--small" onClick={() => setServiceForm(initialServiceForm(serviceForm.academyId))}>
                      <X size={16} /> Limpar
                    </button>
                  ) : null}
                </div>
                <label className="app-field"><span className="app-field__label">Filial</span>{renderAcademySelect(serviceForm.academyId, (value) => setServiceForm((current) => ({ ...current, academyId: value })), false, true)}</label>
                <label className="app-field"><span className="app-field__label">Nome</span><input required className="app-input" value={serviceForm.name} onChange={(event) => setServiceForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Categoria</span><select className="app-select" value={serviceForm.category} onChange={(event) => setServiceForm((current) => ({ ...current, category: event.target.value }))}>{serviceCategories.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
                <label className="app-field"><span className="app-field__label">Descricao</span><textarea className="app-textarea" value={serviceForm.description} onChange={(event) => setServiceForm((current) => ({ ...current, description: event.target.value }))} /></label>
                <div className="controle-total__mini-grid">
                  <label className="app-field"><span className="app-field__label">Custo</span><input required className="app-input" inputMode="decimal" value={serviceForm.cost} onChange={(event) => setServiceForm((current) => ({ ...current, cost: event.target.value }))} /></label>
                  <label className="app-field"><span className="app-field__label">Preco de venda (Filial)</span><input required className="app-input" inputMode="decimal" value={serviceForm.salePriceFilial} onChange={(event) => setServiceForm((current) => ({ ...current, salePriceFilial: event.target.value }))} /></label>
                  <label className="app-field"><span className="app-field__label">Preco de venda (Diretoria)</span><input required className="app-input" inputMode="decimal" value={serviceForm.salePriceDiretoria} onChange={(event) => setServiceForm((current) => ({ ...current, salePriceDiretoria: event.target.value }))} /></label>
                </div>
                <label className="app-field"><span className="app-field__label">Status</span><select className="app-select" value={serviceForm.status} onChange={(event) => setServiceForm((current) => ({ ...current, status: event.target.value as ServiceFormState['status'] }))}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
                <button type="submit" disabled={busy === 'service'} className="app-button app-button--gold"><ReceiptText size={18} /> Salvar servico</button>
              </form>

              <section className="app-panel app-panel-pad">
                <h3>Servicos</h3>
                <div className="app-list">
                  {filteredServices.map((service) => (
                    <article key={service.id} className="app-list-card controle-total__catalog-card">
                      <div>
                        <strong>{service.name}</strong>
                        <p>{academyName(academies, service.academyId)}</p>
                        <div className="superadmin-chip-row">
                          <span className={statusClass(service.status)}>{statusLabel(service.status)}</span>
                          <span className="app-badge app-badge--gold">Margem {formatCurrency(service.salePrice - service.cost)}</span>
                        </div>
                      </div>
                      <div className="controle-total__row-actions">
                        <button type="button" className="app-button app-button--ghost app-button--icon" title="Editar" onClick={() => setServiceForm({
                          serviceId: service.id,
                          academyId: service.academyId,
                          name: service.name,
                          category: service.category ?? 'Mensalidade',
                          description: service.description ?? '',
                          cost: String(service.cost),
                          salePriceFilial: String(readServiceSalePriceFilial(service)),
                          salePriceDiretoria: String(readServiceSalePriceDiretoria(service)),
                          status: service.status,
                        })}><Edit3 size={17} /></button>
                        <button type="button" className="app-button app-button--danger app-button--icon" title="Excluir ou inativar" onClick={() => void runAction('delete-service', () => backendFunctions.deleteOrArchiveFinanceService({ serviceId: service.id }).then(() => undefined))}><Trash2 size={17} /></button>
                      </div>
                    </article>
                  ))}
                  {filteredServices.length === 0 ? <div className="app-empty">Nenhum servico encontrado.</div> : null}
                </div>
              </section>
            </section>
          )}
        </div>
      ) : null}

      {activeTab === 'list' ? (
        <div className="controle-total__stack">
          <section className="app-panel app-panel-pad controle-total__filters">
            <label className="app-field"><span className="app-field__label">Filial</span>{renderAcademySelect(listAcademyId, setListAcademyId, true)}</label>
            <label className="app-field">
              <span className="app-field__label">Inicio</span>
              <DateField value={listStart} onChange={setListStart} />
            </label>
            <label className="app-field">
              <span className="app-field__label">Fim</span>
              <DateField value={listEnd} onChange={setListEnd} />
            </label>
            <label className="app-field"><span className="app-field__label">Tipo</span><select className="app-select" value={listType} onChange={(event) => setListType(event.target.value as ListType)}><option value="all">Todos</option><option value="sale">Vendas</option><option value="payment">Pagamentos</option><option value="withdrawal">Vales</option><option value="stock">Estoque</option></select></label>
            <label className="app-field"><span className="app-field__label">Ordenar</span><select className="app-select" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="newest">Mais recentes</option><option value="oldest">Mais antigas</option><option value="value_desc">Maior valor</option><option value="value_asc">Menor valor</option></select></label>
          </section>

          <section className="app-panel app-panel-pad controle-total__actions-panel">
            <div className="controle-total__section-heading">
              <h3>Acoes do dia</h3>
              <div className="controle-total__action-buttons">
                {([
                  ['sale', 'Venda', <ShoppingCart key="icon" size={16} />],
                  ['purchase', 'Compra', <Package key="icon" size={16} />],
                ] as Array<[ActionMode, string, React.ReactNode]>).map(([mode, label, icon]) => (
                  <button
                    key={String(mode)}
                    type="button"
                    className={`app-button app-button--small controle-total__action-button controle-total__action-button--${String(mode)} ${actionMode === mode ? 'is-active' : ''}`}
                    onClick={() => setActionMode(actionMode === mode ? null : mode)}
                  >
                    {icon}{label}
                  </button>
                ))}
              </div>
            </div>

            {actionMode === 'sale' ? (
              <form onSubmit={submitSale} className="controle-total__form-grid">
                <label className="app-field"><span className="app-field__label">Tipo de venda</span><select className="app-select" value={saleForm.saleType} onChange={(event) => selectSaleType(event.target.value as SaleFormState['saleType'])}><option value="product">Produto</option><option value="service">Servico</option></select></label>
                <label className="app-field"><span className="app-field__label">Tipo de comprador</span><select className="app-select" value={saleForm.buyerType} onChange={(event) => selectSaleBuyerType(event.target.value as SaleFormState['buyerType'])}>
                  <option value="filial">Filial</option>
                  <option value="diretoria">Diretoria</option>
                  {saleForm.saleType === 'service' ? <option value="individuo">Individuo</option> : null}
                </select></label>
                {saleForm.buyerType === 'filial' ? (
                  <label className="app-field"><span className="app-field__label">Filial compradora</span>{renderAcademySelect(saleForm.buyerAcademyId, selectBuyerAcademy)}</label>
                ) : saleForm.buyerType === 'diretoria' ? (
                  <label className="app-field"><span className="app-field__label">Comprador</span><input className="app-input" value="Diretoria (Central)" disabled /></label>
                ) : null}
                {saleForm.buyerType === 'individuo' ? (
                  <>
                    <label className="app-field"><span className="app-field__label">Cliente / Aluno</span><select className="app-select" value={saleForm.customerId} onChange={(event) => selectCustomer(event.target.value)}>
                      <option value="">- Digitar nome livre -</option>
                      {students.map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}
                    </select></label>
                    <label className="app-field"><span className="app-field__label">Nome do cliente</span><input required className="app-input" value={saleForm.customerName} placeholder="Nome completo" onChange={(event) => setSaleForm((current) => ({ ...current, customerName: event.target.value, customerId: '' }))} /></label>
                  </>
                ) : (
                  <label className="app-field"><span className="app-field__label">Rotulo do comprador</span><input required className="app-input" value={saleForm.customerName} placeholder="Nome do comprador" onChange={(event) => setSaleForm((current) => ({ ...current, customerName: event.target.value }))} /></label>
                )}
                <label className="app-field">
                  <span className="app-field__label">Data</span>
                  <DateField value={saleForm.saleDate} onChange={(value) => setSaleForm((current) => ({ ...current, saleDate: value }))} />
                </label>
                <label className="app-field"><span className="app-field__label">Responsavel pela compra</span><select className="app-select" value={saleForm.sellerId} onChange={(event) => selectSeller(event.target.value)}><option value="">- Selecionar -</option>{staff.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}</select></label>
                <label className="app-field">
                  <span className="app-field__label">Vencimento</span>
                  <DateField value={saleForm.dueDate} onChange={(value) => setSaleForm((current) => ({ ...current, dueDate: value }))} />
                </label>

                <div className="controle-total__items-editor controle-total__span-2">
                  <div className="controle-total__section-heading">
                    <strong>Itens da venda</strong>
                    <button type="button" className="app-button app-button--ghost app-button--small" onClick={() => setSaleForm((current) => ({ ...current, items: [...current.items, { ...initialSaleItem(), type: current.saleType }] }))}>
                      <Plus size={16} /> Adicionar
                    </button>
                  </div>
                  {saleForm.items.map((item, index) => {
                    const itemType = saleForm.saleType;
                    const selectedService = itemType === 'service' ? serviceById.get(item.itemId) : undefined;
                    const isCertificate = selectedService?.category === CERTIFICATE_CATEGORY;
                    return (
                      <div key={index} className="controle-total__sale-item-row">
                        <div className="controle-total__sale-item">
                          <select required className="app-select" value={item.itemId} onChange={(event) => updateSaleItem(index, { itemId: event.target.value, beneficiaryName: '', beneficiaryUserId: '' })}>
                            <option value="">{itemType === 'product' ? 'Selecionar produto' : 'Selecionar servico'}</option>
                            {(itemType === 'product' ? availableProducts : availableServices).map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.name}{itemType === 'product' && 'stockCurrent' in entry ? ` (${entry.stockCurrent} em estoque)` : ''}
                              </option>
                            ))}
                          </select>
                          <input className="app-input" inputMode="decimal" placeholder="Qtd" value={item.quantity} onChange={(event) => updateSaleItem(index, { quantity: event.target.value })} />
                          <input className="app-input" inputMode="decimal" placeholder={item.itemId ? formatCurrency(selectedItemPrice({ ...item, type: itemType, unitPrice: '' })) : 'Preco unit.'} value={item.unitPrice} onChange={(event) => updateSaleItem(index, { unitPrice: event.target.value })} />
                          <input className="app-input" inputMode="decimal" placeholder="Desconto" value={item.discount} onChange={(event) => updateSaleItem(index, { discount: event.target.value })} />
                          <button type="button" className="app-button app-button--ghost app-button--icon" title="Remover" onClick={() => setSaleForm((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }))}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                        {isCertificate ? (
                          <div className="controle-total__sale-item-beneficiary">
                            <label className="app-field">
                              <span className="app-field__label">Beneficiario (nome no certificado)</span>
                              <input required className="app-input" value={item.beneficiaryName} onChange={(event) => updateSaleItem(index, { beneficiaryName: event.target.value, beneficiaryUserId: '' })} placeholder="Nome completo" />
                            </label>
                            <label className="app-field">
                              <span className="app-field__label">Aluno cadastrado (opcional)</span>
                              <select className="app-select" value={item.beneficiaryUserId} onChange={(event) => selectBeneficiaryStudent(index, event.target.value)}>
                                <option value="">- Digitar nome livre -</option>
                                {students.map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}
                              </select>
                            </label>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <label className="app-field"><span className="app-field__label">Forma de pagamento</span><select className="app-select" value={saleForm.paymentMethod} onChange={(event) => setSaleForm((current) => ({ ...current, paymentMethod: event.target.value }))}>{paymentMethods.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
                <label className="app-field"><span className="app-field__label">Valor recebido</span><input className="app-input" inputMode="decimal" placeholder={formatCurrency(salePreview.total)} value={saleForm.receivedAmount} onChange={(event) => setSaleForm((current) => ({ ...current, receivedAmount: event.target.value }))} /></label>
                <label className="app-field">
                  <span className="app-field__label">Data pagamento</span>
                  <DateField value={saleForm.paymentDate} onChange={(value) => setSaleForm((current) => ({ ...current, paymentDate: value }))} />
                </label>
                <label className="app-field controle-total__span-2"><span className="app-field__label">Observacoes</span><input className="app-input" value={saleForm.notes} onChange={(event) => setSaleForm((current) => ({ ...current, notes: event.target.value }))} /></label>

                <div className="controle-total__sale-total">
                  <span>Subtotal: <strong>{formatCurrency(salePreview.subtotal)}</strong></span>
                  <span>Descontos: <strong>{formatCurrency(salePreview.discount)}</strong></span>
                  <span>Total: <strong>{formatCurrency(salePreview.total)}</strong></span>
                </div>

                <button type="submit" disabled={busy === 'sale'} className="app-button app-button--gold"><ShoppingCart size={18} /> Registrar venda</button>
              </form>
            ) : null}

            {actionMode === 'purchase' ? (
              <form onSubmit={submitPurchase} className="controle-total__form-grid">
                <label className="app-field controle-total__span-2"><span className="app-field__label">Produto</span><select required className="app-select" value={purchaseForm.productId} onChange={(event) => setPurchaseForm((current) => ({ ...current, productId: event.target.value }))}>
                  <option value="">Selecionar produto</option>
                  {availablePurchaseProducts.map((product) => (
                    <option key={product.id} value={product.id}>{product.name} (estoque atual: {product.stockCurrent})</option>
                  ))}
                </select></label>
                <label className="app-field"><span className="app-field__label">Quantidade</span><input required className="app-input" inputMode="decimal" placeholder="Ex: 10" value={purchaseForm.quantity} onChange={(event) => setPurchaseForm((current) => ({ ...current, quantity: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Fornecedor</span><input className="app-input" value={purchaseForm.supplier} onChange={(event) => setPurchaseForm((current) => ({ ...current, supplier: event.target.value }))} /></label>
                <label className="app-field controle-total__span-2"><span className="app-field__label">Observacoes</span><input className="app-input" value={purchaseForm.notes} onChange={(event) => setPurchaseForm((current) => ({ ...current, notes: event.target.value }))} /></label>
                <button type="submit" disabled={busy === 'purchase'} className="app-button app-button--gold"><Package size={18} /> Registrar compra</button>
              </form>
            ) : null}

          </section>

          <section className="app-panel app-panel-pad">
            <div className="controle-total__section-heading">
              <h3>Lista</h3>
              <div className="app-search controle-total__search">
                <Search size={18} />
                <input className="app-input pl-11" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar na lista" />
              </div>
            </div>
            <div className="app-list">
              {timeline.map((entry) => (
                <article key={entry.id} className="app-list-card controle-total__timeline-card">
                  <div>
                    <span className={statusClass(entry.status)}>{statusLabel(entry.status)}</span>
                    <strong>{entry.title}</strong>
                    <p>{formatDate(entry.date)} | {entry.subtitle}</p>
                  </div>
                  <strong className={entry.value < 0 ? 'controle-total__negative' : 'controle-total__positive'}>
                    {entry.type === 'stock' ? `${entry.value > 0 ? '+' : ''}${entry.value}` : formatCurrency(entry.value)}
                  </strong>
                </article>
              ))}
              {timeline.length === 0 ? <div className="app-empty">Nenhum registro no periodo selecionado.</div> : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'stock' ? (
        <div className="controle-total__stack">
          <section className="app-panel app-panel-pad controle-total__filters">
            <label className="app-field">
              <span className="app-field__label">Filial (movimentacoes)</span>
              {renderAcademySelect(stockAcademyId, setStockAcademyId, true)}
            </label>
          </section>

          <section className="app-panel app-panel-pad">
            <div className="controle-total__section-heading">
              <h3>Estoque</h3>
              <span className="controle-total__stock-count">{stockListProducts.length} {stockListProducts.length === 1 ? 'produto' : 'produtos'}</span>
            </div>
            <div className="app-list">
              {stockListProducts.map((product) => {
                const lowStock = product.stockCurrent <= product.stockMinimum;
                const editRaw = stockEdits[product.id];
                const editing = editRaw !== undefined;
                const editValue = editing ? editRaw : String(product.stockCurrent);
                const parsed = Number((editValue || '').replace(',', '.'));
                const dirty = editing && Number.isFinite(parsed) && parsed >= 0 && parsed !== product.stockCurrent;
                const busyKey = `stock-edit:${product.id}`;
                return (
                  <article key={product.id} className={`controle-total__stock-card ${lowStock ? 'is-low-stock' : ''} ${product.status === 'inactive' ? 'is-inactive' : ''}`}>
                    <div className="controle-total__stock-card__info">
                      <strong>{product.name}</strong>
                      <p>{product.category}</p>
                      <div className="superadmin-chip-row">
                        <span className={statusClass(product.status)}>{statusLabel(product.status)}</span>
                        <span className={lowStock ? 'app-badge app-badge--danger' : 'app-badge app-badge--muted'}>Estoque {product.stockCurrent}/{product.stockMinimum}</span>
                      </div>
                    </div>
                    <div className="controle-total__stock-card__edit">
                      <label className="app-field controle-total__stock-card__field">
                        <span className="app-field__label">Quantidade</span>
                        <input
                          className="app-input"
                          type="number"
                          min="0"
                          step="1"
                          value={editValue}
                          onChange={(event) => setStockEdits((current) => ({ ...current, [product.id]: event.target.value }))}
                        />
                      </label>
                      <button
                        type="button"
                        className="app-button app-button--gold app-button--small"
                        disabled={!dirty || busy === busyKey}
                        onClick={() => void submitStockEdit(product)}
                      >
                        Salvar
                      </button>
                      {editing ? (
                        <button
                          type="button"
                          className="app-button app-button--ghost app-button--small"
                          title="Cancelar"
                          onClick={() => setStockEdits((current) => {
                            const next = { ...current };
                            delete next[product.id];
                            return next;
                          })}
                        >
                          <X size={14} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="app-button app-button--danger app-button--icon"
                        title="Excluir ou inativar"
                        onClick={() => void runAction(`delete-product:${product.id}`, () => backendFunctions.deleteOrArchiveFinanceProduct({ productId: product.id }).then(() => undefined))}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                );
              })}
              {stockListProducts.length === 0 ? <div className="app-empty">Nenhum produto cadastrado.</div> : null}
            </div>
          </section>

          <section className="app-panel app-panel-pad">
            <div className="controle-total__section-heading">
              <h3>Movimentacoes de Estoque</h3>
            </div>
            <div className="app-list">
              {timeline.filter((entry) => entry.type === 'stock' && (!stockAcademyId || entry.academyId === stockAcademyId)).map((entry) => (
                <article key={entry.id} className="app-list-card controle-total__timeline-card">
                  <div>
                    <span className={statusClass(entry.status)}>{statusLabel(entry.status)}</span>
                    <strong>{entry.title}</strong>
                    <p>{formatDate(entry.date)} | {entry.subtitle}</p>
                  </div>
                  <strong className={entry.value >= 0 ? 'controle-total__positive' : 'controle-total__negative'}>
                    {entry.value > 0 ? '+' : ''}{entry.value}
                  </strong>
                </article>
              ))}
              {timeline.filter((entry) => entry.type === 'stock' && (!stockAcademyId || entry.academyId === stockAcademyId)).length === 0 ? <div className="app-empty">Nenhuma movimentacao de estoque no periodo selecionado.</div> : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === 'reports' ? (
        <div className="controle-total__stack">
          <section className="app-panel app-panel-pad controle-total__filters">
            <label className="app-field">
              <span className="app-field__label">Filial</span>
              {renderAcademySelect(reportAcademyId, setReportAcademyId, true, true)}
            </label>
            <label className="app-field">
              <span className="app-field__label">Inicio</span>
              <DateField value={reportStart} onChange={setReportStart} />
            </label>
            <label className="app-field">
              <span className="app-field__label">Fim</span>
              <DateField value={reportEnd} onChange={setReportEnd} />
            </label>
          </section>

          <section className="app-panel app-panel-pad controle-total__stack">
            <div className="controle-total__section-heading">
              <strong>Blocos do relatorio</strong>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
              {(['resumo', 'vendas', 'pagamentos', 'receitas', 'despesas', 'maisVendidos', 'vales'] as ReportBlock[]).map((block) => (
                <label key={block} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={reportBlocks[block]}
                    onChange={(event) => setReportBlocks((current) => ({ ...current, [block]: event.target.checked }))}
                  />
                  <span>{REPORT_BLOCK_LABELS[block]}</span>
                </label>
              ))}
            </div>

            <div className="controle-total__section-heading">
              <strong>Formato</strong>
            </div>
            <div className="app-segment" role="tablist" aria-label="Formato do relatorio">
              <button type="button" role="tab" className={`app-segment__button ${reportFormat === 'excel' ? 'is-active' : ''}`} onClick={() => setReportFormat('excel')}>
                Excel (.xlsx)
              </button>
              <button type="button" role="tab" className={`app-segment__button ${reportFormat === 'pdf' ? 'is-active' : ''}`} onClick={() => setReportFormat('pdf')}>
                PDF
              </button>
            </div>

            <button type="button" className="app-button app-button--gold" disabled={reportBusy} onClick={handleGenerateReport}>
              <FileDown size={18} /> {reportBusy ? 'Gerando...' : 'Gerar relatorio'}
            </button>
          </section>
        </div>
      ) : null}

      {activeTab === 'vales' ? (
        <div className="controle-total__stack">
          <form onSubmit={submitWithdrawal} className="app-panel app-panel-pad controle-total__stack">
            <div className="controle-total__section-heading">
              <strong>Registrar retirada (vale)</strong>
            </div>
            <label className="app-field">
              <span className="app-field__label">Quem retirou (equipe)</span>
              <select required className="app-select" value={withdrawalDebtorId} onChange={(event) => setWithdrawalDebtorId(event.target.value)}>
                <option value="">- Selecionar -</option>
                {withdrawalDebtors.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
              </select>
            </label>

            <div className="controle-total__items-editor">
              <div className="controle-total__section-heading">
                <strong>Itens retirados</strong>
                <button type="button" className="app-button app-button--ghost app-button--small" onClick={() => setWithdrawalItems((current) => [...current, { productId: '', quantity: '1', unitValue: '' }])}>
                  <Plus size={16} /> Adicionar
                </button>
              </div>
              {withdrawalItems.map((item, index) => (
                <div key={index} className="controle-total__sale-item-row">
                  <div className="controle-total__sale-item">
                    <select required className="app-select" value={item.productId} onChange={(event) => {
                      const product = productById.get(event.target.value);
                      const price = product ? readProductSalePriceForBuyer(product, 'diretoria') : 0;
                      setWithdrawalItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, productId: event.target.value, unitValue: product ? String(price) : '' } : entry));
                    }}>
                      <option value="">Selecionar produto</option>
                      {availableProducts.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.stockCurrent} em estoque)</option>)}
                    </select>
                    <input className="app-input" inputMode="decimal" placeholder="Qtd" value={item.quantity} onChange={(event) => setWithdrawalItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantity: event.target.value } : entry))} />
                    <input className="app-input" inputMode="decimal" placeholder="Valor unit." value={item.unitValue} onChange={(event) => setWithdrawalItems((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, unitValue: event.target.value } : entry))} />
                    {withdrawalItems.length > 1 ? (
                      <button type="button" className="app-button app-button--ghost app-button--small" aria-label="Remover item" onClick={() => setWithdrawalItems((current) => current.filter((_, entryIndex) => entryIndex !== index))}><Trash2 size={16} /></button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <label className="app-field">
              <span className="app-field__label">Observacao</span>
              <input className="app-input" value={withdrawalNotes} onChange={(event) => setWithdrawalNotes(event.target.value)} placeholder="Opcional" />
            </label>

            <button type="submit" className="app-button app-button--gold" disabled={!!busy}>
              <Package size={18} /> Registrar retirada
            </button>
          </form>

          <section className="app-panel app-panel-pad controle-total__stack">
            <div className="controle-total__section-heading">
              <strong>Vales</strong>
              <span className="app-badge app-badge--gold">Em aberto: {formatCurrency(valesEmAberto)}</span>
            </div>
            {withdrawals.length === 0 ? <div className="app-empty">Nenhum vale registrado.</div> : null}
            {withdrawals.map((withdrawal) => {
              const itemsLabel = withdrawal.items.map((item) => `${item.quantity}x ${item.productName}`).join(', ');
              const canSettle = withdrawal.status !== 'cancelled' && withdrawal.balanceDue > 0;
              const canReturn = withdrawal.status !== 'cancelled' && withdrawal.amountReceived === 0;
              return (
                <article key={withdrawal.id} style={{ border: '1px solid rgba(128,128,128,0.25)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div>
                      <strong>{withdrawal.debtorName}</strong>
                      <p style={{ margin: '2px 0', opacity: 0.8 }}>{itemsLabel}</p>
                      <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.6 }}>{formatDate(toDate(withdrawal.withdrawnAt ?? withdrawal.createdAt))}</p>
                    </div>
                    <span className={statusClass(withdrawal.status)}>{statusLabel(withdrawal.status)}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                    <span>Total {formatCurrency(withdrawal.total)}</span>
                    <span>Recebido {formatCurrency(withdrawal.amountReceived)}</span>
                    <strong>Saldo {formatCurrency(withdrawal.balanceDue)}</strong>
                  </div>
                  {settleTarget === withdrawal.id ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      <input className="app-input" inputMode="decimal" placeholder="Valor" value={settleAmount} onChange={(event) => setSettleAmount(event.target.value)} style={{ maxWidth: '140px' }} />
                      <select className="app-select" value={settleMethod} onChange={(event) => setSettleMethod(event.target.value)} style={{ maxWidth: '180px' }}>
                        {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                      </select>
                      <DateField value={settleDate} onChange={setSettleDate} style={{ maxWidth: '210px' }} />
                      <button type="button" className="app-button app-button--gold app-button--small" disabled={!!busy} onClick={() => submitSettle(withdrawal.id)}>Confirmar</button>
                      <button type="button" className="app-button app-button--ghost app-button--small" onClick={() => setSettleTarget('')}>Fechar</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {canSettle ? <button type="button" className="app-button app-button--small" onClick={() => startSettle(withdrawal)}>Receber</button> : null}
                      {canReturn ? <button type="button" className="app-button app-button--ghost app-button--small" disabled={!!busy} onClick={() => cancelWithdrawal(withdrawal.id)}>Devolver ao estoque</button> : null}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </div>
      ) : null}

    </div>
  );
};

export default ControleTotalView;
