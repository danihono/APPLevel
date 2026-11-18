import { RekognitionClient } from '@aws-sdk/client-rekognition';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createFakeRekognitionClient } from './fakeRekognition';

// Chaves de um usuario IAM com permissao apenas para o Rekognition (ver docs/biometria-aws.md).
// Configurar com: firebase functions:secrets:set AWS_REKOGNITION_ACCESS_KEY_ID (e o SECRET).
export const awsRekognitionKeyId = defineSecret('AWS_REKOGNITION_ACCESS_KEY_ID');
export const awsRekognitionSecret = defineSecret('AWS_REKOGNITION_SECRET_ACCESS_KEY');
// Sao Paulo tem Rekognition limitado; us-east-1 tem todas as operacoes usadas.
export const awsRekognitionRegion = defineString('AWS_REKOGNITION_REGION', { default: 'us-east-1' });
export const awsRekognitionCollection = defineString('AWS_REKOGNITION_COLLECTION', { default: 'applevel-alunos' });

export const faceSecrets = [awsRekognitionKeyId, awsRekognitionSecret];

let client: RekognitionClient | null = null;

// Simulacao local: so no emulador e so com FACE_AWS_FAKE=1 (functions/.env.local).
const useFake = process.env.FUNCTIONS_EMULATOR === 'true' && process.env.FACE_AWS_FAKE === '1';

export function getRekognitionClient(): RekognitionClient {
  if (useFake) {
    return createFakeRekognitionClient() as unknown as RekognitionClient;
  }
  if (!client) {
    client = new RekognitionClient({
      region: awsRekognitionRegion.value(),
      maxAttempts: 4,
      credentials: {
        accessKeyId: awsRekognitionKeyId.value(),
        secretAccessKey: awsRekognitionSecret.value(),
      },
    });
  }
  return client;
}

export function getFaceCollectionId(): string {
  return awsRekognitionCollection.value();
}

export function getFaceRegion(): string {
  return awsRekognitionRegion.value();
}
