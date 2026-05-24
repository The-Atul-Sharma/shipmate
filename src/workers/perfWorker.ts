/**
 * Forked child process that runs Lighthouse against a local URL using
 * bundled Puppeteer Chromium. Communicates with the host via IPC.
 */

interface RunMessage {
  type: 'run';
  req: { url: string; mode: 'quick' | 'standard' | 'full'; throttling: 'mobile' | 'desktop' };
}

function progress(percent: number, step: string): void {
  process.send?.({ type: 'progress', percent, step });
}

function categoriesFor(mode: RunMessage['req']['mode']): string[] {
  if (mode === 'quick') {
    return ['performance'];
  }
  if (mode === 'standard') {
    return ['performance'];
  }
  return ['performance', 'accessibility', 'best-practices', 'seo'];
}

import * as fs from 'fs';

/** Locate an installed Chrome/Chromium/Edge across platforms. */
function findChrome(): string | undefined {
  if (process.env.SHIPMATE_CHROME && fs.existsSync(process.env.SHIPMATE_CHROME)) {
    return process.env.SHIPMATE_CHROME;
  }
  const candidates: Record<string, string[]> = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ],
    linux: ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/microsoft-edge']
  };
  for (const p of candidates[process.platform] ?? []) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
}

async function run(req: RunMessage['req']): Promise<void> {
  progress(5, 'Launching Chrome');
  let puppeteer: any;
  let lighthouse: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    puppeteer = require('puppeteer-core');
    lighthouse = (await import('lighthouse')).default;
  } catch {
    throw new Error('Quality runtime missing. Reinstall the latest Shipmate .vsix (it bundles lighthouse + puppeteer-core).');
  }

  // puppeteer-core ships no Chromium — drive the user's installed Chrome.
  const executablePath = findChrome();
  let browser: any;
  try {
    browser = executablePath
      ? await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox'] })
      : await puppeteer.launch({ headless: true, channel: 'chrome', args: ['--no-sandbox'] });
  } catch {
    throw new Error(
      'Could not launch Chrome. Install Google Chrome, or set the SHIPMATE_CHROME env var to a Chrome/Chromium executable path.'
    );
  }
  try {
    progress(20, 'Connecting Lighthouse');
    const endpoint = new URL(browser.wsEndpoint());

    const desktop = req.throttling === 'desktop';
    const flags: any = {
      port: Number(endpoint.port),
      onlyCategories: categoriesFor(req.mode),
      throttlingMethod: desktop ? 'provided' : 'simulate',
      screenEmulation: desktop ? { disabled: true } : undefined,
      formFactor: desktop ? 'desktop' : 'mobile'
    };

    progress(40, 'Auditing page');
    const result = await lighthouse(req.url, flags);
    progress(90, 'Scoring');

    const lhr = result?.lhr;
    process.send?.({
      type: 'result',
      result: {
        scores: {
          performance: Math.round((lhr?.categories.performance?.score ?? 0) * 100),
          accessibility: Math.round((lhr?.categories.accessibility?.score ?? 0) * 100),
          bestPractices: Math.round((lhr?.categories['best-practices']?.score ?? 0) * 100),
          seo: Math.round((lhr?.categories.seo?.score ?? 0) * 100)
        },
        metrics: {
          fcp: lhr?.audits['first-contentful-paint']?.displayValue,
          lcp: lhr?.audits['largest-contentful-paint']?.displayValue,
          tbt: lhr?.audits['total-blocking-time']?.displayValue,
          cls: lhr?.audits['cumulative-layout-shift']?.displayValue,
          tti: lhr?.audits['interactive']?.displayValue,
          si: lhr?.audits['speed-index']?.displayValue
        },
        opportunities: Object.values(lhr?.audits ?? {})
          .filter((a: any) => a.details?.type === 'opportunity' && a.numericValue > 0)
          .sort((a: any, b: any) => b.numericValue - a.numericValue)
          .slice(0, 5)
          .map((a: any) => ({ title: a.title, savings: a.displayValue }))
      }
    });
  } finally {
    await browser.close();
  }
}

process.on('message', (msg: RunMessage) => {
  if (msg.type === 'run') {
    run(msg.req).catch((err) => {
      process.send?.({ type: 'error', error: err.message });
    });
  }
});
