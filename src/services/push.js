// Phone push notifications (daily 9 AM summary). This device registers its push token in
// pushTokens/{token}; the scheduled server job (functions/) sends the summary.
// Needs the Blaze plan for the job and a web-push key in VITE_FIREBASE_VAPID_KEY.

import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging'
import { app, db, usingEmulators } from './firebase.js'

const KEY = 'pushToken'
const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY

/** 'unsupported' | 'not-configured' | 'blocked' | 'on' | 'off' for this device. */
export async function pushStatus() {
  if (usingEmulators || !vapidKey) return 'not-configured'
  if (!(await isSupported())) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return localStorage.getItem(KEY) ? 'on' : 'off'
}

function workerUrl() {
  const c = app.options
  const params = new URLSearchParams({
    apiKey: c.apiKey,
    projectId: c.projectId,
    messagingSenderId: c.messagingSenderId,
    appId: c.appId,
  })
  return `/firebase-messaging-sw.js?${params}`
}

/** Asks permission, gets this device's token and registers it for the daily summary. */
export async function enablePush(actor) {
  if (!vapidKey) throw new Error('Phone notifications are not set up yet (web-push key missing).')
  if (!(await isSupported())) throw new Error('This browser does not support notifications. On iPhone, add the app to the Home Screen first.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications were not allowed on this device.')
  const registration = await navigator.serviceWorker.register(workerUrl())
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration })
  await setDoc(doc(db, 'pushTokens', token), { email: actor.email.toLowerCase(), createdAt: serverTimestamp() })
  localStorage.setItem(KEY, token)
}

/** Stops notifications on this device. */
export async function disablePush() {
  const token = localStorage.getItem(KEY)
  if (token) {
    await deleteDoc(doc(db, 'pushTokens', token)).catch(() => {})
    await deleteToken(getMessaging(app)).catch(() => {})
  }
  localStorage.removeItem(KEY)
}
