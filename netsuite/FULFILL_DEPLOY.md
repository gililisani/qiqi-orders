# Deploying the fulfill-order RESTlet (Shopify sync Loop B)

This lets the Hub create Item Fulfillments for Shopify orders **the same
way the UI's Fulfill button does** — including cross-subsidiary
fulfillment from BrandFox, which NetSuite's plain REST API cannot do
(proven 2026-08-21: REST reports "no valid line item" on cross-subsidiary
orders while the UI and SuiteScript fulfill them fine).

Same routine as the invoice-PDF RESTlet. ~10 minutes, NetSuite
Administrator role.

## 1. Upload the script
1. **Customization → Scripting → Scripts → New.**
2. Click the **+** by "Script File" → upload `netsuite/restlet_fulfill_order.js`.
3. **Create Script Record.** Type is detected as **RESTlet**.
4. Under **Scripts** tab, the POST function is `post`. Name it e.g.
   `QQ Shopify Fulfill`. **Save.**

## 2. Deploy it
1. On the saved script record → **Deploy Script.**
2. **Status: Released.** **Log Level: Error.**
3. **Audience / Roles:** add **QQ Partners Hub Role** (the role the
   integration token uses — same as the PDF RESTlet).
4. **Save.**

## 3. Get the IDs (for the app's env)
On the deployment record, the **External URL** looks like:
```
https://<acct>.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=NNNN&deploy=1
```
Copy the two numbers:
- `script=` → **NETSUITE_FULFILL_SCRIPT_ID**
- `deploy=` → **NETSUITE_FULFILL_DEPLOY_ID**

Add both to Vercel (**Production** scope) and to local `.env.local`:
```
NETSUITE_FULFILL_SCRIPT_ID=NNNN
NETSUITE_FULFILL_DEPLOY_ID=1
```

Until these env vars exist, the sync falls back to the plain REST
transform — which works in sandbox (same-subsidiary) and fails loudly
into the error queue in production. So deploying this RESTlet is what
turns on automated production fulfillments.

## 4. Permissions
The token role already runs RESTlets and now has **Transactions → Fulfill
Sales Orders (Full)** (added 2026-08-21). Nothing else is needed.

## Updating the script (new version of the .js file)
Customization → Scripting → Scripts → open the script → click the Script
File link → Edit → paste the new content (or upload the file over it).
Same script/deploy IDs keep working.
