import { defineConfig } from 'vitest/config';
import { transform } from 'esbuild';
import path from 'path';

export default defineConfig({
  plugins: [
    {
      // lib/pdf/components/*.js contain JSX (Next transpiles them in the app
      // build); teach vitest's pipeline to do the same so tests can render them.
      name: 'jsx-in-js',
      async transform(code: string, id: string) {
        if (!/lib\/pdf\/components\/.*\.js$/.test(id)) return null;
        const result = await transform(code, { loader: 'jsx', jsx: 'transform', sourcefile: id });
        return { code: result.code, map: null };
      },
    },
  ],
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
