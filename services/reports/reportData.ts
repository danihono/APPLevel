// Montagem dos dados do relatorio financeiro (funcao pura). Filtra por periodo
// e filial e monta o resumo (KPIs) + as tabelas de cada bloco selecionado.
// Nao depende de React nem da view; os exportadores (Excel/PDF) consomem o
// FinanceReport que esta funcao retorna.

import type { FirestoreEntity } from '../firebase/data';
import type {
  AcademyRecord,
  FinanceExpenseRecord,
  FinancePaymentRecord,
  FinanceRevenueRecord,
  FinanceSaleItemRecord,
  FinanceSaleRecord,
  FinanceWithdrawalRecord,
} from '../firebase/models';
import { LEVEL_CATALOG_ID } from '../firebase/models';

export type ReportBlock =
  | 'resumo'
  | 'vendas'
  | 'pagamentos'
  | 'receitas'
  | 'despesas'
  | 'maisVendidos'
  | 'vales';

export const REPORT_BLOCK_LABELS: Record<ReportBlock, string> = {
  resumo: 'Resumo',
  vendas: 'Vendas',
  pagamentos: 'Pagamentos',
  receitas: 'Receitas (entradas)',
  despesas: 'Despesas (saidas)',
  maisVendidos: 'Mais vendidos',
  vales: 'Vales (retiradas)',
};

export interface ReportColumn {
  key: string;
  label: string;
  money?: boolean;
  numeric?: boolean;
}

export type ReportCell = string | number;
export type ReportRow = Record<string, ReportCell>;

export interface ReportTable {
  id: string;
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  // chave da coluna de dinheiro a ser somada no rodape (Total), se houver.
  totalKey?: string;
}

export interface ReportSummary {
  entradas: number; // receitas recebidas no periodo
  saidas: number; // despesas no periodo
  saldo: number; // entradas - saidas
  vendasTotal: number; // total bruto das vendas (detalhe comercial)
  pagamentosTotal: number; // pagamentos recebidos
  pendencias: number; // saldo devedor das vendas
  ticketMedio: number;
  lucroBruto: number; // total das vendas - custo dos itens vendidos
  qtdVendas: number;
  valesAbertos: number; // saldo a receber de vales nao cancelados
}

export interface FinanceReport {
  meta: {
    periodLabel: string;
    academyLabel: string;
    generatedAt: Date;
    startValue: string;
    endValue: string;
    fileBase: string;
  };
  blocks: ReportBlock[];
  summary: ReportSummary;
  tables: ReportTable[];
  // dados para os graficos do PDF
  chart: {
    topProdutos: Array<{ name: string; total: number }>;
  };
}

export interface BuildReportParams {
  academies: Array<FirestoreEntity<AcademyRecord>>;
  sales: Array<FirestoreEntity<FinanceSaleRecord>>;
  saleItems: Array<FirestoreEntity<FinanceSaleItemRecord>>;
  payments: Array<FirestoreEntity<FinancePaymentRecord>>;
  revenues: Array<FirestoreEntity<FinanceRevenueRecord>>;
  expenses: Array<FirestoreEntity<FinanceExpenseRecord>>;
  withdrawals: Array<FirestoreEntity<FinanceWithdrawalRecord>>;
  startValue: string; // YYYY-MM-DD
  endValue: string; // YYYY-MM-DD
  academyId: string; // '' = todas as filiais
  blocks: ReportBlock[];
}

// --- helpers de data/rotulo (copias pequenas e locais, sem acoplar a view) ---

type TimestampLike = { toDate?: () => Date; seconds?: number } | null | undefined;

function toDate(value: TimestampLike): Date | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

function parseInputDate(value: string, endOfDay = false): Date {
  if (!value) {
    const fallback = new Date();
    fallback.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return fallback;
  }
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(date.getTime()) ? parseInputDate('', endOfDay) : date;
}

function isWithin(date: Date | null, startValue: string, endValue: string): boolean {
  if (!date) return false;
  return (
    date.getTime() >= parseInputDate(startValue).getTime() &&
    date.getTime() <= parseInputDate(endValue, true).getTime()
  );
}

function academyName(academies: Array<FirestoreEntity<AcademyRecord>>, academyId: string): string {
  if (academyId === LEVEL_CATALOG_ID) return 'Diretoria';
  return academies.find((academy) => academy.id === academyId)?.name ?? 'Filial';
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  paid: 'Pago',
  partial: 'Parcial',
  pending: 'Pendente',
  cancelled: 'Cancelado',
  overdue: 'Atrasado',
  received: 'Recebido',
  reversed: 'Revertido',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status ?? '-';
}

const ORIGIN_LABELS: Record<string, string> = {
  sale: 'Venda',
  product: 'Produto',
  service: 'Servico',
  manual: 'Manual',
  estorno: 'Estorno',
};

function matchesAcademy(recordAcademyId: string, academyId: string): boolean {
  return !academyId || recordAcademyId === academyId;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatPeriodLabel(startValue: string, endValue: string): string {
  const start = parseInputDate(startValue);
  const end = parseInputDate(endValue);
  return `${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')}`;
}

export function buildFinanceReport(params: BuildReportParams): FinanceReport {
  const { academies, academyId, startValue, endValue, blocks } = params;

  // Vendas no escopo (data: saleDate ?? createdAt).
  const scopedSales = params.sales.filter(
    (sale) =>
      matchesAcademy(sale.academyId, academyId) &&
      isWithin(toDate(sale.saleDate ?? sale.createdAt), startValue, endValue),
  );
  const scopedSaleIds = new Set(scopedSales.map((sale) => sale.id));

  const scopedPayments = params.payments.filter(
    (payment) =>
      matchesAcademy(payment.academyId, academyId) &&
      isWithin(toDate(payment.paymentDate ?? payment.createdAt), startValue, endValue),
  );

  // Entradas reais = receitas recebidas (evita dupla contagem com vendas).
  const scopedRevenues = params.revenues.filter(
    (revenue) =>
      revenue.status === 'received' &&
      matchesAcademy(revenue.academyId, academyId) &&
      isWithin(toDate(revenue.receivedAt ?? revenue.createdAt), startValue, endValue),
  );

  const scopedExpenses = params.expenses.filter(
    (expense) =>
      matchesAcademy(expense.academyId, academyId) &&
      isWithin(toDate(expense.paidAt ?? expense.dueDate ?? expense.createdAt), startValue, endValue),
  );

  const scopedWithdrawals = params.withdrawals.filter(
    (withdrawal) =>
      matchesAcademy(withdrawal.academyId, academyId) &&
      isWithin(toDate(withdrawal.withdrawnAt ?? withdrawal.createdAt), startValue, endValue),
  );

  const nonCancelledSales = scopedSales.filter((sale) => sale.paymentStatus !== 'cancelled');

  // Itens das vendas no escopo (para lucro bruto e "mais vendidos").
  const scopedItems = params.saleItems.filter((item) => scopedSaleIds.has(item.saleId));
  const custoItens = scopedItems.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);

  const entradas = round2(scopedRevenues.reduce((sum, r) => sum + r.amount, 0));
  const saidas = round2(scopedExpenses.reduce((sum, e) => sum + e.amount, 0));
  const vendasTotal = round2(nonCancelledSales.reduce((sum, s) => sum + s.total, 0));
  const pagamentosTotal = round2(
    scopedPayments.filter((p) => p.status === 'received').reduce((sum, p) => sum + p.amount, 0),
  );
  const pendencias = round2(nonCancelledSales.reduce((sum, s) => sum + s.balanceDue, 0));
  const lucroBruto = round2(vendasTotal - custoItens);
  const qtdVendas = nonCancelledSales.length;
  const valesAbertos = round2(
    scopedWithdrawals.filter((w) => w.status !== 'cancelled').reduce((sum, w) => sum + (w.balanceDue ?? 0), 0),
  );
  const ticketMedio = qtdVendas > 0 ? round2(vendasTotal / qtdVendas) : 0;

  const summary: ReportSummary = {
    entradas,
    saidas,
    saldo: round2(entradas - saidas),
    vendasTotal,
    pagamentosTotal,
    pendencias,
    ticketMedio,
    lucroBruto,
    qtdVendas,
    valesAbertos,
  };

  const tables: ReportTable[] = [];

  if (blocks.includes('vendas')) {
    tables.push({
      id: 'vendas',
      title: 'Vendas',
      columns: [
        { key: 'data', label: 'Data' },
        { key: 'filial', label: 'Filial' },
        { key: 'cliente', label: 'Cliente / Comprador' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'subtotal', label: 'Subtotal', money: true },
        { key: 'desconto', label: 'Desconto', money: true },
        { key: 'total', label: 'Total', money: true },
        { key: 'recebido', label: 'Recebido', money: true },
        { key: 'saldo', label: 'Saldo', money: true },
        { key: 'status', label: 'Status' },
      ],
      totalKey: 'total',
      rows: scopedSales.map((sale) => ({
        data: (toDate(sale.saleDate ?? sale.createdAt) ?? new Date()).toLocaleDateString('pt-BR'),
        filial: academyName(academies, sale.academyId),
        cliente: sale.customerName ?? '-',
        tipo: sale.saleType === 'service' ? 'Servico' : sale.saleType === 'product' ? 'Produto' : '-',
        subtotal: round2(sale.subtotal),
        desconto: round2(sale.discountTotal),
        total: round2(sale.total),
        recebido: round2(sale.amountReceived),
        saldo: round2(sale.balanceDue),
        status: statusLabel(sale.paymentStatus),
      })),
    });
  }

  if (blocks.includes('pagamentos')) {
    tables.push({
      id: 'pagamentos',
      title: 'Pagamentos',
      columns: [
        { key: 'data', label: 'Data' },
        { key: 'filial', label: 'Filial' },
        { key: 'metodo', label: 'Metodo' },
        { key: 'status', label: 'Status' },
        { key: 'valor', label: 'Valor', money: true },
      ],
      totalKey: 'valor',
      rows: scopedPayments.map((payment) => ({
        data: (toDate(payment.paymentDate ?? payment.createdAt) ?? new Date()).toLocaleDateString('pt-BR'),
        filial: academyName(academies, payment.academyId),
        metodo: payment.paymentMethod ?? '-',
        status: statusLabel(payment.status),
        valor: round2(payment.amount),
      })),
    });
  }

  if (blocks.includes('receitas')) {
    tables.push({
      id: 'receitas',
      title: 'Receitas (entradas)',
      columns: [
        { key: 'data', label: 'Data' },
        { key: 'filial', label: 'Filial' },
        { key: 'categoria', label: 'Categoria' },
        { key: 'descricao', label: 'Descricao' },
        { key: 'origem', label: 'Origem' },
        { key: 'metodo', label: 'Metodo' },
        { key: 'valor', label: 'Valor', money: true },
      ],
      totalKey: 'valor',
      rows: scopedRevenues.map((revenue) => ({
        data: (toDate(revenue.receivedAt ?? revenue.createdAt) ?? new Date()).toLocaleDateString('pt-BR'),
        filial: academyName(academies, revenue.academyId),
        categoria: revenue.category ?? '-',
        descricao: revenue.description ?? '-',
        origem: ORIGIN_LABELS[revenue.origin] ?? revenue.origin,
        metodo: revenue.paymentMethod ?? '-',
        valor: round2(revenue.amount),
      })),
    });
  }

  if (blocks.includes('despesas')) {
    tables.push({
      id: 'despesas',
      title: 'Despesas (saidas)',
      columns: [
        { key: 'data', label: 'Data' },
        { key: 'filial', label: 'Filial' },
        { key: 'categoria', label: 'Categoria' },
        { key: 'descricao', label: 'Descricao' },
        { key: 'fornecedor', label: 'Fornecedor' },
        { key: 'status', label: 'Status' },
        { key: 'valor', label: 'Valor', money: true },
      ],
      totalKey: 'valor',
      rows: scopedExpenses.map((expense) => ({
        data: (toDate(expense.paidAt ?? expense.dueDate ?? expense.createdAt) ?? new Date()).toLocaleDateString('pt-BR'),
        filial: academyName(academies, expense.academyId),
        categoria: expense.category ?? '-',
        descricao: expense.description ?? '-',
        fornecedor: expense.supplier ?? '-',
        status: statusLabel(expense.status),
        valor: round2(expense.amount),
      })),
    });
  }

  // Agregacao "mais vendidos" (produtos e servicos) a partir dos itens.
  const aggregate = (type: 'product' | 'service') => {
    const map = new Map<string, { name: string; quantity: number; total: number }>();
    for (const item of scopedItems) {
      if (item.type !== type) continue;
      const entry = map.get(item.itemId) ?? { name: item.itemName, quantity: 0, total: 0 };
      entry.quantity += item.quantity;
      entry.total += item.total;
      map.set(item.itemId, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  };

  const topProdutos = aggregate('product');
  const topServicos = aggregate('service');

  if (blocks.includes('maisVendidos')) {
    tables.push({
      id: 'topProdutos',
      title: 'Produtos mais vendidos',
      columns: [
        { key: 'produto', label: 'Produto' },
        { key: 'quantidade', label: 'Quantidade', numeric: true },
        { key: 'total', label: 'Total', money: true },
      ],
      totalKey: 'total',
      rows: topProdutos.map((p) => ({ produto: p.name, quantidade: p.quantity, total: round2(p.total) })),
    });
    tables.push({
      id: 'topServicos',
      title: 'Servicos mais vendidos',
      columns: [
        { key: 'servico', label: 'Servico' },
        { key: 'quantidade', label: 'Quantidade', numeric: true },
        { key: 'total', label: 'Total', money: true },
      ],
      totalKey: 'total',
      rows: topServicos.map((s) => ({ servico: s.name, quantidade: s.quantity, total: round2(s.total) })),
    });
  }

  if (blocks.includes('vales')) {
    tables.push({
      id: 'vales',
      title: 'Vales (retiradas)',
      columns: [
        { key: 'data', label: 'Data' },
        { key: 'quemRetirou', label: 'Quem retirou' },
        { key: 'itens', label: 'Itens' },
        { key: 'total', label: 'Total', money: true },
        { key: 'recebido', label: 'Recebido', money: true },
        { key: 'saldo', label: 'Saldo', money: true },
        { key: 'status', label: 'Status' },
      ],
      totalKey: 'saldo',
      rows: scopedWithdrawals.map((withdrawal) => ({
        data: (toDate(withdrawal.withdrawnAt ?? withdrawal.createdAt) ?? new Date()).toLocaleDateString('pt-BR'),
        quemRetirou: withdrawal.debtorName,
        itens: withdrawal.items.map((item) => `${item.quantity}x ${item.productName}`).join(', '),
        total: round2(withdrawal.total),
        recebido: round2(withdrawal.amountReceived),
        saldo: round2(withdrawal.balanceDue),
        status: statusLabel(withdrawal.status),
      })),
    });
  }

  const academyLabel = academyId ? academyName(academies, academyId) : 'Todas as filiais';

  return {
    meta: {
      periodLabel: formatPeriodLabel(startValue, endValue),
      academyLabel,
      generatedAt: new Date(),
      startValue,
      endValue,
      fileBase: `Relatorio_Level_${startValue}_${endValue}`,
    },
    blocks,
    summary,
    tables,
    chart: {
      topProdutos: topProdutos.slice(0, 5).map((p) => ({ name: p.name, total: round2(p.total) })),
    },
  };
}
