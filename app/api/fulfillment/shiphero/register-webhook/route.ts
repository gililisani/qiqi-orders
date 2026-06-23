import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../platform/auth/guards';
import { getFulfillmentProvider } from '../../../../../lib/fulfillment';
import { getShipHeroConfig } from '../../../../../lib/fulfillment/shiphero/config';

/**
 * POST /api/fulfillment/shiphero/register-webhook  { baseUrl? }
 *
 * Admin-only. Registers our Shipment Update webhook with ShipHero, scoped to
 * Qiqi's customer account. The callback URL is
 *   <baseUrl>/api/fulfillment/shiphero/webhook?token=<SHIPHERO_WEBHOOK_SECRET>
 * — the secret token is how the webhook handler verifies authenticity.
 *
 * baseUrl defaults to the origin this request came in on (the deployed domain),
 * so calling it from the live admin app registers the correct public URL.
 *
 * Dry-run gated: when SHIPHERO_DRY_RUN is not "false" this reports the URL it
 * WOULD register without creating anything on ShipHero.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const config = getShipHeroConfig();
    if (!config.webhookSecret) {
      return NextResponse.json(
        { error: 'SHIPHERO_WEBHOOK_SECRET is not set — refusing to register an unverifiable webhook.' },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({} as { baseUrl?: string }));
    const base = (body.baseUrl || request.nextUrl.origin).replace(/\/+$/, '');
    const callbackUrl = `${base}/api/fulfillment/shiphero/webhook?token=${encodeURIComponent(config.webhookSecret)}`;

    const provider = getFulfillmentProvider('shiphero');
    if (!provider.registerWebhook) {
      return NextResponse.json({ error: 'Provider does not support webhook registration.' }, { status: 400 });
    }

    const result = await provider.registerWebhook(callbackUrl);

    if (result.dryRun) {
      return NextResponse.json({ success: true, dryRun: true, callbackUrl });
    }
    return NextResponse.json({ success: true, webhookId: result.id, callbackUrl });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('shiphero register-webhook error:', error);
    return NextResponse.json({ error: error.message || 'Failed to register webhook' }, { status: 500 });
  }
}
