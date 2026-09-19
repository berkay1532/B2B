export function Backdrop() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none fixed inset-0 h-full w-full"
    >
      <defs>
        <radialGradient id="observatory-vignette" cx="38%" cy="42%" r="70%">
          <stop offset="0%" stopColor="var(--bg-2)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--bg)" stopOpacity="1" />
        </radialGradient>
      </defs>
      <rect width="1440" height="900" fill="url(#observatory-vignette)" />
      <g fill="none" stroke="var(--orbit-line)" strokeOpacity="0.07" strokeWidth="1">
        <ellipse cx="520" cy="400" rx="760" ry="250" transform="rotate(-14 520 400)" />
        <ellipse cx="520" cy="400" rx="560" ry="180" transform="rotate(-14 520 400)" />
        <ellipse cx="520" cy="400" rx="980" ry="330" transform="rotate(-14 520 400)" />
      </g>
      <g fill="var(--muted-2)" fillOpacity="0.25">
        <circle cx="140" cy="120" r="1" />
        <circle cx="1290" cy="90" r="1.2" />
        <circle cx="1180" cy="520" r="1" />
        <circle cx="420" cy="640" r="0.8" />
        <circle cx="1380" cy="300" r="1" />
        <circle cx="60" cy="560" r="0.8" />
      </g>
    </svg>
  );
}
