// Daily phone push: at 9:00 AM India time, sends every registered family device one summary of
// the Dashboard reminders (owner choice 2026-11-21). Uses the same rules as the app (shared/).
// Needs the Blaze plan. Deployed with: npm run deploy:functions (from the project root).

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { dueRentCharges } from './shared/collections.js'
import { todayInKolkata } from './shared/money/index.js'
import { computeReminders, reminderSummary } from './shared/reminders.js'

initializeApp()

async function all(db, name) {
  const snap = await db.collection(name).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export const dailyReminderPush = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'Asia/Kolkata', region: 'asia-south1' },
  async () => {
    const db = getFirestore()
    const today = todayInKolkata()
    const [tenancies, tenants, flats, connections, stored, payments, bills, ownReminders, tokens] = await Promise.all(
      ['tenancies', 'tenants', 'flats', 'connections', 'charges', 'payments', 'bills', 'reminders', 'pushTokens'].map((n) => all(db, n)),
    )
    // Include rent periods that have started but were not yet created by the app (not saved here).
    const charges = [...stored, ...tenancies.flatMap((t) => dueRentCharges(t, stored.filter((c) => c.tenancyId === t.id), today))]
    const summary = reminderSummary(computeReminders({ tenancies, tenants, flats, connections, charges, payments, bills, ownReminders }, today))
    if (!summary || tokens.length === 0) return

    const result = await getMessaging().sendEachForMulticast({
      tokens: tokens.map((t) => t.id),
      notification: { title: 'Property Manager', body: summary },
      webpush: { fcmOptions: { link: '/' } },
    })
    // Forget devices that no longer accept notifications.
    await Promise.all(
      result.responses.map((r, i) =>
        !r.success && ['messaging/registration-token-not-registered', 'messaging/invalid-argument'].includes(r.error?.code)
          ? db.collection('pushTokens').doc(tokens[i].id).delete()
          : null,
      ),
    )
  },
)
