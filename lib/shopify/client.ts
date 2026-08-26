/**
 * L1 TRANSPORT — Shopify Admin GraphQL client. No business logic.
 *
 * Auth: dev-dashboard custom apps issue 24h tokens via the client-credentials
 * grant. We exchange on demand and cache in memory until ~5 min before
 * expiry (serverless cold starts just re-exchange — one cheap call).
 * SHOPIFY_ADMIN_TOKEN, when set, is used as a static override (scripts).
 *
 * Throttling: Shopify GraphQL is cost-based; on THROTTLED we back off and
 * retry. 5xx/network errors retry with exponential backoff.
 */

export const SHOPIFY_API_VERSION = '2026-07';

interface TokenCache {
  token: string;
  expiresAt: number; // epoch ms
}

let tokenCache: TokenCache | null = null;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

async function exchangeToken(): Promise<TokenCache> {
  const domain = env('SHOPIFY_STORE_DOMAIN');
  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    signal: AbortSignal.timeout(60_000),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env('SHOPIFY_CLIENT_ID'),
      client_secret: env('SHOPIFY_CLIENT_SECRET'),
      grant_type: 'client_credentials',
    }),
  });
  const data: any = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    throw new Error(`Shopify token exchange failed (HTTP ${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  const ttlMs = (typeof data.expires_in === 'number' ? data.expires_in : 86400) * 1000;
  return { token: data.access_token, expiresAt: Date.now() + ttlMs - 5 * 60_000 };
}

async function getToken(): Promise<string> {
  const staticToken = process.env.SHOPIFY_ADMIN_TOKEN;
  if (staticToken) return staticToken;
  if (!tokenCache || Date.now() >= tokenCache.expiresAt) {
    tokenCache = await exchangeToken();
  }
  return tokenCache.token;
}

export class ShopifyGraphQLError extends Error {
  constructor(
    message: string,
    public readonly errors: unknown,
    public readonly httpStatus: number,
  ) {
    super(message);
  }
}

const MAX_ATTEMPTS = 5;

export async function shopifyGraphQL<T = any>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const domain = env('SHOPIFY_STORE_DOMAIN');
  let attempt = 0;
  // Sequential retry loop — each attempt depends on the previous failing.
  while (true) {
    attempt += 1;
    let res: Response | null = null;
    let netErr: unknown = null;
    try {
      // A hung socket must fail loudly, not freeze the poller (2026-08-26 wedge).
      res = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        signal: AbortSignal.timeout(60_000),
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await getToken() },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      netErr = err;
    }

    if (res && res.ok) {
      const body: any = await res.json();
      if (!body.errors) return body.data as T;
      const throttled = Array.isArray(body.errors) && body.errors.some((e: any) => e?.extensions?.code === 'THROTTLED');
      if (throttled && attempt < MAX_ATTEMPTS) {
        const waitMs = 1000 * attempt;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw new ShopifyGraphQLError(
        `Shopify GraphQL errors: ${JSON.stringify(body.errors).slice(0, 500)}`,
        body.errors,
        res.status,
      );
    }

    const status = res?.status ?? 0;
    const retryable = netErr !== null || status === 429 || status >= 500;
    if (retryable && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      continue;
    }
    const text = res ? (await res.text()).slice(0, 300) : String(netErr);
    throw new ShopifyGraphQLError(`Shopify HTTP ${status}: ${text}`, null, status);
  }
}

/**
 * Paginate a connection query. `query` must declare ($cursor: String) and
 * select pageInfo { hasNextPage endCursor } on the connection addressed by
 * `path` (dot path from data root, e.g. "orders").
 */
export async function shopifyPaginate<TNode = any>(
  query: string,
  variables: Record<string, unknown>,
  path: string,
): Promise<TNode[]> {
  const nodes: TNode[] = [];
  let cursor: string | null = null;
  // Sequential by nature: each page needs the previous endCursor.
  while (true) {
    const data: any = await shopifyGraphQL(query, { ...variables, cursor });
    const conn = path.split('.').reduce((o: any, k) => o?.[k], data);
    if (!conn) throw new Error(`shopifyPaginate: no connection at path "${path}"`);
    nodes.push(...conn.nodes);
    if (!conn.pageInfo?.hasNextPage) return nodes;
    cursor = conn.pageInfo.endCursor;
  }
}
