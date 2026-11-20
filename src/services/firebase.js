// Firebase setup. Settings come from .env.local (never committed).
//
// - With a real project configured, the app talks to that project.
// - In development without a project (or with VITE_USE_EMULATORS=true), it uses the local
//   Firebase emulators (`npm run emulators`) under the offline "demo-family-property" project.
// - A production build without a project is a configuration error, never a silent fallback.

import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

const env = import.meta.env
const hasProject = Boolean(env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_API_KEY)

export const usingEmulators = env.DEV && (env.VITE_USE_EMULATORS === 'true' || !hasProject)
export const configError =
  !hasProject && !usingEmulators ? 'Firebase is not configured. Fill in .env.local (see docs/setup/FIREBASE_SETUP.md).' : null

const firebaseConfig = hasProject && !usingEmulators
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }
  : // Emulator-only demo project: no real data, no network calls to Google.
    {
      apiKey: 'demo-key',
      authDomain: 'localhost',
      projectId: 'demo-family-property',
      storageBucket: 'demo-family-property.appspot.com',
      appId: 'demo-app',
    }

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

if (usingEmulators) {
  // Same host name as the app, so the browser treats the emulator sign-in page as the same site
  // (otherwise redirect sign-in results are lost to storage partitioning).
  connectAuthEmulator(auth, `http://${window.location.hostname}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
}

export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
