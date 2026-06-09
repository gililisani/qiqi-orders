# Deploying the as-of-date inventory RESTlet

This gives the inventory-investigation tool direct, automatic access to
NetSuite's **own measured on-hand for any past date** — eliminating the manual
CSV snapshot uploads and the reconstruction errors (the FPS0017 −22 problem).

You only do this once. ~10 minutes, NetSuite Administrator role.

## 1. Upload the script
1. **Customization → Scripting → Scripts → New.**
2. Click the **+** by "Script File" → upload `netsuite/restlet_inventory_asof.js`.
3. **Create Script Record.** Type is detected as **RESTlet**.
4. Under **Scripts** tab, the GET function is `get`. Name it e.g. `QQ Inventory As-Of`. **Save.**

## 2. Deploy it
1. On the saved script record → **Deploy Script.**
2. **Status: Released.** **Log Level: Error.**
3. **Audience / Roles:** add the role your integration token uses
   (the same one that runs the tool's SuiteQL — "QQ Partners Hub Role").
4. **Save.**

## 3. Get the IDs (for the app's env)
On the deployment record, the **External URL** looks like:
```
https://<acct>.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=1234&deploy=1
```
Copy the two numbers:
- `script=` → **NETSUITE_ASOF_SCRIPT_ID** (e.g. `1234`)
- `deploy=` → **NETSUITE_ASOF_DEPLOY_ID** (e.g. `1`)

Add both to the app environment (Vercel env + local `.env.local`):
```
NETSUITE_ASOF_SCRIPT_ID=1234
NETSUITE_ASOF_DEPLOY_ID=1
```

## 4. Grant RESTlet execution to the token role
The token role must be allowed to run RESTlets:
- **Setup → Users/Roles → Manage Roles →** (the token's role) → **Permissions →
  Setup →** add **SuiteScript** (or **RESTlet**) with **Full**, if not present.

## 5. Validate before we trust it (important)
After deploy + env are set, I'll run a one-line check from the app calling:
```
GET …?date=2024-09-30&item=FPS0017
```
We confirm it returns **Packable - Qiqi INC = 5** (your known-good value). If it
matches, the RESTlet is trustworthy and I switch the engine to anchor on it. If
it's off, we adjust the search formula (the date format / "inventory" filter are
the usual culprits on a given account) before relying on it.

## Notes / gotchas
- **Date format:** locale-safe. The script parses the ISO `date` param into a
  real Date via `N/format` and passes the Date object to the search, so it works
  regardless of the account's display format (this account's UI is MM/DD/YYYY;
  the external SuiteQL API separately returns DD/MM — the two surfaces differ,
  which is why we avoid hardcoding either).
- **"inventory affecting" filter:** uses the transaction-line `inventory` flag,
  mirroring the `isinventoryaffecting='T'` we use elsewhere.
- Nothing here writes to NetSuite — it's read-only.
