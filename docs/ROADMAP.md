# Roadmap

Requirements: [REQUIREMENTS.md](REQUIREMENTS.md). Each phase ends with something usable and checked.

**Live status, progress, blockers and next steps are in the [build tracker](tracker/TRACKER.md)** (source: `tracker/tracker.json`). This file describes the plan only.

| # | Phase | Outcome | Depends on |
|---|---|---|---|
| 0 | Foundation | Git repo, app shell, navigation, docs | — |
| 1 | Money engine | Pure JS functions for rent periods, proration, allocation, expense split and profit, with Vitest tests for the acceptance scenarios. No Firebase. | 0 |
| 2 | Sign-in and lockdown | Firebase Auth, allowlist with admin/family roles, Firestore rules, emulator tests | 0 |
| 3 | Buildings and flats | Hierarchy, duplicate floor/position check, derived occupancy | 2 |
| 4 | Tenants and tenancies | Move-in, departure with proration preview, history | 1, 3 |
| 5 | Collections | Charge generation, quick full/partial payment, allocation preview, credit | 1, 4 |
| 6 | Electricity | Own-meter bills and submeter readings | 1, 3, 4 |
| 7 | Expenses | Categories, payer types, building split snapshots | 1, 3 |
| 8 | Documents | Private uploads in Firebase Storage with rules | 2, 4 |
| 9 | Dashboard and reminders | Computed in-app reminders | 5, 6, 8 |
| 10 | Reports and exports | Report bases, filters, Excel/PDF | 5, 6, 7 |
| 11 | Deploy and pilot | Firebase Hosting, PWA install, backups/export, family pilot | all of 0–10 |

Critical path: 0 → 2 → 3 → 4 → 5 → 10 → 11. Phase 1 can run alongside Phases 2 and 3.

## Architecture notes

- **No server of our own.** Business logic runs in the browser as pure, tested functions (`src/lib/money/`). Firestore rules enforce access and the invariants that can be checked there.
- **Duplicate prevention with deterministic IDs.** Rent charges use IDs like `{tenancyId}_{periodStart}` and are created in transactions, so generating the same period twice fails instead of duplicating. Payments use a client-generated ID created once per form submission, so a retry rewrites the same document instead of creating another.
- **Charge generation without scheduled jobs.** Due periods are generated when a family member opens Collections or the dashboard (idempotent thanks to deterministic IDs). This avoids Cloud Functions in version 1.
- **Concurrency.** Financial writes use Firestore transactions; edits check a `version` field to reject stale saves.
- **Audit.** Every write adds an audit entry in the same batch; rules allow creating audit entries only.
