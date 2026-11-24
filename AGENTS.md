# Family Property Manager Project Guide

## Purpose
A private property management app for one Indian family (about six users) managing roughly 25 tenants across five-plus buildings: flats, tenants and tenancies, rent collection, electricity, expenses, private documents, reminders, reports and an audit trail.

**Read first:**
- [docs/tracker/TRACKER.md](docs/tracker/TRACKER.md) — live build tracker: current step, progress, blockers, next steps.
- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) — the owner's requirements and the financial rules that must never be broken.
- [docs/ROADMAP.md](docs/ROADMAP.md) — build phases and architecture notes.

The requirements were carried over from an earlier Flutter + Python prototype ("Family Rent"). The family chose to rebuild on React + Firebase so there is no server to run. Keep that prototype's business rules; do not reintroduce its server.

## Architecture
- React + Vite (JavaScript) for the UI, React Router for navigation.
- Firebase Authentication for family sign-in; Firestore for data; **Google Drive** for ID proofs and agreements (uploader's Drive, shared view-only with the family; the app stores only the link; Drive permission limited to files the app created); Firebase Hosting for deployment. Firebase Storage is not used.
- PWA for install on Android and desktop; iPhone via the browser.
- No custom backend. The daily 9 AM reminders (phone push + email) are sent by a free Google Apps Script in the owner's Google account (`apps-script/`, built from `src/lib` with `npm run apps-script`). A Cloud Function version (`functions/`) exists for if the Blaze plan is ever turned on. Money logic lives in pure, unit-tested functions under `src/lib/`.
- App name on phones: **Property Manager**. Published at https://property-management-a5e84.web.app (Firebase Hosting) — only after the owner's OK.

### Layout
```
src/
  app/          App shell, routes, layout, navigation
  features/     one folder per area: dashboard, flats, collections, expenses,
                documents, reports, settings (later: auth, tenants, electricity, audit)
  components/   shared UI
  services/     Firebase access (firebase.js, data helpers, audit)
  lib/          pure helpers: money, dates, validation, masking
docs/           requirements and roadmap
```

## Rules that must not be broken
- Money is stored as **integer paise**. Never use floating point for stored or compared money.
- Business dates use **Asia/Kolkata**.
- Rent periods follow the **move-in anniversary**; departure proration includes the leaving day, rounded half-up.
- Payments go to the **oldest unpaid period first** within one tenancy and one account (rent and electricity are separate).
- Building expenses split across **all flats present at posting, including vacant ones**, and the split is stored.
- **Primary profit = rent received − owner-paid expenses − tenant-paid expenses.** Do not change this formula.
- Issued charges never change silently; corrections are explicit, audited adjustments.
- No security deposits and no scheduled rent increases in version 1.

## Security principles
- Never commit secrets, credentials, service account keys, `.env*` files or tokens. Firebase web config lives in `.env.local` (ignored by Git).
- The Firebase web API key is not a secret by itself; protection comes from **Firestore and Storage security rules** plus the family allowlist. Rules are committed and tested in the emulator.
- Admin/family roles enforced by rules: only admins delete/restore or manage buildings, flats, users and settings.
- Treat rental agreements and ID proofs as sensitive: Drive files are shared only with active family members (never "anyone with the link"); "Update sharing" removes members whose access was turned off.
- Minimise personal data in logs, screenshots and code comments. Mask phone/ID numbers in lists.
- Every data change writes an audit entry; audit entries cannot be edited or deleted.

## Development rules
1. Inspect existing files before overwriting them.
2. Never commit real tenant data, balances or documents. Synthetic test fixtures in tests are fine; real data is entered through the app.
3. Keep dependencies minimal and free-tier compatible.
4. Prefer simple, readable code. One feature folder per area.
5. Money logic changes need a test first; the acceptance scenarios in REQUIREMENTS.md section 11 must keep passing.
6. Validate locally (`npm run lint`, `npm run build`, tests) before claiming something works.
7. If an error occurs, explain the actual cause and fix.

## Build tracker (mandatory)
The tracker in `docs/tracker/` is the single place to see how far the build is and what comes next. Keep it current:
- **Source of truth is `docs/tracker/tracker.json`.** Never hand-edit `TRACKER.md` or `tracker.html`; they are generated.
- **Update it whenever** a task or phase changes status, the current step or next steps change, a blocker opens or resolves, or the plan itself changes (phases, tasks, dependencies, requirements).
- After editing `tracker.json`, run:
  `node scripts/build-tracker.js --log "What changed" --why "Reason" --phases <ids of phases whose plan or status changed>`
  (Call `node` directly, not `npm run tracker -- …`: on Windows npm can silently drop or hang on longer quoted arguments.)
  This stamps the change in IST, writes a `CHANGELOG.md` entry with the impacted downstream phases, and flags any impacted Done/Verified phase as "Needs re-check".
- Clear a "Needs re-check" flag (`needsRecheck: false`) only after reviewing that phase, and log the review.
- Use only these statuses: Not started, In progress, Blocked, Done, Verified (Verified = tested and checked in the app).
- Commit the four tracker files together with the work they describe.

## Git safety
`.gitignore` excludes `.env`, `.env.*`, `*.local`, service account keys, certificates, `node_modules`, `dist` and editor files. Firestore/Storage rules and `firebase.json` contain no secrets and are committed.
