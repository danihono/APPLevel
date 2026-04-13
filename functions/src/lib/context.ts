import type { CallableRequest } from 'firebase-functions/v2/https';
import { COLLECTIONS, ROLE_ORDER, type Role, type UserDoc } from '../domain/models';
import { assertCondition } from './errors';
import { db } from './firebase';

type WhereClause = [string | FirebaseFirestore.FieldPath, FirebaseFirestore.WhereFilterOp, unknown];

export interface RequestContext {
  uid: string;
  role: Role;
  academyId: string;
  user: UserDoc;
}

function normalizeRole(role: Role): Role {
  return role === 'admin' ? 'professor' : role;
}

function hasRole(role: string): role is Role {
  return ROLE_ORDER.includes(role as Role);
}

function roleRank(role: Role): number {
  return ROLE_ORDER.indexOf(role);
}

function ensureMinimumRole(actualRole: Role, minimumRole: Role): void {
  assertCondition(
    roleRank(actualRole) >= roleRank(minimumRole),
    'permission-denied',
    'Voce nao tem permissao para executar esta operacao.',
  );
}

export async function getUserDoc(userId: string): Promise<UserDoc> {
  const userSnapshot = await db.collection(COLLECTIONS.users).doc(userId).get();
  assertCondition(userSnapshot.exists, 'not-found', 'Usuario nao encontrado.');
  return userSnapshot.data() as UserDoc;
}

export async function getRequestContext(
  request: CallableRequest<unknown>,
  minimumRole: Role,
): Promise<RequestContext> {
  const uid = request.auth?.uid;
  assertCondition(!!uid, 'unauthenticated', 'Autenticacao obrigatoria.');

  const user = await getUserDoc(uid);
  assertCondition(hasRole(user.role), 'failed-precondition', 'O perfil do usuario esta sem role valida.');
  const role = normalizeRole(user.role);
  ensureMinimumRole(role, normalizeRole(minimumRole));
  assertCondition(
    role === 'superadmin' || user.academyId.trim().length > 0,
    'failed-precondition',
    'O usuario precisa estar vinculado a uma academia.',
  );
  const normalizedUser = role === user.role
    ? user
    : { ...user, role };

  return {
    uid,
    role,
    academyId: user.academyId,
    user: normalizedUser,
  };
}

export async function findSingleByFields<T>(
  collectionName: string,
  clauses: WhereClause[],
): Promise<{ id: string; data: T } | undefined> {
  let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db.collection(collectionName);

  for (const [fieldPath, operator, value] of clauses) {
    query = query.where(fieldPath as never, operator, value);
  }

  const snapshot = await query.limit(2).get();
  assertCondition(
    snapshot.size <= 1,
    'failed-precondition',
    'A consulta retornou mais de um documento quando apenas um era esperado.',
  );

  if (snapshot.empty) {
    return undefined;
  }

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    data: doc.data() as T,
  };
}
