# Family Property Manager — product requirements

Source: the owner's requirements as recorded in the earlier "Family Rent" handoff (Flutter + Python prototype, 13–19 November 2026), carried over into this React + Firebase rebuild. Business rules here are binding; the earlier technology choices are not.

Status markers: **[decided]** = agreed requirement, **[open]** = needs an owner decision.

## 1. Scope and conventions

- One Indian family, not a multi-organisation product. English UI.
- Money in Indian rupees with Indian digit grouping (₹1,23,456.78). Store money as **integer paise**, never floating point.
- Business dates use **Asia/Kolkata**. Reporting years run January–December.
- Works on Android phones and desktop browsers (PWA). iPhone works through the browser.
- Online-first: Firebase is the single shared source of truth. Offline viewing via Firestore cache is a bonus, not a requirement.

## 2. Users and permissions

- **Admin:** manage buildings, flats, users, settings and all records; **only admins may delete or restore** records.
- **Family member:** view all family data; add/edit tenants, tenancies, payments, expenses, documents and operational details.
- Access only for an explicit allowlist of family accounts (about six people). Everyone else is denied, even with the URL.
- Every financial change records actor, timestamp, previous values and new values. Deletion is recoverable (soft delete) and keeps audit history.
- Tenant accounts are out of scope for version 1.

## 3. Navigation

Dashboard · Buildings and flats · Collections · Expenses · Documents and reminders · Reports · Settings.

Building → floor → flat hierarchy, search, readable text, large touch targets, plain language. The primary monthly workflow (Collections) must be fast: open Collections, review the tenant and rent period, mark full rent received or enter a partial amount, confirm the allocation, move to the next tenant. Optional fields (reference, method, notes, evidence) must not slow this down.

## 4. Buildings and flats

- Buildings (from the owner's property sheet, 2026-11-20; entered through the app, never committed as seed data). Each has a permanent short code; names are editable:

  | Code | Name | Flats | Use |
  |---|---|---|---|
  | B01 | 40 Gaj | 4 | Rented |
  | B02 | Clinic 100 Gaj | 10 | Rented |
  | B03 | Jootey vaala 120 Gaj | 3 | Rented |
  | B04 | 25 Gaj | 3 | Rented |
  | B05 | New 120 Gaj | 4 | Rented |
  | B06 | Home | 6 | Own use |
  | B07 | Office | 1 | Own use |

  Admins can add more buildings.
- **Own use:** buildings/flats not rented to tenants (Home, Office). Their electricity and expenses can be tracked, but they never show as vacant or appear in rent collection.
- A flat has: permanent code, building, floor label (Ground/1st/…/custom), position (Left/Right/Front/Back/Single/number/custom), optional friendly name (e.g. Clinic, Godown, Hall), own-use flag, electricity connection (CA number) and notes. Example: `40 Gaj / 1st / Left`.
- **Flat code** = `building code-floor key-position key`, e.g. `B01-G-1`, `B02-1-L`, `B03-G-1C`. More than one flat per floor is allowed. Because the code is built from floor + position, **a duplicate floor + position within a building is impossible**. Floor and position cannot change after creation; friendly name, own use, connection and notes can.
- Jootey vaala ground floor has two units: positions **1C** (commercial) and **1D** (domestic).
- **Electricity connections:** one record per CA number with type (domestic/commercial), sub-meter yes/no and the meter holder's name, phone and email. Several flats can share one CA number (main meter + sub-meters). Holder phone numbers are masked in lists and kept out of the audit log.
- **Import:** admins can import buildings, flats and connections from the property sheet saved as CSV (Settings → Import), with a preview, a problem list and editable building names before anything is saved. Flats that already exist are skipped, never changed.
- Occupancy is **derived from tenancy dates**, not a separately editable flag. Renaming must not break history.

## 5. Tenants and tenancies

- Tenant identity is separate from a tenancy (a tenant living in a flat for a date range).
- A flat may have **only one overlapping active tenancy**.
- Store: primary name, phones/contacts, household member names and optional phones, vehicles, move-in/out dates, monthly rent, agreement start/expiry, notes, ID proofs and agreements.
- Old tenancies, documents, payments, expenses and debt are kept after departure.
- **Never transfer an old tenancy's balance to a replacement tenant.**
- **No security deposits and no scheduled rent increases in version 1.** [decided]

## 6. Financial rules (must survive every change)

### 6.1 Rent periods

- Rent follows the **move-in anniversary**, not calendar months. A 15 January move-in creates 15 Jan–14 Feb, due 15 Jan. The first period is **not** prorated.
- For a 29/30/31 anchor, clamp to the last valid day of a shorter month but keep the original anchor for later months. Period end = next anniversary − 1 day. Non-leap year, 31 Jan start: 31 Jan–27 Feb; 28 Feb–30 Mar; 31 Mar–29 Apr.
- Generating the same tenancy + period twice must be impossible (including after a deleted period).
- Issued charges never silently change when rent or tenant details change. Corrections are explicit, audited adjustments or reversals.

### 6.2 Departure

- Departure rent = monthly rent × occupied days ÷ total days in that period, **including the leaving day**, rounded half-up to the paisa. Show the calculation before saving.
- Example: ₹10,000 rent, period 15 Jan–14 Feb (31 days), leaving 29 Jan → 15 days → **₹4,838.71**.
- The original charge stays; the reduction is an explicit adjustment that targets **that period** (not older debt).

### 6.3 Payments, allocation and credit

- Quick collection defaults to the displayed period's remaining amount and today's Kolkata date.
- Payments are allocated to the **oldest unpaid period first** within the same tenancy and account. Preview clearly when older debt receives money before the displayed period. Allow explicit manual allocation with a reason.
- Never cross rent and electricity accounts, or different tenancies, implicitly.
- Partial payments keep the original period's remaining debt. Excess stays as visible **credit**, used transparently on later charges.
- Statuses: unpaid, partially paid, overdue, fully paid, credit.
- A network retry must never create a duplicate payment. Concurrent edits must not overwrite unseen changes.

### 6.4 Expenses and profit

- Expenses are building-wide or flat-specific: date, amount, category, building, optional flat/tenancy, payer type (owner-paid / tenant-paid), description, evidence.
- Initial editable categories: repairs, paint, bathroom fittings, submersible/borewell, maintenance, tax, other. Categories can be added, renamed and archived.
- A building expense is split **equally across all flats present at posting, including vacant flats**. The flat list and shares are stored at posting; leftover paise are distributed deterministically so shares sum exactly. Adding a flat later does not change old shares.
- Flat reports include direct costs plus stored building shares; consolidated reports count each expense once.
- **Primary profit = rent received − owner-paid expenses − tenant-paid expenses.** (The owner's explicit formula; do not change it.)
- **Owner cash surplus = rent received + owner electricity collections − owner-paid expenses.**
- Show both payer totals separately. Tenant-paid expenses are not owner cash spent. Direct tenant-to-provider electricity payments are neither rent nor owner receipts.

### 6.5 Openings and history

- Existing tenants may start with opening balances (rent and electricity kept separate), with known or unknown original periods. Openings are shown separately and never double-count against generated rent. Setup must show the first generated period clearly.

## 7. Electricity

- Two models: a tenant's own Tata Power Delhi meter (CA number), and a shared main connection with flat submeters.
- Own-meter bills: provider, CA number, dates, amount, status, documents.
- Submeter charges: previous/current readings and dates, manually entered rate, consumption, adjustments, override with reason. **Negative consumption is rejected** unless an explicit reset/correction is recorded.
- Version 1 is manual entry. No provider API integration is claimed.

## 8. Documents

- Camera images and PDF/JPEG/PNG uploads (up to 15 MB) for IDs, agreements, payment evidence, bills, receipts, invoices.
- Attached to the original record; preview, download, type, upload date and uploader shown. Storage is private and authenticated.

## 9. Reminders

- Rent: 3 days before the due date, when unpaid.
- Agreement expiry: 30 and 7 days before.
- Electricity: unpaid bill, timing configurable (initially one day after due).
- Each reminder links to its record, appears once (no duplicates), and disappears when resolved.
- Version 1: shown in-app (dashboard). Push notifications are a later decision. [open]

## 10. Reports and exports

- Expected / received / outstanding rent with period detail; electricity charges, collections and unpaid amounts separately; expenses by payer type; primary profit; owner cash surplus; occupancy/vacancy.
- Filters: building, flat, tenant, date range.
- Expected rent is allocated over each charge's covered dates (periods crossing 31 December are split exactly to the paisa). Receipts by payment date, expenses by expense date.
- Show gross outstanding debt and credit separately as well as the net figure.
- Export reports, ledgers, collections, outstanding balances and expense breakdowns to Excel and PDF.

## 11. Acceptance scenarios

Each must pass as an automated test of the money logic and as a manual check in the app:

1. Full rent quick action saves exactly the remaining amount and Kolkata date, once, and shows the allocation.
2. Partial payment leaves the correct remainder on its original period.
3. Several missed periods: a later payment pays oldest first; manual reallocation is explicit; credit is visible.
4. A 31st anniversary passes through February and back to the 31st with no gaps/overlaps, including leap years.
5. Mid-period departure includes the leaving day, previews half-up proration, keeps the original charge and adds an explicit correction — with earlier unpaid periods present and across a year boundary.
6. A replacement tenant has a separate tenancy and zero inherited debt; old history stays accessible.
7. Submeter readings calculate exactly; negative consumption blocked without explicit reset; override requires a reason and keeps the original calculation.
8. Building expense includes vacant flats, rounds exactly, and keeps its posted flat set after a flat is added; building totals do not double-count.
9. Both payer types reduce primary profit; owner cash surplus excludes tenant-paid outflows and direct provider payments.
10. Unpaid, no bill, unknown status and failed check are distinct electricity states.
11. Openings, historical entries and generated charges never double-count, including year splits and departure.
12. Admin/family permissions are enforced by Firestore/Storage rules; edits record old/new values; delete/restore is recoverable; documents need sign-in; exports open and reconcile.

Also: two devices editing at once, lost-response retry, expired sessions, restore from backup.

## 12. Open decisions

- [open] Sign-in method: Google sign-in (recommended) or email + password.
- [open] Firebase Blaze plan with a budget alert (needed for Firebase Storage on new projects).
- [open] Push notifications for reminders, or in-app only.
- [open] Real flat inventory, tenant records and historical balances — entered through the app during the pilot, never committed to the repository.
