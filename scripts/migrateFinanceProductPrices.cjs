/**
 * Migracao: catalogo de produtos da Level (atacado).
 *
 * Converte cada documento de `finance_products` do modelo antigo (um unico
 * `salePrice` por filial) para o novo modelo:
 *   - salePriceFilial    = salePrice antigo
 *   - salePriceDiretoria = salePrice antigo
 *   - priceHistory       = [{ changedAt, purchasePrice, salePriceFilial, salePriceDiretoria }]
 *   - remove o campo `salePrice`
 *
 * O campo `academyId` e mantido (ignorado pelo app). Se a mesma filial tinha
 * produtos duplicados, eles continuam como produtos distintos no catalogo.
 *
 * Uso:
 *   node scripts/migrateFinanceProductPrices.cjs           (dry-run, nao grava)
 *   node scripts/migrateFinanceProductPrices.cjs --apply   (aplica as mudancas)
 */
const path = require('node:path');
const fs = require('node:fs');

const projectId = 'applevel-c5e73';
const apply = process.argv.includes('--apply');

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
      scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore openid email',
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

/** Converte um valor tipado do Firestore em numero. */
function readNumber(value) {
  if (!value) return 0;
  if (value.doubleValue != null) return Number(value.doubleValue);
  if (value.integerValue != null) return Number(value.integerValue);
  return 0;
}

async function listProducts(accessToken) {
  const docs = [];
  let pageToken;

  do {
    const url = new URL(`${documentsBase}/finance_products`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Falha ao listar finance_products: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    docs.push(...(payload.documents || []));
    pageToken = payload.nextPageToken;
  } while (pageToken);

  return docs;
}

async function patchProduct(accessToken, doc, salePrice, purchasePrice, nowIso) {
  const url = new URL(`https://firestore.googleapis.com/v1/${doc.name}`);
  for (const field of ['salePriceFilial', 'salePriceDiretoria', 'priceHistory', 'salePrice', 'updatedAt']) {
    url.searchParams.append('updateMask.fieldPaths', field);
  }

  const priceEntry = {
    mapValue: {
      fields: {
        changedAt: { timestampValue: nowIso },
        purchasePrice: { doubleValue: purchasePrice },
        salePriceFilial: { doubleValue: salePrice },
        salePriceDiretoria: { doubleValue: salePrice },
      },
    },
  };

  // `salePrice` esta no updateMask mas ausente do corpo => o campo e removido.
  const body = {
    fields: {
      salePriceFilial: { doubleValue: salePrice },
      salePriceDiretoria: { doubleValue: salePrice },
      priceHistory: { arrayValue: { values: [priceEntry] } },
      updatedAt: { timestampValue: nowIso },
    },
  };

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Falha ao migrar ${doc.name}: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  console.log(apply ? 'Modo: APLICAR alteracoes.' : 'Modo: DRY-RUN (use --apply para gravar).');
  const accessToken = await getAccessToken();
  const docs = await listProducts(accessToken);
  console.log(`${docs.length} produto(s) encontrado(s).`);

  const nowIso = new Date().toISOString();
  let migrated = 0;
  let skipped = 0;

  for (const doc of docs) {
    const fields = doc.fields || {};
    const id = doc.name.split('/').pop();

    if (fields.salePriceFilial) {
      console.log(`- ${id}: ja migrado, ignorando.`);
      skipped += 1;
      continue;
    }

    const salePrice = readNumber(fields.salePrice);
    const purchasePrice = readNumber(fields.purchasePrice);
    console.log(`- ${id}: salePrice ${salePrice} -> Filial/Diretoria ${salePrice}`);

    if (apply) {
      await patchProduct(accessToken, doc, salePrice, purchasePrice, nowIso);
    }
    migrated += 1;
  }

  console.log(`Concluido. ${migrated} migrado(s), ${skipped} ignorado(s).`);
  if (!apply && migrated > 0) {
    console.log('Nada foi gravado. Rode novamente com --apply para aplicar.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
