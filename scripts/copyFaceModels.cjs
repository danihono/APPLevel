// Copia os modelos de reconhecimento facial (biblioteca Human) de node_modules para
// public/models/human/, de onde o app os baixa sob demanda. Roda antes de `dev` e `build`
// (hooks predev/prebuild), entao os binarios (~9 MB) nao precisam ficar no git.
const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, '..', 'node_modules', '@vladmandic', 'human', 'models');
const target = path.join(__dirname, '..', 'public', 'models', 'human');
// Deteccao do rosto, malha (alinhamento) e descritor (o "vetor" usado na comparacao).
const models = ['blazeface', 'facemesh', 'faceres'];

if (!fs.existsSync(source)) {
  console.error('Modelos faciais nao encontrados. Rode `npm install` na raiz do projeto.');
  process.exit(1);
}

fs.mkdirSync(target, { recursive: true });
for (const model of models) {
  for (const extension of ['json', 'bin']) {
    fs.copyFileSync(path.join(source, `${model}.${extension}`), path.join(target, `${model}.${extension}`));
  }
}
console.log(`Modelos faciais copiados para ${path.relative(process.cwd(), target)}`);
