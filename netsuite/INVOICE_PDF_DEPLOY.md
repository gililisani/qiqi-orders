# Deploying the invoice PDF RESTlet (Billing Phase B)

This lets the Hub serve partners the **real NetSuite invoice PDF** — rendered
inside NetSuite with your Advanced PDF/HTML invoice template (remittance
details, bank info, terms, logo — identical to the UI's Print button). The Hub
only transports the bytes; change the template in NetSuite and the Hub picks
it up automatically.

Same routine as the as-of inventory RESTlet. ~10 minutes, NetSuite
Administrator role.

## 1. Upload the script
1. **Customization → Scripting → Scripts → New.**
2. Click the **+** by "Script File" → upload `netsuite/restlet_invoice_pdf.js`.
3. **Create Script Record.** Type is detected as **RESTlet**.
4. Under **Scripts** tab, the GET function is `get`. Name it e.g.
   `QQ Invoice PDF`. **Save.**

## 2. Deploy it
1. On the saved script record → **Deploy Script.**
2. **Status: Released.** **Log Level: Error.**
3. **Audience / Roles:** add **QQ Partners Hub Role** (the role the
   integration token uses — same as the inventory RESTlet).
4. **Save.**

## 3. Get the IDs (for the app's env)
On the deployment record, the **External URL** looks like:
```
https://<acct>.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=5678&deploy=1
```
Copy the two numbers:
- `script=` → **NETSUITE_INVPDF_SCRIPT_ID** (e.g. `5678`)
- `deploy=` → **NETSUITE_INVPDF_DEPLOY_ID** (e.g. `1`)

Add both to Vercel (**Production** scope — staging has no NetSuite on
purpose) and to local `.env.local`:
```
NETSUITE_INVPDF_SCRIPT_ID=5678
NETSUITE_INVPDF_DEPLOY_ID=1
```

## 4. Permissions
The token role already runs RESTlets (granted for the inventory one). This
script additionally **loads and prints invoices**, so if the first test
returns a permission error, check the role has:
- **Permissions → Transactions → Invoice** — at least **View**
- **Permissions → Transactions → Print Checks and Forms** — if NetSuite
  complains specifically about printing

## Updating the script (new version of the .js file)

No new script record, no new IDs. In NetSuite:
1. **Customization → Scripting → Scripts** → open the script (e.g. "Partners
   Hub Invoice pull").
2. Click the **Script File** link → **Edit** → replace the content with the
   new file (or upload the new file over it) → **Save**.
The existing deployment serves the new code immediately.

## 5. Verify
Ask the agent to run the local verification script against a known invoice
(it fetches one PDF, read-only, and saves it for you to open):
```
npx tsx scripts/verify-invoice-pdf.ts <netsuite invoice internal id>
```
Compare the saved PDF against the same invoice printed from the NetSuite UI —
they should be identical. After that, the Download buttons in the Hub
(billing page + order details) go live on their own; without the env vars
they show a friendly "not available right now" error instead.
