import { Timestamp } from 'firebase-admin/firestore';
import { ClassDoc, COLLECTIONS, UserDoc } from '../domain/models';
import { db } from '../lib/firebase';

// Script de varredura: reaponta o `professorId` de aulas cujo dono real e outro usuario.
//
// O bug (corrigido em resolveClassProfessor, modules/classes.ts) vinha de `professorId` e
// `professorName` terem fallbacks independentes nos writers de aula: um `professorName` vazio virava
// `actor.user.displayName` e era carimbado por cima do id de outra pessoa. Como o card mostra o nome
// (ClassSessionCard) e o filtro "Minhas" casa pelo id (CalendarView.isMyClass), os dois divergiam sem
// ninguem perceber — a aula aparecia com o nome certo e nunca entrava em "Minhas".
//
// Assinatura do bug: aula cujo `professorId` e `professorName` apontam para pessoas diferentes.
//
// A correcao depende de qual dos dois campos ainda e confiavel:
//
// 1. `professorId` resolve para um usuario existente => o ID e a fonte da verdade, porque
//    `professorName` e so uma copia desnormalizada e era ela que o writer antigo sobrescrevia.
//    Corrige o NOME (acao "corrigir-nome"). Reescrever o id aqui tiraria a aula do dono real e a
//    daria para quem editou por ultimo — o oposto do que se quer.
// 2. `professorId` e orfao (nenhum usuario com esse id, ex.: conta antiga removida) => o nome e o
//    unico sinal restante. Procura em `users` alguem cujo `displayName` case com o `professorName`,
//    entre os usuarios da mesma academia e os superadmins (que tem `academyId` vazio por design,
//    vide normalizeScopedAcademyId em modules/auth.ts), e corrige o ID (acao "corrigir-id"). So
//    reescreve com EXATAMENTE um candidato; com zero ou mais de um apenas loga, porque homonimo
//    nao se resolve sozinho.
//
// Reapontar o `professorId` (caso 2) move as metricas por professor no painel do superadmin
// (SuperadminDashboardView) e o destinatario das notificacoes de pedido de presenca
// (modules/attendance.ts). Rode sempre com --dryRun antes para conferir o impacto.
//
// Uso (rode com as credenciais admin do projeto, igual ao bootstrap:tenant):
//   npm --prefix functions run fix:class-professors -- [--academySlug=minha-academia] [--dryRun]
//
// Sem --academySlug, varre todas as academias. Use --dryRun para apenas listar sem gravar.

interface SweepArgs {
  academySlug?: string;
  dryRun: boolean;
}

interface UserEntry {
  id: string;
  academyId: string;
  role: UserDoc['role'];
  displayName: string;
}

function parseArgs(argv: string[]): SweepArgs {
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

  return {
    academySlug: parsed.get('academySlug')?.trim().toLowerCase(),
    dryRun: parsed.get('dryRun') === 'true',
  };
}

async function resolveAcademyId(slug?: string): Promise<string | undefined> {
  if (!slug) {
    return undefined;
  }
  const snapshot = await db.collection(COLLECTIONS.academies).where('slug', '==', slug).limit(2).get();
  if (snapshot.empty) {
    throw new Error(`Academia com slug "${slug}" nao encontrada.`);
  }
  if (snapshot.size > 1) {
    throw new Error(`Slug "${slug}" duplicado; corrija antes de continuar.`);
  }
  return snapshot.docs[0].id;
}

// Mesma normalizacao do fallback por nome em CalendarView.isMyClass, para o script casar exatamente
// os mesmos registros que a tela casaria.
function normalizeName(value?: string): string {
  return (value ?? '').trim().toLocaleLowerCase('pt-BR');
}

async function loadUsers(): Promise<UserEntry[]> {
  const snapshot = await db.collection(COLLECTIONS.users).get();
  return snapshot.docs.map((doc) => {
    const user = doc.data() as UserDoc;
    return {
      id: doc.id,
      academyId: user.academyId ?? '',
      role: user.role,
      displayName: user.displayName ?? '',
    };
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const academyId = await resolveAcademyId(args.academySlug);

  const users = await loadUsers();
  const usersById = new Map(users.map((user) => [user.id, user]));

  const baseQuery = academyId
    ? db.collection(COLLECTIONS.classes).where('academyId', '==', academyId)
    : db.collection(COLLECTIONS.classes);
  const snapshot = await baseQuery.get();

  let scanned = 0;
  let affected = 0;
  let renamedIds = 0;
  let renamedNames = 0;
  let ambiguous = 0;
  let unmatched = 0;

  for (const doc of snapshot.docs) {
    const lesson = doc.data() as ClassDoc;
    scanned += 1;

    const professorName = normalizeName(lesson.professorName);
    if (!professorName) {
      // Sem nome gravado nao ha como inferir o dono real; deixa como esta.
      continue;
    }

    const owner = lesson.professorId ? usersById.get(lesson.professorId) : undefined;

    // `professorId` que resolve para um usuario existente e a fonte da verdade: `professorName` e
    // so uma copia desnormalizada, e era ela que o writer antigo sobrescrevia com o displayName do
    // ator. Divergiu com id valido => quem tem que ser corrigido e o NOME, nunca o id (reescrever o
    // id aqui tiraria a aula do dono real e daria para quem editou por ultimo).
    if (owner) {
      if (normalizeName(owner.displayName) === professorName) {
        // Nome e id ja concordam: nada a fazer.
        continue;
      }

      affected += 1;
      console.log(
        JSON.stringify(
          {
            aula: {
              classId: doc.id,
              title: lesson.title,
              academyId: lesson.academyId,
              scheduledStart: lesson.scheduledStart?.toDate?.().toISOString() ?? null,
            },
            acao: 'corrigir-nome',
            antes: { professorId: lesson.professorId, professorName: lesson.professorName ?? null },
            depois: { professorId: lesson.professorId, professorName: owner.displayName },
            dryRun: args.dryRun,
          },
          null,
          2,
        ),
      );

      if (!args.dryRun) {
        await db.collection(COLLECTIONS.classes).doc(doc.id).update({
          professorName: owner.displayName,
          updatedAt: Timestamp.now(),
        });
        renamedNames += 1;
      }
      continue;
    }

    // Daqui para baixo o id e orfao (nenhum usuario com esse id), entao o nome e o unico sinal do
    // dono real e reescrever o `professorId` e a unica saida.
    affected += 1;

    // Candidatos: quem e da mesma academia da aula, mais os superadmins (academyId vazio).
    const candidates = users.filter((user) => (
      normalizeName(user.displayName) === professorName
      && (user.academyId === lesson.academyId || user.role === 'superadmin')
    ));

    if (candidates.length === 0) {
      unmatched += 1;
      console.warn(
        `[skip] aula ${doc.id} ("${lesson.title}"): professorName "${lesson.professorName}" nao casa com nenhum usuario da unidade nem superadmin.`,
      );
      continue;
    }

    if (candidates.length > 1) {
      ambiguous += 1;
      console.warn(
        `[skip] aula ${doc.id} ("${lesson.title}"): "${lesson.professorName}" casa com ${candidates.length} usuarios (${candidates.map((c) => c.id).join(', ')}); resolva o homonimo na mao.`,
      );
      continue;
    }

    const [target] = candidates;

    console.log(
      JSON.stringify(
        {
          aula: {
            classId: doc.id,
            title: lesson.title,
            academyId: lesson.academyId,
            scheduledStart: lesson.scheduledStart?.toDate?.().toISOString() ?? null,
          },
          acao: 'corrigir-id',
          antes: {
            professorId: lesson.professorId || null,
            professorName: lesson.professorName ?? null,
            donoResolvido: '(id nao encontrado)',
          },
          depois: {
            professorId: target.id,
            professorName: target.displayName,
            role: target.role,
          },
          dryRun: args.dryRun,
        },
        null,
        2,
      ),
    );

    if (args.dryRun) {
      continue;
    }

    await db.collection(COLLECTIONS.classes).doc(doc.id).update({
      professorId: target.id,
      professorName: target.displayName,
      updatedAt: Timestamp.now(),
    });
    renamedIds += 1;
  }

  console.log(
    JSON.stringify(
      {
        resumo: {
          academySlug: args.academySlug ?? '(todas)',
          aulasVarridas: scanned,
          afetadas: affected,
          idsCorrigidos: renamedIds,
          nomesCorrigidos: renamedNames,
          semCorrespondencia: unmatched,
          homonimos: ambiguous,
          dryRun: args.dryRun,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Falha ao varrer/corrigir o professor das aulas:', error);
  process.exitCode = 1;
});
