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

**Monthly sheet** (owner request 2026-11-20): for a chosen month, one row per tenant with rent paid (yes / part / no), amount paid, paid date and payment mode, and electricity paid (yes / no), amount and paid date. For own-meter tenants, electricity shows whether that month's Tata Power bill is paid.

Building → floor → flat hierarchy, search, readable text, large touch targets, plain language. The primary monthly workflow (Collections) must be fast: open Collections, review the tenant and rent period, mark full rent received or enter a partial amount, confirm the allocation, move to the next tenant. Optional fields (reference, method, notes, evidence) must not slow this down.

**Simplicity (owner request 2026-11-23):** one tap does the job, no extra screens. On Collections, "Full rent received ₹X" has **Cash** and **UPI** buttons that save straight away with today's date (the same for electricity due); a different amount or date uses "Different amount or date". After a one-tap save an **Undo** shows for 10 seconds (only the person who saved it; kept in the ledger as voided). Every inner page has a **‹ Back** button (pages under "More" show it on phones). The app is laid out for phones: tables such as rent periods, the monthly sheet, bills, reports and change history turn into one card per row.

**Amounts and fields (owner request 2026-11-23):** amounts are shown as whole rupees with Indian grouping and no ₹ sign (e.g. 12,000), rounded to the nearest rupee for display only; stored money stays exact paise. Excel uses the same whole-rupee format. The optional Reference and Notes fields are removed from all forms (payments, expenses, bills, flats, buildings, tenants, tenancies); notes already saved are kept but not shown. Cards are compact. Tapping a vacant flat on Buildings and flats offers **+ Add tenant**, which opens the full add-tenant form right there.

**Less clutter (owner request 2026-11-24):** rarely used Edit buttons are hidden: tap the heading they belong to (building name, flat title, tenant "Details", agreement dates) to show Edit; on Expenses, tap a row to show Split / Edit / Void. Flats are added from one **+ Add flat** button on Buildings and flats (choose the building first). On phones the bottom menu hides while the keyboard is open.

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
- **Building view (owner request 2026-11-23):** each building is drawn as floors stacked top floor first, each floor split into its flats (green occupied, amber vacant, grey own use; amount due shown on the flat). Tapping a flat opens its details right under the building: status, CA number and type, and a **tenant timeline**: same-size cards, oldest to newest, each tenant's card holding all their details (stay, rent, mobile, members, agreement, balances) and "Empty" cards for gaps; it opens at the latest card and Earlier/Later (or a swipe) moves one card at a time.
- Connection types are shown as **Dom** (domestic) and **Com** (commercial).

## 5. Tenants and tenancies

- Tenant identity is separate from a tenancy (a tenant living in a flat for a date range).
- A flat may have **only one overlapping active tenancy**.
- Store: primary name, phones/contacts, household member names and optional phones, vehicles, move-in/out dates, monthly rent, agreement start/expiry, notes, ID proofs and agreements.
- **Passport-size photo** (owner request 2026-11-23): taken with the phone's front camera or chosen from the gallery, cropped to 35 × 45 proportions and shrunk to about 10–20 KB, stored with the tenant in the app (not in Drive) and shown on the tenant page and the flat timeline. Any member can add or replace it.
- **Owner requests 2026-11-24:** tapping a vacant flat opens its flat page with the add-tenant form; the rental agreement (dates and file) is optional and can be added later ("Add agreement" on the tenant page). An Aadhaar number must be exactly 12 digits (the box accepts digits only, up to 12; also checked by the database rules); other ID types keep their own format.
- Old tenancies, documents, payments, expenses and debt are kept after departure.
- **Never transfer an old tenancy's balance to a replacement tenant.**
- **No security deposits and no scheduled rent increases in version 1.** [decided]
- Agreements are renewed yearly: **Renew agreement** sets new start/end dates and keeps the previous dates as history (owner request 2026-11-20).

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

- Expenses are building-wide or flat-specific: date, amount, category, building, optional flat/tenancy, payer type (owner-paid / tenant-paid), **payment mode** (cash, UPI, bank transfer, cheque, other — owner request 2026-11-20), optional description (owner request 2026-11-23), evidence (photo/PDF once Blaze is on).
- Amount, date, building, flat, payer and the stored split never change after saving; description, category, payment mode and notes can. Wrong expenses are voided by an admin (with a reason) and entered again.
- Family-paid Tata Power bills are **not** also entered as expenses; reports count paid family bills as owner electricity payments (no double counting).
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
- **Owner decisions (2026-11-20):**
  - **Own meter** (one flat, no sub-meter): the **tenant pays Tata Power directly**. The app records each bill (dates, amount, due date, paid/unpaid) only to check it is paid; it is never family income.
  - **Shared meter** (sub-meter = yes): the **family pays Tata Power**. Sub-meter readings are entered **with each Tata Power bill** (reading date = bill period end). Each tenant's charge = **units used × one family-wide rate per unit** (set by admins in Settings, e.g. ₹4), **due on the bill's due date**. Each charge keeps the rate it was made with.
  - The first time a sub-meter is used, a **starting reading** is entered; afterwards the previous reading fills in automatically. Vacant and own-use flats are read but not charged.
  - **Bills are recorded for all connections**, including Home and Office (family-paid).
  - Electricity is collected in **Collections as a separate line** and has its own ledger; it is never mixed with rent.

## 8. Documents

- Camera photos and JPG/PNG/PDF files (up to 15 MB) for ID proofs and agreements, attached to the tenant (and tenancy).
- **Stored in Google Drive (owner choice 2026-11-23):** any family member can upload; each file goes to the uploader's own Drive under *Property Manager / <tenant>* and is shared **view-only with every active family member**. The app keeps only the link (documents/{id}) and uses Google's narrowest Drive permission (only files the app created).
- When family members are added or turned off, the uploader presses **Update sharing** (Documents page) to add or remove their access.
- Shown on the tenant page and the Documents page with type, file name and whose Drive it is in; **Open** shows it in the Google Drive viewer.

## 9. Reminders

- Rent: 3 days before the due date, when unpaid.
- Agreement expiry: 30 and 7 days before.
- Electricity: unpaid bill, timing configurable (initially one day after due).
- Each reminder links to its record, appears once (no duplicates), and disappears when resolved.
- Shown in-app on the Dashboard for all family members, plus a **daily summary at about 9 AM**: a phone push (devices that turned it on) and an email to every active member. Sent by a free Google Apps Script in the owner's Google account, so the Blaze plan is not needed (owner choice 2026-11-24; see apps-script/README.md). Nothing is sent when nothing needs attention.
- Reminder types: rent overdue and due within 3 days; agreement ending within 30 / 7 days or expired; tenant electricity due/overdue; unpaid Tata Power bills; own reminders (**title + date only**), any member can mark done.
- **Dashboard (owner request 2026-11-23):** a **This month / Year to date** switch (year to date = calendar year, 1 January to today). Totals: rent due, rent received, remaining balance, overdue rent (and how many tenants), electricity due/received, expenses (family and tenant paid). Below: the number of buildings and one card per building with its flats (occupied/vacant) and the same figures for that building; tapping a card opens that building on Buildings and flats.
- **Dashboard update (owner request 2026-11-23, later):** one building dropdown (All buildings, or tick one or more buildings) changes every figure on the page. An occupancy board shows each building's floors with one small square per flat (green occupied, orange vacant, grey own use), like a hotel room board. **Rent by building** is a collapsible list Building → Floor → Flat with due, received and balance for the chosen period, summed at every level, children indented.

## 10. Reports and exports

- **Owner choices (2026-11-21):** six reports — rent collection, outstanding dues, expenses, electricity, occupancy, tenant list (ID numbers masked). **No profit report.** Period: **calendar year (Jan–Dec)**. Filters: building, flat, tenant. Export: **Excel and PDF** (print / Save as PDF).
- Admins: **Download backup** (Excel of all records) and a **Change history** screen (audit log, admins only).
- Expected rent is allocated over each charge's covered dates (periods crossing 31 December are split exactly to the paisa). Receipts by payment date, expenses by expense date.
- Show gross outstanding debt and credit separately as well as the net figure.
- Export reports, ledgers, collections, outstanding balances and expense breakdowns to Excel and PDF.

## 11. Acceptance scenarios

Each must pass as an automated test of the money logic and as a manual check in the app:

1. Full rent quick action (Cash / UPI) saves exactly the remaining amount and Kolkata date, once, with Undo for 10 seconds; the allocation shows in the ledger.
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
