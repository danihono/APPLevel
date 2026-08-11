import { COLLECTIONS, UserDoc } from '../domain/models';
import { app, auth, db } from '../lib/firebase';

// Script de LEITURA: compara duas ou mais contas lado a lado. Nao grava nada, nunca.
//
// Existe porque uma mesma pessoa pode ter mais de uma conta — o caso que motivou isto foi um
// professor que tambem e superadmin e aparecia duas vezes em `users`, com dois e-mails, cada conta
// com um pedaco da historia. As aulas ficaram gravadas numa (`classes.professorId`) e ele entrava
// pela outra, entao "Minhas" no calendario vinha vazio sem nada estar corrompido: os dois documentos
// eram internamente consistentes, so nao eram a mesma conta.
//
// Decidir qual conta manter e uma decisao de negocio, nao de codigo, e depende do que esta pendurado
// em cada uma. Contar isso no console do Firestore, colecao por colecao, e lento e da erro. Aqui sai
// tudo de uma vez.
//
// Uso (credenciais admin do projeto, igual ao bootstrap:tenant). Rode de dentro de functions/:
//   node lib/scripts/inspectDuplicateUsers.js --emails=um@exemplo.com,outro@exemplo.com
//   node lib/scripts/inspectDuplicateUsers.js --userIds=uid1,uid2
//
// Por e-mail resolve o uid no Firebase Auth; por uid vai direto ao documento. Aceita quantas contas
// voce quiser, separadas por virgula.

interface InspectArgs {
  emails: string[];
  userIds: string[];
}

interface AccountReport {
  userId: string;
  existsInAuth: boolean;
  existsInFirestore: boolean;
  email?: string;
  displayName?: string;
  role?: string;
  status?: string;
  academyId?: string;
  belt?: string;
  stripes?: number;
  attendanceCount?: number;
  lastLoginAt?: string;
  counts: Record<string, number>;
}

function parseArgs(argv: string[]): InspectArgs {
  const parsed = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      continue;
    }

    const [rawKey, rawValue] = item.slice(2).split('=');
    if (rawValue != null) {
      parsed.set(rawKey, rawValue);
      continue;
    }

    const nextValue = argv[index + 1];
    if (nextValue && !nextValue.startsWith('--')) {
      parsed.set(rawKey, nextValue);
      index += 1;
    } else {
      parsed.set(rawKey, 'true');
    }
  }

  const split = (value?: string): string[] => (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return {
    emails: split(parsed.get('emails')),
    userIds: split(parsed.get('userIds')),
  };
}

// Conta sem baixar os documentos: em colecoes com milhares de aulas/presencas, trazer tudo so para
// medir o tamanho e desperdicio e fica lento.
async function countWhere(collection: string, field: string, value: string): Promise<number> {
  const snapshot = await db.collection(collection).where(field, '==', value).count().get();
  return snapshot.data().count;
}

async function buildReport(userId: string): Promise<AccountReport> {
  const [authUser, doc] = await Promise.all([
    auth.getUser(userId).catch(() => undefined),
    db.collection(COLLECTIONS.users).doc(userId).get(),
  ]);

  const user = doc.exists ? (doc.data() as UserDoc) : undefined;

  // Cada par colecao/campo abaixo e um lugar onde o id da conta ficou gravado. Se voce consolidar as
  // contas, e exatamente esta lista que precisa ser reapontada.
  const [aulas, presencas, graduacoes, pedidosComoProfessor, pedidosComoAluno, rsvps] = await Promise.all([
    countWhere(COLLECTIONS.classes, 'professorId', userId),
    countWhere(COLLECTIONS.attendances, 'userId', userId),
    countWhere(COLLECTIONS.graduations, 'userId', userId),
    countWhere(COLLECTIONS.attendanceRequests, 'professorId', userId),
    countWhere(COLLECTIONS.attendanceRequests, 'userId', userId),
    countWhere(COLLECTIONS.classRsvps, 'userId', userId),
  ]);

  return {
    userId,
    existsInAuth: !!authUser,
    existsInFirestore: doc.exists,
    email: authUser?.email ?? user?.email,
    displayName: user?.displayName,
    role: user?.role,
    status: user?.status,
    academyId: user?.academyId === '' ? '(vazio — conta de rede)' : user?.academyId,
    belt: user?.belt,
    stripes: user?.stripes,
    attendanceCount: user?.attendanceCount,
    lastLoginAt: user?.lastLoginAt?.toDate?.().toISOString(),
    counts: {
      'aulas onde e o professor': aulas,
      'presencas como aluno': presencas,
      graduacoes,
      'pedidos de presenca recebidos': pedidosComoProfessor,
      'pedidos de presenca feitos': pedidosComoAluno,
      'confirmacoes de presenca (rsvp)': rsvps,
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const projectId = app.options.projectId
    ?? process.env.GOOGLE_CLOUD_PROJECT
    ?? process.env.GCLOUD_PROJECT
    ?? '(desconhecido)';
  console.log(`[projeto] conectado em "${projectId}". Este script so le, nunca grava.`);

  if (args.emails.length === 0 && args.userIds.length === 0) {
    throw new Error('Informe --emails=a@x.com,b@x.com ou --userIds=uid1,uid2.');
  }

  const resolved = [...args.userIds];

  for (const email of args.emails) {
    const record = await auth.getUserByEmail(email).catch(() => undefined);
    if (!record) {
      console.warn(`[skip] e-mail "${email}" nao existe no Firebase Auth deste projeto.`);
      continue;
    }
    console.log(`[auth] "${email}" => uid ${record.uid}`);
    resolved.push(record.uid);
  }

  const unique = [...new Set(resolved)];
  if (unique.length < resolved.length) {
    console.warn('[atencao] os valores informados apontam para o mesmo uid; nao ha duas contas aqui.');
  }
  if (unique.length === 0) {
    throw new Error('Nenhuma conta encontrada para os valores informados.');
  }

  const reports: AccountReport[] = [];
  for (const userId of unique) {
    reports.push(await buildReport(userId));
  }

  console.log(JSON.stringify({ contas: reports }, null, 2));

  // O resumo existe para a pergunta pratica: qual conta carrega a historia? Somar na cabeca, lendo o
  // JSON acima, e onde se erra.
  console.log('\n=== Resumo ===');
  for (const report of reports) {
    const total = Object.values(report.counts).reduce((sum, value) => sum + value, 0);
    console.log(
      `${report.userId}  ${report.email ?? '(sem e-mail)'}  role=${report.role ?? '?'}  `
      + `aulas=${report.counts['aulas onde e o professor']}  presencas=${report.counts['presencas como aluno']}  `
      + `total de vinculos=${total}`,
    );
  }
  console.log(
    '\nA conta com mais vinculos e a que carrega a historia. Nao apague a outra: apagar deixa esses '
    + 'vinculos orfaos. Se for consolidar, reaponte os vinculos antes e desative a conta vazia.',
  );
}

main().catch((error) => {
  console.error('Falha ao comparar as contas:', error);
  process.exitCode = 1;
});
