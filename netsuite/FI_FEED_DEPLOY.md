# QQ Shopify 100501 Feed — deploy checklist (Part 1 reconciliation)

Goal: NetSuite pulls the Shopify statement for 100501 from the Hub on its
own schedule → Match Bank Data's left side fills itself → reconciliation
rules auto-pair everything the engine posted. After this, nobody imports
anything into 100501 by hand.

Prereqs already true in the account: Bank Statement Parsers SuiteApp
(OFX parser installed), Financial Institution Connectivity feature
(FICONNECTIVITY script type present), Hub endpoint live at
https://partners.qiqiglobal.com/api/shopify/statement (main 6ff5a88).

Do SANDBOX first (Hub endpoint is read-only; imports land in sandbox
100501), then repeat 3-7 in PRODUCTION.

1. **Token into Vercel** — copy `SHOPIFY_STATEMENT_TOKEN` from `.env.local`
   into Vercel → qiqi-orders → Settings → Environment Variables →
   Production scope → redeploy (or wait for the next deploy).
2. **Token into NetSuite** — Setup > Company > API Secrets > New:
   ID `custsecret_qq_stmt_token`, value = the same token,
   restrict to the script from step 3.
3. **Upload the plug-in** — Documents > Files > SuiteScripts: upload
   `netsuite/fi_connectivity_shopify.js`. Then Customization > Plug-ins >
   Plug-in Implementations > New → pick the file → type shows
   "Financial Institution Connectivity" → name "QQ Shopify 100501 Feed"
   → Save (Status: Released).
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
