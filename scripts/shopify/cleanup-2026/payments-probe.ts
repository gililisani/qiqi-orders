import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import fs from 'fs';
import axios from 'axios';
import { shopifyGraphQL } from '../../../lib/shopify/client';
import { createNetSuiteForTarget } from '../../../lib/shopify/engine/nsTarget';
import { normalizeNsDate } from '../../../lib/netsuite';

const NAMES = ['5621','5734','5789','5828','5851','5924','5995','6234','6256','6360','6402','6435','6499','6559','6570','6585','6598','6602','6649','6739','6753','6760','6773','6787','6816','6903','6991','7026','7029','7208','7215','7232','7251','7268'];
const INV: Record<string,string> = {'5621':'INVUS15367','5734':'INVUS15486','5789':'INVUS15604','5828':'INVUS15646','5851':'INVUS16699','5924':'INVUS16759','5995':'INVUS15829','6234':'INVUS16073','6256':'INVUS16698','6360':'INVUS17139','6402':'INVUS16697','6435':'INVUS16274','6499':'INVUS16337','6559':'INVUS16531','6570':'INVUS16545','6585':'INVUS16693','6598':'INVUS16442','6602':'INVUS16444','6649':'INVUS16434','6739':'INVUS17140','6753':'INVUS16609','6760':'INVUS16616','6773':'INVUS16631','6787':'INVUS16645','6816':'INVUS16679','6903':'INVUS16778','6991':'INVUS16868','7026':'INVUS16904','7029':'INVUS16907','7208':'INVUS17089','7215':'INVUS17096','7232':'INVUS17113','7251':'INVUS17132','7268':'INVUS17151'};

async function applying(ns: any, invoiceId: string) {
  const scriptId = process.env.NETSUITE_INVPDF_SCRIPT_ID!, deployId = process.env.NETSUITE_INVPDF_DEPLOY_ID!;
  const acct = process.env.NETSUITE_ACCOUNT_ID!.toLowerCase().replace(/_/g, '-');
  const url = `https://${acct}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?${new URLSearchParams({ script: scriptId, deploy: deployId, paymentForInvoice: invoiceId, debug: '1' })}`;
  const res = await axios({ method: 'GET', url, headers: { Authorization: ns.getAuthHeader(url, 'GET'), Accept: 'application/json', 'Content-Type': 'application/json' }, validateStatus: () => true });
  return res.status < 400 ? (res.data?.applying ?? []) : [{ error: `HTTP ${res.status}` }];
}

async function main() {
  const ns: any = createNetSuiteForTarget('production');
  const orders: any[] = [];
  for (let i = 0; i < NAMES.length; i += 10) {
    const q = NAMES.slice(i, i + 10).map((n) => `name:#${n}`).join(' OR ');
    const d = await shopifyGraphQL(`{ orders(first: 20, query: "${q}") { nodes { name currentTotalPriceSet { shopMoney { amount } } totalRefundedSet { shopMoney { amount } } transactions(first: 10) { kind status amountSet { shopMoney { amount } } } } } }`);
    orders.push(...d.orders.nodes);
  }
  const byName = new Map(orders.map((o) => [o.name.replace('#',''), o]));
  const rows = ['| Order | Shopify charged | NS invoice | NS payment(s) by memo (amount · date · 100501 line cleared) | Linked (RESTlet) | CMs by memo |','|---|---|---|---|---|---|'];
  const stats = { payEqInvoice: 0, payEqShopify: 0, payOther: 0, cleared: 0, noPay: 0 };
  for (const n of NAMES) {
    const o = byName.get(n);
    const charged = o ? o.transactions.filter((t: any) => (t.kind==='SALE'||t.kind==='CAPTURE') && t.status==='SUCCESS').reduce((s: number, t: any) => s + Number(t.amountSet.shopMoney.amount), 0) : NaN;
    const inv = (await ns.suiteQL(`SELECT id, foreigntotal FROM transaction WHERE tranid = '${INV[n]}'`))[0];
    const pays = await ns.suiteQL(`SELECT id, tranid, trandate, foreigntotal FROM transaction WHERE type = 'CustPymt' AND memo = '${n}'`);
    const cms = await ns.suiteQL(`SELECT tranid, foreigntotal FROM transaction WHERE type = 'CustCred' AND memo = '${n}'`);
    const payCells: string[] = [];
    for (const p of pays) {
      const lines = await ns.suiteQL(`SELECT tal.account, tl.cleared FROM transactionline tl JOIN transactionaccountingline tal ON tal.transaction = tl.transaction AND tal.transactionline = tl.id WHERE tl.transaction = ${p.id}`);
      const clearing = lines.find((l: any) => String(l.account) === '1019');
      const cl = clearing?.cleared === 'T';
      if (cl) stats.cleared++;
      const amt = Number(p.foreigntotal);
      if (Math.abs(amt - Number(inv?.foreigntotal)) < 0.005) stats.payEqInvoice++; else if (Math.abs(amt - charged) < 0.005) stats.payEqShopify++; else stats.payOther++;
      payCells.push(`${p.tranid} $${amt.toFixed(2)} · ${normalizeNsDate(p.trandate)} · ${cl ? 'CLEARED' : 'not cleared'}`);
    }
    if (!pays.length) stats.noPay++;
    const linked = inv ? await applying(ns, String(inv.id)) : [];
    rows.push(`| #${n} | $${charged.toFixed(2)} | ${INV[n]} $${Number(inv?.foreigntotal).toFixed(2)} | ${payCells.join('<br>') || '—'} | ${linked.map((a: any) => a.tranid ?? a.error).join(', ') || '—'} | ${cms.map((c: any) => `${c.tranid} $${Math.abs(Number(c.foreigntotal)).toFixed(2)}`).join(', ') || '—'} |`);
  }
  const out = `# Payments behind the 34 mismatches — ${new Date().toISOString().slice(0,16)}Z\n\nPayment == NS invoice amount: ${stats.payEqInvoice} · == Shopify charge: ${stats.payEqShopify} · other: ${stats.payOther} · no payment found by memo: ${stats.noPay} · clearing-line CLEARED (bank-matched): ${stats.cleared}\n\n${rows.join('\n')}\n`;
  fs.writeFileSync('/private/tmp/claude-501/-Users-gililisani-Documents-GitHub-qiqi-orders/3eef839b-4bcb-4306-87ad-9aff26f2e337/scratchpad/payments-34.md', out);
  console.log(out);
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 400)); process.exit(1); });
