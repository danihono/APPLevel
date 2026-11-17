// Publica a PAGINA DE TESTE da biometria facial (tools/teste-biometria) num link de
// pre-visualizacao do Firebase Hosting, separado do site oficial e com validade de 7 dias.
// Nao publica o app, nao mexe no site oficial, nas Cloud Functions nem no banco: a pagina roda
// so no navegador e nao salva nada.
//
// Uso:  npm run demo:biometria            -> publica e mostra o link
//       npm run demo:biometria -- --local -> so monta a pasta e abre em http://localhost:5050
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const out = path.join(root, '.face-demo-dist');
const human = path.join(root, 'node_modules', '@vladmandic', 'human');
const local = process.argv.includes('--local');

if (!fs.existsSync(human)) {
  console.error('Biblioteca de reconhecimento facial nao encontrada. Rode `npm install` na raiz do projeto.');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'models'), { recursive: true });
fs.copyFileSync(path.join(root, 'tools', 'teste-biometria', 'index.html'), path.join(out, 'index.html'));
fs.copyFileSync(path.join(human, 'dist', 'human.esm.js'), path.join(out, 'human.esm.js'));
for (const model of ['blazeface', 'facemesh', 'faceres']) {
  for (const ext of ['json', 'bin']) {
    fs.copyFileSync(path.join(human, 'models', `${model}.${ext}`), path.join(out, 'models', `${model}.${ext}`));
  }
}

// Config propria: so hosting, apontando para a pasta da pagina de teste.
const configPath = path.join(out, 'firebase.json');
fs.writeFileSync(configPath, JSON.stringify({
  hosting: { public: '.', ignore: ['firebase.json'] },
  emulators: { hosting: { port: 5050 }, ui: { enabled: false } },
}, null, 2));

const args = local
  ? ['emulators:start', '--only', 'hosting', '--config', configPath, '--project', 'demo-teste-biometria']
  : ['hosting:channel:deploy', 'teste-biometria', '--expires', '7d', '--config', configPath,
    '--project', 'applevel-c5e73', '--non-interactive'];

console.log(local
  ? 'Abrindo a pagina de teste em http://localhost:5050 (Ctrl+C para parar)...'
  : 'Publicando a pagina de teste num link de pre-visualizacao (valido por 7 dias)...');

const result = spawnSync('firebase', args, { stdio: 'inherit', cwd: out, shell: process.platform === 'win32' });
if (result.error) {
  console.error('Nao foi possivel rodar o Firebase CLI. Instale com `npm install -g firebase-tools` e faca `firebase login`.');
  process.exit(1);
}
process.exit(result.status ?? 0);
