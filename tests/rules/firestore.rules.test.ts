/**
 * Testes das regras do Firestore contra o emulador.
 *
 * Cada teste aqui corresponde a uma falha encontrada na auditoria de seguranca.
 * Todos DEVEM falhar nas regras antigas e passar nas novas — e essa a prova de que
 * a correcao resolveu, e nao apenas de que as regras continuam validas.
 *
 * Execucao:
 *   npm run test:rules
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const ACADEMY_A = 'academy-a';
const ACADEMY_B = 'academy-b';

let testEnv: RulesTestEnvironment;

/** Contextos autenticados espelhando os custom claims reais (role + academyId). */
const student = () => testEnv.authenticatedContext('student-1', { role: 'student', academyId: ACADEMY_A }).firestore();
const professor = () => testEnv.authenticatedContext('prof-1', { role: 'professor', academyId: ACADEMY_A }).firestore();
const superadmin = () => testEnv.authenticatedContext('super-1', { role: 'superadmin', academyId: ACADEMY_A }).firestore();

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'applevel-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  // Semeia os documentos ignorando as regras (equivalente ao Admin SDK).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'academies', ACADEMY_A), {
      name: 'Academia A', timezone: 'America/Sao_Paulo', status: 'active',
      progressionRules: { stripeEvery: 40 }, masterBlackLimit: 3,
    });
    await setDoc(doc(db, 'users', 'student-1'), {
      academyId: ACADEMY_A, role: 'student', status: 'active',
      email: 'aluno@x.com', cpf: '11111111111', firstName: 'Aluno', fcmTokens: [],
    });
    await setDoc(doc(db, 'users', 'student-2'), {
      academyId: ACADEMY_A, role: 'student', status: 'suspended',
      email: 'outro@x.com', cpf: '22222222222', firstName: 'Outro', fcmTokens: [],
    });
    await setDoc(doc(db, 'classes', 'class-1'), {
      academyId: ACADEMY_A, title: 'Fundamentos', status: 'active',
      activeQrHash: 'hash-abc', activeQrVersion: 1,
    });
    // O token em texto puro vive na subcolecao privada.
    await setDoc(doc(db, 'classes', 'class-1', 'qr_private', 'current'), { token: 'token-secreto-em-texto-puro' });
    await setDoc(doc(db, 'rate_limits', 'signup:global'), { count: 1 });
    // Documento LEGADO: criado antes da correcao, ainda carrega o token como campo.
    // Serve para provar por que o script de purga e obrigatorio.
    await setDoc(doc(db, 'classes', 'class-legado'), {
      academyId: ACADEMY_A, title: 'Aula antiga', status: 'active',
      activeQrHash: 'hash-xyz', activeQrToken: 'token-legado-em-texto-puro',
    });
  });
});

after(async () => {
  await testEnv?.cleanup();
});

describe('V1 — token do QR (fraude de presenca)', () => {
  it('aluno LE o documento da aula, mas ele nao carrega mais o token', async () => {
    const snap = await assertSucceeds(getDoc(doc(student(), 'classes', 'class-1')));
    assert.equal(snap.get('activeQrToken'), undefined, 'o token nao pode estar no documento publico da aula');
    assert.ok(snap.get('activeQrHash'), 'o hash continua no documento, para validacao no servidor');
  });

  it('aluno NAO le a subcolecao privada com o token', async () => {
    await assertFails(getDoc(doc(student(), 'classes', 'class-1', 'qr_private', 'current')));
  });

  it('nem professor nem superadmin leem o token pelo SDK', async () => {
    await assertFails(getDoc(doc(professor(), 'classes', 'class-1', 'qr_private', 'current')));
    await assertFails(getDoc(doc(superadmin(), 'classes', 'class-1', 'qr_private', 'current')));
  });

  it('ninguem escreve na subcolecao privada', async () => {
    await assertFails(setDoc(doc(professor(), 'classes', 'class-1', 'qr_private', 'current'), { token: 'forjado' }));
  });

  /**
   * NOTA IMPORTANTE sobre o alcance das REGRAS nesta falha.
   *
   * As regras nao conseguem esconder um campo de um documento que o usuario pode ler:
   * `allow read` e tudo-ou-nada no documento. Por isso a correcao de V1 e de MODELO DE
   * DADOS (o backend parou de gravar o token no documento da aula), e nao de regras.
   * A subcolecao privada e defesa em profundidade.
   *
   * Consequencia pratica: todo documento de aula criado ANTES da correcao continua
   * expondo o token ate `scripts/purgeLegacySecrets.cjs --apply` ser executado.
   * Este teste existe para deixar esse risco visivel e falhar enquanto ele existir.
   */
  it('as regras NAO escondem o campo de um documento legado (por isso a purga e obrigatoria)', async () => {
    const snap = await assertSucceeds(getDoc(doc(student(), 'classes', 'class-legado')));
    assert.equal(
      snap.get('activeQrToken'),
      'token-legado-em-texto-puro',
      'Este teste documenta uma LIMITACAO, nao um bug: `allow read` e tudo-ou-nada no '
      + 'documento, entao nenhuma regra esconde um campo de quem pode ler a aula. '
      + 'Enquanto houver documento antigo com activeQrToken, a fraude de presenca segue '
      + 'possivel — rode `node scripts/purgeLegacySecrets.cjs --apply` em producao.',
    );
  });
});

describe('V4 — blocklist de users', () => {
  it('professor NAO reativa aluno suspenso escrevendo status direto', async () => {
    await assertFails(updateDoc(doc(professor(), 'users', 'student-2'), { status: 'active' }));
  });

  it('professor NAO injeta fcmTokens (sequestro de push)', async () => {
    await assertFails(updateDoc(doc(professor(), 'users', 'student-1'), { fcmTokens: ['token-do-atacante'] }));
  });

  it('professor NAO grava plainPassword', async () => {
    await assertFails(updateDoc(doc(professor(), 'users', 'student-1'), { plainPassword: 'senha123' }));
  });

  it('professor NAO troca email nem cpf', async () => {
    await assertFails(updateDoc(doc(professor(), 'users', 'student-1'), { email: 'sequestro@x.com' }));
    await assertFails(updateDoc(doc(professor(), 'users', 'student-1'), { cpf: '99999999999' }));
  });

  it('professor CONTINUA editando os campos legitimos de perfil', async () => {
    await assertSucceeds(updateDoc(doc(professor(), 'users', 'student-1'), { firstName: 'Novo', phone: '11999999999' }));
  });

  it('escalada de privilegio pelo SDK segue bloqueada (role e belt)', async () => {
    await assertFails(updateDoc(doc(professor(), 'users', 'student-1'), { role: 'superadmin' }));
    await assertFails(updateDoc(doc(student(), 'users', 'student-1'), { belt: 'black' }));
  });
});

describe('V5 — academies', () => {
  it('professor NAO grava progressionRules (burlaria o gate de graduacao)', async () => {
    await assertFails(updateDoc(doc(professor(), 'academies', ACADEMY_A), { progressionRules: { stripeEvery: 1 } }));
  });

  it('professor NAO deleta a academia', async () => {
    await assertFails(deleteDoc(doc(professor(), 'academies', ACADEMY_A)));
  });

  it('professor CONTINUA ajustando as configuracoes operacionais', async () => {
    await assertSucceeds(updateDoc(doc(professor(), 'academies', ACADEMY_A), {
      name: 'Academia A2', timezone: 'America/Bahia', classCheckinWindowMinutes: 20,
    }));
  });
});

describe('V7 — rate limits', () => {
  it('nenhum cliente le ou escreve a colecao de contadores', async () => {
    await assertFails(getDoc(doc(student(), 'rate_limits', 'signup:global')));
    await assertFails(setDoc(doc(superadmin(), 'rate_limits', 'signup:global'), { count: 0 }));
  });
});

describe('Isolamento multi-tenant (regressao)', () => {
  it('usuario da academia B nao le dados da academia A', async () => {
    const outsider = testEnv.authenticatedContext('intruso', { role: 'professor', academyId: ACADEMY_B }).firestore();
    await assertFails(getDoc(doc(outsider, 'classes', 'class-1')));
    await assertFails(getDoc(doc(outsider, 'users', 'student-1')));
  });

  it('usuario nao autenticado nao le nada', async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'classes', 'class-1')));
    await assertFails(getDoc(doc(anon, 'users', 'student-1')));
    await assertFails(getDoc(doc(anon, 'academies', ACADEMY_A)));
  });
});
