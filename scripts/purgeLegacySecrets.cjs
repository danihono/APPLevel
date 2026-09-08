/**
 * Remediacao de dados legados apontados pela auditoria de seguranca.
 *
 * As correcoes de codigo impedem NOVAS gravacoes, mas os documentos ja existentes
 * em producao continuam carregando os campos sensiveis. Este script os apaga:
 *
 *   1. users.plainPassword    - senha em texto puro, legivel por qualquer staff
 *                               da academia (e exibida na UI antes da correcao).
 *   2. classes.activeQrToken  - token do QR em texto puro, legivel por qualquer
 *                               aluno da academia; permitia check-in remoto.
 *
 * Usa o token do Firebase CLI (mesmo padrao dos demais scripts desta pasta).
 * O acesso e via REST com credencial de owner, entao IGNORA firestore.rules.
 *
 * >>> DRY-RUN POR PADRAO. Nada e alterado sem --apply. <<<
 *
 * Uso:
 *   node scripts/purgeLegacySecrets.cjs                 (so relata o que existe)
 *   node scripts/purgeLegacySecrets.cjs --apply         (apaga de verdade)
 *   node scripts/purgeLegacySecrets.cjs --only=users    (limita a uma colecao)
 *   node scripts/purgeLegacySecrets.cjs --only=classes
 *
 * IMPORTANTE: apagar `plainPassword` NAO invalida as senhas que ja vazaram.
 * Todas as contas que tiveram a senha armazenada devem ter a senha ROTACIONADA.
 * Rode com --apply e depois exija troca de senha para os instrutores afetados.
 */
const path = require('node:path');
const fs = require('node:fs');

const projectId = 'applevel-c5e73';
const apply = process.argv.includes('--apply');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1] : null;

const TARGETS = [
  { collection: 'users', field: 'plainPassword', label: 'senha em texto puro' },
  { collection: 'classes', field: 'activeQrToken', label: 'token do QR em texto puro' },
];

const firebaseToolsConfigPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.config',
  'configstore',
  'firebase-tools.json',
);

async function getAccessToken() {
  const rawConfig = fs.readFileSync(firebaseToolsConfigPath, 'utf8');
  const config = JSON.parse(rawConfig);
  const refreshToken = config?.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error('Refresh token do Firebase CLI nao encontrado. Rode "firebase login".');
  }

  const tokenResponse = await fetch('https://www.googleapis.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      grant_type: 'refresh_token',
      scope: 'https://www.googleapis.com/auth/cloud-platform openid email',
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Falha ao renovar access token: ${tokenResponse.status} ${await tokenResponse.text()}`);
  }
  const tokenPayload = await tokenResponse.json();
  if (!tokenPayload.access_token) {
    throw new Error('A renovacao do access token nao retornou token valido.');
  }
  return tokenPayload.access_token;
}

const documentsBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

async function listAll(accessToken, collection) {
  const docs = [];
  let pageToken = '';
  do {
    const url = new URL(`${documentsBase}/${collection}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      throw new Error(`Falha ao listar ${collection}: ${response.status} ${await response.text()}`);
    }
    const payload = await response.json();
    docs.push(...(payload.documents || []));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  return docs;
}

/**
 * Apaga UM campo do documento. `updateMask` sem o campo correspondente em
 * `fields` remove aquele campo e preserva todo o resto do documento.
 */
async function deleteField(accessToken, docName, field) {
  const url = new URL(`https://firestore.googleapis.com/v1/${docName}`);
  url.searchParams.append('updateMask.fieldPaths', field);

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: {} }),
  });
  if (!response.ok) {
    throw new Error(`Falha ao limpar ${field} em ${docName}: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  const accessToken = await getAccessToken();

  console.log(apply
    ? '>>> MODO --apply: os campos serao APAGADOS em producao.\n'
    : '>>> DRY-RUN: nada sera alterado. Use --apply para executar de verdade.\n');

  let totalAffected = 0;

  for (const target of TARGETS) {
    if (only && only !== target.collection) continue;

    const docs = await listAll(accessToken, target.collection);
    const affected = docs.filter((doc) => doc.fields && doc.fields[target.field] !== undefined);

    console.log(`[${target.collection}.${target.field}] ${target.label}`);
    console.log(`  documentos na colecao: ${docs.length}`);
    console.log(`  documentos com o campo: ${affected.length}`);

    for (const doc of affected) {
      const id = doc.name.split('/').pop();
      if (apply) {
        await deleteField(accessToken, doc.name, target.field);
        console.log(`  apagado: ${id}`);
      } else {
        console.log(`  seria apagado: ${id}`);
      }
    }
    console.log('');
    totalAffected += affected.length;
  }

  if (totalAffected === 0) {
    console.log('Nada a fazer: nenhum documento carrega os campos legados.');
    return;
  }

  if (apply) {
    console.log(`Concluido. ${totalAffected} campo(s) removido(s).`);
    console.log('\nATENCAO: apagar o campo nao invalida as senhas que ja foram expostas.');
    console.log('Rotacione a senha de TODAS as contas que tinham plainPassword armazenado.');
  } else {
    console.log(`${totalAffected} campo(s) seriam removidos. Rode com --apply para executar.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
