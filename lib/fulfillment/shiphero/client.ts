import type { ShipHeroConfig } from './config';
import { getAccessToken } from './auth';

/**
 * Thin ShipHero GraphQL client. GraphQL-only API at a single endpoint; auth is
 * a Bearer access token (see auth.ts). ShipHero rate-limits by a credit/throttle
 * system and returns 200 with an `errors` array on GraphQL errors, so we inspect
 * the body rather than trusting the HTTP status alone.
 */

const GRAPHQL_URL = 'https://public-api.shiphero.com/graphql';

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; code?: number | string }>;
  extensions?: {
    throttling?: {
      user_quota?: { credits_remaining?: number; max_available?: number };
    };
  };
}

export class ShipHeroClient {
  constructor(private config: ShipHeroConfig) {}

  async graphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const token = await getAccessToken(this.config);

    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    const body = (await res.json().catch(() => ({}))) as GraphQLResponse<T>;

    if (res.status >= 400) {
      const msg = body.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
      throw new Error(`ShipHero ${res.status}: ${msg}`);
    }
    if (body.errors?.length) {
      throw new Error(`ShipHero GraphQL error: ${body.errors.map((e) => e.message).join('; ')}`);
    }
    if (!body.data) {
      throw new Error('ShipHero GraphQL returned no data');
    }

    return body.data;
  }
}
