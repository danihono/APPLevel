import { createHash, randomBytes } from 'node:crypto';

export function generateQrToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hashQrToken(token: string): string {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

export function buildQrPayload(payload: {
  academyId: string;
  classId: string;
  expiresAt: string;
  token: string;
}): string {
  return JSON.stringify(payload);
}
