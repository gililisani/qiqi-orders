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

  // The RLS policy order_history_client_select only serves rows with
  // visible_to_client = true, and the DB default is false. UI-driven entries
  // must therefore opt in explicitly or they vanish from the client timeline.
  function insertedRow(supabase: any): any {
    const fromSpy = supabase.__spies.from;
    const idx = fromSpy.mock.calls.findIndex(
      ([table]: any[]) => table === 'order_history'
    );
    expect(idx).toBeGreaterThanOrEqual(0);
    const insertSpy = fromSpy.mock.results[idx].value.insert;
    expect(insertSpy).toHaveBeenCalledTimes(1);
    return insertSpy.mock.calls[0][0];
  }

  function workingSupabase() {
    return createMockSupabase({
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
  }

  it('marks entries visible to clients by default', async () => {
    const supabase = workingSupabase();
    await addOrderHistoryEntry({ ...baseParams, supabase: supabase as any });
    expect(insertedRow(supabase).visible_to_client).toBe(true);
  });

  it('honors an explicit visibleToClient: false', async () => {
    const supabase = workingSupabase();
    await addOrderHistoryEntry({
      ...baseParams,
      supabase: supabase as any,
      visibleToClient: false,
    });
    expect(insertedRow(supabase).visible_to_client).toBe(false);
  });
});
