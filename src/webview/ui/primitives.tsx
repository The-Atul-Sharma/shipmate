import React, { useEffect, useState } from 'react';
import { Icon, IconName } from './Icon';

/** Minimal file shape rendered by FileRow (name + parent dir + status badge). */
export interface GitFile {
  path: string;
  dir: string;
  status: string;
}

/** Collapsible section with header, optional count + hover actions. */
export function Section({
  title,
  count,
  defaultOpen = true,
  actions,
  children
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <div className={'shead ' + (open ? '' : 'collapsed')} onClick={() => setOpen((v) => !v)}>
        <span className="chev">
          <Icon name="chevD" size={12} />
        </span>
        <span className="title">{title}</span>
        {typeof count === 'number' && <span className="count">{count}</span>}
        {actions && (
          <span className="actions" onClick={(e) => e.stopPropagation()}>
            {actions}
          </span>
        )}
      </div>
      {open && <div className="sbody">{children}</div>}
    </div>
  );
}

/** Tooltip placement: where the bubble sits relative to its trigger.
 *  'end' right-anchors it (for controls near the right edge); 'top' flips it
 *  above (for footer / bottom-edge controls). Combine e.g. 'top-end'. */
export type TipPlace = 'bottom' | 'end' | 'top' | 'top-end';

function placeClass(place?: TipPlace): string {
  switch (place) {
    case 'end':
      return ' tip-end';
    case 'top':
      return ' tip-top';
    case 'top-end':
      return ' tip-top tip-end';
    default:
      return '';
  }
}

export const Tip = ({
  tip,
  place,
  children,
  className,
  ...rest
}: {
  tip: string;
  place?: TipPlace;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={'tip' + placeClass(place) + (className ? ' ' + className : '')} data-tip={tip} {...rest}>
    {children}
  </span>
);

export const IconBtn = ({
  tip,
  place,
  icon,
  onClick,
  size = 14,
  disabled
}: {
  tip: string;
  place?: TipPlace;
  icon: IconName;
  onClick?: () => void;
  size?: number;
  disabled?: boolean;
}) => (
  <Tip tip={tip} place={place}>
    <button className="iconbtn" onClick={onClick} disabled={disabled} aria-label={tip}>
      <Icon name={icon} size={size} />
    </button>
  </Tip>
);

/** Normalise a git status code to a single display letter (U = untracked). */
function statusLetter(s: string): string {
  const c = (s || '').trim();
  if (c === '?' || c === '??' || c === '') return 'U';
  return c[0].toUpperCase();
}

export const FBadge = ({ s }: { s: string }) => {
  const letter = statusLetter(s);
  return <span className={`fbadge ${letter}`}>{letter}</span>;
};

export function FileRow({
  file,
  checked,
  onCheck,
  active,
  onClick,
  onDiscard,
  showCheck = true
}: {
  file: GitFile;
  checked?: boolean;
  onCheck?: (v: boolean) => void;
  active?: boolean;
  onClick?: () => void;
  onDiscard?: () => void;
  showCheck?: boolean;
}) {
  return (
    <div className={'frow ' + (active ? 'active' : '')} onClick={onClick}>
      {showCheck && (
        <span
          className={'check ' + (checked ? 'checked' : '')}
          onClick={(e) => {
            e.stopPropagation();
            onCheck?.(!checked);
          }}
        >
          {checked && <Icon name="check" size={10} />}
        </span>
      )}
      <span className="fname">{file.path.split('/').pop()}</span>
      <span className="fdir">{file.dir}</span>
      {onDiscard && (
        <Tip tip="Discard changes" place="end">
          <span
            className="frow-discard"
            role="button"
            aria-label="Discard changes"
            onClick={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
          >
            <Icon name="trash" size={11} />
          </span>
        </Tip>
      )}
      <FBadge s={file.status} />
    </div>
  );
}

export const Empty = ({
  icon = 'info',
  title,
  hint,
  action
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) => (
  <div className="empty">
    <div className="ico">
      <Icon name={icon} size={20} />
    </div>
    <div className="strong">{title}</div>
    {hint && <div>{hint}</div>}
    {action && <div style={{ marginTop: 10 }}>{action}</div>}
  </div>
);

export function ErrorBanner({
  msg,
  onRetry,
  onClose
}: {
  msg?: string;
  onRetry?: () => void;
  onClose?: () => void;
}) {
  if (!msg) return null;
  return (
    <div className="banner err">
      <Icon name="warn" size={13} />
      <div style={{ flex: 1, lineHeight: 1.4 }}>{msg}</div>
      {onRetry && (
        <span className="lk" onClick={onRetry}>
          Retry
        </span>
      )}
      <span className="lk" onClick={() => navigator.clipboard?.writeText?.(msg)}>
        Copy
      </span>
      {onClose && (
        <span className="close" onClick={onClose}>
          <Icon name="x" size={12} />
        </span>
      )}
    </div>
  );
}

export function Progress({ label = 'Working…', onCancel }: { label?: string; onCancel?: () => void }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ padding: '8px 10px' }}>
      <div className="row" style={{ marginBottom: 6, fontSize: 11 }}>
        <Icon name="spinner" size={12} />
        <span className="muted" style={{ flex: 1 }}>
          {label}
        </span>
        <span className="mono muted">{t}s</span>
        {onCancel && (
          <button
            className="btn ghost"
            style={{ height: 18, padding: '0 6px', fontSize: 10 }}
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
      <div className="prog">
        <div className="bar" />
      </div>
    </div>
  );
}

export type PillTone = 'ok' | 'warn' | 'err' | 'info' | 'solid' | '';
export const Pill = ({ tone = '', children }: { tone?: PillTone; children: React.ReactNode }) => (
  <span className={'pill ' + tone}>{children}</span>
);
