import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Edit3,
  Filter,
  Package,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import type { FirestoreEntity } from '../services/firebase/data';
import { backendFunctions, type FinanceSaleItemPayload } from '../services/firebase/functions';
import type {
  AcademyRecord,
  FinanceExpenseRecord,
  FinancePaymentRecord,
  FinanceProductRecord,
  FinanceRevenueRecord,
  FinanceSaleItemRecord,
  FinanceSaleRecord,
  FinanceServiceRecord,
  InventoryMovementRecord,
  UserRecord,
} from '../services/firebase/models';

type ControleTab = 'dashboard' | 'catalog' | 'list';
type CatalogMode = 'product' | 'service';
type ListType = 'all' | 'sale' | 'payment' | 'revenue' | 'expense' | 'stock';
type SortMode = 'newest' | 'oldest' | 'value_desc' | 'value_asc';
type ActionMode = 'sale' | 'payment' | 'revenue' | 'expense' | 'stock' | null;

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
  selectedAcademyId: string;
  onSelectAcademy: (academyId: string) => void;
}

interface ProductFormState {
  productId: string;
  academyId: string;
  name: string;
  category: string;
  description: string;
  purchasePrice: string;
  salePrice: string;
  stockCurrent: string;
  stockMinimum: string;
  status: 'active' | 'inactive';
}

interface ServiceFormState {
  serviceId: string;
  academyId: string;
  name: string;
  description: string;
  cost: string;
  salePrice: string;
  status: 'active' | 'inactive';
}

interface SaleItemFormState {
  type: 'product' | 'service';
  itemId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
}

interface SaleFormState {
  academyId: string;
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

interface PaymentFormState {
  saleId: string;
  amount: string;
  paymentMethod: string;
  paymentDate: string;
  notes: string;
}

interface RevenueFormState {
  academyId: string;
  category: string;
  description: string;
  amount: string;
  receivedAt: string;
  paymentMethod: string;
}

interface ExpenseFormState {
  expenseId: string;
  academyId: string;
  category: string;
  description: string;
  amount: string;
  dueDate: string;
  paidAt: string;
  status: 'pending' | 'paid' | 'overdue';
  supplier: string;
  notes: string;
}

interface StockFormState {
  productId: string;
  quantityDelta: string;
  reason: string;
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
const serviceCategories = ['Mensalidade', 'Aula particular', 'Seminario', 'Exame', 'Matricula', 'Treino', 'Outros'];
const expenseCategories = ['Aluguel', 'Agua', 'Luz', 'Internet', 'Marketing', 'Professor', 'Limpeza', 'Produtos', 'Equipamentos', 'Taxas', 'Eventos', 'Outros'];

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

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

function initialProductForm(academyId: string): ProductFormState {
  return {
    productId: '',
    academyId,
    name: '',
    category: 'Outros',
    description: '',
    purchasePrice: '',
    salePrice: '',
    stockCurrent: '0',
    stockMinimum: '0',
    status: 'active',
  };
}

function initialServiceForm(academyId: string): ServiceFormState {
  return {
    serviceId: '',
    academyId,
    name: '',
    description: '',
    cost: '',
    salePrice: '',
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
  };
}

function initialSaleForm(academyId: string): SaleFormState {
  return {
    academyId,
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

function initialPaymentForm(): PaymentFormState {
  return {
    saleId: '',
    amount: '',
    paymentMethod: 'Pix',
    paymentDate: dateInputValue(),
    notes: '',
  };
}

function initialRevenueForm(academyId: string): RevenueFormState {
  return {
    academyId,
    category: 'Manual',
    description: '',
    amount: '',
    receivedAt: dateInputValue(),
    paymentMethod: 'Pix',
  };
}

function initialExpenseForm(academyId: string): ExpenseFormState {
  return {
    expenseId: '',
    academyId,
    category: 'Outros',
    description: '',
    amount: '',
    dueDate: dateInputValue(),
    paidAt: '',
    status: 'pending',
    supplier: '',
    notes: '',
  };
}

function initialStockForm(productId = ''): StockFormState {
  return {
    productId,
    quantityDelta: '',
    reason: '',
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
  const [productForm, setProductForm] = useState<ProductFormState>(() => initialProductForm(defaultAcademyId));
  const [serviceForm, setServiceForm] = useState<ServiceFormState>(() => initialServiceForm(defaultAcademyId));
  const [saleForm, setSaleForm] = useState<SaleFormState>(() => initialSaleForm(defaultAcademyId));
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(() => initialPaymentForm());
  const [revenueForm, setRevenueForm] = useState<RevenueFormState>(() => initialRevenueForm(defaultAcademyId));
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(() => initialExpenseForm(defaultAcademyId));
  const [stockForm, setStockForm] = useState<StockFormState>(() => initialStockForm());

  const students = useMemo(() => users.filter((user) => user.role === 'student'), [users]);
  const staff = useMemo(() => users.filter((user) => user.role === 'professor' || user.role === 'superadmin'), [users]);
  const salesById = useMemo(() => new Map(sales.map((sale) => [sale.id, sale])), [sales]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const serviceById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);

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
    const revenueTotal = scopedRevenues.reduce((total, revenue) => total + revenue.amount, 0);
    const expenseTotal = scopedExpenses.reduce((total, expense) => total + expense.amount, 0);
    const pendingTotal = scopedSales
      .filter((sale) => sale.paymentStatus === 'pending' || sale.paymentStatus === 'partial')
      .reduce((total, sale) => total + sale.balanceDue, 0);
    const lowStock = products.filter((product) => (
      (!academyFilter || product.academyId === academyFilter)
      && product.status === 'active'
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
    const academyRevenue = scopedRevenues.reduce<Map<string, number>>((map, revenue) => {
      map.set(revenue.academyId, (map.get(revenue.academyId) ?? 0) + revenue.amount);
      return map;
    }, new Map());
    const customerTotals = ticketSales.reduce<Map<string, number>>((map, sale) => {
      map.set(sale.customerName, (map.get(sale.customerName) ?? 0) + sale.total);
      return map;
    }, new Map());

    return {
      soldTotal: ticketSales.reduce((total, sale) => total + sale.total, 0),
      revenueTotal,
      pendingTotal,
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
  }, [dashboardAcademyId, dashboardEnd, dashboardStart, expenses, products, revenues, saleItems, sales]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return products.filter((product) => (
      (!selectedAcademyId || product.academyId === selectedAcademyId)
      && (!term || `${product.name} ${product.category}`.toLowerCase().includes(term))
    ));
  }, [products, searchTerm, selectedAcademyId]);

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
      entries.push({
        id: `sale:${sale.id}`,
        type: 'sale',
        title: `Venda - ${sale.customerName}`,
        subtitle: `${academyName(academies, sale.academyId)} | ${statusLabel(sale.paymentStatus)}`,
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
  }, [academies, expenses, inventoryMovements, listAcademyId, listEnd, listStart, listType, payments, revenues, sales, salesById, searchTerm, sortMode]);

  const availableProducts = products.filter((product) => (
    product.status === 'active' && product.academyId === saleForm.academyId
  ));
  const availableServices = services.filter((service) => (
    service.status === 'active' && service.academyId === saleForm.academyId
  ));
  const pendingSales = sales.filter((sale) => sale.paymentStatus === 'pending' || sale.paymentStatus === 'partial');

  function selectedItemPrice(item: SaleItemFormState): number {
    if (item.unitPrice.trim()) return asNumber(item.unitPrice);
    if (item.type === 'product') return productById.get(item.itemId)?.salePrice ?? 0;
    return serviceById.get(item.itemId)?.salePrice ?? 0;
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
        academyId: productForm.academyId,
        name: productForm.name,
        category: productForm.category,
        description: productForm.description || undefined,
        purchasePrice: asNumber(productForm.purchasePrice),
        salePrice: asNumber(productForm.salePrice),
        stockCurrent: asNumber(productForm.stockCurrent),
        stockMinimum: asNumber(productForm.stockMinimum),
        status: productForm.status,
      });
      setProductForm(initialProductForm(productForm.academyId));
    });
  }

  async function submitService(event: React.FormEvent) {
    event.preventDefault();
    await runAction('service', async () => {
      await backendFunctions.upsertFinanceService({
        serviceId: serviceForm.serviceId || undefined,
        academyId: serviceForm.academyId,
        name: serviceForm.name,
        description: serviceForm.description || undefined,
        cost: asNumber(serviceForm.cost),
        salePrice: asNumber(serviceForm.salePrice),
        status: serviceForm.status,
      });
      setServiceForm(initialServiceForm(serviceForm.academyId));
    });
  }

  async function submitSale(event: React.FormEvent) {
    event.preventDefault();
    await runAction('sale', async () => {
      const items: FinanceSaleItemPayload[] = saleForm.items.map((item) => ({
        type: item.type,
        itemId: item.itemId,
        quantity: asNumber(item.quantity),
        ...(item.unitPrice.trim() ? { unitPrice: asNumber(item.unitPrice) } : {}),
        discount: asNumber(item.discount),
      }));

      await backendFunctions.createFinanceSale({
        academyId: saleForm.academyId,
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
      setSaleForm(initialSaleForm(saleForm.academyId));
    });
  }

  async function submitPayment(event: React.FormEvent) {
    event.preventDefault();
    await runAction('payment', async () => {
      await backendFunctions.recordSalePayment({
        saleId: paymentForm.saleId,
        amount: asNumber(paymentForm.amount),
        paymentMethod: paymentForm.paymentMethod,
        paymentDate: paymentForm.paymentDate || undefined,
        notes: paymentForm.notes || undefined,
      });
      setPaymentForm(initialPaymentForm());
    });
  }

  async function submitRevenue(event: React.FormEvent) {
    event.preventDefault();
    await runAction('revenue', async () => {
      await backendFunctions.upsertManualRevenue({
        academyId: revenueForm.academyId,
        category: revenueForm.category,
        description: revenueForm.description,
        amount: asNumber(revenueForm.amount),
        receivedAt: revenueForm.receivedAt || undefined,
        paymentMethod: revenueForm.paymentMethod || undefined,
      });
      setRevenueForm(initialRevenueForm(revenueForm.academyId));
    });
  }

  async function submitExpense(event: React.FormEvent) {
    event.preventDefault();
    await runAction('expense', async () => {
      await backendFunctions.upsertExpense({
        expenseId: expenseForm.expenseId || undefined,
        academyId: expenseForm.academyId,
        category: expenseForm.category,
        description: expenseForm.description,
        amount: asNumber(expenseForm.amount),
        dueDate: expenseForm.dueDate || undefined,
        paidAt: expenseForm.paidAt || undefined,
        status: expenseForm.status,
        supplier: expenseForm.supplier || undefined,
        notes: expenseForm.notes || undefined,
      });
      setExpenseForm(initialExpenseForm(expenseForm.academyId));
    });
  }

  async function submitStock(event: React.FormEvent) {
    event.preventDefault();
    await runAction('stock', async () => {
      await backendFunctions.adjustProductStock({
        productId: stockForm.productId,
        quantityDelta: asNumber(stockForm.quantityDelta),
        reason: stockForm.reason || undefined,
      });
      setStockForm(initialStockForm(stockForm.productId));
    });
  }

  const renderAcademySelect = (
    value: string,
    onChange: (value: string) => void,
    includeAll = false,
  ) => (
    <select
      className="app-select"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {includeAll ? <option value="">Todas as filiais</option> : null}
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
              <input className="app-input" type="date" value={dashboardStart} onChange={(event) => setDashboardStart(event.target.value)} />
            </label>
            <label className="app-field">
              <span className="app-field__label">Fim</span>
              <input className="app-input" type="date" value={dashboardEnd} onChange={(event) => setDashboardEnd(event.target.value)} />
            </label>
          </section>

          <section className="controle-total__kpi-grid">
            {[
              ['Total vendido', dashboardMetrics.soldTotal, <ShoppingCart key="icon" size={18} />],
              ['Total recebido', dashboardMetrics.revenueTotal, <DollarSign key="icon" size={18} />],
              ['Total pendente', dashboardMetrics.pendingTotal, <CreditCard key="icon" size={18} />],
              ['Despesas', dashboardMetrics.expenseTotal, <ReceiptText key="icon" size={18} />],
              ['Lucro bruto', dashboardMetrics.grossProfit, <BarChart3 key="icon" size={18} />],
              ['Lucro liquido', dashboardMetrics.netProfit, <CheckCircle2 key="icon" size={18} />],
              ['Ticket medio', dashboardMetrics.averageTicket, <ReceiptText key="icon" size={18} />],
              ['Estoque baixo', dashboardMetrics.lowStock.length, <AlertTriangle key="icon" size={18} />],
            ].map(([label, value, icon]) => (
              <article key={String(label)} className="superadmin-kpi-tile">
                <span className="superadmin-kpi-tile__label">{icon}{label}</span>
                <strong className="superadmin-kpi-tile__value">
                  {typeof value === 'number' && label !== 'Estoque baixo' ? formatCurrency(value) : String(value)}
                </strong>
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
            <label className="app-field">
              <span className="app-field__label">Filial ativa</span>
              {renderAcademySelect(selectedAcademyId || defaultAcademyId, (value) => {
                onSelectAcademy(value);
                setProductForm((current) => ({ ...current, academyId: value }));
                setServiceForm((current) => ({ ...current, academyId: value }));
              })}
            </label>
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
                    <button type="button" className="app-button app-button--ghost app-button--small" onClick={() => setProductForm(initialProductForm(productForm.academyId))}>
                      <X size={16} /> Limpar
                    </button>
                  ) : null}
                </div>
                <label className="app-field"><span className="app-field__label">Filial</span>{renderAcademySelect(productForm.academyId, (value) => setProductForm((current) => ({ ...current, academyId: value })))}</label>
                <label className="app-field"><span className="app-field__label">Nome</span><input required className="app-input" value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Categoria</span><select className="app-select" value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))}>{productCategories.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
                <label className="app-field"><span className="app-field__label">Descricao</span><textarea className="app-textarea" value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} /></label>
                <div className="controle-total__mini-grid">
                  <label className="app-field"><span className="app-field__label">Preco de compra</span><input required className="app-input" inputMode="decimal" value={productForm.purchasePrice} onChange={(event) => setProductForm((current) => ({ ...current, purchasePrice: event.target.value }))} /></label>
                  <label className="app-field"><span className="app-field__label">Preco de venda</span><input required className="app-input" inputMode="decimal" value={productForm.salePrice} onChange={(event) => setProductForm((current) => ({ ...current, salePrice: event.target.value }))} /></label>
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
                          <p>{academyName(academies, product.academyId)} | {product.category}</p>
                          <div className="superadmin-chip-row">
                            <span className={statusClass(product.status)}>{statusLabel(product.status)}</span>
                            <span className={lowStock ? 'app-badge app-badge--danger' : 'app-badge app-badge--muted'}>Estoque {product.stockCurrent}/{product.stockMinimum}</span>
                            <span className="app-badge app-badge--gold">Lucro {formatCurrency(product.salePrice - product.purchasePrice)}</span>
                          </div>
                        </div>
                        <div className="controle-total__row-actions">
                          <button type="button" className="app-button app-button--ghost app-button--icon" title="Editar" onClick={() => setProductForm({
                            productId: product.id,
                            academyId: product.academyId,
                            name: product.name,
                            category: product.category,
                            description: product.description ?? '',
                            purchasePrice: String(product.purchasePrice),
                            salePrice: String(product.salePrice),
                            stockCurrent: String(product.stockCurrent),
                            stockMinimum: String(product.stockMinimum),
                            status: product.status,
                          })}><Edit3 size={17} /></button>
                          <button type="button" className="app-button app-button--ghost app-button--icon" title="Ajustar estoque" onClick={() => { setStockForm(initialStockForm(product.id)); setActionMode('stock'); }}><Plus size={17} /></button>
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
                <label className="app-field"><span className="app-field__label">Filial</span>{renderAcademySelect(serviceForm.academyId, (value) => setServiceForm((current) => ({ ...current, academyId: value })))}</label>
                <label className="app-field"><span className="app-field__label">Nome</span><input required className="app-input" value={serviceForm.name} onChange={(event) => setServiceForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Descricao</span><textarea className="app-textarea" value={serviceForm.description} onChange={(event) => setServiceForm((current) => ({ ...current, description: event.target.value }))} /></label>
                <div className="controle-total__mini-grid">
                  <label className="app-field"><span className="app-field__label">Custo</span><input required className="app-input" inputMode="decimal" value={serviceForm.cost} onChange={(event) => setServiceForm((current) => ({ ...current, cost: event.target.value }))} /></label>
                  <label className="app-field"><span className="app-field__label">Preco de venda</span><input required className="app-input" inputMode="decimal" value={serviceForm.salePrice} onChange={(event) => setServiceForm((current) => ({ ...current, salePrice: event.target.value }))} /></label>
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
                          description: service.description ?? '',
                          cost: String(service.cost),
                          salePrice: String(service.salePrice),
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
            <label className="app-field"><span className="app-field__label">Inicio</span><input className="app-input" type="date" value={listStart} onChange={(event) => setListStart(event.target.value)} /></label>
            <label className="app-field"><span className="app-field__label">Fim</span><input className="app-input" type="date" value={listEnd} onChange={(event) => setListEnd(event.target.value)} /></label>
            <label className="app-field"><span className="app-field__label">Tipo</span><select className="app-select" value={listType} onChange={(event) => setListType(event.target.value as ListType)}><option value="all">Todos</option><option value="sale">Vendas</option><option value="payment">Pagamentos</option><option value="revenue">Receitas</option><option value="expense">Despesas</option><option value="stock">Estoque</option></select></label>
            <label className="app-field"><span className="app-field__label">Ordenar</span><select className="app-select" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="newest">Mais recentes</option><option value="oldest">Mais antigas</option><option value="value_desc">Maior valor</option><option value="value_asc">Menor valor</option></select></label>
          </section>

          <section className="app-panel app-panel-pad controle-total__actions-panel">
            <div className="controle-total__section-heading">
              <h3>Acoes do dia</h3>
              <div className="controle-total__action-buttons">
                {[
                  ['sale', 'Venda', <ShoppingCart key="icon" size={16} />],
                  ['payment', 'Pagamento', <CreditCard key="icon" size={16} />],
                  ['revenue', 'Receita', <DollarSign key="icon" size={16} />],
                  ['expense', 'Despesa', <ReceiptText key="icon" size={16} />],
                  ['stock', 'Estoque', <Package key="icon" size={16} />],
                ].map(([mode, label, icon]) => (
                  <button
                    key={String(mode)}
                    type="button"
                    className={`app-button app-button--small controle-total__action-button controle-total__action-button--${String(mode)} ${actionMode === mode ? 'is-active' : ''}`}
                    onClick={() => setActionMode(actionMode === mode ? null : mode as ActionMode)}
                  >
                    {icon}{label}
                  </button>
                ))}
              </div>
            </div>

            {actionMode === 'sale' ? (
              <form onSubmit={submitSale} className="controle-total__form-grid">
                <label className="app-field"><span className="app-field__label">Filial</span>{renderAcademySelect(saleForm.academyId, (value) => setSaleForm((current) => ({ ...current, academyId: value, items: [initialSaleItem()] })))}</label>
                <label className="app-field"><span className="app-field__label">Aluno/cliente</span><select className="app-select" value={saleForm.customerId} onChange={(event) => selectCustomer(event.target.value)}><option value="">Cliente avulso</option>{students.filter((student) => !saleForm.academyId || student.academyId === saleForm.academyId).map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}</select></label>
                <label className="app-field"><span className="app-field__label">Nome do cliente</span><input required className="app-input" value={saleForm.customerName} onChange={(event) => setSaleForm((current) => ({ ...current, customerName: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Responsavel</span><select className="app-select" value={saleForm.sellerId} onChange={(event) => selectSeller(event.target.value)}><option value="">Sem responsavel</option>{staff.filter((entry) => !saleForm.academyId || entry.academyId === saleForm.academyId || entry.role === 'superadmin').map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}</select></label>
                <label className="app-field"><span className="app-field__label">Data da venda</span><input className="app-input" type="date" value={saleForm.saleDate} onChange={(event) => setSaleForm((current) => ({ ...current, saleDate: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Data futura de pagamento</span><input className="app-input" type="date" value={saleForm.dueDate} onChange={(event) => setSaleForm((current) => ({ ...current, dueDate: event.target.value }))} /></label>

                <div className="controle-total__items-editor">
                  {saleForm.items.map((item, index) => {
                    const options = item.type === 'product' ? availableProducts : availableServices;
                    return (
                      <div key={index} className="controle-total__sale-item">
                        <select className="app-select" value={item.type} onChange={(event) => updateSaleItem(index, { type: event.target.value as SaleItemFormState['type'], itemId: '', unitPrice: '' })}><option value="product">Produto</option><option value="service">Servico</option></select>
                        <select required className="app-select" value={item.itemId} onChange={(event) => updateSaleItem(index, { itemId: event.target.value, unitPrice: '' })}><option value="">Selecionar</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
                        <input className="app-input" inputMode="decimal" value={item.quantity} onChange={(event) => updateSaleItem(index, { quantity: event.target.value })} placeholder="Qtd" />
                        <input className="app-input" inputMode="decimal" value={item.unitPrice} onChange={(event) => updateSaleItem(index, { unitPrice: event.target.value })} placeholder={formatCurrency(selectedItemPrice(item))} />
                        <input className="app-input" inputMode="decimal" value={item.discount} onChange={(event) => updateSaleItem(index, { discount: event.target.value })} placeholder="Desc." />
                        <button type="button" className="app-button app-button--ghost app-button--icon" onClick={() => setSaleForm((current) => {
                          const nextItems = current.items.filter((_, itemIndex) => itemIndex !== index);
                          return { ...current, items: nextItems.length ? nextItems : [initialSaleItem()] };
                        })}><X size={16} /></button>
                      </div>
                    );
                  })}
                  <button type="button" className="app-button app-button--ghost app-button--small" onClick={() => setSaleForm((current) => ({ ...current, items: [...current.items, initialSaleItem()] }))}><Plus size={16} /> Item</button>
                </div>

                <label className="app-field"><span className="app-field__label">Forma de pagamento</span><select className="app-select" value={saleForm.paymentMethod} onChange={(event) => setSaleForm((current) => ({ ...current, paymentMethod: event.target.value }))}>{paymentMethods.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
                <label className="app-field"><span className="app-field__label">Valor recebido</span><input className="app-input" inputMode="decimal" value={saleForm.receivedAmount} onChange={(event) => setSaleForm((current) => ({ ...current, receivedAmount: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Data do pagamento</span><input className="app-input" type="date" value={saleForm.paymentDate} onChange={(event) => setSaleForm((current) => ({ ...current, paymentDate: event.target.value }))} /></label>
                <label className="app-field controle-total__span-2"><span className="app-field__label">Observacoes</span><textarea className="app-textarea" value={saleForm.notes} onChange={(event) => setSaleForm((current) => ({ ...current, notes: event.target.value }))} /></label>
                <div className="controle-total__sale-total">
                  <span>Subtotal {formatCurrency(salePreview.subtotal)}</span>
                  <span>Desconto {formatCurrency(salePreview.discount)}</span>
                  <strong>Total {formatCurrency(salePreview.total)}</strong>
                </div>
                <button type="submit" disabled={busy === 'sale'} className="app-button app-button--gold"><ShoppingCart size={18} /> Criar venda</button>
              </form>
            ) : null}

            {actionMode === 'payment' ? (
              <form onSubmit={submitPayment} className="controle-total__form-grid">
                <label className="app-field controle-total__span-2"><span className="app-field__label">Venda</span><select required className="app-select" value={paymentForm.saleId} onChange={(event) => {
                  const sale = salesById.get(event.target.value);
                  setPaymentForm((current) => ({ ...current, saleId: event.target.value, amount: sale ? String(sale.balanceDue) : current.amount }));
                }}><option value="">Selecionar venda pendente</option>{pendingSales.map((sale) => <option key={sale.id} value={sale.id}>{formatDate(toDate(sale.saleDate))} - {sale.customerName} - saldo {formatCurrency(sale.balanceDue)}</option>)}</select></label>
                <label className="app-field"><span className="app-field__label">Valor</span><input required className="app-input" inputMode="decimal" value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Forma</span><select className="app-select" value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm((current) => ({ ...current, paymentMethod: event.target.value }))}>{paymentMethods.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
                <label className="app-field"><span className="app-field__label">Data</span><input className="app-input" type="date" value={paymentForm.paymentDate} onChange={(event) => setPaymentForm((current) => ({ ...current, paymentDate: event.target.value }))} /></label>
                <label className="app-field controle-total__span-2"><span className="app-field__label">Observacoes</span><input className="app-input" value={paymentForm.notes} onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))} /></label>
                <button type="submit" disabled={busy === 'payment'} className="app-button app-button--gold"><CreditCard size={18} /> Registrar pagamento</button>
              </form>
            ) : null}

            {actionMode === 'revenue' ? (
              <form onSubmit={submitRevenue} className="controle-total__form-grid">
                <label className="app-field"><span className="app-field__label">Filial</span>{renderAcademySelect(revenueForm.academyId, (value) => setRevenueForm((current) => ({ ...current, academyId: value })))}</label>
                <label className="app-field"><span className="app-field__label">Categoria</span><input required className="app-input" value={revenueForm.category} onChange={(event) => setRevenueForm((current) => ({ ...current, category: event.target.value }))} /></label>
                <label className="app-field controle-total__span-2"><span className="app-field__label">Descricao</span><input required className="app-input" value={revenueForm.description} onChange={(event) => setRevenueForm((current) => ({ ...current, description: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Valor</span><input required className="app-input" inputMode="decimal" value={revenueForm.amount} onChange={(event) => setRevenueForm((current) => ({ ...current, amount: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Recebimento</span><input className="app-input" type="date" value={revenueForm.receivedAt} onChange={(event) => setRevenueForm((current) => ({ ...current, receivedAt: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Forma</span><select className="app-select" value={revenueForm.paymentMethod} onChange={(event) => setRevenueForm((current) => ({ ...current, paymentMethod: event.target.value }))}>{paymentMethods.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
                <button type="submit" disabled={busy === 'revenue'} className="app-button app-button--gold"><DollarSign size={18} /> Salvar receita</button>
              </form>
            ) : null}

            {actionMode === 'expense' ? (
              <form onSubmit={submitExpense} className="controle-total__form-grid">
                <label className="app-field"><span className="app-field__label">Filial</span>{renderAcademySelect(expenseForm.academyId, (value) => setExpenseForm((current) => ({ ...current, academyId: value })))}</label>
                <label className="app-field"><span className="app-field__label">Categoria</span><select className="app-select" value={expenseForm.category} onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))}>{expenseCategories.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
                <label className="app-field controle-total__span-2"><span className="app-field__label">Descricao</span><input required className="app-input" value={expenseForm.description} onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Valor</span><input required className="app-input" inputMode="decimal" value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Vencimento</span><input className="app-input" type="date" value={expenseForm.dueDate} onChange={(event) => setExpenseForm((current) => ({ ...current, dueDate: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Pagamento</span><input className="app-input" type="date" value={expenseForm.paidAt} onChange={(event) => setExpenseForm((current) => ({ ...current, paidAt: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Status</span><select className="app-select" value={expenseForm.status} onChange={(event) => setExpenseForm((current) => ({ ...current, status: event.target.value as ExpenseFormState['status'] }))}><option value="pending">Pendente</option><option value="paid">Pago</option><option value="overdue">Atrasado</option></select></label>
                <label className="app-field"><span className="app-field__label">Fornecedor</span><input className="app-input" value={expenseForm.supplier} onChange={(event) => setExpenseForm((current) => ({ ...current, supplier: event.target.value }))} /></label>
                <label className="app-field controle-total__span-2"><span className="app-field__label">Observacoes</span><input className="app-input" value={expenseForm.notes} onChange={(event) => setExpenseForm((current) => ({ ...current, notes: event.target.value }))} /></label>
                <button type="submit" disabled={busy === 'expense'} className="app-button app-button--gold"><ReceiptText size={18} /> Salvar despesa</button>
              </form>
            ) : null}

            {actionMode === 'stock' ? (
              <form onSubmit={submitStock} className="controle-total__form-grid">
                <label className="app-field controle-total__span-2"><span className="app-field__label">Produto</span><select required className="app-select" value={stockForm.productId} onChange={(event) => setStockForm((current) => ({ ...current, productId: event.target.value }))}><option value="">Selecionar produto</option>{products.filter((product) => product.status === 'active').map((product) => <option key={product.id} value={product.id}>{academyName(academies, product.academyId)} - {product.name} ({product.stockCurrent})</option>)}</select></label>
                <label className="app-field"><span className="app-field__label">Entrada/baixa</span><input required className="app-input" inputMode="decimal" value={stockForm.quantityDelta} onChange={(event) => setStockForm((current) => ({ ...current, quantityDelta: event.target.value }))} /></label>
                <label className="app-field controle-total__span-2"><span className="app-field__label">Motivo</span><input className="app-input" value={stockForm.reason} onChange={(event) => setStockForm((current) => ({ ...current, reason: event.target.value }))} /></label>
                <button type="submit" disabled={busy === 'stock'} className="app-button app-button--gold"><Package size={18} /> Ajustar estoque</button>
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

    </div>
  );
};

export default ControleTotalView;
