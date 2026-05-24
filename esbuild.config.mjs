import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';

const watch = process.argv.includes('--watch');

function copyCodicons() {
  const src = 'node_modules/@vscode/codicons/dist';
  mkdirSync('dist/codicons', { recursive: true });
  copyFileSync(`${src}/codicon.css`, 'dist/codicons/codicon.css');
  copyFileSync(`${src}/codicon.ttf`, 'dist/codicons/codicon.ttf');
}

const ctx = await esbuild.context({
  entryPoints: {
    extension: 'src/extension.ts',
    perfWorker: 'src/workers/perfWorker.ts'
  },
  bundle: true,
  outdir: 'dist',
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  minify: !watch,
  external: ['vscode', 'puppeteer-core', 'lighthouse'],
  logLevel: 'info'
});

copyCodicons();

if (watch) {
  await ctx.watch();
  console.log('[esbuild] watching...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
