# QQ Shopify 100501 Feed — deploy checklist (Part 1 reconciliation)

Goal: NetSuite pulls the Shopify statement for 100501 from the Hub on its
own schedule → Match Bank Data's left side fills itself → reconciliation
rules auto-pair everything the engine posted. After this, nobody imports
anything into 100501 by hand.

Prereqs already true in the account: Bank Statement Parsers SuiteApp
(OFX parser installed), Financial Institution Connectivity feature
(FICONNECTIVITY script type present), Hub endpoint live at
https://partners.qiqiglobal.com/api/shopify/statement (main 6ff5a88).

All steps run in PRODUCTION NetSuite (owner's call 2026-08-23: sandbox
already proved import + rules; the real 1:1 match rate lives in prod).
Safe because an import posts NOTHING to the GL — statement lines are
reconciliation data; auto-matches wait in Review for confirmation, and
imported lines can always be Excluded.

Production-specific:
- The bookkeeper's OLD imported lines still open on 100501's left side
  may duplicate lines this feed brings for the same transactions →
  Exclude her leftovers so nothing double-matches.
- In Review, confirm page by page after a scan — never blanket-confirm.

1. **Token into Vercel** — copy `SHOPIFY_STATEMENT_TOKEN` from `.env.local`
   into Vercel → qiqi-orders → Settings → Environment Variables →
   Production scope → redeploy (or wait for the next deploy).
2. **Plug-in script** — two parts:
   a. Documents > Files > SuiteScripts: upload
      `netsuite/fi_connectivity_shopify.js`.
   b. Customization > Plug-ins > Plug-in Implementations > New → pick the
      uploaded file → type shows "Financial Institution Connectivity" →
      name "QQ Shopify 100501 Feed" → Save (Status: Released).
   (b matters: uploading the file alone registers nothing.)
3. **Token into NetSuite** — Setup > Company > API Secrets > New:
   ID `custsecret_qq_stmt_token`, value = the same token as step 1,
   "Restrict to Script" → pick the plug-in from step 2b. (This is why the
   script must exist first.)
4. **Financial Institution record** — Setup > Accounting > Financial
   Institutions > New: name "Shopify Payments (Hub)". Add a **Format
   Profile**: profile type Bank Reconciliation, connectivity plug-in =
   QQ Shopify 100501 Feed, parser = "OFX/QFX Plugin Implementation".
5. **Link the account** — on the format profile's Account Linking subtab
   the plug-in offers "Shopify Payments (Qiqi Hub)" → map it to GL
   **100501 Shopify - QIQI INC (USD)**.
6. **First import** — Transactions > Bank > Banking Import (or the
   format profile's import action) → the first pull requests everything
   since 2026-01-01 (the cleaned backlog). Then Match Bank Data →
   Run Reconciliation Rules → Review → Confirm.
7. **Matching rule** — Match Bank Data > Reconciliation Rules: add a rule
   amount equal + date within 2 days + bank memo contains transaction
   memo/number (absorbs midnight-crossing charges; makes same-amount
   days unambiguous).
8. **Schedule** — Manage Import Schedules on the Match Bank Data page:
   daily is fine; weekly (Mondays after the payout run) is enough.

Backlog notes: the bookkeeper's per-payout "TRANSFER Shopify CCD"
journals match the payout lines 1:1; her MONTHLY "Shopify Fee" journals
pair with several per-payout fee lines → match those few many-to-one by
hand once. From the 2026-08-17 payout onward everything is engine-posted
and pairs 1:1.

Rollback: deactivate the plug-in implementation (or the import schedule);
imported-but-unmatched lines can be Excluded. Nothing posts to the GL
from an import — matching only flags reconciliation state.

## PayPal + Affirm accounts (Phase A, added 2026-08-24)

The same plug-in now serves three accounts: `shopify-payments` (100501),
`paypal` (100504), `affirm` (100503). PayPal/Affirm lines are the ORDER
side only (charges + refunds from Shopify — 26/26 and 13/13 verified
against NS postings). Gateway fees and bank transfers are not in Shopify;
the bookkeeper keeps booking/matching those (Phase B = PayPal/Affirm APIs).

To enable (after the Hub deploy carrying the `account` parameter):
1. File Cabinet → replace `fi_connectivity_shopify.js` with the current
   version (adds the two accounts).
2. Setup > Accounting > Financial Institutions > "Shopify Payments (Hub)"
   → the format profile → **Account Linking** → two new rows appear:
   "PayPal via Shopify (Qiqi Hub)" → link GL **100504**,
   "Affirm via Shopify (Qiqi Hub)" → link GL **100503**;
   set each row's earliest-import date (60-day max applies) → Save.
3. Next 00:01 import (or Update Imported Bank Data) pulls all three.
   Affirm is the bookkeeper's best-kept account — expect some of its
   older lines to find no free partner (already matched her way):
   Exclude those.
