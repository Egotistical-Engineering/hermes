import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(async () => {
  const plugins = [
    react(),
    tsconfigPaths({ ignoreConfigErrors: true }),
  ];

  // Only load Sentry plugin when auth token is available (avoids @sentry/cli dep in CI)
  if (process.env.SENTRY_AUTH_TOKEN) {
    const { sentryVitePlugin } = await import('@sentry/vite-plugin');
    plugins.push(
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
      }),
    );
  }

  return {
    plugins,
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-sentry': ['@sentry/react'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-tiptap': ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-placeholder', '@tiptap/markdown'],
            'vendor-markdown': ['react-markdown', 'remark-gfm'],
          },
        },
      },
    },
    server: {
      port: 5176,
      strictPort: true,
    },
  };
});
