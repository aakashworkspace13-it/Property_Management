# Family Property Manager

Private app for one family to manage flats, tenants, rent collection, electricity, expenses, documents and reports. Works on Android phones and desktop browsers.

- Requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)
- Build tracker (progress, blockers, next steps): [docs/tracker/TRACKER.md](docs/tracker/TRACKER.md) or open `docs/tracker/tracker.html`
- Firebase project setup: [docs/setup/FIREBASE_SETUP.md](docs/setup/FIREBASE_SETUP.md)
- Rules for contributors and AI agents: [AGENTS.md](AGENTS.md)

## Requirements

- Node.js 20+
- Java 21+ (for the Firebase emulators)
- Firebase CLI (`npm install -g firebase-tools`)

## Run locally (with the Firebase emulators)

Use two terminals.

Terminal 1, start the local Firebase emulators (Auth + Firestore, with a UI at http://127.0.0.1:4000):

```bash
npm run emulators
```

Terminal 2, start the app:

```bash
npm run dev
```

Open http://localhost:5173. Sign in with the emulator's fake Google account screen (any email works locally).
The first account to sign in on a fresh database is offered the **owner** (first admin) role.

Emulator data is temporary and disappears when the emulators stop.

## Checks

```bash
npm run lint
npm test
npm run test:rules
npm run build
```

- `npm test`: money rules in `src/lib/money/`.
- `npm run test:rules`: Firestore security rules (`firestore.rules`) against the emulator.

## Configuration

Firebase settings go in `.env.local` (never committed). With them filled in, `npm run dev` uses the real project; leave them empty (or set `VITE_USE_EMULATORS=true`) to use the emulators.

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
# Optional: force the emulators even when a real project is configured
VITE_USE_EMULATORS=true
```

## Deploy security rules

After changing `firestore.rules` (and after `npm run test:rules` passes):

```bash
npm run deploy:rules
```

This deploys to the real project (`prod` alias in `.firebaserc`). If it fails with HTTP 401, the Firebase CLI login has expired: run `firebase logout`, then `firebase login`.

## Build tracker

After changing `docs/tracker/tracker.json`:

```bash
node scripts/build-tracker.js --log "What changed" --why "Reason" --phases 2
```
