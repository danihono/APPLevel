/**
 * Leitura (somente lista, NAO apaga) dos documentos de `graduation_requests`.
 *
 * Usa o token do Firebase CLI (mesmo padrao de migrateFinanceProductPrices.cjs).
 *
 * Uso:
 *   node scripts/listGraduationRequests.cjs              (lista pendentes)
 *   node scripts/listGraduationRequests.cjs --all        (lista todos os status)
 */
const path = require('node:path');
const fs = require('node:fs');

const projectId = 'applevel-c5e73';
const showAll = process.argv.includes('--all');

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
  if (v.timestampValue != null) return v.timestampValue;
  if (v.booleanValue != null) return String(v.booleanValue);
  return '';
}

async function listAll(accessToken) {
  const docs = [];
  let pageToken;
  do {
    const url = new URL(`${documentsBase}/graduation_requests`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      throw new Error(`Falha ao listar graduation_requests: ${response.status} ${await response.text()}`);
    }
    const payload = await response.json();
    docs.push(...(payload.documents || []));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return docs;
}

(async () => {
  const accessToken = await getAccessToken();
  const docs = await listAll(accessToken);

  const rows = docs.map((doc) => {
    const f = doc.fields || {};
    return {
      id: doc.name.split('/').pop(),
      aluno: s(f.userDisplayName),
      status: s(f.status),
      atual: `${s(f.currentBelt)}/${s(f.currentStripes)}g`,
      alvo: `${s(f.targetType)} ${s(f.targetBelt)}/${s(f.targetStripes)}g`,
      restam: s(f.remainingClasses),
      atualizado: s(f.updatedAt),
    };
  });

  const filtered = showAll ? rows : rows.filter((r) => r.status === 'pending');
  filtered.sort((a, b) => (b.atualizado || '').localeCompare(a.atualizado || ''));

  const counts = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  console.log(`Total de graduation_requests: ${rows.length}`);
  console.log(`Por status: ${JSON.stringify(counts)}`);
  console.log(`Exibindo ${showAll ? 'TODOS' : 'apenas status=pending'} (${filtered.length}):\n`);
  for (const r of filtered) {
    console.log(`${r.id} | ${r.aluno} | ${r.status} | atual ${r.atual} -> ${r.alvo} | restam ${r.restam} | ${r.atualizado}`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
