// Dados ficticios da visao do superadmin na galeria do redesign (?preview=redesign e link de demonstracao).
// Nada aqui toca o Firebase: sao objetos no mesmo formato dos documentos do Firestore, gerados de forma
// deterministica para a rede parecer real (8 academias, ~1.200 alunos, 6 meses de financeiro).
import { Timestamp } from 'firebase/firestore';
import type { FirestoreEntity } from '../services/firebase/data';
import {
  LEVEL_CATALOG_ID,
  type AcademyRecord,
  type AttendanceRecord,
  type ClassRecord,
  type CompetitionRecord,
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

const ts = (date: Date) => Timestamp.fromDate(date);
const now = new Date();
const dayAt = (offsetDays: number, hour = 12, minute = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, hour, minute, 0, 0);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2026);
const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
const between = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));

// ─── Academias ──────────────────────────────────────────────────────────────
interface AcademySeed {
  id: string;
  name: string;
  slug: string;
  students: number;
  leaders: number;
  blackLeaders: number;
  status: AcademyRecord['status'];
  masterBlackLimit: number;
  // Dias desde a ultima atividade dos usuarios (alimenta o sinal "sem atividade recente").
  idleDays?: number;
  live?: number;
}

const academySeeds: AcademySeed[] = [
  { id: 'sa-centro', name: 'Level Centro', slug: 'level-centro', students: 248, leaders: 5, blackLeaders: 2, status: 'active', masterBlackLimit: 3, live: 2 },
  { id: 'sa-norte', name: 'Level Zona Norte', slug: 'level-zona-norte', students: 196, leaders: 3, blackLeaders: 1, status: 'active', masterBlackLimit: 3, live: 1 },
  { id: 'sa-sul', name: 'Level Zona Sul', slug: 'level-zona-sul', students: 172, leaders: 4, blackLeaders: 3, status: 'active', masterBlackLimit: 2, live: 1 },
  { id: 'sa-barra', name: 'Level Barra', slug: 'level-barra', students: 158, leaders: 3, blackLeaders: 1, status: 'active', masterBlackLimit: 3, live: 1 },
  { id: 'sa-campinas', name: 'Level Campinas', slug: 'level-campinas', students: 131, leaders: 2, blackLeaders: 1, status: 'active', masterBlackLimit: 3, live: 1 },
  { id: 'sa-curitiba', name: 'Level Curitiba', slug: 'level-curitiba', students: 118, leaders: 2, blackLeaders: 0, status: 'inactive', masterBlackLimit: 3 },
  { id: 'sa-recife', name: 'Level Recife', slug: 'level-recife', students: 97, leaders: 1, blackLeaders: 0, status: 'active', masterBlackLimit: 3, idleDays: 26 },
  { id: 'sa-poa', name: 'Level Porto Alegre', slug: 'level-porto-alegre', students: 64, leaders: 0, blackLeaders: 0, status: 'active', masterBlackLimit: 3 },
];

export const saAcademies: Array<FirestoreEntity<AcademyRecord>> = academySeeds.map((seed, index) => ({
  id: seed.id,
  name: seed.name,
  slug: seed.slug,
  ownerUserId: `${seed.id}-prof-0`,
  status: seed.status,
  timezone: 'America/Sao_Paulo',
  classCheckinWindowMinutes: 15,
  masterBlackLimit: seed.masterBlackLimit,
  createdAt: ts(dayAt(-900 + index * 40)),
  updatedAt: ts(dayAt(-(seed.idleDays ?? 3) - 1)),
}));

// ─── Pessoas ────────────────────────────────────────────────────────────────
const FIRST = ['Lucas', 'Marina', 'Pedro', 'Carla', 'Rafael', 'Beatriz', 'Thiago', 'Larissa', 'Eduardo', 'Gabriela', 'Felipe', 'Paula', 'Bruno', 'Camila', 'Diego', 'Julia', 'Gustavo', 'Renata', 'Vinicius', 'Fernanda', 'Leandro', 'Aline', 'Rodrigo', 'Patricia', 'Matheus', 'Isabela', 'André', 'Daniela', 'Caio', 'Mariana'] as const;
const LAST = ['Almeida', 'Costa', 'Lima', 'Mendes', 'Souza', 'Rocha', 'Pires', 'Melo', 'Teixeira', 'Nunes', 'Alves', 'Ribeiro', 'Couto', 'Prado', 'Martins', 'Barros', 'Cardoso', 'Freitas', 'Moreira', 'Araújo'] as const;
const BELT_WEIGHTS: Array<[string, number]> = [['white', 41], ['blue', 30], ['purple', 15], ['brown', 9], ['black', 5]];

function randomBelt() {
  let roll = rand() * 100;
  for (const [belt, weight] of BELT_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) return belt;
  }
  return 'white';
}

function makeUser(id: string, academyId: string, role: UserRecord['role'], belt: string, overrides: Partial<UserRecord> = {}): FirestoreEntity<UserRecord> {
  const first = pick(FIRST);
  const last = pick(LAST);
  const stripes = belt === 'black' ? between(0, 4) : between(0, 4);
  const count = role === 'student' ? between(4, belt === 'white' ? 140 : belt === 'blue' ? 320 : 700) : 400;
  return {
    id,
    academyId,
    firstName: first,
    lastName: last,
    displayName: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}.${id.slice(-4)}@exemplo.com`,
    cpf: '000.000.000-00',
    phone: '(11) 99999-0000',
    role,
    status: 'active',
    belt,
    stripes,
    grade: stripes,
    attendanceCount: count,
    qrCheckinsCount: Math.round(count * 0.8),
    currentStreak: between(0, 6),
    longestStreak: 9,
    competitionPoints: 0,
    missionPoints: 0,
    rankingPoints: count,
    beltPromotions: 1,
    createdAt: ts(dayAt(-between(40, 700))),
    ...overrides,
  };
}

const lastAttendanceFor = (idleDays: number | undefined) => {
  if (idleDays !== undefined) return ts(dayAt(-(idleDays + between(0, 3)), 19));
  const roll = rand();
  const days = roll < 0.78 ? between(0, 9) : roll < 0.92 ? between(14, 30) : between(31, 90);
  return ts(dayAt(-days, 19));
};

export const saUsers: Array<FirestoreEntity<UserRecord>> = academySeeds.flatMap((seed) => {
  const people: Array<FirestoreEntity<UserRecord>> = [];
  for (let i = 0; i < seed.leaders; i += 1) {
    people.push(makeUser(`${seed.id}-prof-${i}`, seed.id, 'professor', i < seed.blackLeaders ? 'black' : 'brown', {
      lastAttendanceAt: ts(dayAt(-(seed.idleDays ?? 0), 19)),
      lastLoginAt: ts(dayAt(-(seed.idleDays ?? 0), 20)),
    }));
  }
  for (let i = 0; i < seed.students; i += 1) {
    const kid = rand() < 0.06;
    const roll = rand();
    const status: UserRecord['status'] = roll < 0.03 ? 'invited' : roll < 0.09 ? 'suspended' : 'active';
    people.push(makeUser(`${seed.id}-aluno-${i}`, seed.id, 'student', kid ? 'yellow-white' : randomBelt(), {
      status,
      lastAttendanceAt: lastAttendanceFor(seed.idleDays),
      birthDate: kid ? '2015-05-05' : `${between(1980, 2004)}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`,
    }));
  }
  return people;
});

// ─── Aulas e presencas (por academia, sob demanda) ──────────────────────────
const classCache = new Map<string, Array<FirestoreEntity<ClassRecord>>>();
const attendanceCache = new Map<string, Array<FirestoreEntity<AttendanceRecord>>>();

function buildAcademyActivity(academyId: string) {
  const seed = academySeeds.find((entry) => entry.id === academyId)!;
  const local = mulberry32(academyId.length * 977 + seed.students);
  const professors = saUsers.filter((user) => user.academyId === academyId && user.role === 'professor');
  const students = saUsers.filter((user) => user.academyId === academyId && user.role === 'student' && user.status === 'active');
  const classes: Array<FirestoreEntity<ClassRecord>> = [];
  const attendances: Array<FirestoreEntity<AttendanceRecord>> = [];
  const idle = seed.idleDays ?? 0;
  const slots: Array<[number, number, string]> = [[7, 0, 'Jiu-Jitsu Adulto'], [12, 0, 'Jiu-Jitsu Adulto'], [19, 0, 'Jiu-Jitsu Adulto'], [18, 0, 'Kids']];
  for (let offset = -75 - idle; offset <= 2; offset += 1) {
    const day = dayAt(offset, 12);
    const weekday = day.getDay();
    if (weekday === 0) continue;
    const todaySlots = weekday === 6 ? [[10, 0, 'Jiu-Jitsu Adulto'] as [number, number, string]] : slots;
    todaySlots.forEach(([hour, minute, title], slotIndex) => {
      if (offset > -idle && idle > 0) return;
      const start = dayAt(offset, hour, minute);
      const isToday = offset === 0;
      const nowMs = now.getTime();
      const live = isToday && seed.live && slotIndex === 2 && hour === 19;
      const isPast = start.getTime() + 3_600_000 < nowMs;
      const status: ClassRecord['status'] = live ? 'active' : isPast ? 'finished' : 'scheduled';
      const professor = professors.length ? professors[Math.floor(local() * professors.length)] : null;
      const present = status === 'scheduled' ? 0 : Math.max(4, Math.round(Math.min(students.length, 30) * (0.45 + local() * 0.5) * (title === 'Kids' ? 0.6 : 1)));
      const id = `${academyId}-class-${offset}-${hour}`;
      classes.push({
        id,
        academyId,
        title,
        professorId: professor?.id ?? 'sem-professor',
        professorName: professor?.displayName ?? 'Sem professor',
        tatame: slotIndex % 2 === 0 ? 'Tatame 1' : 'Tatame 2',
        status,
        scheduledStart: ts(start),
        scheduledEnd: ts(new Date(start.getTime() + 3_600_000)),
        startedAt: status === 'scheduled' ? null : ts(start),
        endedAt: status === 'finished' ? ts(new Date(start.getTime() + 3_600_000)) : null,
        capacity: 40,
        currentAttendanceCount: present,
        rsvpCount: Math.round(present * 0.8),
        checkinWindowMinutes: 15,
      });
      if (status !== 'scheduled') {
        for (let i = 0; i < present; i += 1) {
          const student = students[Math.floor(local() * students.length)];
          if (!student) break;
          attendances.push({
            id: `${id}-${i}`,
            academyId,
            classId: id,
            userId: student.id,
            checkInMethod: local() < 0.8 ? 'qr' : 'manual',
            checkedInBy: student.id,
            countsAsAttendance: true,
            classDayKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
            classStartAt: ts(start),
            checkedInAt: ts(new Date(start.getTime() + (i + 1) * 60_000)),
          });
        }
      }
    });
  }
  classCache.set(academyId, classes);
  attendanceCache.set(academyId, attendances);
}

export function saClassesFor(academyId: string) {
  if (!academyId) return [];
  if (!classCache.has(academyId)) buildAcademyActivity(academyId);
  return classCache.get(academyId)!;
}
export function saAttendancesFor(academyId: string) {
  if (!academyId) return [];
  if (!attendanceCache.has(academyId)) buildAcademyActivity(academyId);
  return attendanceCache.get(academyId)!;
}

// Aulas finalizadas e presencas dos ultimos dias em toda a rede ("Alunos por dia" da Central).
export function saDailyTrainingSnapshot(startDate: Date) {
  const classes: Array<FirestoreEntity<ClassRecord>> = [];
  const attendances: Array<FirestoreEntity<AttendanceRecord>> = [];
  academySeeds.forEach((seed) => {
    const lessons = saClassesFor(seed.id).filter((lesson) => lesson.status === 'finished' && (lesson.scheduledStart?.toMillis() ?? 0) >= startDate.getTime());
    const ids = new Set(lessons.map((lesson) => lesson.id));
    classes.push(...lessons);
    attendances.push(...saAttendancesFor(seed.id).filter((entry) => ids.has(entry.classId)));
  });
  return { classes, attendances };
}

// Participacao das ultimas 72 horas (alimenta "Desempenho das academias").
export function saRecentParticipation(): Array<FirestoreEntity<AttendanceRecord>> {
  const local = mulberry32(31);
  return saUsers
    .filter((user) => user.role === 'student' && user.status === 'active')
    .filter((user) => {
      const idle = academySeeds.find((entry) => entry.id === user.academyId)?.idleDays;
      return idle === undefined && local() < 0.62;
    })
    .map((user) => ({
      id: `part-${user.id}`,
      academyId: user.academyId,
      classId: 'participacao',
      userId: user.id,
      checkInMethod: 'qr' as const,
      checkedInBy: user.id,
      countsAsAttendance: true,
      checkedInAt: ts(new Date(Date.now() - Math.floor(local() * 60) * 3_600_000)),
    }));
}

export const saCompetitions: Array<FirestoreEntity<CompetitionRecord>> = [
  { id: 'comp-1', academyId: 'sa-sul', name: 'Campeonato Interno Zona Sul', location: 'Ginásio Zona Sul', status: 'published', startDate: ts(dayAt(2)), endDate: ts(dayAt(2)) },
  { id: 'comp-2', academyId: 'sa-centro', name: 'Copa Level Centro', location: 'Centro', status: 'published', startDate: ts(dayAt(11)), endDate: ts(dayAt(12)) },
  { id: 'comp-3', academyId: 'sa-campinas', name: 'Open Campinas', location: 'Campinas', status: 'published', startDate: ts(dayAt(24)), endDate: ts(dayAt(24)) },
  { id: 'comp-4', academyId: 'sa-barra', name: 'Torneio Barra Pesados', location: 'Barra', status: 'finished', startDate: ts(dayAt(-20)), endDate: ts(dayAt(-20)) },
];

// ─── Financeiro (Controle Total) ────────────────────────────────────────────
const PRODUCT_SEEDS: Array<[string, string, number, number, number, number]> = [
  ['Kimono A2 branco', 'Kimonos', 230, 389, 14, 20], ['Kimono A3 preto', 'Kimonos', 255, 429, 38, 15], ['Kimono Kids K2', 'Kimonos', 150, 249, 18, 12],
  ['Faixa branca', 'Faixas', 22, 59, 52, 30], ['Faixa azul', 'Faixas', 28, 69, 9, 15], ['Rashguard LEVEL', 'Vestuário', 78, 159, 24, 12],
  ['Camiseta LEVEL', 'Vestuário', 42, 89, 61, 20], ['Protetor bucal', 'Acessórios', 21, 49, 4, 10],
];
export const saProducts: Array<FirestoreEntity<FinanceProductRecord>> = PRODUCT_SEEDS.map(([name, category, purchasePrice, salePrice, stockCurrent, stockMinimum], index) => ({
  id: `prod-${index + 1}`, name, category, purchasePrice, salePrice, salePriceFilial: Math.round(salePrice * 0.85), salePriceDiretoria: salePrice,
  stockCurrent, stockMinimum, status: 'active', createdAt: ts(dayAt(-300)),
}));

const SERVICE_SEEDS: Array<[string, string, number, number]> = [['Mensalidade Adulto', 'Mensalidade', 14, 180], ['Mensalidade Kids', 'Mensalidade', 15, 150], ['Aula avulsa', 'Avulso', 5, 60]];
export const saServices: Array<FirestoreEntity<FinanceServiceRecord>> = academySeeds.flatMap((academy) => SERVICE_SEEDS.map(([name, category, cost, salePrice], index) => ({
  id: `${academy.id}-svc-${index + 1}`, academyId: academy.id, name, category, cost, salePrice, status: 'active' as const, createdAt: ts(dayAt(-300)),
})));

const sales: Array<FirestoreEntity<FinanceSaleRecord>> = [];
const saleItems: Array<FirestoreEntity<FinanceSaleItemRecord>> = [];
const payments: Array<FirestoreEntity<FinancePaymentRecord>> = [];
const revenues: Array<FirestoreEntity<FinanceRevenueRecord>> = [];
const expenses: Array<FirestoreEntity<FinanceExpenseRecord>> = [];

academySeeds.forEach((academy, academyIndex) => {
  const buyers = saUsers.filter((user) => user.academyId === academy.id && user.role === 'student').slice(0, 40);
  const idle = academy.idleDays ?? 0;
  for (let month = 5; month >= 0; month -= 1) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - month, 1);
    const daysInMonth = month === 0 ? Math.max(1, now.getDate()) : new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const growth = 0.82 + (5 - month) * 0.04;
    const count = Math.round((academy.students / 7) * growth);
    for (let i = 0; i < count; i += 1) {
      const buyer = buyers[(i + academyIndex) % Math.max(1, buyers.length)];
      const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.max(1, Math.min(daysInMonth, between(1, daysInMonth))), between(9, 20));
      if (idle > 0 && month === 0 && i % 2 === 0) continue;
      const isProduct = rand() < 0.22;
      const product = pick(saProducts);
      const serviceName = rand() < 0.8 ? 'Mensalidade Adulto' : 'Mensalidade Kids';
      const service = saServices.find((entry) => entry.academyId === 'sa-centro' && entry.name === serviceName)!;
      const unitPrice = isProduct ? product.salePrice : service.salePrice;
      const unitCost = isProduct ? product.purchasePrice : service.cost;
      const quantity = isProduct ? between(1, 2) : 1;
      const total = unitPrice * quantity;
      const statusRoll = rand();
      const paymentStatus: FinanceSaleRecord['paymentStatus'] = month === 0 && statusRoll < 0.18 ? 'pending' : statusRoll < 0.05 ? 'partial' : statusRoll < 0.07 ? 'cancelled' : 'paid';
      const received = paymentStatus === 'paid' ? total : paymentStatus === 'partial' ? Math.round(total / 2) : 0;
      const saleId = `${academy.id}-sale-${month}-${i}`;
      sales.push({
        id: saleId, academyId: academy.id, saleType: isProduct ? 'product' : 'service', buyerType: 'individuo', customerId: buyer?.id, customerName: buyer?.displayName ?? 'Cliente balcão',
        sellerName: 'Recepção', saleDate: ts(date), paymentMethod: pick(['pix', 'cartao', 'dinheiro']), paymentStatus, subtotal: total, discountTotal: 0, total,
        amountReceived: received, balanceDue: paymentStatus === 'cancelled' ? 0 : total - received, createdAt: ts(date),
      });
      saleItems.push({
        id: `${saleId}-item`, academyId: academy.id, saleId, type: isProduct ? 'product' : 'service', itemId: isProduct ? product.id : service.id,
        itemName: isProduct ? product.name : service.name, quantity, unitPrice, unitCost, discount: 0, finalUnitPrice: unitPrice, total, beneficiaryName: buyer?.displayName,
      });
      if (received > 0) {
        const paymentId = `${saleId}-pay`;
        payments.push({ id: paymentId, academyId: academy.id, saleId, amount: received, paymentDate: ts(date), paymentMethod: 'pix', status: 'received', createdAt: ts(date) });
        revenues.push({
          id: `${saleId}-rev`, academyId: academy.id, category: isProduct ? 'Produtos' : 'Mensalidades', description: `${isProduct ? product.name : service.name} · ${buyer?.displayName ?? 'Cliente'}`,
          amount: received, receivedAt: ts(date), origin: 'sale', status: 'received', saleId, paymentId, createdAt: ts(date),
        });
      }
    }
    // Despesas fixas da unidade no mes.
    (['Aluguel', 'Energia', 'Limpeza', 'Marketing'] as const).forEach((category, index) => {
      const amount = [1500, 420, 260, 340][index] * (0.6 + academy.students / 300);
      const due = new Date(monthStart.getFullYear(), monthStart.getMonth(), 5 + index * 4);
      const overdue = month === 0 && (academy.id === 'sa-recife' || academy.id === 'sa-poa') && index < 2;
      const pending = month === 0 && !overdue && due.getTime() > now.getTime();
      expenses.push({
        id: `${academy.id}-exp-${month}-${index}`, academyId: academy.id, category, description: `${category} · ${academy.name}`, amount: Math.round(amount),
        dueDate: ts(due), paidAt: overdue || pending ? undefined : ts(due), status: overdue ? 'overdue' : pending ? 'pending' : 'paid', createdAt: ts(due),
      });
    });
  }
});

const inventoryMovements: Array<FirestoreEntity<InventoryMovementRecord>> = saProducts.slice(0, 8).flatMap((product, index) => ([
  { id: `inv-${index}-a`, academyId: LEVEL_CATALOG_ID, productId: product.id, productName: product.name, type: 'manual_entry' as const, quantityDelta: 40, stockBefore: product.stockCurrent - 40 + 12, stockAfter: product.stockCurrent + 12, reason: 'Compra', createdAt: ts(dayAt(-between(3, 40))) },
  { id: `inv-${index}-b`, academyId: LEVEL_CATALOG_ID, productId: product.id, productName: product.name, type: 'sale_decrement' as const, quantityDelta: -12, stockBefore: product.stockCurrent + 12, stockAfter: product.stockCurrent, createdAt: ts(dayAt(-between(0, 10))) },
]));

const withdrawals: Array<FirestoreEntity<FinanceWithdrawalRecord>> = [
  ['sa-centro-prof-0', 'Kimono A2 branco', 389, 41, 0], ['sa-norte-prof-1', 'Faixa azul + camiseta', 214, 18, 100], ['sa-sul-prof-2', 'Rashguard LEVEL', 159, 9, 0], ['sa-barra-prof-0', 'Kimono Kids K2', 249, 3, 0], ['sa-campinas-prof-1', 'Protetor bucal', 98, 22, 0],
].map(([userId, label, total, days, received], index) => {
  const debtor = saUsers.find((user) => user.id === userId)!;
  const value = Number(total);
  return {
    id: `vale-${index}`, academyId: debtor.academyId, debtorUserId: debtor.id, debtorName: debtor.displayName,
    items: [{ productId: 'prod-1', productName: String(label), quantity: 1, unitValue: value, total: value }], total: value, amountReceived: Number(received), balanceDue: value - Number(received),
    status: Number(received) > 0 ? 'partial' as const : 'pending' as const, withdrawnAt: ts(dayAt(-Number(days))), createdAt: ts(dayAt(-Number(days))),
  };
});

export const saFinance = { sales, saleItems, payments, revenues, expenses, inventoryMovements, withdrawals };
