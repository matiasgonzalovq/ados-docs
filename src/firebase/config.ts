import { initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'

export type FirebaseRuntime = {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

let runtime: FirebaseRuntime | null = null

export function firebaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID,
  )
}

export function getFirebase(): FirebaseRuntime {
  if (runtime) {
    return runtime
  }
  if (!firebaseConfigured()) {
    throw new Error('La configuración de Firebase no está completa. Revisa .env.local.')
  }
  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  })
  const auth = getAuth(app)
  const db = getFirestore(app)
  const authEmulator = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST
  if (authEmulator) {
    connectAuthEmulator(auth, `http://${authEmulator}`, { disableWarnings: true })
  }
  const firestoreEmulator = import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST
  if (firestoreEmulator) {
    const [host, port] = firestoreEmulator.split(':')
    connectFirestoreEmulator(db, host, Number(port || 8086))
  }
  runtime = { app, auth, db }
  return runtime
}

export function resetFirebaseForTests(): void {
  runtime = null
}
