import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth'
import { getFirebase } from './config.ts'

export type AuthStatus =
  | { state: 'loading' }
  | { state: 'authed'; user: User }
  | { state: 'guest' }

export function onAuthState(callback: (status: AuthStatus) => void): () => void {
  const { auth } = getFirebase()
  return onAuthStateChanged(
    auth,
    (user) => callback(user ? { state: 'authed', user } : { state: 'guest' }),
    () => callback({ state: 'guest' }),
  )
}

export function currentUser(): User | null {
  const { auth } = getFirebase()
  return auth.currentUser
}

export async function registerWithEmail(email: string, password: string): Promise<User> {
  const { auth } = getFirebase()
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
  return cred.user
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const { auth } = getFirebase()
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
  return cred.user
}

export async function logout(): Promise<void> {
  const { auth } = getFirebase()
  await signOut(auth)
}

export async function resetPassword(email: string): Promise<void> {
  const { auth } = getFirebase()
  await sendPasswordResetEmail(auth, email.trim())
}
