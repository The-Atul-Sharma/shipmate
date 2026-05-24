import React from 'react';

/** Original stroke icons (16x16, currentColor), ported from the design bundle.
 *  Deliberately small + monochrome to fit a dense extension panel. */
const ICONS: Record<string, React.ReactNode> = {
  // Chevrons / arrows
  chevR: <path d="M6 3.5 10.5 8 6 12.5" />,
  chevD: <path d="M3.5 6 8 10.5 12.5 6" />,
  chevU: <path d="M3.5 10 8 5.5 12.5 10" />,
  chevL: <path d="M10 3.5 5.5 8 10 12.5" />,
  arrowR: (
    <g>
      <path d="M3 8h10" />
      <path d="M9.5 4.5 13 8l-3.5 3.5" />
    </g>
  ),
  external: (
    <g>
      <path d="M9 3h4v4" />
      <path d="M13 3 7 9" />
      <path d="M11 9v4H3V5h4" />
    </g>
  ),
  refresh: (
    <g>
      <path d="M3 8a5 5 0 0 1 9-3" />
      <path d="M12 3v2.5H9.5" />
      <path d="M13 8a5 5 0 0 1-9 3" />
      <path d="M4 13v-2.5h2.5" />
    </g>
  ),

  // Status / shapes
  check: <path d="m3.5 8.5 3 3 6-6" />,
  x: (
    <g>
      <path d="m4 4 8 8" />
      <path d="m12 4-8 8" />
    </g>
  ),
  plus: (
    <g>
      <path d="M8 3v10" />
      <path d="M3 8h10" />
    </g>
  ),
  minus: <path d="M3 8h10" />,
  dot: <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />,
  spinner: (
    <g>
      <circle cx="8" cy="8" r="5" opacity=".25" />
      <path d="M13 8a5 5 0 0 0-5-5">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 8 8"
          to="360 8 8"
          dur="0.9s"
          repeatCount="indefinite"
        />
      </path>
    </g>
  ),
  warn: (
    <g>
      <path d="M8 2.5 14 13H2L8 2.5Z" />
      <path d="M8 6v3.5" />
      <circle cx="8" cy="11.2" r=".6" fill="currentColor" stroke="none" />
    </g>
  ),
  info: (
    <g>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 7.2v3.6" />
      <circle cx="8" cy="5.2" r=".7" fill="currentColor" stroke="none" />
    </g>
  ),

  // Tools
  gear: (
    <g>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.5 1.5M10.9 10.9l1.5 1.5M3.6 12.4l1.5-1.5M10.9 5.1l1.5-1.5" />
    </g>
  ),
  sliders: (
    <g>
      <path d="M3 4h6" />
      <path d="M11 4h2" />
      <path d="M3 8h2" />
      <path d="M7 8h6" />
      <path d="M3 12h7" />
      <path d="M12 12h1" />
      <circle cx="10" cy="4" r="1.2" />
      <circle cx="6" cy="8" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </g>
  ),
  search: (
    <g>
      <circle cx="7" cy="7" r="4" />
      <path d="m10 10 3 3" />
    </g>
  ),
  copy: (
    <g>
      <rect x="4" y="4" width="8" height="8" />
      <path d="M3 11V3h8" />
    </g>
  ),
  trash: (
    <g>
      <path d="M3 4.5h10" />
      <path d="M5 4.5V3h6v1.5" />
      <path d="M4.5 4.5 5 13h6l.5-8.5" />
    </g>
  ),
  more: (
    <g>
      <circle cx="3.5" cy="8" r=".9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r=".9" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="8" r=".9" fill="currentColor" stroke="none" />
    </g>
  ),
  link: (
    <g>
      <path d="M7 9a3 3 0 0 1 0-4l2-2a3 3 0 0 1 4 4l-1 1" />
      <path d="M9 7a3 3 0 0 1 0 4l-2 2a3 3 0 0 1-4-4l1-1" />
    </g>
  ),
  filter: <path d="M2.5 3.5h11l-4 5v4l-3 1.5v-5.5l-4-5Z" />,
  cancel: (
    <g>
      <circle cx="8" cy="8" r="5.5" />
      <path d="m5 5 6 6" />
    </g>
  ),

  // Git
  branch: (
    <g>
      <circle cx="4" cy="3.5" r="1.4" />
      <circle cx="4" cy="12.5" r="1.4" />
      <circle cx="12" cy="6" r="1.4" />
      <path d="M4 5v6" />
      <path d="M5.3 3.8c3.5 0 5.4 1 5.4 4" />
    </g>
  ),
  commit: (
    <g>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M2 8h3.5" />
      <path d="M10.5 8H14" />
    </g>
  ),
  pull: (
    <g>
      <path d="M8 2v9" />
      <path d="M5 8.5 8 11.5 11 8.5" />
      <path d="M3 14h10" />
    </g>
  ),
  push: (
    <g>
      <path d="M8 14V5" />
      <path d="M5 7.5 8 4.5 11 7.5" />
      <path d="M3 2h10" />
    </g>
  ),
  fetch: (
    <g>
      <path d="M3 11A5 5 0 0 1 12 6.5" />
      <path d="M12 4v2.5H9.5" />
      <circle cx="8" cy="13" r="1.2" />
    </g>
  ),
  stash: (
    <g>
      <rect x="2.5" y="9" width="11" height="3.5" />
      <rect x="3.5" y="6" width="9" height="2" />
      <rect x="4.5" y="3.5" width="7" height="1.5" />
    </g>
  ),
  gitpr: (
    <g>
      <circle cx="4" cy="3.5" r="1.4" />
      <circle cx="4" cy="12.5" r="1.4" />
      <circle cx="12" cy="12.5" r="1.4" />
      <path d="M4 5v6" />
      <path d="M12 11V8a3 3 0 0 0-3-3H7l1.5-1.5M8.5 5 7 6.5" />
    </g>
  ),
  review: (
    <g>
      <path d="M2.5 4.5h11v6h-7l-2.5 2.5v-2.5H2.5Z" />
      <circle cx="6" cy="7.5" r=".8" fill="currentColor" stroke="none" />
      <circle cx="8" cy="7.5" r=".8" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7.5" r=".8" fill="currentColor" stroke="none" />
    </g>
  ),
  beaker: (
    <g>
      <path d="M6.5 2v4l-3 7h9l-3-7V2" />
      <path d="M6 2h4" />
      <path d="M5 10h6" />
    </g>
  ),
  doc: (
    <g>
      <path d="M4 2h5l3 3v9H4Z" />
      <path d="M9 2v3h3" />
      <path d="M6 8h4M6 10h4M6 12h3" />
    </g>
  ),
  zap: <path d="M9 2 4 9h3l-1 5 5-7H8Z" />,
  ai: (
    <g>
      <path d="M8 2.5 9 6l3.5 1L9 8l-1 3.5L7 8 3.5 7 7 6Z" />
      <path d="m12 11 .5 1.5L14 13l-1.5.5L12 15l-.5-1.5L10 13l1.5-.5Z" />
    </g>
  ),
  key: (
    <g>
      <circle cx="5" cy="8" r="2.5" />
      <path d="M7.5 8H13" />
      <path d="M11 8v2" />
      <path d="M13 8v2" />
    </g>
  ),

  // Files / view
  file: (
    <g>
      <path d="M4 2h5l3 3v9H4Z" />
      <path d="M9 2v3h3" />
    </g>
  ),
  folder: <path d="M2.5 4.5h4l1.2 1.5h5.8v7H2.5Z" />,
  list: (
    <g>
      <path d="M5 4h9M5 8h9M5 12h9" />
      <circle cx="2.5" cy="4" r=".8" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="8" r=".8" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="12" r=".8" fill="currentColor" stroke="none" />
    </g>
  ),
  diff: (
    <g>
      <path d="M5 2v7M5 12v2M2.5 4.5h5M2.5 11.5h5" />
      <path d="M11 4v9M8.5 6h5M8.5 11h5" />
    </g>
  ),
  play: <path d="M5 3.5 12 8l-7 4.5Z" />,

  // Ship logo (used in header + activity bar)
  ship: (
    <g>
      <path d="M2.5 9.5h11l-1 3H3.5Z" />
      <path d="M4 9.5V6h8v3.5" />
      <path d="M8 2v4" />
      <path d="M6 4h4" />
    </g>
  ),
  bell: (
    <g>
      <path d="M3.5 11h9" />
      <path d="M4.5 11V8a3.5 3.5 0 1 1 7 0v3" />
      <path d="M7 13h2" />
    </g>
  )
};

export type IconName = keyof typeof ICONS | string;

export function Icon({
  name,
  size = 16,
  ...rest
}: { name: IconName; size?: number } & React.SVGProps<SVGSVGElement>) {
  const paths = ICONS[name];
  if (!paths) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths}
    </svg>
  );
}
