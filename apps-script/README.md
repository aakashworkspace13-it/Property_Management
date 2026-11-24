# Daily reminders without Blaze (Google Apps Script)

Every morning between 9 and 10 AM (India time) this free script, running in the owner's Google
account, works out the Dashboard reminders with the app's own rules and:

- sends a **phone push** to every device that turned on notifications (Settings → Phone notifications), and
- **emails** the list to every active family member (from the owner's Gmail).

Nothing is sent on days when nothing needs attention. It reads the app's data with the owner's own
Google login (no key file). Firebase Cloud Messaging is free on the Spark plan.

## Set it up (once, about 5 minutes)

1. Build the file: `npm run apps-script` (writes `apps-script/Code.gs`).
2. Signed in as the owner (the Firebase project owner), open <https://script.google.com> → **New project**.
   Name it *Property Manager reminders*.
3. Replace the contents of `Code.gs` in the editor with the contents of `apps-script/Code.gs`.
4. **Project Settings** (gear) → tick **Show "appsscript.json" manifest file in editor**. Back in the
   editor, replace `appsscript.json` with `apps-script/appsscript.json`.
5. Save. In the function list choose **`setup`** → **Run**. Google asks for permission: choose the
   owner account → *Advanced* → *Go to Property Manager reminders (unsafe)* → **Allow**.
   (It is "unverified" only because it is your own private script.)
6. Choose **`sendTestToMe`** → **Run**. You get the email (and a push on your own devices).

That's all: the daily run is scheduled by `setup`. To stop it, open **Triggers** (clock icon) and
delete the trigger.

## Phone push needs two more things

- **Web-push key**: Firebase console → Project settings → Cloud Messaging → *Web Push certificates* →
  **Generate key pair**; put the key in `.env.local` as `VITE_FIREBASE_VAPID_KEY=...`.
- **The app must be published** (Firebase Hosting) so phones can open it and turn on notifications.
  iPhone: add the app to the Home Screen first (iOS 16.4+).

The email works without either.

## Changing it

Edit `apps-script/main.js` (sending) or `src/lib/reminders.js` (the rules), run `npm run apps-script`,
and paste the new `Code.gs` into the editor again. If the Blaze plan is turned on later, the Cloud
Function in `functions/` can do the same job; delete the Apps Script trigger then.
