import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  type User,
  updateEmail,
} from 'firebase/auth';
import { firebaseAuth } from './client';

export function subscribeToAuthState(listener: (user: User | null) => void) {
  return onAuthStateChanged(firebaseAuth, listener);
}

export async function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(firebaseAuth, email, password);
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
