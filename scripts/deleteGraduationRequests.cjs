/**
 * Exclui documentos especificos de `graduation_requests` por ID.
 *
 * Usa o token do Firebase CLI (mesmo padrao de migrateFinanceProductPrices.cjs).
 *
 * Uso:
 *   node scripts/deleteGraduationRequests.cjs <id1> <id2> ...            (dry-run)
 *   node scripts/deleteGraduationRequests.cjs --apply <id1> <id2> ...    (apaga)
 */
const path = require('node:path');
const fs = require('node:fs');

const projectId = 'applevel-c5e73';
const apply = process.argv.includes('--apply');
const ids = process.argv.slice(2).filter((arg) => arg !== '--apply');

if (ids.length === 0) {
  console.error('Informe ao menos um ID de documento. Ex.: node scripts/deleteGraduationRequests.cjs --apply abc123');
  process.exit(1);
}

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

function s(v) {
  if (!v) return '';
  if (v.stringValue != null) return v.stringValue;
  if (v.integerValue != null) return String(v.integerValue);
  return '';
}

async function getDoc(accessToken, id) {
  const response = await fetch(`${documentsBase}/graduation_requests/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Falha ao ler ${id}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function deleteDoc(accessToken, id) {
  const response = await fetch(`${documentsBase}/graduation_requests/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Falha ao apagar ${id}: ${response.status} ${await response.text()}`);
  }
}

(async () => {
  const accessToken = await getAccessToken();
  console.log(`Modo: ${apply ? 'APLICAR (apaga de verdade)' : 'DRY-RUN (nao apaga)'}`);
  console.log(`IDs alvo: ${ids.join(', ')}\n`);

  for (const id of ids) {
    const doc = await getDoc(accessToken, id);
    if (!doc) {
      console.log(`- ${id} | NAO ENCONTRADO (ja removido?)`);
      continue;
    }
    const f = doc.fields || {};
    const desc = `${s(f.userDisplayName)} | status=${s(f.status)} | ${s(f.currentBelt)}/${s(f.currentStripes)}g -> ${s(f.targetType)} ${s(f.targetBelt)}/${s(f.targetStripes)}g`;
    if (apply) {
      await deleteDoc(accessToken, id);
      console.log(`- ${id} | APAGADO | ${desc}`);
    } else {
      console.log(`- ${id} | seria apagado | ${desc}`);
    }
  }

  console.log(`\n${apply ? 'Concluido.' : 'Dry-run concluido. Rode com --apply para apagar.'}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
