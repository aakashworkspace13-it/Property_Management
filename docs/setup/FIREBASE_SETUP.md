# Create the Firebase project (one-time, ~10 minutes)

You do these steps yourself in the Firebase console, signed in with the Google account that should own the app. No credit card is needed for these steps.

Until this is done, the app runs against the **local Firebase emulators** on your PC, so development is not blocked.

## 1. Create the project

1. Open <https://console.firebase.google.com> and click **Create a project** (or **Add project**).
2. Name: `family-property-manager` (any name works; Firebase may add a suffix to the project ID).
3. **Google Analytics: turn it off.** It is not needed and keeps tenant activity out of analytics.
4. Click **Create project**, wait, then **Continue**.

## 2. Turn on Google sign-in

1. Left menu: **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Google** → switch **Enable** on.
3. Pick your email as the **project support email** → **Save**.
4. Do **not** enable any other sign-in providers.

## 3. Create the database

1. Left menu: **Build → Firestore Database → Create database**.
2. Edition (if asked): **Standard**.
3. Location: **asia-south2 (Delhi)** or **asia-south1 (Mumbai)**. *This cannot be changed later.*
4. Security: **Start in production mode** (everything locked). The app's own rules replace this when deployed.
5. Click **Create**.

## 4. Register the web app and copy its settings

1. Click the **gear icon → Project settings → General**.
2. Under **Your apps**, click the web icon **`</>`**.
3. Nickname: `family-property-web`. Leave **Firebase Hosting unticked** for now. Click **Register app**.
4. Firebase shows a `firebaseConfig` block. Copy each value into the project's `.env.local` file:

   | `firebaseConfig` field | `.env.local` line |
   |---|---|
   | `apiKey` | `VITE_FIREBASE_API_KEY=` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN=` |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID=` |
   | `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET=` |
   | `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID=` |
   | `appId` | `VITE_FIREBASE_APP_ID=` |

   No quotes, no spaces, e.g. `VITE_FIREBASE_PROJECT_ID=family-property-manager-1a2b3`.
   `.env.local` is ignored by git, so these values never get committed.

## 5. Tell Claude the project ID

Claude will then:
- link the project (`.firebaserc`),
- deploy the security rules (only after you confirm),
- switch the app from the emulators to the real project.

## 6. Become the owner (important)

The **first person who signs in** to a fresh database becomes its admin, and this can only happen once.
Right after the app is connected to the real project, **open it and sign in yourself first**, before sharing the link with anyone. Then add the other family members from **Settings → Family members**.

## Later: Blaze plan (blocker B3)

Firebase Storage (Phase 8, for agreements and ID proofs) needs the **Blaze** pay-as-you-go plan. At family scale the cost is expected to be ₹0, but set a **budget alert** (e.g. ₹100) when upgrading: **gear icon → Usage and billing → Details & settings → Modify plan**. Not needed until Phase 8.
