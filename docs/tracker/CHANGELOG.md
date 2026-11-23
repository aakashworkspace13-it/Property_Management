# Tracker change log

Every change to the plan or progress, newest first. Times are IST (Asia/Kolkata).
Generated entries come from `node scripts/build-tracker.js --log ... --why ...`.

<!-- new entries go below this line, newest first -->

## 2026-11-23 12:34 IST — Phase 8 verified live: Drive API enabled (B13 resolved), rules deployed, test upload for TEST Tenant One shared view-only and opened in Drive

- **Why:** Live check of Google Drive documents after the owner enabled the Drive API
- **Phases changed:** 8 · Documents
- **Impact (dependent phases):** 9 · Dashboard and reminders; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 97%

## 2026-11-23 12:21 IST — Google Drive documents built; Storage removed; re-check of 5, 6, 10 cleared

- **Why:** Owner chose Google Drive for files. Re-check flags came from Phase 4 task 4.8 (Storage) which does not affect Collections, Electricity or Reports; reviewed and cleared.
- **Phases changed:** 8 · Documents
- **Impact (dependent phases):** 9 · Dashboard and reminders; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 96%

## 2026-11-23 12:17 IST — Documents move to Google Drive (Phase 8 re-planned)

- **Why:** Owner chose Google Drive instead of Firebase Storage: any member uploads, all members view, one folder per tenant; Blaze now only needed for push.
- **Phases changed:** 4 · Tenants and tenancies; 8 · Documents
- **Impact (dependent phases):** 5 · Collections; 6 · Electricity; 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** 5 · Collections; 6 · Electricity; 10 · Reports and exports
- **Overall progress after change:** 90%

## 2026-11-21 00:41 IST — 2 TEST tenants added to the live app

- **Why:** Owner asked; added through the real Add tenant form in Chrome; Dashboard loading fix.
- **Phases changed:** 4 · Tenants and tenancies; 9 · Dashboard and reminders
- **Impact (dependent phases):** 5 · Collections; 6 · Electricity; 8 · Documents; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** 5 · Collections; 6 · Electricity; 10 · Reports and exports
- **Overall progress after change:** 92%

## 2026-11-21 00:31 IST — Publishing on hold for owner review

- **Why:** Owner will review the app and request changes before publishing.
- **Phases changed:** none
- **Impact (dependent phases):** none
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 91%

## 2026-11-21 00:25 IST — Phases 9-11 built and verified on emulators

- **Why:** Dashboard, reminders, six reports with Excel/PDF, backup, change history, installable app and faster loading done; push and publishing wait for Blaze and owner OK.
- **Phases changed:** 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Impact (dependent phases):** none
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 91%

## 2026-11-21 00:09 IST — Phases 9-11 planned from owner answers

- **Why:** Owner answered all questions: reminders + 9 AM push, six reports (no profit), calendar year, Excel+PDF, free Firebase address, backup download, admin change history, app name Property Manager, ask before publishing.
- **Phases changed:** 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Impact (dependent phases):** none
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 77%

## 2026-11-20 23:48 IST — Tracker brought up to date; Blaze not yet upgraded

- **Why:** Owner confirmed Blaze is not upgraded; electricity payer rule changed to follow Tenant applicable; Phase 7 rules deployed.
- **Phases changed:** 6 · Electricity
- **Impact (dependent phases):** 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 78%

## 2026-11-20 16:16 IST — Phase 6 re-check cleared after review

- **Why:** Phase 7 changes to Collections (shared charge-generation hook) and tenancies (agreement history) do not affect electricity code; Monthly sheet electricity column verified on the emulators.
- **Phases changed:** none
- **Impact (dependent phases):** none
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 77%

## 2026-11-20 16:15 IST — Phase 7 Expenses, Monthly sheet and agreement renewal built and verified

- **Why:** Owner-requested monthly fields and yearly agreement renewal added with expenses; verified on emulators; requirements updated.
- **Phases changed:** 4 · Tenants and tenancies; 5 · Collections; 7 · Expenses
- **Impact (dependent phases):** 6 · Electricity; 8 · Documents; 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** 6 · Electricity
- **Overall progress after change:** 77%

## 2026-11-20 16:06 IST — Phase 7 planned with Monthly sheet and agreement renewal

- **Why:** Owner listed monthly fields and yearly agreement updates; chose Monthly sheet, Tata bill status for own meters, renewal history, payment mode on expenses.
- **Phases changed:** 7 · Expenses
- **Impact (dependent phases):** 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 69%

## 2026-11-20 15:59 IST — Electricity rules deployed

- **Why:** Owner approved; deploy complete. Live app can now store the rate, bills and readings.
- **Phases changed:** 6 · Electricity
- **Impact (dependent phases):** 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 72%

## 2026-11-20 15:58 IST — Phase 6 Electricity built and verified on emulators

- **Why:** Bills for all connections, sub-meter readings with one family-wide rate, tenant charges due on bill due date, separate electricity collection and ledger; requirements updated with owner decisions.
- **Phases changed:** 6 · Electricity
- **Impact (dependent phases):** 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 72%

## 2026-11-20 15:48 IST — Phase 6 planned with owner choices

- **Why:** Owner answered electricity questions: tenant pays own meters, shared meters units x one rate, readings with each bill, bills for all connections, separate collection line.
- **Phases changed:** 6 · Electricity
- **Impact (dependent phases):** 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 64%

## 2026-11-20 15:41 IST — Firestore rules for tenants and collections deployed

- **Why:** Owner approved; deploy complete. Live app can now store tenants, charges and payments.
- **Phases changed:** 5 · Collections
- **Impact (dependent phases):** 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 66%

## 2026-11-20 15:39 IST — Phase 5 Collections built and verified on emulators

- **Why:** Charges, quick and partial payments, allocation preview, manual split, void/restore, opening balances and move-out adjustments done; crash after saving fixed.
- **Phases changed:** 4 · Tenants and tenancies; 5 · Collections
- **Impact (dependent phases):** 6 · Electricity; 8 · Documents; 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 66%

## 2026-11-20 15:29 IST — Phase 4 go-live deferred; Phase 5 planned

- **Why:** Owner will upgrade to Blaze later and asked to continue building.
- **Phases changed:** 4 · Tenants and tenancies; 5 · Collections
- **Impact (dependent phases):** 6 · Electricity; 8 · Documents; 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 54%

## 2026-11-20 15:08 IST — Phase 4 built and verified on emulators

- **Why:** Tenant form, tenancies with one-tenant-per-flat lock, ID/agreement uploads, move-out preview, history; 39 rules tests and 91 unit tests pass.
- **Phases changed:** 4 · Tenants and tenancies
- **Impact (dependent phases):** 5 · Collections; 6 · Electricity; 8 · Documents; 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 54%

## 2026-11-20 14:56 IST — Phase 4 planned with owner field choices

- **Why:** Owner chose tenant fields, Blaze for uploads, TEST tenants in the live app; opening balances moved to Phase 5.
- **Phases changed:** 4 · Tenants and tenancies; 5 · Collections
- **Impact (dependent phases):** 6 · Electricity; 8 · Documents; 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 44%

## 2026-11-20 14:42 IST — Phase 3 complete and live

- **Why:** Owner imported the real property sheet and confirmed 7 buildings and 32 flats are correct.
- **Phases changed:** 3 · Buildings and flats
- **Impact (dependent phases):** 4 · Tenants and tenancies; 5 · Collections; 6 · Electricity; 7 · Expenses; 8 · Documents; 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 47%

## 2026-11-20 00:34 IST — Phase 3 rules deployed

- **Why:** Owner approved; npm run deploy:rules finished with Deploy complete.
- **Phases changed:** 3 · Buildings and flats
- **Impact (dependent phases):** 4 · Tenants and tenancies; 5 · Collections; 6 · Electricity; 7 · Expenses; 8 · Documents; 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 45%

## 2026-11-20 00:33 IST — Phase 3 built and verified on emulators

- **Why:** Buildings, flats with codes, electricity connections, CSV import and search done; requirements updated from the owner's property sheet (7 buildings, 32 flats).
- **Phases changed:** 3 · Buildings and flats
- **Impact (dependent phases):** 4 · Tenants and tenancies; 5 · Collections; 6 · Electricity; 7 · Expenses; 8 · Documents; 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 45%

## 2026-11-20 00:09 IST — Phase 2 complete and live

- **Why:** Rules deployed to property-management-a5e84 and the owner signed in as Admin on the real project.
- **Phases changed:** 2 · Sign-in and lockdown
- **Impact (dependent phases):** 3 · Buildings and flats; 4 · Tenants and tenancies; 5 · Collections; 6 · Electricity; 7 · Expenses; 8 · Documents; 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 36%

## 2026-11-19 22:19 IST — Next steps updated

- **Why:** Phase 1 was committed by the owner as 7f2058f.
- **Phases changed:** none
- **Impact (dependent phases):** none
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 35%

## 2026-11-19 22:19 IST — Phase 2 built and verified on emulators

- **Why:** Google sign-in, one-time owner setup, family members with roles, Firestore rules (16 tests) and audit log done; only the real-project connection is left.
- **Phases changed:** 2 · Sign-in and lockdown
- **Impact (dependent phases):** 3 · Buildings and flats; 4 · Tenants and tenancies; 5 · Collections; 6 · Electricity; 7 · Expenses; 8 · Documents; 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 35%

## 2026-11-19 21:30 IST — Phase 1 money engine complete

- **Why:** All 12 Phase 1 tasks done with 61 passing tests; logic side of acceptance scenarios 1-9 and 11 done; handoff concern #1 fixed.
- **Phases changed:** 1 · Money engine
- **Impact (dependent phases):** 4 · Tenants and tenancies; 5 · Collections; 6 · Electricity; 7 · Expenses; 8 · Documents; 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 26%

## 2026-11-19 21:20 IST — Phase 0 complete; Phase 1 started

- **Why:** Owner made the first git commit (17736d8), resolving blocker B1.
- **Phases changed:** 0 · Foundation; 1 · Money engine
- **Impact (dependent phases):** 2 · Sign-in and lockdown; 3 · Buildings and flats; 4 · Tenants and tenancies; 5 · Collections; 6 · Electricity; 7 · Expenses; 8 · Documents; 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 10%

## 2026-11-19 19:44 IST — Created the build tracker

- **Why:** Owner asked for a single tracker (flowchart, status, comments, next steps) with dated change history and dependency impact.
- **Phases changed:** 0 · Foundation
- **Impact (dependent phases):** 1 · Money engine; 2 · Sign-in and lockdown; 3 · Buildings and flats; 4 · Tenants and tenancies; 5 · Collections; 6 · Electricity; 7 · Expenses; 8 · Documents; 9 · Dashboard and reminders; 10 · Reports and exports; 11 · Deploy and pilot
- **Flagged "Needs re-check":** none
- **Overall progress after change:** 8%
