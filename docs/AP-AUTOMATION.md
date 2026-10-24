# AP Automation — Phase 1 design

Status: **approved by owner 2026-10-24** — built for Qiqi first. The multi-company
version is a separate later project (code name **SpinOff**); keep settings in data, not
code, so SpinOff has less to strip out.

Goal: vendor invoices arrive by email (or upload) and become NetSuite vendor bills —
plus the bill payment when the invoice is already paid — without anyone typing them.
Phase 1 proves accuracy with a person approving every bill in one click; Phase 2 lets
trusted vendors post on their own.

---

## 1. What the data says (NetSuite, Jan–Oct 2026, read-only)

- **400 vendor bills typed by hand** (plus 29 the Hub already creates itself: Shopify
  payout fees, Amazon platform fees) and 335 bill payments, from 72 vendors.
- **32 small vendors (under $1,000 per bill on average) → ~175 bills a year.** These are
  Phase 1's target: Sanity, Upwork, Supabase, Tolstoy, Vercel, Cookiebot, SoftSale,
  Klaviyo, GoDaddy, Anthropic, Google, Adobe, Suno, 101domain, DHL (Israel + USA),
  pazomat, BUYME, Obelis, and others.
- **They follow a very regular pattern:** one expense line; memo `<Vendor> MM.YY`
  (e.g. `Supabase 09.26`); the vendor's invoice number as the bill's reference number;
  bill in the invoice's currency. **25 of the 32 vendors use exactly the same
  account / department every single time** — the coding can be learned, not configured.
- **How they're paid** (from the bill payments):

  | Paid from | Subsidiary | Used by |
  |---|---|---|
  | 220301 IDB Qiqi INC **Visa 5335** | Qiqi INC. | Sanity, Supabase, Tolstoy, Vercel, Cookiebot, Klaviyo, Anthropic, Google, Adobe |
  | 220202 Mastercard Poalim **4223 USD** | Qiqi Global Ltd. | Upwork, GoDaddy, Suno, 101domain |
  | 220201 Mastercard Poalim **4223 ILS** | Qiqi Global Ltd. | SoftSale, BUYME, Israeli suppliers |
  | Bank accounts (Hapoalim / IDB) | both | DHL Israel, pazomat, Obelis, Shopify (bank charge) |

- **Israeli VAT** (Qiqi Global Ltd. only) is per vendor and consistent: foreign SaaS
  billed to the Israeli company → `IL- VAT Purchases Not Reported IL`; Israeli
  suppliers with deductible VAT → `ILT - VAT on Purchases IL` (posts to 101402);
  car-related → partial `ILT - VAT Other 2/3` / `1/4`; non-claimable → `IL - Non-Clamable VAT IL`.

## 2. How it works

```
 ap@ mailbox ──┐
               ├─► 1 Intake ─► 2 Read ─► 3 Match & code ─► 4 Checks ─► 5 Review ─► 6 Post to NetSuite
 Hub upload ───┘                                                       (1 click)     bill + payment + PDF
```

1. **Intake.** Microsoft notifies the Hub the moment an email lands in
   `ap@qiqiglobal.com`; a sweep every 10 minutes catches anything a notification
   missed. Every PDF attachment becomes one *document* in the Hub. An email with no PDF
   (some vendors send the receipt as the email itself) is read from its body. A
   drag-and-drop **Upload** page in the Hub feeds the same pipeline (several PDFs at once).
   Non-invoices (newsletters, "your statement is ready" links) are recognized and
   parked in an "Not an invoice" list, never deleted.
2. **Read.** The document is read into structured fields: vendor name, invoice number,
   invoice date, due date, currency, line items, tax/VAT, total, and payment status —
   *paid* (with the card's last 4 digits when shown) or *due*. Hebrew invoices included.
   *Engine:* the Anthropic API (company account, key in the Hub's server settings).
   It sits behind one swappable "reader" switch, and the Hub **learns each vendor's
   layout** so repeat invoices from the same vendor are read without calling the AI;
   the AI is only used for new vendors, layout changes, or when the Hub's own reading
   doesn't add up.
3. **Match & code.**
   - *Vendor:* matched to the NetSuite vendor by sender address / domain, name and
     tax id on the invoice. First time a vendor is seen, a person confirms the match once.
   - *Coding:* each vendor's **profile** is learned from its past bills — subsidiary,
     AP account, expense account, department, class, location, VAT code, memo
     pattern. The bill is proposed exactly the way that vendor has always been booked.
   - *Payment:* "paid by Visa ending 5335" → that card's NetSuite account. No card shown →
     the vendor's usual payment account from its history.
4. **Checks** (all must pass; any failure → the item waits in review with the reason):
   - lines + tax = total, to the cent;
   - **not a duplicate** — same vendor + invoice number not already in NetSuite (this also
     catches bills someone typed by hand during the transition) and not already in the Hub;
     Stripe-style vendors that send an *invoice* and a *receipt* for one charge count once;
   - vendor recognized and active;
   - amount within the vendor's normal range (e.g. a $34 Cookiebot invoice that becomes $340 is flagged);
   - currency matches the vendor's usual currency;
   - invoice date falls in an open accounting period (otherwise: date it in the open period, and say so);
   - email genuinely from the vendor (Microsoft's sender authentication results) or forwarded
     by a known internal address.
5. **Review.** Phase 1: every bill waits for a person — PDF on the left, the proposed bill
   on the right, everything editable, **Approve** posts it. Reject (with reason) keeps it
   on record. Corrections teach the vendor profile.
6. **Post to NetSuite.**
   - **Vendor bill:** vendor, subsidiary, reference no. = invoice number, date = invoice
     date, due date, currency, memo `<Vendor> MM.YY`, AP account, one expense line per
     account (multi-line invoices are summarized per account, as today), VAT code for the
     Israeli subsidiary. The original PDF is attached to the bill.
   - **Bill payment** (only when the invoice is already paid): from the card / bank
     account, dated the payment date, applied to the bill.
   - Every record carries an external id derived from the document, so a retry can never
     create a second bill or payment (same safety approach as the Shopify sync).

**Unpaid invoices** (net-30 etc.) in Phase 1: read and checked, then marked
"unpaid — handle manually" in the review list. Phase 2 posts them as open bills.

## 3. What you see in the Hub (new "Accounts Payable" area)

- **Inbox** — every document with its status: *Reading → Needs review → Posted*,
  or *Rejected* / *Not an invoice* / *Unpaid (manual)*. Search and filters; links to the
  bill and payment in NetSuite.
- **Review** — PDF next to the proposed bill; Approve / Edit / Reject.
- **Upload** — drag-and-drop PDFs.
- **Vendors** — each vendor's learned profile (coding, payment account, usual amount,
  sender addresses), editable.
- **Settings** — see below.
- Daily email to the approvers when items are waiting.

## 4. Settings (what any company configures — the product view)

| Setting | Qiqi's configuration |
|---|---|
| Intake mailbox | `ap@qiqiglobal.com` |
| Internal forwarders trusted as senders | `@qiqiglobal.com` |
| Subsidiaries in scope | Qiqi INC., Qiqi Global Ltd. |
| Payment cards → NetSuite account | Visa 5335 → 220301 · Mastercard 4223 USD → 220202 · Mastercard 4223 ILS → 220201 |
| Default AP account | 210100 (domestic) / 210101 (foreign) — learned per vendor |
| VAT handling | Israeli VAT codes on Qiqi Global Ltd. — learned per vendor |
| Approvers | any Hub admin, chosen by the owner in AP settings |
| Auto-post limit (Phase 2) | off in Phase 1 |
| Reader | Anthropic API, company key; cheaper model first |

Nothing Qiqi-specific in code: vendors, accounts, cards, VAT codes and limits are all data.

## 5. Safety

- **Nothing lost, nothing doubled:** every email, attachment and NetSuite record is
  tracked; the external-id rule makes retries safe.
- **Fraud:** only recognized senders; new vendors and changed bank details are never
  auto-anything; the Hub never sends a wire or creates a payment for an unpaid invoice.
- **Audit trail:** original PDF (Hub storage + attached in NetSuite), what was read, the
  proposed vs approved bill, who approved and when.
- **Access:** the Hub reads `ap@` only (not other mailboxes); the AI key lives on the
  server only; new permissions `ap:view` / `ap:edit` decide who can see and approve.
- **Testing:** built and tested against the NetSuite **sandbox**, with real invoices from
  `ap@`, before anything touches production.

## 6. Setup steps (guided, one at a time, when we reach them)

1. ✅ Shared mailbox `ap@qiqiglobal.com` created.
2. Start sending small-vendor invoices to `ap@` (forward, or change the billing email in
   each vendor account) — builds the real test set while we build.
3. Microsoft 365: allow the Hub's existing Microsoft app to **read** `ap@` only.
4. Anthropic: API key into `.env.local` + Vercel; ~$20 credit.
5. NetSuite: confirm the Hub's integration role may create vendor bills and bill
   payments (I test in the sandbox and tell you exactly what's missing, if anything);
   upload one small update to the Hub's existing NetSuite script so it can attach the PDF
   to the bill.
6. Hub: one database change (I run it on staging; you run it in production as usual).

## 7. Owner decisions (2026-10-24)

1. **Approvers** — any Hub admin, picked from the admin list in AP settings.
2. **Bill date** — the invoice date.
3. **Multi-line invoices** — one line per expense account.
4. **Memo** — keep `<Vendor> MM.YY`.
5. **Start set** — the small vendors; 3PL and factories in Phase 3.
6. **Intake** — the Hub reads the `ap@qiqiglobal.com` shared mailbox (Microsoft 365).

## 8. Later phases (not in Phase 1)

- **Phase 2 — autopilot:** trusted vendors under a limit post without review; unpaid
  invoices become open bills; "missing invoice" alerts (e.g. no Supabase invoice for
  October); monthly summary.
- **Phase 3 — the big invoices:** BrandFox (3PL) invoices checked against actual ShipHero
  shipments; factory bills matched to purchase orders and receipts.
