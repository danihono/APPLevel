import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import nodemailer from 'nodemailer';
import { COLLECTIONS, UserDoc } from '../domain/models';
import { assertCondition } from '../lib/errors';
import { auth, db } from '../lib/firebase';
import { requiredString } from '../lib/payload';

// Credenciais da conta de e-mail da HostGator (ex.: contato@leveljiujitsu.com.br).
// O SMTP_USER tambem e o remetente das mensagens.
const smtpHost = defineSecret('SMTP_HOST');
const smtpUser = defineSecret('SMTP_USER');
const smtpPass = defineSecret('SMTP_PASS');

const callableOptions = {
  region: 'southamerica-east1',
  invoker: 'public' as const,
  secrets: [smtpHost, smtpUser, smtpPass],
};

const APP_URL = 'https://applevel-c5e73.web.app';
const RESET_PAGE_URL = `${APP_URL}/redefinir-senha/`;
const LOGO_URL = `${APP_URL}/email/level-mark.png`;
const SUPPORT_URL = `${APP_URL}/suporte/`;
const SENDER_NAME = 'LEVEL Jiu Jitsu';

const RATE_LIMIT_COLLECTION = 'password_reset_requests';
const MIN_INTERVAL_MS = 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getErrorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
}

// Reserva um envio para o e-mail. A funcao e publica e dispara e-mail: sem esse
// limite, qualquer um poderia lotar a caixa de entrada de um aluno.
async function reserveSendSlot(emailKey: string, now: number): Promise<void> {
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(emailKey);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const previous = (snap.data()?.sentAt as number[] | undefined) ?? [];
    const recent = previous.filter((timestamp) => now - timestamp < WINDOW_MS);

    assertCondition(
      !recent.some((timestamp) => now - timestamp < MIN_INTERVAL_MS),
      'resource-exhausted',
      'Ja enviamos um link agora ha pouco. Confira sua caixa de entrada (e o spam) ou aguarde 1 minuto para pedir outro.',
    );
    assertCondition(
      recent.length < MAX_PER_WINDOW,
      'resource-exhausted',
      'Muitos pedidos de redefinicao para este e-mail. Aguarde uma hora e tente de novo.',
    );

    transaction.set(ref, {
      sentAt: [...recent, now],
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function releaseSendSlot(emailKey: string, now: number): Promise<void> {
  try {
    await db.collection(RATE_LIMIT_COLLECTION).doc(emailKey).update({
      sentAt: FieldValue.arrayRemove(now),
    });
  } catch (error) {
    logger.warn('requestPasswordReset: nao foi possivel liberar o limite de envio', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildResetUrl(firebaseLink: string): string {
  const oobCode = new URL(firebaseLink).searchParams.get('oobCode');
  if (!oobCode) {
    throw new Error('Link de redefinicao gerado sem oobCode.');
  }

  const resetUrl = new URL(RESET_PAGE_URL);
  resetUrl.searchParams.set('oobCode', oobCode);
  return resetUrl.toString();
}

function buildEmailText(firstName: string, resetUrl: string): string {
  const greeting = firstName ? `Oss, ${firstName}!` : 'Oss!';

  return [
    greeting,
    '',
    'Recebemos um pedido para redefinir a senha da sua conta no LEVEL.',
    'Abra o link abaixo para criar uma senha nova:',
    '',
    resetUrl,
    '',
    'O link vale por 1 hora e só pode ser usado uma vez.',
    '',
    'Não pediu a troca? É só ignorar este e-mail: sua senha continua a mesma.',
    '',
    '— Equipe LEVEL Jiu Jitsu',
    `Ajuda: ${SUPPORT_URL}`,
  ].join('\n');
}

function buildEmailHtml(firstName: string, resetUrl: string): string {
  const greeting = firstName ? `Oss, ${escapeHtml(firstName)}!` : 'Oss!';
  const safeUrl = escapeHtml(resetUrl);
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Redefina sua senha</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;" bgcolor="#0a0a0a">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0a0a0a;">Crie uma senha nova para voltar ao tatame. O link vale por 1 hora.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a" style="background-color:#0a0a0a;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td align="center" style="padding:0 0 24px 0;">
            <img src="${LOGO_URL}" width="70" height="54" alt="" style="display:block;border:0;outline:none;text-decoration:none;margin:0 auto 12px auto;">
            <div style="font-family:${font};font-size:26px;font-weight:800;letter-spacing:8px;color:#E8AF48;line-height:1;">LEVEL</div>
            <div style="font-family:${font};font-size:11px;font-weight:600;letter-spacing:5px;color:#8a8a8a;line-height:1;padding-top:8px;">JIU JITSU</div>
          </td>
        </tr>
        <tr>
          <td bgcolor="#161616" style="background-color:#161616;border:1px solid #2a2a2a;border-radius:16px;padding:32px 28px;">
            <div style="font-family:${font};font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;padding-bottom:12px;">${greeting}</div>
            <div style="font-family:${font};font-size:15px;color:#c8c8c8;line-height:1.6;padding-bottom:28px;">Recebemos um pedido para redefinir a senha da sua conta no LEVEL. Toque no botão abaixo para criar uma senha nova.</div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
              <tr>
                <td align="center" bgcolor="#E8AF48" style="background-color:#E8AF48;border-radius:12px;">
                  <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${font};font-size:16px;font-weight:700;color:#0a0a0a;text-decoration:none;border-radius:12px;">Redefinir minha senha</a>
                </td>
              </tr>
            </table>
            <div style="font-family:${font};font-size:13px;color:#8a8a8a;line-height:1.6;padding-top:28px;text-align:center;">O link vale por <strong style="color:#c8c8c8;">1 hora</strong> e só pode ser usado uma vez.</div>
            <div style="border-top:1px solid #2a2a2a;margin-top:24px;padding-top:20px;font-family:${font};font-size:12px;color:#8a8a8a;line-height:1.6;">O botão não funcionou? Copie e cole este endereço no navegador:<br><a href="${safeUrl}" target="_blank" style="color:#E8AF48;text-decoration:underline;word-break:break-all;">${safeUrl}</a></div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 12px 0 12px;font-family:${font};font-size:12px;color:#6b6b6b;line-height:1.6;text-align:center;">
            Não pediu a troca? É só ignorar este e-mail: sua senha continua a mesma.<br>
            Dúvidas? <a href="${SUPPORT_URL}" target="_blank" style="color:#8a8a8a;text-decoration:underline;">Fale com a gente</a>.<br><br>
            © LEVEL Jiu Jitsu
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export const requestPasswordReset = onCall(callableOptions, async (request) => {
  const email = requiredString(request.data, 'email').trim();
  assertCondition(
    email.length <= 254 && EMAIL_PATTERN.test(email),
    'invalid-argument',
    'Informe um e-mail valido para receber o link de redefinicao.',
  );

  const emailKey = createHash('sha256').update(email.toLowerCase()).digest('hex');
  const now = Date.now();
  await reserveSendSlot(emailKey, now);

  // E-mail nao cadastrado ou conta desativada: responde sucesso sem enviar nada,
  // para a tela de login nao revelar quem tem conta.
  let uid: string;
  try {
    const userRecord = await auth.getUserByEmail(email);
    if (userRecord.disabled) {
      return { ok: true };
    }
    uid = userRecord.uid;
  } catch (error) {
    if (getErrorCode(error) === 'auth/user-not-found') {
      return { ok: true };
    }
    await releaseSendSlot(emailKey, now);
    throw error;
  }

  let firstName = '';
  try {
    const userSnap = await db.collection(COLLECTIONS.users).doc(uid).get();
    firstName = ((userSnap.data() as Partial<UserDoc> | undefined)?.firstName ?? '').trim();
  } catch (error) {
    logger.warn('requestPasswordReset: nao foi possivel ler o perfil para a saudacao', {
      uid,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const resetUrl = buildResetUrl(await auth.generatePasswordResetLink(email));
    const sender = smtpUser.value().trim();
    const transport = nodemailer.createTransport({
      host: smtpHost.value().trim(),
      port: 465,
      secure: true,
      auth: { user: sender, pass: smtpPass.value() },
    });

    await transport.sendMail({
      from: { name: SENDER_NAME, address: sender },
      to: email,
      subject: 'Redefina sua senha do LEVEL',
      text: buildEmailText(firstName, resetUrl),
      html: buildEmailHtml(firstName, resetUrl),
    });
  } catch (error) {
    await releaseSendSlot(emailKey, now);
    logger.error('requestPasswordReset: falha ao gerar ou enviar o e-mail', {
      uid,
      code: getErrorCode(error),
      message: error instanceof Error ? error.message : String(error),
    });
    throw new HttpsError(
      'unavailable',
      'Nao foi possivel enviar o e-mail agora. Tente novamente em alguns minutos.',
    );
  }

  return { ok: true };
});
