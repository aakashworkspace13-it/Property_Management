# Family Property Manager

Private app for one family to manage flats, tenants, rent collection, electricity, expenses, documents and reports. Works on Android phones and desktop browsers.

- Requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- Roadmap and status: [docs/ROADMAP.md](docs/ROADMAP.md)
- Rules for contributors and AI agents: [AGENTS.md](AGENTS.md)

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Checks

```bash
npm run lint
npm run build
```

## Configuration

Firebase settings go in `.env.local` (never committed):

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```
