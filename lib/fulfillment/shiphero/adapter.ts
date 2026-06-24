import type { ShipHeroConfig } from './config';
import { getShipHeroConfig } from './config';
import { ShipHeroClient } from './client';
import { buildShipHeroOrderInput, parseShipHeroWebhook, parseShipHeroOrderFulfillment } from './mapping';
import type {
  FulfillmentProvider,
  NormalizedOrder,
  CreateOrderResult,
  NormalizedFulfillmentEvent,
  FulfillmentSnapshot,
} from '../types';

/**
 * ShipHero implementation of the provider-agnostic `FulfillmentProvider`.
 *
 * Live mutations (order_create, webhook_create) are suppressed unless the
 * dry-run gate is explicitly disabled (SHIPHERO_DRY_RUN=false). In dry-run we
 * still build and return the exact payload so it can be reviewed/logged.
 */

const ORDER_CREATE = /* GraphQL */ `
  mutation($data: CreateOrderInput!) {
    order_create(data: $data) {
      request_id
      complexity
      order { id legacy_id order_number partner_order_id }
    }
  }
`;

const WEBHOOK_CREATE = /* GraphQL */ `
  mutation($data: CreateWebhookInput!) {
    webhook_create(data: $data) {
      request_id
      complexity
      webhook { id legacy_id account_id name url enabled shared_signature_secret }
    }
  }
`;

const ORDER_CANCEL = /* GraphQL */ `
  mutation($data: CancelOrderInput!) {
    order_cancel(data: $data) {
      request_id
      complexity
    }
  }
`;

const ORDER_FULFILLMENT = /* GraphQL */ `
  query($id: String!) {
    order(id: $id) {
      request_id
      data {
        fulfillment_status
        shipments {
          id
          created_date
          shipping_labels {
            tracking_number
            carrier
            shipping_method
            tracking_url
            delivered
          }
        }
      }
    }
  }
`;

// ShipHero's webhook type string for the fulfillment/ready signal.
const SHIPMENT_UPDATE_WEBHOOK_NAME = 'Shipment Update';

export class ShipHeroProvider implements FulfillmentProvider {
  readonly name = 'shiphero';
  readonly dryRun: boolean;

  private client: ShipHeroClient;

  constructor(private config: ShipHeroConfig) {
    this.dryRun = config.dryRun;
    this.client = new ShipHeroClient(config);
  }

  async createOrder(order: NormalizedOrder): Promise<CreateOrderResult> {
    // Record the submission date (now) as the ShipHero order_date — see mapping.
    const data = buildShipHeroOrderInput(order, this.config, new Date().toISOString());

    if (this.dryRun) {
      return { externalId: null, dryRun: true, request: data };
    }

    // Going live: refuse to create an unscoped order on BrandFox's master 3PL
    // account — without customer_account_id it could land under the wrong brand.
    if (!this.config.customerAccountId) {
      throw new Error(
        'ShipHero customer_account_id is not configured (SHIPHERO_CUSTOMER_ACCOUNT_ID). ' +
          'Refusing to create an order on the master 3PL account without scoping it to Qiqi.',
      );
    }

    const res = await this.client.graphql<{
      order_create: { order: { id: string; legacy_id: string; order_number: string; partner_order_id: string } };
    }>(ORDER_CREATE, { data });

    const created = res.order_create?.order;
    return {
      externalId: created?.id ?? null,
      externalLegacyId: created?.legacy_id ?? null,
      dryRun: false,
      request: data,
      raw: res,
    };
  }

  parseWebhook(args: {
    rawBody: string;
    headers: Record<string, string>;
    urlToken?: string | null;
  }): NormalizedFulfillmentEvent | null {
    // Verify the shared secret carried in the callback URL before trusting the
    // payload. (ShipHero also exposes a per-webhook shared_signature_secret for
    // HMAC verification — a future hardening once we capture the header scheme.)
    if (this.config.webhookSecret && args.urlToken !== this.config.webhookSecret) {
      return null;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(args.rawBody);
    } catch {
      return null;
    }
    return parseShipHeroWebhook(payload);
  }

  async cancelOrder(externalId: string, reason = 'Cancelled from Qiqi Hub'): Promise<{ dryRun: boolean; raw?: unknown }> {
    const data: Record<string, unknown> = { order_id: externalId, reason };
    if (this.config.customerAccountId) data.customer_account_id = this.config.customerAccountId;

    if (this.dryRun) {
      return { dryRun: true, raw: data };
    }
    const res = await this.client.graphql(ORDER_CANCEL, { data });
    return { dryRun: false, raw: res };
  }

  async getFulfillment(externalId: string): Promise<FulfillmentSnapshot> {
    // Read-only — not gated by dry-run, so the Hub can show status pre-go-live.
    const res = await this.client.graphql<{ order: { data: any } }>(ORDER_FULFILLMENT, { id: externalId });
    return parseShipHeroOrderFulfillment(res.order?.data);
  }

  async registerWebhook(url: string): Promise<{ id: string | null; dryRun: boolean; raw?: unknown }> {
    const data: Record<string, unknown> = {
      name: SHIPMENT_UPDATE_WEBHOOK_NAME,
      url,
      enabled: true,
      shop_name: this.config.shopName,
    };
    if (this.config.customerAccountId) data.customer_account_id = this.config.customerAccountId;

    if (this.dryRun) {
      return { id: null, dryRun: true, raw: data };
    }

    const res = await this.client.graphql<{ webhook_create: { webhook: { id: string } } }>(
      WEBHOOK_CREATE,
      { data },
    );
    return { id: res.webhook_create?.webhook?.id ?? null, dryRun: false, raw: res };
  }
}

/** Factory mirroring `createNetSuiteAPI()` / `createStripeClient()`. */
export function createShipHeroProvider(): ShipHeroProvider {
  return new ShipHeroProvider(getShipHeroConfig());
}
