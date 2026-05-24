import React, { useState } from 'react';
import { Icon } from '../ui/Icon';
import { Empty, Section } from '../ui/primitives';
import { runCommand } from '../state/messaging';
import { useStore } from '../state/store';

function ScoreRing({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  const color = value >= 90 ? 'var(--ext-success)' : value >= 50 ? 'var(--ext-warning)' : 'var(--ext-danger)';
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  return (
    <div className={'score ' + (active ? 'active' : '')} onClick={onClick}>
      <div className="ring">
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} stroke="var(--ext-border)" strokeWidth="4" fill="none" />
          <circle cx="32" cy="32" r={r} stroke={color} strokeWidth="4" fill="none" strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
        </svg>
        <div className="num" style={{ color }}>
          {value}
        </div>
      </div>
      <div className="lbl">{label}</div>
    </div>
  );
}

const MODE_MAP: Record<string, 'quick' | 'standard' | 'full'> = { Quick: 'quick', Standard: 'standard', Full: 'full' };

/** Build a Markdown block of Lighthouse scores to append to a PR description. */
function formatQualityMarkdown(
  scores: { performance: number; accessibility: number; bestPractices: number; seo: number },
  metricRows: { k: string; v?: string }[]
): string {
  const rows = [
    `| Performance | ${scores.performance} |`,
    `| Accessibility | ${scores.accessibility} |`,
    `| Best Practices | ${scores.bestPractices} |`,
    `| SEO | ${scores.seo} |`
  ];
  const vitals = metricRows.length
    ? `\n\n**Web Vitals:** ${metricRows.map((m) => `${m.k} ${m.v}`).join(' · ')}`
    : '';
  return (
    `### Quality report\n\n_Lighthouse audit of the production build_\n\n` +
    `| Category | Score |\n| --- | --- |\n${rows.join('\n')}${vitals}`
  );
}

export function QualityTab() {
  const quality = useStore((s) => s.quality);
  const selectedPR = useStore((s) => s.selectedPR);
  const [mode, setMode] = useState('Standard');
  const [device, setDevice] = useState('Desktop');
  const [network, setNetwork] = useState('Fast 4G');
  const [activeRing, setActiveRing] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const result = quality.result;
  const inProgress = running && !result && !quality.error;

  const run = () => {
    setRunning(true);
    useStore.setState(() => ({ quality: {} }));
    // Mobile device or any throttled network → simulated (mobile) profile.
    const throttled = device === 'Mobile' || network !== 'Fast 4G';
    runCommand('shipmate.runQualityCheck', {
      mode: MODE_MAP[mode],
      throttling: throttled ? 'mobile' : 'desktop'
    });
  };

  const scores = result?.scores;
  const metrics = result?.metrics as Record<string, string | undefined> | undefined;
  const opps = (result?.opportunities ?? []) as { title: string; savings?: string }[];
  const metricRows = metrics
    ? [
        { k: 'FCP', v: metrics.fcp },
        { k: 'LCP', v: metrics.lcp },
        { k: 'TBT', v: metrics.tbt },
        { k: 'CLS', v: metrics.cls },
        { k: 'TTI', v: metrics.tti },
        { k: 'Speed Index', v: metrics.si }
      ].filter((m) => m.v)
    : [];

  return (
    <div>
      <div style={{ padding: '8px 10px 10px' }}>
        <div className="muted" style={{ fontSize: 11, lineHeight: 1.45, marginBottom: 8 }}>
          Builds your project and audits the <strong>production bundle</strong> with Lighthouse + Chromium — not the dev
          server, so scores match what ships. Configure the build via <code>quality.build</code> in{' '}
          <code>shipmate.config.yml</code>.
        </div>

        <div style={{ marginTop: 4 }}>
          <label className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Mode</label>
          <div className="seg" style={{ width: '100%', marginTop: 4 }}>
            {[
              { k: 'Quick', sub: '30s' },
              { k: 'Standard', sub: '45s' },
              { k: 'Full', sub: '60s' }
            ].map((o) => (
              <button key={o.k} className={mode === o.k ? 'active' : ''} onClick={() => setMode(o.k)} style={{ padding: '0 6px' }}>
                <span>{o.k}</span>
                <span className="muted" style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>~{o.sub}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Device</label>
          <div className="seg" style={{ width: '100%', marginTop: 4 }}>
            <button className={device === 'Desktop' ? 'active' : ''} onClick={() => setDevice('Desktop')}>Desktop</button>
            <button className={device === 'Mobile' ? 'active' : ''} onClick={() => setDevice('Mobile')}>Mobile</button>
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <label className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Network</label>
          <div className="seg" style={{ width: '100%', marginTop: 4 }}>
            {['Fast 4G', 'Slow 4G', 'Slow 3G'].map((n) => (
              <button key={n} className={network === n ? 'active' : ''} onClick={() => setNetwork(n)} style={{ padding: '0 4px' }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <button className="btn full" style={{ marginTop: 10 }} onClick={run} disabled={inProgress}>
          <Icon name="zap" size={12} /> {inProgress ? 'Running…' : 'Run Quality Check'}
        </button>

        {inProgress && (
          <div style={{ padding: '8px 0 0' }}>
            <div className="row" style={{ marginBottom: 6, fontSize: 11 }}>
              <Icon name="spinner" size={12} />
              <span className="muted" style={{ flex: 1 }}>{quality.progress?.label ?? 'Starting Lighthouse…'}</span>
              <button className="btn ghost" style={{ height: 18, padding: '0 6px', fontSize: 10 }} onClick={() => runCommand('shipmate.cancel', 'quality')}>
                Cancel
              </button>
            </div>
            <div className="prog">
              <div className="bar" style={quality.progress?.elapsed ? { width: `${quality.progress.elapsed}%`, animation: 'none', left: 0 } : undefined} />
            </div>
          </div>
        )}

        {quality.error && (
          <div className="banner err" style={{ marginTop: 8 }}>
            <Icon name="warn" size={13} />
            <div style={{ flex: 1 }}>{quality.error}</div>
          </div>
        )}
      </div>

      {!running && !result && (
        <Empty icon="zap" title="No results yet." hint="Run a check to build and audit your production bundle." />
      )}

      {result && scores && (
        <div>
          <div style={{ padding: '0 10px 8px' }}>
            <button
              className="btn sec full"
              onClick={() =>
                runCommand('shipmate.attachQualityToPR', {
                  prNumber: selectedPR,
                  body: formatQualityMarkdown(scores, metricRows)
                })
              }
            >
              <Icon name="gitpr" size={12} /> Attach scores to PR{selectedPR ? ` #${selectedPR}` : ''} description
            </button>
          </div>
          <div className="scores">
            <ScoreRing label="Perf" value={scores.performance} active={activeRing === 'perf'} onClick={() => setActiveRing(activeRing === 'perf' ? null : 'perf')} />
            <ScoreRing label="A11y" value={scores.accessibility} active={activeRing === 'a11y'} onClick={() => setActiveRing(activeRing === 'a11y' ? null : 'a11y')} />
            <ScoreRing label="BP" value={scores.bestPractices} active={activeRing === 'bp'} onClick={() => setActiveRing(activeRing === 'bp' ? null : 'bp')} />
            <ScoreRing label="SEO" value={scores.seo} active={activeRing === 'seo'} onClick={() => setActiveRing(activeRing === 'seo' ? null : 'seo')} />
          </div>

          {metricRows.length > 0 && (
            <>
              <div className="muted" style={{ fontSize: 10, padding: '0 10px 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Web Vitals
              </div>
              <div className="mgrid">
                {metricRows.map((mt) => (
                  <div key={mt.k} className="mtile">
                    <div className="k">{mt.k}</div>
                    <div className="v">{mt.v}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {opps.length > 0 && (
            <Section title="Top opportunities" count={opps.length}>
              {opps.map((o) => (
                <div key={o.title} className="frow" style={{ paddingLeft: 12, height: 24 }}>
                  <Icon name="zap" size={11} />
                  <span className="fname" style={{ fontSize: 11 }}>{o.title}</span>
                  <span style={{ flex: 1 }} />
                  {o.savings && <span className="mono" style={{ fontSize: 10, color: 'var(--ext-warning)' }}>{o.savings}</span>}
                </div>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}
