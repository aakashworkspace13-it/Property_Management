/* global importScripts, firebase */
// Service worker for phone push notifications (daily summary from the server job).
// The Firebase web config is passed in the URL when the app registers this worker.
importScripts('https://www.gstatic.com/firebasejs/13.1.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging-compat.js')

const params = new URL(self.location).searchParams
firebase.initializeApp({
  apiKey: params.get('apiKey'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
})

// Notification messages are shown automatically; tapping one opens the Dashboard.
firebase.messaging()

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('/'))
})
