#!/usr/bin/env node
// Confere se as chaves e a regiao da AWS estao prontas para a chamada por foto.
// Roda no SEU computador, antes do deploy. Nao envia nenhuma foto de aluno.
//
// Uso (as chaves sao as do usuario IAM criado em docs/biometria-aws.md):
//   AWS_REKOGNITION_ACCESS_KEY_ID=... AWS_REKOGNITION_SECRET_ACCESS_KEY=... npm run face:aws-check
// Opcional: AWS_REKOGNITION_REGION (padrao us-east-1) e AWS_REKOGNITION_COLLECTION (padrao applevel-alunos).
const path = require('node:path');

let sdk;
let sharp;
try {
  sdk = require(path.join(__dirname, '..', 'functions', 'node_modules', '@aws-sdk', 'client-rekognition'));
  sharp = require(path.join(__dirname, '..', 'functions', 'node_modules', 'sharp'));
} catch {
  console.error('Rode antes: npm --prefix functions install');
  process.exit(1);
}

const keyId = process.env.AWS_REKOGNITION_ACCESS_KEY_ID;
const secret = process.env.AWS_REKOGNITION_SECRET_ACCESS_KEY;
const region = process.env.AWS_REKOGNITION_REGION || 'us-east-1';
const collectionId = process.env.AWS_REKOGNITION_COLLECTION || 'applevel-alunos';

if (!keyId || !secret) {
  console.error('Defina AWS_REKOGNITION_ACCESS_KEY_ID e AWS_REKOGNITION_SECRET_ACCESS_KEY (veja docs/biometria-aws.md).');
  process.exit(1);
}

const client = new sdk.RekognitionClient({ region, credentials: { accessKeyId: keyId, secretAccessKey: secret } });

function explain(error) {
  const name = error && error.name;
  if (name === 'UnrecognizedClientException' || name === 'InvalidSignatureException') return 'chave de acesso invalida (confira o ID e o segredo).';
  if (name === 'AccessDeniedException') return 'o usuario IAM nao tem permissao para esta acao (confira a politica do passo 2).';
  if (name === 'ENOTFOUND' || /getaddrinfo/.test(String(error && error.message))) return `regiao ${region} sem Rekognition ou sem internet.`;
  return `${name || 'erro'}: ${error && error.message}`;
}

async function step(label, fn) {
  try {
    const detail = await fn();
    console.log(`  OK   ${label}${detail ? ` (${detail})` : ''}`);
    return true;
  } catch (error) {
    console.log(`  ERRO ${label}: ${explain(error)}`);
    return false;
  }
}

(async () => {
  console.log(`Verificando AWS Rekognition na regiao ${region}, colecao "${collectionId}"...\n`);
  let ok = true;

  ok = await step('colecao existe ou foi criada', async () => {
    try {
      const info = await client.send(new sdk.DescribeCollectionCommand({ CollectionId: collectionId }));
      return `${info.FaceCount ?? 0} rostos, ${info.UserCount ?? 0} alunos`;
    } catch (error) {
      if (error.name !== 'ResourceNotFoundException') throw error;
      await client.send(new sdk.CreateCollectionCommand({ CollectionId: collectionId }));
      return 'criada agora';
    }
  }) && ok;

  // Imagem sem rosto, gerada aqui: so prova que a deteccao responde nesta regiao.
  const blank = await sharp({ create: { width: 320, height: 320, channels: 3, background: '#808080' } }).jpeg().toBuffer();
  ok = await step('deteccao de rostos responde', async () => {
    const result = await client.send(new sdk.DetectFacesCommand({ Image: { Bytes: blank } }));
    return `${(result.FaceDetails || []).length} rostos numa imagem vazia, como esperado`;
  }) && ok;

  ok = await step('busca de alunos na colecao', async () => {
    const result = await client.send(new sdk.ListUsersCommand({ CollectionId: collectionId, MaxResults: 1 }));
    return `${(result.Users || []).length ? 'ja ha alunos cadastrados' : 'colecao vazia'}`;
  }) && ok;

  console.log(ok
    ? '\nTudo certo. Proximo passo: gravar as chaves no Firebase (passo 4 do docs/biometria-aws.md).'
    : '\nCorrija os itens com ERRO antes do deploy.');
  process.exit(ok ? 0 : 1);
})();
