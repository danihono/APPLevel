/**
 * Testes das regras do Storage contra o emulador.
 *
 * Cobre V6 da auditoria: antes desta correcao NAO havia nenhuma checagem de
 * `request.resource.size` nem de `contentType` no arquivo inteiro. Qualquer usuario
 * autenticado subia arquivos de tamanho e tipo arbitrarios em `users/{uid}/**`, uma
 * pasta que e legivel por todos os autenticados de todos os tenants.
 *
 * Execucao:
 *   npm run test:rules:storage
 */
import { after, before, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes } from 'firebase/storage';

const ACADEMY_A = 'academy-a';
let testEnv: RulesTestEnvironment;

const student = () => testEnv.authenticatedContext('student-1', { role: 'student', academyId: ACADEMY_A }).storage();
const professor = () => testEnv.authenticatedContext('prof-1', { role: 'professor', academyId: ACADEMY_A }).storage();

const bytes = (size: number) => new Uint8Array(size);

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'applevel-rules-test',
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

describe('V6 — limites de upload em users/{uid}', () => {
  it('foto de perfil dentro do limite e aceita', async () => {
    await assertSucceeds(uploadBytes(
      ref(student(), 'users/student-1/profile-1.jpg'),
      bytes(64 * 1024),
      { contentType: 'image/jpeg' },
    ));
  });

  it('imagem ACIMA de 5 MB e recusada (DoS de custo de armazenamento)', async () => {
    await assertFails(uploadBytes(
      ref(student(), 'users/student-1/profile-grande.jpg'),
      bytes(6 * 1024 * 1024),
      { contentType: 'image/jpeg' },
    ));
  });

  it('tipo nao-imagem e recusado (hospedagem de conteudo arbitrario)', async () => {
    await assertFails(uploadBytes(
      ref(student(), 'users/student-1/payload.html'),
      bytes(1024),
      { contentType: 'text/html' },
    ));
    await assertFails(uploadBytes(
      ref(student(), 'users/student-1/script.js'),
      bytes(1024),
      { contentType: 'application/javascript' },
    ));
  });

  it('aluno nao escreve na pasta de outro usuario', async () => {
    await assertFails(uploadBytes(
      ref(student(), 'users/outro-aluno/profile.jpg'),
      bytes(1024),
      { contentType: 'image/jpeg' },
    ));
  });

  it('video de luta continua permitido no caminho proprio', async () => {
    await assertSucceeds(uploadBytes(
      ref(student(), 'users/student-1/fight-videos/luta.mp4'),
      bytes(256 * 1024),
      { contentType: 'video/mp4' },
    ));
  });

  it('arquivo nao-video na pasta de videos e recusado', async () => {
    await assertFails(uploadBytes(
      ref(student(), 'users/student-1/fight-videos/payload.html'),
      bytes(1024),
      { contentType: 'text/html' },
    ));
  });
});

describe('V6 — assets de academia', () => {
  it('staff envia asset permitido na propria academia', async () => {
    await assertSucceeds(uploadBytes(
      ref(professor(), `academies/${ACADEMY_A}/banners/banner.png`),
      bytes(128 * 1024),
      { contentType: 'image/png' },
    ));
  });

  it('staff nao envia executavel disfarcado', async () => {
    await assertFails(uploadBytes(
      ref(professor(), `academies/${ACADEMY_A}/banners/app.exe`),
      bytes(1024),
      { contentType: 'application/x-msdownload' },
    ));
  });

  it('staff nao escreve em academia de outro tenant', async () => {
    await assertFails(uploadBytes(
      ref(professor(), 'academies/academy-b/banners/banner.png'),
      bytes(1024),
      { contentType: 'image/png' },
    ));
  });

  it('staff nao escreve na arvore de learning (reservada ao superadmin)', async () => {
    await assertFails(uploadBytes(
      ref(professor(), `academies/${ACADEMY_A}/learning/lessons/l1/aula.mp4`),
      bytes(1024),
      { contentType: 'video/mp4' },
    ));
  });
});

describe('V6 — site/faixas', () => {
  it('nao-superadmin nao escreve nas imagens institucionais', async () => {
    await assertFails(uploadBytes(
      ref(professor(), 'site/faixas/preta.png'),
      bytes(1024),
      { contentType: 'image/png' },
    ));
  });
});
