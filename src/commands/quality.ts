import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { fork, spawn, ChildProcess } from 'child_process';
import { logger } from '../core/logger';
import { loadConfig, QualityBuildConfig } from '../core/config';
import type { ShipmatePanel } from '../panel';

export type QualityMode = 'quick' | 'standard' | 'full';
export type Throttling = 'mobile' | 'desktop';

let activeWorker: ChildProcess | undefined;
let activeBuild: ChildProcess | undefined;
let activePreview: ChildProcess | undefined;
let activeServer: http.Server | undefined;

export interface QualityRequest {
  mode: QualityMode;
  throttling: Throttling;
}

/** Output dirs to probe when `quality.build.dir` isn't set, in priority order. */
const COMMON_DIST_DIRS = ['dist', 'build', 'out', '.output/public', '.next', 'public'];

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json'
};

export function runQualityCheck(
  ctx: vscode.ExtensionContext,
  panel: ShipmatePanel,
  req: QualityRequest
): void {
  cancelQualityCheck();
  void start(ctx, panel, req).catch((err) => {
    logger.error('quality check failed', err);
    panel.post({ type: 'stream:error', payload: { channel: 'quality', error: String(err?.message ?? err) } });
    cleanup();
  });
}

async function start(ctx: vscode.ExtensionContext, panel: ShipmatePanel, req: QualityRequest): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    throw new Error('Open a project folder to run a quality check.');
  }
  const build = loadConfig().qualityBuild;

  const url = build.previewCommand
    ? await runPreviewServer(panel, root, build)
    : await buildAndServe(panel, root, build);

  runWorker(ctx, panel, { ...req, url });
}

function progress(panel: ShipmatePanel, percent: number, step: string): void {
  panel.post({ type: 'stream:delta', payload: { channel: 'quality:progress', percent, step } });
}

/** Run the configured build command, then serve its output dir locally. */
async function buildAndServe(panel: ShipmatePanel, root: string, build: QualityBuildConfig): Promise<string> {
  progress(panel, 8, `Building production bundle (${build.command})…`);
  await runCommand(build.command, root, (p) => (activeBuild = p));
  activeBuild = undefined;

  const dir = resolveDistDir(root, build.dir);
  progress(panel, 30, `Serving ${path.relative(root, dir) || '.'}…`);
  return serveStatic(dir);
}

/** Resolve the output dir to serve: explicit config, else first dir with index.html. */
function resolveDistDir(root: string, configured?: string): string {
  // Explicit config wins — trust it as long as the folder exists.
  if (configured) {
    const p = path.isAbsolute(configured) ? configured : path.join(root, configured);
    if (!fs.existsSync(p)) {
      throw new Error(`Configured output folder \`${configured}\` does not exist after the build. Check \`quality.build.dir\` and \`quality.build.command\` in shipmate.config.yml.`);
    }
    if (!fs.existsSync(path.join(p, 'index.html'))) {
      throw new Error(`\`${configured}\` exists but has no index.html to audit. Point \`quality.build.dir\` at the folder your build emits index.html into.`);
    }
    return p;
  }
  // Auto-detect: first known dir that actually contains an index.html.
  for (const candidate of COMMON_DIST_DIRS) {
    if (fs.existsSync(path.join(root, candidate, 'index.html'))) {
      return path.join(root, candidate);
    }
  }
  // None matched — tell the user which dirs exist so they can set the right one.
  const existing = COMMON_DIST_DIRS.filter((c) => fs.existsSync(path.join(root, c)));
  const hint = existing.length
    ? `Found ${existing.join(', ')} but none contain an index.html.`
    : 'No common output folder (dist, build, out, …) was found.';
  throw new Error(
    `Build finished but no auditable output folder was found. ${hint} Set \`quality.build.dir\` in shipmate.config.yml to the folder your build emits index.html into.`
  );
}

/** Minimal static file server with SPA fallback to index.html. Returns the URL. */
function serveStatic(dir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((rq, rs) => {
      try {
        const reqPath = decodeURIComponent((rq.url ?? '/').split('?')[0]);
        let filePath = path.join(dir, reqPath);
        // Block path traversal outside the served dir.
        if (!filePath.startsWith(dir)) {
          rs.writeHead(403).end();
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          const indexed = path.join(filePath, 'index.html');
          filePath = fs.existsSync(indexed) ? indexed : path.join(dir, 'index.html');
        }
        if (!fs.existsSync(filePath)) {
          rs.writeHead(404).end();
          return;
        }
        rs.writeHead(200, { 'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(rs);
      } catch (err) {
        rs.writeHead(500).end(String(err));
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      activeServer = server;
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

/** Spawn a user-provided preview server and wait until its URL responds. */
async function runPreviewServer(panel: ShipmatePanel, root: string, build: QualityBuildConfig): Promise<string> {
  const url = build.previewUrl;
  if (!url) {
    throw new Error('`quality.build.previewCommand` requires `quality.build.previewUrl` in shipmate.config.yml.');
  }
  progress(panel, 10, `Starting preview server (${build.previewCommand})…`);
  activePreview = spawn(build.previewCommand!, { cwd: root, shell: true, stdio: 'ignore' });
  activePreview.on('error', (err) => logger.error('preview server error', err));

  progress(panel, 25, 'Waiting for preview server…');
  await waitForUrl(url, 60_000);
  return url;
}

function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      const r = http.get(url, (res) => {
        res.destroy();
        resolve();
      });
      r.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`Preview server at ${url} did not respond within ${timeoutMs / 1000}s.`));
        } else {
          setTimeout(tick, 500);
        }
      });
    };
    tick();
  });
}

function runCommand(command: string, cwd: string, register: (p: ChildProcess) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, { cwd, shell: true, stdio: ['ignore', 'ignore', 'pipe'] });
    register(proc);
    let stderr = '';
    proc.stderr?.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build failed (exit ${code}). ${stderr.trim().split('\n').slice(-3).join(' ')}`.trim()));
      }
    });
  });
}

function runWorker(ctx: vscode.ExtensionContext, panel: ShipmatePanel, req: QualityRequest & { url: string }): void {
  const workerPath = path.join(ctx.extensionPath, 'dist', 'perfWorker.js');
  const worker = fork(workerPath, [], { silent: false });
  activeWorker = worker;

  worker.on('message', (msg: any) => {
    if (msg.type === 'progress') {
      panel.post({ type: 'stream:delta', payload: { channel: 'quality:progress', ...msg } });
    } else if (msg.type === 'result') {
      panel.post({ type: 'stream:done', payload: { channel: 'quality', result: msg.result } });
      cleanup();
    } else if (msg.type === 'error') {
      panel.post({ type: 'stream:error', payload: { channel: 'quality', error: msg.error } });
      cleanup();
    }
  });

  worker.on('error', (err) => {
    logger.error('perfWorker error', err);
    panel.post({ type: 'stream:error', payload: { channel: 'quality', error: err.message } });
    cleanup();
  });

  worker.send({ type: 'run', req });
}

export function cancelQualityCheck(): void {
  if (activeWorker || activeBuild || activePreview || activeServer) {
    cleanup();
  }
}

function cleanup(): void {
  activeWorker?.kill();
  activeBuild?.kill();
  activePreview?.kill();
  activeServer?.close();
  activeWorker = activeBuild = activePreview = undefined;
  activeServer = undefined;
}
