import { describe, it, expect, vi } from 'vitest';
import { addOrderHistoryEntry } from '@/lib/orderHistory';
import { createMockSupabase } from '../helpers/mockSupabase';

describe('addOrderHistoryEntry', () => {
  const baseParams = {
    orderId: 'order-1',
    actionType: 'order_created',
    role: 'admin' as const,
  };

  it('throws if no authenticated user (prevents silent audit-log drop)', async () => {
    const supabase = createMockSupabase({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    });

    await expect(
      addOrderHistoryEntry({ ...baseParams, supabase: supabase as any })
    ).rejects.toThrow(/no authenticated user/i);
  });

  it('throws if supabase.auth.getUser returns an error', async () => {
    const supabase = createMockSupabase({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: { message: 'jwt expired' },
        })),
      },
    });

    await expect(
      addOrderHistoryEntry({ ...baseParams, supabase: supabase as any })
    ).rejects.toThrow(/auth\.getUser failed/i);
  });

  it('throws if the order_history insert fails', async () => {
    const supabase = createMockSupabase({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'user-1' } },
          error: null,
        })),
      },
      tableResults: {
        admins: { data: { name: 'Admin A' }, error: null },
        order_history: { data: null, error: { message: 'insert blew up' } },
      },
    });

    await expect(
      addOrderHistoryEntry({ ...baseParams, supabase: supabase as any })
    ).rejects.toThrow(/insert failed/i);
  });

  it('succeeds when auth, profile lookup, and insert all work', async () => {
    const supabase = createMockSupabase({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'user-1' } },
          error: null,
        })),
      },
      tableResults: {
        admins: { data: { name: 'Admin A' }, error: null },
        order_history: { data: null, error: null },
      },
    });

    await expect(
      addOrderHistoryEntry({ ...baseParams, supabase: supabase as any })
    ).resolves.toBeUndefined();
  });
});
