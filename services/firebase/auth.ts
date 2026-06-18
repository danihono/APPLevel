import {
  confirmPasswordReset,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
  updateEmail,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { firebaseAuth } from './client';

export function subscribeToAuthState(listener: (user: User | null) => void) {
  return onAuthStateChanged(firebaseAuth, listener);
}

export async function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(firebaseAuth, email, password);
}

export async function requestPasswordReset(email: string) {
  return sendPasswordResetEmail(firebaseAuth, email.trim(), {
    url: window.location.origin,
  });
}

export async function verifyResetCode(oobCode: string): Promise<string> {
  return verifyPasswordResetCode(firebaseAuth, oobCode);
}

export async function applyPasswordReset(oobCode: string, newPassword: string) {
  return confirmPasswordReset(firebaseAuth, oobCode, newPassword);
}

export async function logout() {
  return signOut(firebaseAuth);
}

export async function updateSignedInEmail(currentPassword: string, nextEmail: string) {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser || !currentUser.email) {
    throw new Error('Sua sessao expirou. Entre novamente.');
  }

  const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
  await reauthenticateWithCredential(currentUser, credential);
  await updateEmail(currentUser, nextEmail.trim());
}

export async function reauthenticateCurrentUser(currentPassword: string) {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser || !currentUser.email) {
    throw new Error('Sua sessao expirou. Entre novamente.');
  }

  const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
  await reauthenticateWithCredential(currentUser, credential);
}
