import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': fileURLToPath(
        new URL('./src/__tests__/support/cloudflare-workers-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Bundle the provider through Vite so the cloudflare:workers alias applies.
    server: { deps: { inline: ['@cloudflare/workers-oauth-provider'] } },
  },
});
