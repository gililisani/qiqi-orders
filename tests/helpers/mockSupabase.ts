import { vi } from 'vitest';

type RpcHandler = (args: any) => Promise<{ data: any; error: any }> | { data: any; error: any };

/**
 * Tiny fluent Supabase mock. Covers `.rpc()` and `.from().select().eq()...`
 * just enough for our security/saga tests. Each chained method returns the
 * same builder object, so you can keep chaining; the final result is
 * yielded by awaiting (or by .single()/.maybeSingle()).
 */
export function createMockSupabase(opts: {
  rpc?: Record<string, RpcHandler>;
  tableResults?: Record<string, { data: any; error: any }>;
  auth?: {
    getUser?: () => Promise<{ data: { user: any }; error: any }>;
    admin?: any;
  };
} = {}) {
  const rpcSpy = vi.fn(async (name: string, args: any) => {
    const handler = opts.rpc?.[name];
    if (!handler) return { data: null, error: { message: `unmocked rpc: ${name}` } };
    return await handler(args);
  });

  const tableSpy = vi.fn((tableName: string) => {
    const result = opts.tableResults?.[tableName] ?? { data: null, error: null };
    const builder: any = {
      select: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      update: vi.fn(() => builder),
      delete: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => result),
      single: vi.fn(async () => result),
      then: (resolve: any) => Promise.resolve(result).then(resolve),
    };
    return builder;
  });

  const authMock = opts.auth ?? {
    getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
  };

  return {
    rpc: rpcSpy,
    from: tableSpy,
    auth: authMock,
    __spies: { rpc: rpcSpy, from: tableSpy },
  } as any;
}
