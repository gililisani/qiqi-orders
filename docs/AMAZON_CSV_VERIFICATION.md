# Amazon FBA — Monthly Verification Procedure (for the accounting team)

Purpose: verify, using only Amazon's downloadable transaction report, that the
records the Hub created in NetSuite for a month are correct. No Hub access or
API knowledge required — though uploading the same CSV on the Hub's Amazon FBA
page performs this whole comparison automatically.

## The source

Seller Central → Payments → Reports repository → **All Transactions** CSV for
the calendar month (e.g. 3/1/2026 – 3/31/2026).

## The four NetSuite records per month

Find them in NetSuite global search by external ID (MM = month):

| Record | External ID |
|---|---|
| Cash Sale | `AMAZON-FBA-2026-MM` |
| Cash Refund | `AMAZON-FBA-REFUND-2026-MM` |
| Vendor Bill (+ its payment) | `AMAZON-FBA-FEES-2026-MM` / `AMAZON-FBA-FEEPAY-2026-MM` |
| Journal (reimbursements) | `AMAZON-FBA-REIMB-2026-MM` |

A record is absent when its amount for the month is zero (e.g. no journal in a
month without reimbursements).

## Step 0 — clean the CSV

Delete rows whose Transaction type contains "balance" ("Unavailable balance",
"Previous statement's unavailable balance"). They are Amazon reserve
bookkeeping, always cancel out, and are never booked.

## Step 1 — Cash Sale

Filter Transaction type = **Order Payment**.

- **Item lines total** = sum of column F (Total product charges).
- **Promo/credit line** = sum of column G (Total promotional rebates)
  **plus** sum of column I (Other) *on these Order Payment rows only*.
  This can be negative (real seller-funded discounts) or positive (credits:
  buyer-paid shipping, fee corrections — column I on order rows is never a fee).
- **Cash Sale total** = item lines + promo line.

Note: row counts will differ — Amazon truncates multi-product orders into one
row; NetSuite carries one line per product. Compare totals, not row counts.

## Step 2 — Cash Refund

Filter Transaction type = **Refund**.

- **Refund total** = |sum of columns F + G + I| on these rows.
- Column H on refund rows is Amazon returning part of its fee — it belongs to
  the bill (step 3), not the refund.

## Step 3 — Vendor Bill

- **Bill total** = |sum of column H across ALL rows (orders, refunds, service
  fees)| **plus** |negative amounts in column I on Service Fees rows|
  (storage, inbound placement, inbound transportation live in "Other").
- The Bill Payment always equals the bill and is paid from account 100505.

## Step 4 — Journal

- Sum of column J (Total USD) on **Inventory Reimbursement** rows
  = journal amount (debit 100505 / credit 620070).

## Step 5 — the master check

Cash Sale − Refund − Bill + Journal = sum of column J (Total USD) on the
cleaned CSV. This is the month's net cash movement from Amazon and must match
to the cent.

## Known legitimate difference: month-boundary timing

The Hub books by Amazon's *settlement posting timestamp*; the CSV column A is
Amazon's display date. An order settling within ~a day of the month boundary
can appear in one month's CSV but the neighboring month's NetSuite records.

- Symptom: a small difference in one month that is exactly offset in the
  neighboring month (same order IDs).
- Rule: differences must net to zero across any two adjacent months. If a
  difference does NOT resolve this way, escalate — that would be a real error.

## Fastest path

Upload the same CSV on the Hub page (Integrations → Amazon FBA). For a month
already pushed, the Hub compares the CSV against what was actually created in
NetSuite and shows per-record deltas automatically — the manual steps above
are the independent fallback.
