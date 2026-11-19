#!/usr/bin/env node
// Teste LOCAL da chamada por foto: liga uma copia do app no seu computador com um Firebase
// SIMULADO (emuladores, projeto "demo-applevel"). Nao publica nada e nao toca no app de verdade:
// contas, aulas e presencas daqui so existem nesta maquina e somem ao fechar.
//
// Uso:  npm run biometria:teste-local      (Ctrl+C para encerrar)
// Precisa de: Firebase CLI (`npm i -g firebase-tools`) e Java 11+ (usado pelo emulador do banco).
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const PROJECT = 'demo-applevel';
const PASSWORD = 'teste123';
const isWindows = process.platform === 'win32';
const children = [];

function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, shell: isWindows, stdio: options.stdio ?? 'inherit', env: { ...process.env, ...options.env } });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    if (!child.killed) child.kill(isWindows ? undefined : 'SIGINT');
  }
}
process.on('SIGINT', () => { stopAll(); process.exit(0); });
process.on('exit', stopAll);

function check(command, args, message) {
  const result = spawnSync(command, args, { shell: isWindows, encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(message);
    process.exit(1);
  }
}

async function waitFor(url, label, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw new Error(`${label} nao respondeu a tempo.`);
}

async function seed() {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  const admin = require(path.join(root, 'functions', 'node_modules', 'firebase-admin'));
  admin.initializeApp({ projectId: PROJECT });
  const db = admin.firestore();
  const auth = admin.auth();
  const now = admin.firestore.Timestamp.now();
  const academyId = 'academia-teste';

  await db.collection('academies').doc(academyId).set({
    id: academyId, name: 'Academia Teste (local)', slug: 'teste-local', ownerUserId: 'professor', status: 'active',
    timezone: 'America/Sao_Paulo', classCheckinWindowMinutes: 30, masterBlackLimit: 0,
    faceAttendanceEnabled: true, createdAt: now, updatedAt: now,
  });

  const base = {
    academyId, cpf: '', status: 'active', belt: 'white', stripes: 0, grade: 0, attendanceCount: 0, qrCheckinsCount: 0,
    currentStreak: 0, longestStreak: 0, competitionPoints: 0, missionPoints: 0, rankingPoints: 0, beltPromotions: 0,
    createdAt: now, updatedAt: now,
  };
  const people = [
    ['professor', 'professor', 'Professor Teste'],
    ['aluno1', 'student', 'Aluno Um'],
    ['aluno2', 'student', 'Aluno Dois'],
    ['aluno3', 'student', 'Aluno Tres'],
  ];
  for (const [uid, role, displayName] of people) {
    const email = `${uid}@teste.local`;
    try { await auth.deleteUser(uid); } catch { /* ainda nao existe */ }
    await auth.createUser({ uid, email, password: PASSWORD });
    await auth.setCustomUserClaims(uid, { role, academyId });
    const [firstName, ...rest] = displayName.split(' ');
    await db.collection('users').doc(uid).set({
      ...base, role, email, displayName, firstName, lastName: rest.join(' '), birthDate: '1990-01-01',
    });
    // Ranking ja criado: no 1o login o app sincroniza o usuario em chamadas paralelas e, sem
    // este registro, cada uma criaria o seu (aviso "mais de um documento").
    await db.collection('rankings').doc(`teste-${uid}`).set({
      academyId, userId: uid, displayName, belt: 'white', score: 0, position: 0,
      attendancePoints: 0, consistencyPoints: 0, competitionPoints: 0, missionPoints: 0, updatedAt: now,
    });
  }

  // Aula ativa agora, para o professor fazer a chamada por foto.
  const start = admin.firestore.Timestamp.fromMillis(Date.now() - 10 * 60000);
  await db.collection('classes').doc('aula-teste').set({
    academyId, title: 'Aula de teste', professorId: 'professor', professorName: 'Professor Teste', tatame: 'Tatame 1',
    status: 'active', scheduledStart: start, scheduledEnd: admin.firestore.Timestamp.fromMillis(Date.now() + 3 * 3600000),
    startedAt: start, currentAttendanceCount: 0, checkinWindowMinutes: 30, createdAt: now, updatedAt: now,
  });
}

(async () => {
  check('firebase', ['--version'], 'Firebase CLI nao encontrado. Instale com: npm install -g firebase-tools');
  check('java', ['-version'], 'Java nao encontrado. O emulador do banco precisa do Java 11 ou mais novo (https://adoptium.net).');

  console.log('\n1/3 Compilando as functions...');
  check('npm', ['--prefix', 'functions', 'run', 'build'], 'Falha ao compilar as functions. Rode antes: npm --prefix functions install');

  console.log('2/3 Ligando o Firebase simulado (pode levar 1 minuto)...');
  run('firebase', ['emulators:start', '--only', 'functions,firestore,auth', '--project', PROJECT], { stdio: 'ignore' });
  await waitFor('http://127.0.0.1:8080/', 'Banco simulado');
  await waitFor('http://127.0.0.1:9099/', 'Login simulado');
  await waitFor('http://127.0.0.1:5001/', 'Functions simuladas');
  await new Promise((resolve) => setTimeout(resolve, 8000));
  await seed();

  console.log('3/3 Abrindo o app de teste...');
  run('npx', ['vite', '--port', '3000', '--strictPort'], {
    env: {
      VITE_USE_FIREBASE_EMULATORS: 'true',
      VITE_FIREBASE_PROJECT_ID: PROJECT,
      VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
      VITE_FIREBASE_STORAGE_BUCKET: `${PROJECT}.appspot.com`,
    },
  });

  console.log(`
==============================================================
 TESTE LOCAL DA CHAMADA POR FOTO — nada aqui vai para o app real
==============================================================
 Abra no navegador do computador:  http://localhost:3000

 Senha de todas as contas:  ${PASSWORD}
   Alunos:     aluno1@teste.local  aluno2@teste.local  aluno3@teste.local
   Professor:  professor@teste.local   (ja tem uma "Aula de teste" ativa)

 1. Entre como aluno, toque em "Cadastrar biometria facial" e siga o video (webcam).
    Faca um aluno para cada pessoa (voce, o dono...).
 2. Saia, entre como professor: Aulas → Aula de teste → Presencas → Chamada por foto
    → envie uma foto de voces juntos (tirada no celular e passada para o PC).
 3. Ctrl+C aqui no terminal encerra tudo (e apaga os dados de teste).
==============================================================
`);
})().catch((error) => {
  console.error('\nNao foi possivel ligar o teste local:', error.message);
  stopAll();
  process.exit(1);
});
