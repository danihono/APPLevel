import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
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
