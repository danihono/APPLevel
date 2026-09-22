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
import { backendFunctions } from './functions';

export function subscribeToAuthState(listener: (user: User | null) => void) {
  return onAuthStateChanged(firebaseAuth, listener);
}

export async function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(firebaseAuth, email, password);
}

// O e-mail sai do nosso servidor (SMTP proprio, com o visual da LEVEL) e o link
// aponta para /redefinir-senha/, pagina que funciona ate no navegador embutido
// do Gmail/Instagram/WhatsApp.
export async function requestPasswordReset(email: string) {
  return backendFunctions.requestPasswordReset({ email: email.trim() });
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
