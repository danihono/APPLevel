import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import {
  COLLECTIONS,
  type FinanceBuyerType,
  type FinanceExpenseDoc,
  type FinanceExpenseStatus,
  type FinancePaymentDoc,
  type FinanceProductDoc,
  type FinanceRevenueDoc,
  type FinanceSaleDoc,
  type FinanceSaleItemDoc,
  type FinanceSaleItemType,
  type FinanceSalePaymentStatus,
  type FinanceSaleType,
  type FinanceServiceDoc,
  type FinanceStatus,
  type InventoryMovementDoc,
  type InventoryMovementType,
  type ProductPriceHistoryEntry,
} from '../domain/models';
import { getRequestContext } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import { optionalNumber, optionalString, optionalTimestamp, requiredNumber, requiredString } from '../lib/payload';

const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };
const MAX_SALE_ITEMS = 80;
const DEFAULT_PAYMENT_METHOD = 'Nao informado';
const MAX_PRICE_HISTORY = 50;
// Produtos sao do catalogo da Level (atacado), nao de uma filial. Movimentos de
// estoque que nao tem uma filial compradora usam este id sentinela.
const LEVEL_CATALOG_ID = '__level__';

type Transaction = FirebaseFirestore.Transaction;
type DocumentRef = FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;

interface ParsedSaleItem {
  type: FinanceSaleItemType;
  itemId: string;
  quantity: number;
  unitPrice?: number;
  discount: number;
  beneficiaryName?: string;
  beneficiaryUserId?: string;
}

interface ResolvedSaleItem {
  ref: DocumentRef;
  type: FinanceSaleItemType;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discount: number;
  finalUnitPrice: number;
  total: number;
  beneficiaryName?: string;
  beneficiaryUserId?: string;
  productData?: FinanceProductDoc;
}

// Categoria de servico que exige um beneficiario nominal no item de venda
// (ex.: nome no certificado fisico emitido).
const CERTIFICATE_SERVICE_CATEGORY = 'certificado';

interface SaleTotals {
  subtotal: number;
  discountTotal: number;
  total: number;
}

interface SalePaymentResult {
  paymentId: string;
  revenueId: string;
}

function requestField(data: unknown, fieldName: string): unknown {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  return (data as Record<string, unknown>)[fieldName];
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

type ProductPriceFields = Pick<FinanceProductDoc, 'salePrice' | 'salePriceFilial' | 'salePriceDiretoria'>;

// Preco de venda para filiais. Documentos antigos (preco unico) caem no
// `salePrice`; se so houver o preco de diretoria, usa-o como ultimo recurso.
function readProductSalePriceFilial(product: ProductPriceFields): number {
  if (typeof product.salePriceFilial === 'number') return product.salePriceFilial;
  if (typeof product.salePrice === 'number') return product.salePrice;
  if (typeof product.salePriceDiretoria === 'number') return product.salePriceDiretoria;
  return 0;
}

// Preco de venda para a diretoria. Mesmo esquema de fallback.
function readProductSalePriceDiretoria(product: ProductPriceFields): number {
  if (typeof product.salePriceDiretoria === 'number') return product.salePriceDiretoria;
  if (typeof product.salePrice === 'number') return product.salePrice;
  if (typeof product.salePriceFilial === 'number') return product.salePriceFilial;
  return 0;
}

// Seleciona o preco do produto conforme o tipo de comprador. Produtos so sao
// vendidos para 'filial' ou 'diretoria'; qualquer outro caso usa o de filial.
function readProductSalePriceForBuyer(product: ProductPriceFields, buyerType: FinanceBuyerType): number {
  return buyerType === 'diretoria'
    ? readProductSalePriceDiretoria(product)
    : readProductSalePriceFilial(product);
}

function requiredMoney(data: unknown, fieldName: string): number {
  const value = roundMoney(requiredNumber(data, fieldName));
  assertCondition(value >= 0, 'invalid-argument', `O campo "${fieldName}" nao pode ser negativo.`);
  return value;
}

function optionalMoney(data: unknown, fieldName: string, fallback = 0): number {
  const value = optionalNumber(data, fieldName);
  if (value == null) {
    return fallback;
  }

  const rounded = roundMoney(value);
  assertCondition(rounded >= 0, 'invalid-argument', `O campo "${fieldName}" nao pode ser negativo.`);
  return rounded;
}

function positiveMoney(data: unknown, fieldName: string): number {
  const value = requiredMoney(data, fieldName);
  assertCondition(value > 0, 'invalid-argument', `O campo "${fieldName}" precisa ser maior que zero.`);
  return value;
}

function requiredPositiveQuantity(data: unknown, fieldName: string): number {
  const value = requiredNumber(data, fieldName);
  assertCondition(value > 0, 'invalid-argument', `O campo "${fieldName}" precisa ser maior que zero.`);
  return roundMoney(value);
}

function normalizeStatus(value: string | undefined): FinanceStatus {
  if (!value) {
    return 'active';
  }

  assertCondition(value === 'active' || value === 'inactive', 'invalid-argument', 'Status invalido.');
  return value;
}

function normalizeExpenseStatus(value: string | undefined, dueDate: Timestamp, paidAt?: Timestamp): FinanceExpenseStatus {
  if (value) {
    assertCondition(
      value === 'paid' || value === 'pending' || value === 'overdue',
      'invalid-argument',
      'Status da despesa invalido.',
    );
    return value;
  }

  if (paidAt) {
    return 'paid';
  }

  return dueDate.toMillis() < Timestamp.now().toMillis() ? 'overdue' : 'pending';
}

function assertSaleItemType(value: string): FinanceSaleItemType {
  assertCondition(value === 'product' || value === 'service', 'invalid-argument', 'Tipo de item invalido.');
  return value;
}

function parseBuyerType(value: string | undefined): FinanceBuyerType {
  if (!value) {
    return 'filial';
  }

  assertCondition(
    value === 'filial' || value === 'diretoria' || value === 'individuo',
    'invalid-argument',
    'Tipo de comprador invalido.',
  );
  return value;
}

function parseSaleType(value: string | undefined): FinanceSaleType | undefined {
  if (!value) return undefined;
  assertCondition(value === 'product' || value === 'service', 'invalid-argument', 'Tipo de venda invalido.');
  return value;
}

// Deriva o saleType pelos itens, garantindo que todos sejam do mesmo tipo.
// Se um saleType explicito for passado, valida que bate com os itens.
function resolveSaleType(items: ParsedSaleItem[], explicit?: FinanceSaleType): FinanceSaleType {
  assertCondition(items.length > 0, 'invalid-argument', 'A venda precisa de pelo menos um item.');
  const first = items[0].type;
  for (let i = 1; i < items.length; i += 1) {
    assertCondition(
      items[i].type === first,
      'invalid-argument',
      'Uma venda nao pode misturar produtos e servicos.',
    );
  }
  if (explicit) {
    assertCondition(explicit === first, 'invalid-argument', 'Tipo de venda nao bate com os itens.');
  }
  return first;
}

async function assertAcademyExists(academyId: string): Promise<void> {
  const academySnap = await db.collection(COLLECTIONS.academies).doc(academyId).get();
  assertCondition(academySnap.exists, 'not-found', 'Filial nao encontrada.');
}

// Permite o sentinela do catalogo Central (LEVEL_CATALOG_ID) sem buscar em
// academies. Usado em fluxos onde "diretoria" e a propria Central.
async function assertAcademyOrCatalog(academyId: string): Promise<void> {
  if (academyId === LEVEL_CATALOG_ID) {
    return;
  }
  await assertAcademyExists(academyId);
}

function parseSaleItems(data: unknown): ParsedSaleItem[] {
  const rawItems = requestField(data, 'items');
  assertCondition(Array.isArray(rawItems), 'invalid-argument', 'Informe ao menos um item vendido.');
  assertCondition(rawItems.length > 0, 'invalid-argument', 'Informe ao menos um item vendido.');
  assertCondition(rawItems.length <= MAX_SALE_ITEMS, 'invalid-argument', `A venda aceita no maximo ${MAX_SALE_ITEMS} itens.`);

  return rawItems.map((entry, index) => {
    assertCondition(entry && typeof entry === 'object', 'invalid-argument', `O item ${index + 1} esta invalido.`);
    const type = assertSaleItemType(requiredString(entry, 'type'));
    const itemId = requiredString(entry, 'itemId').trim();
    const quantity = requiredPositiveQuantity(entry, 'quantity');
    const unitPrice = optionalNumber(entry, 'unitPrice');
    const discount = optionalMoney(entry, 'discount', 0);
    const beneficiaryName = optionalString(entry, 'beneficiaryName')?.trim();
    const beneficiaryUserId = optionalString(entry, 'beneficiaryUserId')?.trim();

    if (unitPrice != null) {
      assertCondition(unitPrice >= 0, 'invalid-argument', `O valor unitario do item ${index + 1} nao pode ser negativo.`);
    }

    return {
      type,
      itemId,
      quantity,
      unitPrice: unitPrice == null ? undefined : roundMoney(unitPrice),
      discount,
      ...(beneficiaryName ? { beneficiaryName } : {}),
      ...(beneficiaryUserId ? { beneficiaryUserId } : {}),
    };
  });
}

function calculatePaymentStatus(total: number, amountReceived: number): FinanceSalePaymentStatus {
  const balanceDue = roundMoney(total - amountReceived);
  if (total <= 0 || balanceDue <= 0) {
    return 'paid';
  }

  return amountReceived > 0 ? 'partial' : 'pending';
}

function calculateSaleTotals(items: ResolvedSaleItem[]): SaleTotals {
  return items.reduce<SaleTotals>((totals, item) => ({
    subtotal: roundMoney(totals.subtotal + (item.unitPrice * item.quantity)),
    discountTotal: roundMoney(totals.discountTotal + (item.discount * item.quantity)),
    total: roundMoney(totals.total + item.total),
  }), {
    subtotal: 0,
    discountTotal: 0,
    total: 0,
  });
}

async function resolveSaleItems(
  transaction: Transaction,
  academyId: string,
  buyerType: FinanceBuyerType,
  parsedItems: ParsedSaleItem[],
): Promise<ResolvedSaleItem[]> {
  const productRefs = new Map<string, DocumentRef>();
  const serviceRefs = new Map<string, DocumentRef>();

  for (const item of parsedItems) {
    if (item.type === 'product') {
      productRefs.set(item.itemId, db.collection(COLLECTIONS.financeProducts).doc(item.itemId));
    } else {
      serviceRefs.set(item.itemId, db.collection(COLLECTIONS.financeServices).doc(item.itemId));
    }
  }

  const productSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>>();
  const serviceSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>>();

  for (const [itemId, ref] of productRefs.entries()) {
    productSnaps.set(itemId, await transaction.get(ref));
  }

  for (const [itemId, ref] of serviceRefs.entries()) {
    serviceSnaps.set(itemId, await transaction.get(ref));
  }

  return parsedItems.map((item, index) => {
    const snapshot = item.type === 'product'
      ? productSnaps.get(item.itemId)
      : serviceSnaps.get(item.itemId);

    assertCondition(snapshot?.exists, 'not-found', `Item ${index + 1} nao encontrado.`);
    const data = snapshot.data() as FinanceProductDoc | FinanceServiceDoc;
    // Produtos sao do catalogo global da Level. Servicos podem ser por filial
    // ou do catalogo Central (academyId === LEVEL_CATALOG_ID) - este ultimo e
    // valido para qualquer comprador (ex.: emissao de certificado vendida
    // pela Central para qualquer filial).
    if (item.type === 'service') {
      const serviceAcademyId = (data as FinanceServiceDoc).academyId;
      assertCondition(
        serviceAcademyId === academyId || serviceAcademyId === LEVEL_CATALOG_ID,
        'permission-denied',
        `Item ${index + 1} pertence a outra filial.`,
      );
    }
    assertCondition(data.status === 'active', 'failed-precondition', `Item ${index + 1} esta inativo.`);

    const catalogPrice = item.type === 'product'
      ? readProductSalePriceForBuyer(data as FinanceProductDoc, buyerType)
      : (data as FinanceServiceDoc).salePrice;
    const unitPrice = item.unitPrice ?? catalogPrice;
    assertCondition(item.discount <= unitPrice, 'invalid-argument', `O desconto do item ${index + 1} nao pode superar o valor unitario.`);

    const unitCost = item.type === 'product'
      ? (data as FinanceProductDoc).purchasePrice
      : (data as FinanceServiceDoc).cost;
    const finalUnitPrice = roundMoney(unitPrice - item.discount);

    // Servicos de categoria 'certificado' exigem o nome do beneficiario fisico
    // (e o que vai impresso no certificado).
    if (item.type === 'service'
      && (data as FinanceServiceDoc).category === CERTIFICATE_SERVICE_CATEGORY) {
      assertCondition(
        !!item.beneficiaryName,
        'invalid-argument',
        `Informe o beneficiario do certificado no item ${index + 1}.`,
      );
    }

    return {
      ref: snapshot.ref,
      type: item.type,
      itemId: item.itemId,
      itemName: data.name,
      quantity: item.quantity,
      unitPrice,
      unitCost,
      discount: item.discount,
      finalUnitPrice,
      total: roundMoney(finalUnitPrice * item.quantity),
      ...(item.beneficiaryName ? { beneficiaryName: item.beneficiaryName } : {}),
      ...(item.beneficiaryUserId ? { beneficiaryUserId: item.beneficiaryUserId } : {}),
      ...(item.type === 'product' ? { productData: data as FinanceProductDoc } : {}),
    };
  });
}

function addInventoryMovement(
  transaction: Transaction,
  params: {
    academyId: string;
    productId: string;
    productName: string;
    type: InventoryMovementType;
    quantityDelta: number;
    stockBefore: number;
    stockAfter: number;
    saleId?: string;
    reason?: string;
    actorUid: string;
    now: Timestamp;
  },
): void {
  const movementRef = db.collection(COLLECTIONS.inventoryMovements).doc();
  const movement: InventoryMovementDoc = {
    academyId: params.academyId,
    productId: params.productId,
    productName: params.productName,
    type: params.type,
    quantityDelta: roundMoney(params.quantityDelta),
    stockBefore: roundMoney(params.stockBefore),
    stockAfter: roundMoney(params.stockAfter),
    ...(params.saleId ? { saleId: params.saleId } : {}),
    ...(params.reason ? { reason: params.reason } : {}),
    createdBy: params.actorUid,
    createdAt: params.now,
  };

  transaction.set(movementRef, movement);
}

function buildSaleItemDoc(
  academyId: string,
  saleId: string,
  item: ResolvedSaleItem,
  now: Timestamp,
): FinanceSaleItemDoc {
  return {
    academyId,
    saleId,
    type: item.type,
    itemId: item.itemId,
    itemName: item.itemName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    unitCost: item.unitCost,
    discount: item.discount,
    finalUnitPrice: item.finalUnitPrice,
    total: item.total,
    ...(item.beneficiaryName ? { beneficiaryName: item.beneficiaryName } : {}),
    ...(item.beneficiaryUserId ? { beneficiaryUserId: item.beneficiaryUserId } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

function applyProductStockChange(
  transaction: Transaction,
  productRef: DocumentRef,
  product: FinanceProductDoc,
  params: {
    academyId: string;
    quantityDelta: number;
    movementType: InventoryMovementType;
    saleId?: string;
    reason?: string;
    actorUid: string;
    now: Timestamp;
  },
): void {
  const stockBefore = roundMoney(product.stockCurrent ?? 0);
  const stockAfter = roundMoney(stockBefore + params.quantityDelta);
  assertCondition(stockAfter >= 0, 'failed-precondition', `Estoque insuficiente para ${product.name}.`);

  transaction.update(productRef, {
    stockCurrent: stockAfter,
    updatedAt: params.now,
  });

  addInventoryMovement(transaction, {
    academyId: params.academyId,
    productId: productRef.id,
    productName: product.name,
    type: params.movementType,
    quantityDelta: params.quantityDelta,
    stockBefore,
    stockAfter,
    saleId: params.saleId,
    reason: params.reason,
    actorUid: params.actorUid,
    now: params.now,
  });
}

function sumProductQuantities(items: Array<FinanceSaleItemDoc | ResolvedSaleItem>): Map<string, number> {
  const totals = new Map<string, number>();

  for (const item of items) {
    if (item.type !== 'product') {
      continue;
    }

    totals.set(item.itemId, roundMoney((totals.get(item.itemId) ?? 0) + item.quantity));
  }

  return totals;
}

function applySaleProductStock(
  transaction: Transaction,
  items: ResolvedSaleItem[],
  params: {
    academyId: string;
    saleId: string;
    actorUid: string;
    now: Timestamp;
  },
): void {
  const productQuantities = sumProductQuantities(items);
  const firstProductById = new Map(items.filter((item) => item.type === 'product').map((item) => [item.itemId, item]));
  for (const [productId, quantity] of productQuantities.entries()) {
    const item = firstProductById.get(productId);
    assertCondition(!!item, 'internal', 'Produto da venda nao resolvido.');
    const productData = item.productData;
    assertCondition(!!productData, 'internal', 'Produto da venda sem dados carregados.');
    applyProductStockChange(transaction, item.ref, productData, {
      academyId: params.academyId,
      quantityDelta: -quantity,
      movementType: 'sale_decrement',
      saleId: params.saleId,
      actorUid: params.actorUid,
      now: params.now,
    });
  }
}

function addPaymentAndRevenue(
  transaction: Transaction,
  params: {
    academyId: string;
    saleId: string;
    amount: number;
    paymentMethod: string;
    paymentDate: Timestamp;
    notes?: string;
    customerName: string;
    actorUid: string;
    now: Timestamp;
    reversalOfPaymentId?: string;
  },
): SalePaymentResult {
  const paymentRef = db.collection(COLLECTIONS.financePayments).doc();
  const revenueRef = db.collection(COLLECTIONS.financeRevenues).doc();
  const payment: FinancePaymentDoc = {
    academyId: params.academyId,
    saleId: params.saleId,
    amount: params.amount,
    paymentDate: params.paymentDate,
    paymentMethod: params.paymentMethod,
    ...(params.notes ? { notes: params.notes } : {}),
    status: 'received',
    ...(params.reversalOfPaymentId ? { reversalOfPaymentId: params.reversalOfPaymentId } : {}),
    createdBy: params.actorUid,
    createdAt: params.now,
    updatedAt: params.now,
  };
  const revenue: FinanceRevenueDoc = {
    academyId: params.academyId,
    category: params.amount < 0 ? 'Estorno de venda' : 'Venda',
    description: params.amount < 0
      ? `Estorno da venda ${params.saleId} - ${params.customerName}`
      : `Recebimento da venda ${params.saleId} - ${params.customerName}`,
    amount: params.amount,
    receivedAt: params.paymentDate,
    paymentMethod: params.paymentMethod,
    origin: params.amount < 0 ? 'estorno' : 'sale',
    status: 'received',
    saleId: params.saleId,
    paymentId: paymentRef.id,
    createdBy: params.actorUid,
    createdAt: params.now,
    updatedAt: params.now,
  };

  transaction.set(paymentRef, payment);
  transaction.set(revenueRef, revenue);

  return {
    paymentId: paymentRef.id,
    revenueId: revenueRef.id,
  };
}

export const upsertFinanceProduct = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'superadmin');
  const productId = optionalString(request.data, 'productId');
  const name = requiredString(request.data, 'name').trim();
  const category = requiredString(request.data, 'category').trim();
  const description = optionalString(request.data, 'description')?.trim();
  const purchasePrice = requiredMoney(request.data, 'purchasePrice');
  const salePriceFilial = requiredMoney(request.data, 'salePriceFilial');
  const salePriceDiretoria = requiredMoney(request.data, 'salePriceDiretoria');
  const stockMinimum = optionalMoney(request.data, 'stockMinimum', 0);
  const stockCurrent = optionalNumber(request.data, 'stockCurrent');
  const status = normalizeStatus(optionalString(request.data, 'status'));
  const now = Timestamp.now();

  const productRef = productId
    ? db.collection(COLLECTIONS.financeProducts).doc(productId)
    : db.collection(COLLECTIONS.financeProducts).doc();

  await db.runTransaction(async (transaction) => {
    const existing = productId ? await transaction.get(productRef) : null;
    const previous = existing?.exists ? (existing.data() as FinanceProductDoc) : null;

    const nextStock = stockCurrent == null
      ? (previous?.stockCurrent ?? 0)
      : roundMoney(stockCurrent);
    assertCondition(nextStock >= 0, 'invalid-argument', 'Estoque atual nao pode ser negativo.');

    const previousFilial = previous ? readProductSalePriceFilial(previous) : undefined;
    const previousDiretoria = previous ? readProductSalePriceDiretoria(previous) : undefined;
    // Registra um ponto no historico de precos quando algum preco muda (ou no cadastro inicial).
    const priceChanged = !previous
      || previous.purchasePrice !== purchasePrice
      || previousFilial !== salePriceFilial
      || previousDiretoria !== salePriceDiretoria;
    const priceHistory: ProductPriceHistoryEntry[] = [...(previous?.priceHistory ?? [])];
    if (priceChanged) {
      priceHistory.push({
        changedAt: now,
        changedBy: actor.uid,
        purchasePrice,
        // `salePrice` legado = preco de filial, para leitores antigos.
        salePrice: salePriceFilial,
        salePriceFilial,
        salePriceDiretoria,
      });
    }

    const payload: FinanceProductDoc = {
      name,
      category,
      ...(description ? { description } : {}),
      purchasePrice,
      // `salePrice` legado = preco de filial, para leitores antigos.
      salePrice: salePriceFilial,
      salePriceFilial,
      salePriceDiretoria,
      stockCurrent: nextStock,
      stockMinimum,
      status,
      priceHistory: priceHistory.slice(-MAX_PRICE_HISTORY),
      createdBy: previous?.createdBy ?? actor.uid,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };

    transaction.set(productRef, payload, { merge: true });

    if (previous && stockCurrent != null && roundMoney(previous.stockCurrent) !== nextStock) {
      addInventoryMovement(transaction, {
        academyId: LEVEL_CATALOG_ID,
        productId: productRef.id,
        productName: name,
        type: 'manual_adjustment',
        quantityDelta: roundMoney(nextStock - previous.stockCurrent),
        stockBefore: previous.stockCurrent,
        stockAfter: nextStock,
        reason: 'Ajuste via cadastro do produto',
        actorUid: actor.uid,
        now,
      });
    }
  });

  return {
    productId: productRef.id,
    status,
  };
});

export const deleteOrArchiveFinanceProduct = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');
  const productId = requiredString(request.data, 'productId').trim();
  const productRef = db.collection(COLLECTIONS.financeProducts).doc(productId);
  const [productSnap, usedSnapshot] = await Promise.all([
    productRef.get(),
    db.collection(COLLECTIONS.financeSaleItems)
      .where('itemId', '==', productId)
      .limit(10)
      .get(),
  ]);

  assertCondition(productSnap.exists, 'not-found', 'Produto nao encontrado.');

  const hasProductHistory = usedSnapshot.docs.some((doc) => doc.get('type') === 'product');

  if (!hasProductHistory) {
    await productRef.delete();
    return { productId, status: 'inactive' as FinanceStatus, archived: false };
  }

  await productRef.update({
    status: 'inactive',
    updatedAt: Timestamp.now(),
  });

  return { productId, status: 'inactive' as FinanceStatus, archived: true };
});

export const adjustProductStock = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'superadmin');
  const productId = requiredString(request.data, 'productId').trim();
  const quantityDelta = roundMoney(requiredNumber(request.data, 'quantityDelta'));
  const reason = optionalString(request.data, 'reason')?.trim();
  assertCondition(quantityDelta !== 0, 'invalid-argument', 'Informe uma quantidade diferente de zero.');
  const productRef = db.collection(COLLECTIONS.financeProducts).doc(productId);
  const now = Timestamp.now();
  let stockCurrent = 0;

  await db.runTransaction(async (transaction) => {
    const productSnap = await transaction.get(productRef);
    assertCondition(productSnap.exists, 'not-found', 'Produto nao encontrado.');
    const product = productSnap.data() as FinanceProductDoc;
    assertCondition(product.status === 'active', 'failed-precondition', 'Produto inativo nao aceita ajuste de estoque.');
    applyProductStockChange(transaction, productRef, product, {
      academyId: LEVEL_CATALOG_ID,
      quantityDelta,
      movementType: quantityDelta > 0 ? 'manual_entry' : 'manual_adjustment',
      reason,
      actorUid: actor.uid,
      now,
    });
    stockCurrent = roundMoney(product.stockCurrent + quantityDelta);
  });

  return { productId, stockCurrent };
});

export const upsertFinanceService = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'superadmin');
  const serviceId = optionalString(request.data, 'serviceId');
  const academyId = requiredString(request.data, 'academyId').trim();
  const name = requiredString(request.data, 'name').trim();
  const category = optionalString(request.data, 'category')?.trim();
  const description = optionalString(request.data, 'description')?.trim();
  const cost = requiredMoney(request.data, 'cost');
  const salePrice = requiredMoney(request.data, 'salePrice');
  const status = normalizeStatus(optionalString(request.data, 'status'));
  const now = Timestamp.now();
  await assertAcademyOrCatalog(academyId);

  const serviceRef = serviceId
    ? db.collection(COLLECTIONS.financeServices).doc(serviceId)
    : db.collection(COLLECTIONS.financeServices).doc();
  const existing = serviceId ? await serviceRef.get() : null;
  const previous = existing?.exists ? (existing.data() as FinanceServiceDoc) : null;
  if (previous) {
    assertCondition(previous.academyId === academyId, 'failed-precondition', 'Nao e possivel mover servico entre filiais.');
  }

  const payload: FinanceServiceDoc = {
    academyId,
    name,
    ...(category ? { category } : {}),
    ...(description ? { description } : {}),
    cost,
    salePrice,
    status,
    createdBy: previous?.createdBy ?? actor.uid,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };

  await serviceRef.set(payload, { merge: true });

  return {
    serviceId: serviceRef.id,
    status,
  };
});

export const deleteOrArchiveFinanceService = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');
  const serviceId = requiredString(request.data, 'serviceId').trim();
  const serviceRef = db.collection(COLLECTIONS.financeServices).doc(serviceId);
  const [serviceSnap, usedSnapshot] = await Promise.all([
    serviceRef.get(),
    db.collection(COLLECTIONS.financeSaleItems)
      .where('itemId', '==', serviceId)
      .limit(10)
      .get(),
  ]);

  assertCondition(serviceSnap.exists, 'not-found', 'Servico nao encontrado.');

  const hasServiceHistory = usedSnapshot.docs.some((doc) => doc.get('type') === 'service');

  if (!hasServiceHistory) {
    await serviceRef.delete();
    return { serviceId, status: 'inactive' as FinanceStatus, archived: false };
  }

  await serviceRef.update({
    status: 'inactive',
    updatedAt: Timestamp.now(),
  });

  return { serviceId, status: 'inactive' as FinanceStatus, archived: true };
});

export const createFinanceSale = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'superadmin');
  const buyerType = parseBuyerType(optionalString(request.data, 'buyerType')?.trim());
  const parsedItems = parseSaleItems(request.data);
  const saleType = resolveSaleType(parsedItems, parseSaleType(optionalString(request.data, 'saleType')?.trim()));
  // Validacao cruzada saleType x buyerType:
  //  - Produto: comprador eh uma Filial (revende) ou a propria Diretoria (estoque interno).
  //  - Servico: comprador eh uma Filial (atacado de servicos) ou um Individuo (cliente final).
  if (saleType === 'product') {
    assertCondition(
      buyerType === 'filial' || buyerType === 'diretoria',
      'invalid-argument',
      'Venda de produto exige comprador Filial ou Diretoria.',
    );
  } else {
    assertCondition(
      buyerType === 'filial' || buyerType === 'individuo',
      'invalid-argument',
      'Venda de servico exige comprador Filial ou Individuo.',
    );
  }
  // buyerAcademyId identifica a filial compradora quando buyerType==='filial'.
  // Para 'diretoria' (Central comprando do fornecedor) e 'individuo' (Central
  // vendendo direto a um cliente), usamos LEVEL_CATALOG_ID no academyId.
  const buyerAcademyIdInput = optionalString(request.data, 'buyerAcademyId')?.trim();
  const legacyAcademyIdInput = optionalString(request.data, 'academyId')?.trim();
  let academyId: string;
  if (buyerType === 'filial') {
    const filialId = buyerAcademyIdInput || legacyAcademyIdInput || '';
    assertCondition(!!filialId, 'invalid-argument', 'Informe a filial compradora.');
    academyId = filialId;
  } else {
    academyId = LEVEL_CATALOG_ID;
  }
  const customerId = optionalString(request.data, 'customerId')?.trim();
  const customerName = requiredString(request.data, 'customerName').trim();
  const sellerId = optionalString(request.data, 'sellerId')?.trim();
  const sellerName = optionalString(request.data, 'sellerName')?.trim();
  const saleDate = optionalTimestamp(request.data, 'saleDate') ?? Timestamp.now();
  const dueDate = optionalTimestamp(request.data, 'dueDate');
  const notes = optionalString(request.data, 'notes')?.trim();
  const receivedAmount = optionalMoney(request.data, 'receivedAmount', 0);
  const paymentMethod = optionalString(request.data, 'paymentMethod')?.trim() || DEFAULT_PAYMENT_METHOD;
  const paymentDate = optionalTimestamp(request.data, 'paymentDate') ?? saleDate;
  const now = Timestamp.now();
  const saleRef = db.collection(COLLECTIONS.financeSales).doc();
  await assertAcademyOrCatalog(academyId);

  let paymentStatus: FinanceSalePaymentStatus = 'pending';
  let balanceDue = 0;

  await db.runTransaction(async (transaction) => {
    const items = await resolveSaleItems(transaction, academyId, buyerType, parsedItems);
    const totals = calculateSaleTotals(items);
    assertCondition(receivedAmount <= totals.total, 'invalid-argument', 'Valor recebido nao pode superar o total da venda.');
    const amountReceived = receivedAmount;
    balanceDue = roundMoney(totals.total - amountReceived);
    paymentStatus = calculatePaymentStatus(totals.total, amountReceived);

    const sale: FinanceSaleDoc = {
      academyId,
      saleType,
      buyerType,
      ...(buyerType === 'filial' ? { buyerAcademyId: academyId } : {}),
      ...(customerId ? { customerId } : {}),
      customerName,
      ...(sellerId ? { sellerId } : {}),
      ...(sellerName ? { sellerName } : {}),
      saleDate,
      ...(paymentMethod ? { paymentMethod } : {}),
      paymentStatus,
      ...(paymentStatus === 'paid' ? { paidAt: paymentDate } : {}),
      ...(dueDate ? { dueDate } : {}),
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      total: totals.total,
      amountReceived,
      balanceDue,
      ...(notes ? { notes } : {}),
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    };

    transaction.set(saleRef, sale);
    items.forEach((item, index) => {
      transaction.set(
        db.collection(COLLECTIONS.financeSaleItems).doc(`${saleRef.id}_${index}`),
        buildSaleItemDoc(academyId, saleRef.id, item, now),
      );
    });
    applySaleProductStock(transaction, items, {
      academyId,
      saleId: saleRef.id,
      actorUid: actor.uid,
      now,
    });

    if (receivedAmount > 0) {
      addPaymentAndRevenue(transaction, {
        academyId,
        saleId: saleRef.id,
        amount: receivedAmount,
        paymentMethod,
        paymentDate,
        customerName,
        actorUid: actor.uid,
        now,
      });
    }
  });

  return {
    saleId: saleRef.id,
    paymentStatus,
    balanceDue,
  };
});

export const updateFinanceSale = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'superadmin');
  const saleId = requiredString(request.data, 'saleId').trim();
  const saleRef = db.collection(COLLECTIONS.financeSales).doc(saleId);
  const buyerAcademyIdInput = optionalString(request.data, 'buyerAcademyId')?.trim();
  const legacyAcademyIdInput = optionalString(request.data, 'academyId')?.trim();
  const buyerTypeInput = optionalString(request.data, 'buyerType')?.trim();
  const customerId = optionalString(request.data, 'customerId')?.trim();
  const customerName = requiredString(request.data, 'customerName').trim();
  const sellerId = optionalString(request.data, 'sellerId')?.trim();
  const sellerName = optionalString(request.data, 'sellerName')?.trim();
  const saleDate = optionalTimestamp(request.data, 'saleDate') ?? Timestamp.now();
  const dueDate = optionalTimestamp(request.data, 'dueDate');
  const notes = optionalString(request.data, 'notes')?.trim();
  const parsedItems = parseSaleItems(request.data);
  const now = Timestamp.now();
  let paymentStatus: FinanceSalePaymentStatus = 'pending';
  let balanceDue = 0;

  await db.runTransaction(async (transaction) => {
    const saleSnap = await transaction.get(saleRef);
    assertCondition(saleSnap.exists, 'not-found', 'Venda nao encontrada.');
    const previousSale = saleSnap.data() as FinanceSaleDoc;
    assertCondition(previousSale.paymentStatus !== 'cancelled', 'failed-precondition', 'Venda cancelada nao pode ser editada.');
    const buyerType: FinanceBuyerType = buyerTypeInput
      ? parseBuyerType(buyerTypeInput)
      : (previousSale.buyerType ?? 'filial');
    const saleType = resolveSaleType(parsedItems, parseSaleType(optionalString(request.data, 'saleType')?.trim()));
    if (saleType === 'product') {
      assertCondition(
        buyerType === 'filial' || buyerType === 'diretoria',
        'invalid-argument',
        'Venda de produto exige comprador Filial ou Diretoria.',
      );
    } else {
      assertCondition(
        buyerType === 'filial' || buyerType === 'individuo',
        'invalid-argument',
        'Venda de servico exige comprador Filial ou Individuo.',
      );
    }
    // academyId da venda nunca muda apos a criacao (mantem agregacoes coerentes).
    // Os inputs buyerAcademyId / academyId so servem para validar coerencia.
    const academyId = previousSale.academyId;
    const expectedAcademyId = buyerType === 'filial'
      ? (buyerAcademyIdInput || legacyAcademyIdInput || academyId)
      : LEVEL_CATALOG_ID;
    assertCondition(expectedAcademyId === academyId, 'failed-precondition', 'Nao e possivel mover venda entre filiais.');

    const [oldItemsSnapshot, paymentsSnapshot] = await Promise.all([
      transaction.get(db.collection(COLLECTIONS.financeSaleItems).where('saleId', '==', saleId)),
      transaction.get(db.collection(COLLECTIONS.financePayments).where('saleId', '==', saleId)),
    ]);
    const oldItems = oldItemsSnapshot.docs.map((doc) => doc.data() as FinanceSaleItemDoc);
    const amountReceived = paymentsSnapshot.docs
      .map((doc) => doc.data() as FinancePaymentDoc)
      .reduce((total, payment) => roundMoney(total + payment.amount), 0);
    const newItems = await resolveSaleItems(transaction, academyId, buyerType, parsedItems);
    const totals = calculateSaleTotals(newItems);
    assertCondition(amountReceived <= totals.total, 'failed-precondition', 'A venda ja recebeu mais do que o novo total.');

    const oldProductQuantities = sumProductQuantities(oldItems);
    const newProductQuantities = sumProductQuantities(newItems);
    const productIds = new Set([...oldProductQuantities.keys(), ...newProductQuantities.keys()]);
    const productSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>>();

    for (const productId of productIds) {
      productSnaps.set(productId, await transaction.get(db.collection(COLLECTIONS.financeProducts).doc(productId)));
    }

    for (const productId of productIds) {
      const oldQuantity = oldProductQuantities.get(productId) ?? 0;
      const newQuantity = newProductQuantities.get(productId) ?? 0;
      const deltaSold = roundMoney(newQuantity - oldQuantity);
      if (deltaSold === 0) {
        continue;
      }

      const productRef = db.collection(COLLECTIONS.financeProducts).doc(productId);
      const productSnap = productSnaps.get(productId);
      assertCondition(productSnap?.exists, 'not-found', 'Produto da venda nao encontrado.');
      const product = productSnap.data() as FinanceProductDoc;
      applyProductStockChange(transaction, productRef, product, {
        academyId,
        quantityDelta: -deltaSold,
        movementType: 'sale_edit_adjustment',
        saleId,
        reason: 'Edicao da venda',
        actorUid: actor.uid,
        now,
      });
    }

    oldItemsSnapshot.docs.forEach((doc) => transaction.delete(doc.ref));
    newItems.forEach((item, index) => {
      transaction.set(
        db.collection(COLLECTIONS.financeSaleItems).doc(`${saleId}_${index}`),
        buildSaleItemDoc(academyId, saleId, item, now),
      );
    });

    balanceDue = roundMoney(totals.total - amountReceived);
    paymentStatus = calculatePaymentStatus(totals.total, amountReceived);
    transaction.update(saleRef, {
      saleType,
      buyerType,
      ...(buyerType === 'filial'
        ? { buyerAcademyId: academyId }
        : { buyerAcademyId: FieldValue.delete() }),
      ...(customerId ? { customerId } : { customerId: FieldValue.delete() }),
      customerName,
      ...(sellerId ? { sellerId } : { sellerId: FieldValue.delete() }),
      ...(sellerName ? { sellerName } : { sellerName: FieldValue.delete() }),
      saleDate,
      paymentStatus,
      ...(paymentStatus === 'paid' ? { paidAt: now } : { paidAt: FieldValue.delete() }),
      ...(dueDate ? { dueDate } : { dueDate: FieldValue.delete() }),
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      total: totals.total,
      amountReceived,
      balanceDue,
      ...(notes ? { notes } : { notes: FieldValue.delete() }),
      updatedAt: now,
    });
  });

  return {
    saleId,
    paymentStatus,
    balanceDue,
  };
});

export const recordSalePayment = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'superadmin');
  const saleId = requiredString(request.data, 'saleId').trim();
  const amount = positiveMoney(request.data, 'amount');
  const paymentMethod = requiredString(request.data, 'paymentMethod').trim();
  const paymentDate = optionalTimestamp(request.data, 'paymentDate') ?? Timestamp.now();
  const notes = optionalString(request.data, 'notes')?.trim();
  const saleRef = db.collection(COLLECTIONS.financeSales).doc(saleId);
  const now = Timestamp.now();
  let paymentStatus: FinanceSalePaymentStatus = 'pending';
  let balanceDue = 0;
  let paymentId = '';

  await db.runTransaction(async (transaction) => {
    const saleSnap = await transaction.get(saleRef);
    assertCondition(saleSnap.exists, 'not-found', 'Venda nao encontrada.');
    const sale = saleSnap.data() as FinanceSaleDoc;
    assertCondition(sale.paymentStatus !== 'cancelled', 'failed-precondition', 'Venda cancelada nao recebe pagamento.');
    assertCondition(amount <= sale.balanceDue, 'invalid-argument', 'Pagamento maior que o saldo da venda.');

    const nextAmountReceived = roundMoney(sale.amountReceived + amount);
    balanceDue = roundMoney(sale.total - nextAmountReceived);
    paymentStatus = calculatePaymentStatus(sale.total, nextAmountReceived);
    paymentId = addPaymentAndRevenue(transaction, {
      academyId: sale.academyId,
      saleId,
      amount,
      paymentMethod,
      paymentDate,
      notes,
      customerName: sale.customerName,
      actorUid: actor.uid,
      now,
    }).paymentId;

    transaction.update(saleRef, {
      amountReceived: nextAmountReceived,
      balanceDue,
      paymentStatus,
      paymentMethod,
      ...(paymentStatus === 'paid' ? { paidAt: paymentDate } : {}),
      updatedAt: now,
    });
  });

  return {
    saleId,
    paymentId,
    paymentStatus,
    balanceDue,
  };
});

export const cancelFinanceSale = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'superadmin');
  const saleId = requiredString(request.data, 'saleId').trim();
  const reason = optionalString(request.data, 'reason')?.trim();
  const saleRef = db.collection(COLLECTIONS.financeSales).doc(saleId);
  const now = Timestamp.now();

  await db.runTransaction(async (transaction) => {
    const saleSnap = await transaction.get(saleRef);
    assertCondition(saleSnap.exists, 'not-found', 'Venda nao encontrada.');
    const sale = saleSnap.data() as FinanceSaleDoc;
    assertCondition(sale.paymentStatus !== 'cancelled', 'failed-precondition', 'Venda ja cancelada.');

    const [itemsSnapshot, paymentsSnapshot] = await Promise.all([
      transaction.get(db.collection(COLLECTIONS.financeSaleItems).where('saleId', '==', saleId)),
      transaction.get(db.collection(COLLECTIONS.financePayments).where('saleId', '==', saleId)),
    ]);

    const productQuantities = sumProductQuantities(itemsSnapshot.docs.map((doc) => doc.data() as FinanceSaleItemDoc));
    const productSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>>();
    for (const productId of productQuantities.keys()) {
      productSnaps.set(productId, await transaction.get(db.collection(COLLECTIONS.financeProducts).doc(productId)));
    }

    for (const [productId, quantity] of productQuantities.entries()) {
      const productRef = db.collection(COLLECTIONS.financeProducts).doc(productId);
      const productSnap = productSnaps.get(productId);
      assertCondition(productSnap?.exists, 'not-found', 'Produto da venda nao encontrado.');
      const product = productSnap.data() as FinanceProductDoc;
      applyProductStockChange(transaction, productRef, product, {
        academyId: sale.academyId,
        quantityDelta: quantity,
        movementType: 'sale_cancel_reversal',
        saleId,
        reason: reason || 'Cancelamento da venda',
        actorUid: actor.uid,
        now,
      });
    }

    paymentsSnapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as FinancePaymentDoc }))
      .filter((entry) => entry.data.amount > 0)
      .forEach((entry) => {
        addPaymentAndRevenue(transaction, {
          academyId: sale.academyId,
          saleId,
          amount: -entry.data.amount,
          paymentMethod: entry.data.paymentMethod,
          paymentDate: now,
          notes: reason,
          customerName: sale.customerName,
          actorUid: actor.uid,
          now,
          reversalOfPaymentId: entry.id,
        });
      });

    transaction.update(saleRef, {
      paymentStatus: 'cancelled',
      balanceDue: 0,
      cancelledAt: now,
      cancelledBy: actor.uid,
      ...(reason ? { notes: `${sale.notes ? `${sale.notes}\n` : ''}Cancelamento: ${reason}` } : {}),
      updatedAt: now,
    });
  });

  return {
    saleId,
    paymentStatus: 'cancelled' as const,
  };
});

export const upsertManualRevenue = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'superadmin');
  const revenueId = optionalString(request.data, 'revenueId');
  const academyId = requiredString(request.data, 'academyId').trim();
  const category = requiredString(request.data, 'category').trim();
  const description = requiredString(request.data, 'description').trim();
  const amount = positiveMoney(request.data, 'amount');
  const receivedAt = optionalTimestamp(request.data, 'receivedAt') ?? Timestamp.now();
  const paymentMethod = optionalString(request.data, 'paymentMethod')?.trim();
  const status = optionalString(request.data, 'status') ?? 'received';
  assertCondition(status === 'received' || status === 'reversed', 'invalid-argument', 'Status da receita invalido.');
  await assertAcademyExists(academyId);

  const revenueRef = revenueId
    ? db.collection(COLLECTIONS.financeRevenues).doc(revenueId)
    : db.collection(COLLECTIONS.financeRevenues).doc();
  const existing = revenueId ? await revenueRef.get() : null;
  const previous = existing?.exists ? (existing.data() as FinanceRevenueDoc) : null;
  assertCondition(!previous || previous.origin === 'manual', 'failed-precondition', 'Somente receitas manuais podem ser editadas por aqui.');

  const now = Timestamp.now();
  const payload: FinanceRevenueDoc = {
    academyId,
    category,
    description,
    amount,
    receivedAt,
    ...(paymentMethod ? { paymentMethod } : {}),
    origin: 'manual',
    status,
    createdBy: previous?.createdBy ?? actor.uid,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };

  await revenueRef.set(payload, { merge: true });

  return {
    revenueId: revenueRef.id,
  };
});

export const upsertExpense = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'superadmin');
  const expenseId = optionalString(request.data, 'expenseId');
  const academyId = requiredString(request.data, 'academyId').trim();
  const category = requiredString(request.data, 'category').trim();
  const description = requiredString(request.data, 'description').trim();
  const amount = positiveMoney(request.data, 'amount');
  const dueDate = optionalTimestamp(request.data, 'dueDate') ?? Timestamp.now();
  const paidAt = optionalTimestamp(request.data, 'paidAt');
  const status = normalizeExpenseStatus(optionalString(request.data, 'status'), dueDate, paidAt);
  const supplier = optionalString(request.data, 'supplier')?.trim();
  const notes = optionalString(request.data, 'notes')?.trim();
  await assertAcademyExists(academyId);

  const expenseRef = expenseId
    ? db.collection(COLLECTIONS.financeExpenses).doc(expenseId)
    : db.collection(COLLECTIONS.financeExpenses).doc();
  const existing = expenseId ? await expenseRef.get() : null;
  const previous = existing?.exists ? (existing.data() as FinanceExpenseDoc) : null;
  if (previous) {
    assertCondition(previous.academyId === academyId, 'failed-precondition', 'Nao e possivel mover despesa entre filiais.');
  }

  const now = Timestamp.now();
  const payload: FinanceExpenseDoc = {
    academyId,
    category,
    description,
    amount,
    dueDate,
    ...(paidAt ? { paidAt } : {}),
    status,
    ...(supplier ? { supplier } : {}),
    ...(notes ? { notes } : {}),
    createdBy: previous?.createdBy ?? actor.uid,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };

  await expenseRef.set(payload, { merge: true });

  return {
    expenseId: expenseRef.id,
    status,
  };
});

export const markExpensePaid = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');
  const expenseId = requiredString(request.data, 'expenseId').trim();
  const paidAt = optionalTimestamp(request.data, 'paidAt') ?? Timestamp.now();
  const expenseRef = db.collection(COLLECTIONS.financeExpenses).doc(expenseId);
  const expenseSnap = await expenseRef.get();
  assertCondition(expenseSnap.exists, 'not-found', 'Despesa nao encontrada.');

  await expenseRef.update({
    paidAt,
    status: 'paid',
    updatedAt: Timestamp.now(),
  });

  return {
    expenseId,
    status: 'paid' as const,
  };
});
