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

type ControleTab = 'dashboard' | 'catalog' | 'list' | 'stock';
type CatalogMode = 'product' | 'service';
type ListType = 'all' | 'sale' | 'payment' | 'revenue' | 'expense' | 'stock';
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

interface PurchaseFormState {
  academyId: string;
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

function initialPurchaseForm(academyId: string): PurchaseFormState {
  return {
    academyId,
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
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState>(() => initialPurchaseForm(defaultAcademyId));
  const [stockAcademyId, setStockAcademyId] = useState('');
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});

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
  const availablePurchaseProducts = useMemo(() => products.filter((product) => (
    product.status === 'active' && (!purchaseForm.academyId || product.academyId === purchaseForm.academyId)
  )), [products, purchaseForm.academyId]);
  const stockListProducts = useMemo(() => products
    .filter((product) => !stockAcademyId || product.academyId === stockAcademyId)
    .sort((a, b) => a.name.localeCompare(b.name)),
  [products, stockAcademyId]);

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
      setPurchaseForm(initialPurchaseForm(purchaseForm.academyId));
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
        <button type="button" role="tab" className={`app-segment__button ${activeTab === 'stock' ? 'is-active' : ''}`} onClick={() => setActiveTab('stock')}>
          <Package size={18} /> Estoque
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
            {([
              ['Total vendido', dashboardMetrics.soldTotal, <ShoppingCart key="icon" size={18} />, 'sold'],
              ['Total recebido', dashboardMetrics.revenueTotal, <DollarSign key="icon" size={18} />, 'received'],
              ['Total pendente', dashboardMetrics.pendingTotal, <CreditCard key="icon" size={18} />, 'pending'],
              ['Despesas', dashboardMetrics.expenseTotal, <ReceiptText key="icon" size={18} />, 'expense'],
              ['Lucro bruto', dashboardMetrics.grossProfit, <BarChart3 key="icon" size={18} />, 'gross'],
              ['Lucro liquido', dashboardMetrics.netProfit, <CheckCircle2 key="icon" size={18} />, 'net'],
              ['Ticket medio', dashboardMetrics.averageTicket, <ReceiptText key="icon" size={18} />, 'ticket'],
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
            <label className="app-field"><span className="app-field__label">Tipo</span><select className="app-select" value={listType} onChange={(event) => setListType(event.target.value as ListType)}><option value="all">Todos</option><option value="sale">Vendas</option><option value="payment">Pagamentos</option><option value="stock">Estoque</option></select></label>
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
                <label className="app-field"><span className="app-field__label">Filial</span>{renderAcademySelect(saleForm.academyId, (value) => setSaleForm((current) => ({ ...current, academyId: value })))}</label>
                <label className="app-field"><span className="app-field__label">Data</span><input className="app-input" type="date" value={saleForm.saleDate} onChange={(event) => setSaleForm((current) => ({ ...current, saleDate: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Cliente</span><input required className="app-input" value={saleForm.customerName} placeholder="Nome do cliente" onChange={(event) => setSaleForm((current) => ({ ...current, customerName: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Cliente cadastrado</span><select className="app-select" value={saleForm.customerId} onChange={(event) => selectCustomer(event.target.value)}><option value="">- Avulso -</option>{students.map((student) => <option key={student.id} value={student.id}>{student.displayName}</option>)}</select></label>
                <label className="app-field"><span className="app-field__label">Vendedor</span><select className="app-select" value={saleForm.sellerId} onChange={(event) => selectSeller(event.target.value)}><option value="">- Selecionar -</option>{staff.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}</select></label>
                <label className="app-field"><span className="app-field__label">Vencimento</span><input className="app-input" type="date" value={saleForm.dueDate} onChange={(event) => setSaleForm((current) => ({ ...current, dueDate: event.target.value }))} /></label>

                <div className="controle-total__items-editor controle-total__span-2">
                  <div className="controle-total__section-heading">
                    <strong>Itens da venda</strong>
                    <button type="button" className="app-button app-button--ghost app-button--small" onClick={() => setSaleForm((current) => ({ ...current, items: [...current.items, initialSaleItem()] }))}>
                      <Plus size={16} /> Adicionar
                    </button>
                  </div>
                  {saleForm.items.map((item, index) => (
                    <div key={index} className="controle-total__sale-item">
                      <select className="app-select" value={item.type} onChange={(event) => updateSaleItem(index, { type: event.target.value as SaleItemFormState['type'], itemId: '' })}>
                        <option value="product">Produto</option>
                        <option value="service">Servico</option>
                      </select>
                      <select required className="app-select" value={item.itemId} onChange={(event) => updateSaleItem(index, { itemId: event.target.value })}>
                        <option value="">Selecionar</option>
                        {(item.type === 'product' ? availableProducts : availableServices).map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}{item.type === 'product' && 'stockCurrent' in entry ? ` (${entry.stockCurrent} em estoque)` : ''}
                          </option>
                        ))}
                      </select>
                      <input className="app-input" inputMode="decimal" placeholder="Qtd" value={item.quantity} onChange={(event) => updateSaleItem(index, { quantity: event.target.value })} />
                      <input className="app-input" inputMode="decimal" placeholder="Preco unit." value={item.unitPrice} onChange={(event) => updateSaleItem(index, { unitPrice: event.target.value })} />
                      <input className="app-input" inputMode="decimal" placeholder="Desconto" value={item.discount} onChange={(event) => updateSaleItem(index, { discount: event.target.value })} />
                      <button type="button" className="app-button app-button--ghost app-button--icon" title="Remover" onClick={() => setSaleForm((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }))}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <label className="app-field"><span className="app-field__label">Forma de pagamento</span><select className="app-select" value={saleForm.paymentMethod} onChange={(event) => setSaleForm((current) => ({ ...current, paymentMethod: event.target.value }))}>{paymentMethods.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
                <label className="app-field"><span className="app-field__label">Valor recebido</span><input className="app-input" inputMode="decimal" placeholder={formatCurrency(salePreview.total)} value={saleForm.receivedAmount} onChange={(event) => setSaleForm((current) => ({ ...current, receivedAmount: event.target.value }))} /></label>
                <label className="app-field"><span className="app-field__label">Data pagamento</span><input className="app-input" type="date" value={saleForm.paymentDate} onChange={(event) => setSaleForm((current) => ({ ...current, paymentDate: event.target.value }))} /></label>
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
                <label className="app-field"><span className="app-field__label">Filial</span>{renderAcademySelect(purchaseForm.academyId, (value) => setPurchaseForm((current) => ({ ...current, academyId: value, productId: '' })))}</label>
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
              <span className="app-field__label">Filial</span>
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
                      <p>{academyName(academies, product.academyId)} | {product.category}</p>
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
              {stockListProducts.length === 0 ? <div className="app-empty">Nenhum produto cadastrado para esta filial.</div> : null}
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

    </div>
  );
};

export default ControleTotalView;
