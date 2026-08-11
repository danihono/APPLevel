import { Timestamp } from 'firebase-admin/firestore';
import { ClassDoc, COLLECTIONS, UserDoc } from '../domain/models';
import { app, db } from '../lib/firebase';

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
// ATENCAO — o caso 1 no modo padrao APAGA o `professorName`.
//
// Ha uma segunda origem de divergencia que o caso 1 resolve na direcao errada: ate 920e3db o
// CreateClassModal caia em `professors[0]` quando o usuario logado nao estava na lista da unidade
// (o superadmin tem `academyId` vazio por design), entao a aula nascia com o id de um estranho
// SORTEADO POR ORDEM ALFABETICA e o nome de quem realmente deu a aula. Nessas aulas o id nunca foi
// escolhido por ninguem, e o nome e o unico vestigio do dono real — rodar o modo padrao sobrescreve
// esse nome com o `displayName` do id sorteado e torna a corrupcao irrecuperavel sem PITR.
//
// Nao da para distinguir as duas origens por maquina (as duas terminam em "id valido, nome
// diferente"), entao a escolha e do operador: --trustName inverte a direcao do caso 1 e corrige o
// ID a partir do nome. NAO rode o modo padrao numa unidade afetada antes da passagem com
// --trustName.
//
// Uso (rode com as credenciais admin do projeto, igual ao bootstrap:tenant):
//   npm run firebase:fix:class-professors -- [--academySlug=minha-academia] [--dryRun]
//
// Sem --academySlug, varre todas as academias. Use --dryRun para apenas listar sem gravar.
//
// Reparo confiando no nome (aulas do superadmin que nunca entram em "Minhas"):
//   # 1) inspecionar — obrigatorio antes de gravar; confira "donoAtual" em cada linha
//   npm run firebase:fix:class-professors -- --academySlug=minha-academia \
//     --trustName --professorName="Ricardo Saldanha" --dryRun
//   # 2) aplicar
//   npm run firebase:fix:class-professors -- --academySlug=minha-academia \
//     --trustName --professorName="Ricardo Saldanha"
//
// --trustName exige --academySlug (nunca roda na rede inteira) e avisa em voz alta quando roda sem
// --dryRun — o script nao tem como saber se a inspecao foi feita, entao o passo 1 fica com voce.
// --professorName limita a varredura a um nome so; sem ele, todas as aulas divergentes da unidade
// entram.

interface SweepArgs {
  academySlug?: string;
  dryRun: boolean;
  trustName: boolean;
  professorName?: string;
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
    trustName: parsed.get('trustName') === 'true',
    professorName: parsed.get('professorName')?.trim() || undefined,
  };
}

async function resolveAcademyId(slug?: string): Promise<string | undefined> {
  if (!slug) {
    return undefined;
  }
  const snapshot = await db.collection(COLLECTIONS.academies).where('slug', '==', slug).limit(2).get();
  if (snapshot.empty) {
    // Slug errado e projeto errado dao o mesmo erro ("nao encontrada"). Listar o que existe separa
    // os dois casos na hora: lista vazia ou desconhecida = voce esta no projeto errado.
    const all = await db.collection(COLLECTIONS.academies).get();
    const slugs = all.docs
      .map((doc) => (doc.data() as { slug?: string }).slug)
      .filter((entry): entry is string => !!entry)
      .sort();
    throw new Error(
      `Academia com slug "${slug}" nao encontrada. Slugs neste projeto: ${
        slugs.length ? slugs.map((entry) => `"${entry}"`).join(', ') : '(nenhuma academia)'
      }`,
    );
  }
  if (snapshot.size > 1) {
    throw new Error(`Slug "${slug}" duplicado; corrija antes de continuar.`);
  }
  return snapshot.docs[0].id;
}

// Copia de `normalizePersonName` (utils.ts, na raiz) — o script casa exatamente os mesmos registros
// que a tela casaria. A duplicacao e estrutural, nao preguica: functions/tsconfig.json tem
// `rootDir: "src"` e `include: ["src/**/*.ts"]`, entao este projeto nao consegue importar nada da
// raiz. Mudou um, mude o outro, ou o --dryRun deixa de prever o que o filtro "Minhas" vai mostrar.
function normalizeName(value?: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

// Candidatos a dono real de uma aula, a partir do nome gravado nela: quem e da mesma academia, mais
// os superadmins (que tem `academyId` vazio por design, vide normalizeScopedAcademyId em
// modules/auth.ts). Usada pelos dois ramos que corrigem id, para os dois casarem pela mesma regra.
function findNameCandidates(users: UserEntry[], normalizedName: string, academyId: string): UserEntry[] {
  return users.filter((user) => (
    normalizeName(user.displayName) === normalizedName
    && (user.academyId === academyId || user.role === 'superadmin')
  ));
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

  // O `initializeApp()` sem argumentos pega o projeto do ambiente (GOOGLE_CLOUD_PROJECT, ou o do
  // ADC). Um `gcloud auth application-default login` feito para outra coisa aponta o script para
  // OUTRO banco sem avisar, e um script que grava nao pode depender de adivinhacao. Imprime sempre.
  const projectId = app.options.projectId
    ?? process.env.GOOGLE_CLOUD_PROJECT
    ?? process.env.GCLOUD_PROJECT
    ?? '(desconhecido)';
  console.log(`[projeto] conectado em "${projectId}". Confira antes de gravar.`);

  // --trustName reaponta ids: tira aulas de quem hoje as tem. Nunca deixar isso rodar na rede
  // inteira nem as cegas — exige unidade explicita e uma passagem de inspecao antes de gravar.
  if (args.trustName) {
    if (!args.academySlug) {
      throw new Error('--trustName exige --academySlug: reparo por nome nao roda na rede inteira.');
    }
    if (!args.dryRun) {
      console.warn(
        '[atencao] --trustName vai REAPONTAR o professorId de aulas que hoje pertencem a outra pessoa.\n'
        + '          Rode antes com --dryRun e confira o campo "donoAtual" de cada linha.',
      );
    }
  }

  const normalizedTargetName = normalizeName(args.professorName);
  const academyId = await resolveAcademyId(args.academySlug);

  if (args.trustName) {
    console.log(
      `[modo] confiando no nome (--trustName) na unidade "${args.academySlug}", nome: ${
        normalizedTargetName ? `"${args.professorName}"` : 'todos os nomes divergentes'
      }, dryRun: ${args.dryRun}.`,
    );
  }

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
  let idsCorrigidosPorNome = 0;
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

      // --trustName: o operador afirma que nesta unidade o id e que e lixo (nasceu de
      // `professors[0]`, sorteado por ordem alfabetica) e o nome e o unico vestigio do dono real.
      // Inverte a direcao do caso 1 e corrige o ID, com a mesma regra de candidato unico do ramo
      // orfao — homonimo continua sem ser resolvido no chute.
      if (args.trustName) {
        if (normalizedTargetName && professorName !== normalizedTargetName) {
          // Fora do --professorName pedido: nem conta como afetada.
          continue;
        }

        const candidates = findNameCandidates(users, professorName, lesson.academyId);

        if (candidates.length === 0) {
          affected += 1;
          unmatched += 1;
          console.warn(
            `[skip] aula ${doc.id} ("${lesson.title}"): professorName "${lesson.professorName}" nao casa com nenhum usuario da unidade nem superadmin.`,
          );
          continue;
        }

        if (candidates.length > 1) {
          affected += 1;
          ambiguous += 1;
          console.warn(
            `[skip] aula ${doc.id} ("${lesson.title}"): "${lesson.professorName}" casa com ${candidates.length} usuarios (${candidates.map((c) => c.id).join(', ')}); resolva o homonimo na mao.`,
          );
          continue;
        }

        const [target] = candidates;
        if (target.id === lesson.professorId) {
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
              acao: 'corrigir-id-confiando-no-nome',
              // `donoAtual` e o ponto do log: e de quem a aula esta sendo tirada. Confira um a um.
              antes: {
                professorId: lesson.professorId,
                professorName: lesson.professorName ?? null,
                donoAtual: owner.displayName,
              },
              depois: { professorId: target.id, professorName: target.displayName, role: target.role },
              dryRun: args.dryRun,
            },
            null,
            2,
          ),
        );

        if (!args.dryRun) {
          // Grava os dois campos juntos: deixar o par inconsistente e o bug que estamos consertando.
          await db.collection(COLLECTIONS.classes).doc(doc.id).update({
            professorId: target.id,
            professorName: target.displayName,
            updatedAt: Timestamp.now(),
          });
          idsCorrigidosPorNome += 1;
        }
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

    const candidates = findNameCandidates(users, professorName, lesson.academyId);

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
          modo: args.trustName ? 'confiando-no-nome' : 'padrao',
          professorNameFiltro: args.professorName ?? '(todos)',
          aulasVarridas: scanned,
          afetadas: affected,
          idsCorrigidos: renamedIds,
          idsCorrigidosPorNome,
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
