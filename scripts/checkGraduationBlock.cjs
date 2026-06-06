/**
 * Diagnostico (somente leitura): mostra, para os alunos com pendencia de
 * graduacao, se eles estariam bloqueados pela nova regra
 * (lastGradeApprovalAt ?? lastStripeDateOverride vs lastAttendanceAt).
 */
const path = require('node:path');
const fs = require('node:fs');

const projectId = 'applevel-c5e73';
const firebaseToolsConfigPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.config', 'configstore', 'firebase-tools.json',
);

async function getAccessToken() {
  const config = JSON.parse(fs.readFileSync(firebaseToolsConfigPath, 'utf8'));
  const refreshToken = config?.tokens?.refresh_token;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/token', {
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
  if (!res.ok) throw new Error(`token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const ts = (v) => (v && v.timestampValue) ? v.timestampValue : null;
const str = (v) => (v && v.stringValue) ? v.stringValue : '';

(async () => {
  const token = await getAccessToken();
  // pendentes
  const reqRes = await fetch(`${base}/graduation_requests?pageSize=300`, { headers: { Authorization: `Bearer ${token}` } });
  const reqs = (await reqRes.json()).documents || [];
  const pending = reqs.filter((d) => str(d.fields?.status) === 'pending');

  for (const r of pending) {
    const userId = str(r.fields.userId);
    const uRes = await fetch(`${base}/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!uRes.ok) { console.log(`${str(r.fields.userDisplayName)} | user ${userId} NAO ENCONTRADO`); continue; }
    const f = (await uRes.json()).fields || {};
    const approvalMark = ts(f.lastGradeApprovalAt) ?? ts(f.lastStripeDateOverride);
    const lastAtt = ts(f.lastAttendanceAt);
    const approvalMs = approvalMark ? Date.parse(approvalMark) : null;
    const lastAttMs = lastAtt ? Date.parse(lastAtt) : null;
    const blocked = approvalMs !== null && !(lastAttMs !== null && lastAttMs > approvalMs);
    console.log(`${str(r.fields.userDisplayName)}`);
    console.log(`  lastGradeApprovalAt = ${ts(f.lastGradeApprovalAt) ?? '(vazio)'}`);
    console.log(`  lastStripeDateOverride = ${ts(f.lastStripeDateOverride) ?? '(vazio)'}`);
    console.log(`  lastAttendanceAt = ${lastAtt ?? '(vazio)'}`);
    console.log(`  => marca usada = ${approvalMark ?? '(nenhuma)'} | BLOQUEADO = ${blocked}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
