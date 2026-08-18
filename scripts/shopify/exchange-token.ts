/**
 * One-time (and rotation-time) helper: exchange the Shopify custom app's
 * client credentials for a permanent Admin API access token.
 *
 * Dev-dashboard apps don't expose a ready-made shpat_ token in the UI —
 * you exchange client_id + client_secret for one. Run:
 *
 *   npx tsx scripts/shopify/exchange-token.ts
 *
 * Reads SHOPIFY_STORE_DOMAIN / SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET
 * from .env.local and prints instructions. The token itself is written to
 * .env.local as SHOPIFY_ADMIN_TOKEN (never printed in full).
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const ENV_PATH = path.join(process.cwd(), '.env.local');
dotenv.config({ path: ENV_PATH });

async function main() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) {
    throw new Error('Missing SHOPIFY_STORE_DOMAIN / SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET in .env.local');
  }

  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  if (!res.ok || !data.access_token) {
    throw new Error(`Token exchange failed (HTTP ${res.status}): ${JSON.stringify(data).slice(0, 500)}`);
  }

  const token: string = data.access_token;
  const masked = `${token.slice(0, 10)}...${token.slice(-4)}`;

  // Upsert SHOPIFY_ADMIN_TOKEN in .env.local
  let env = fs.readFileSync(ENV_PATH, 'utf8');
  if (/^SHOPIFY_ADMIN_TOKEN=/m.test(env)) {
    env = env.replace(/^SHOPIFY_ADMIN_TOKEN=.*$/m, `SHOPIFY_ADMIN_TOKEN=${token}`);
  } else {
    env = env.trimEnd() + `\nSHOPIFY_ADMIN_TOKEN=${token}\n`;
  }
  fs.writeFileSync(ENV_PATH, env);

  console.log(`OK — token ${masked} written to .env.local as SHOPIFY_ADMIN_TOKEN`);
  if (data.scope) console.log(`granted scopes: ${data.scope}`);
  if (data.expires_in) {
    console.log(`NOTE: token reports expires_in=${data.expires_in}s — not a permanent offline token; we'll need the authorization-code flow instead.`);
  }
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
