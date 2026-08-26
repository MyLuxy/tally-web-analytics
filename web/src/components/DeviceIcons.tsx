// real brand marks via simple-icons (self-hosted, no CDN). Windows/Edge aren't in that package for licensing reasons so those stay hand-drawn
import type { ReactNode } from "react";
import { siGooglechrome, siFirefoxbrowser, siSafari, siOpera, siApple, siAndroid, siLinux } from "simple-icons";

function BrandIcon({ path }: { path: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" role="img" aria-hidden="true">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

function IconBase({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

// ---- browsers ----

function GlobeIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9Z" />
    </IconBase>
  );
}

function EdgeIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="9" />
      <path d="M6.2 14c1.4 2.4 4.3 3.3 6.7 2.2 1.9-.9 2.9-2.5 2.6-4.1" />
      <path d="M7.2 8.7c1.9-1.7 4.7-1.5 6.2.3" />
    </IconBase>
  );
}

export function browserIcon(name: string): ReactNode {
  switch (name) {
    case "Chrome":
      return <BrandIcon path={siGooglechrome.path} />;
    case "Firefox":
      return <BrandIcon path={siFirefoxbrowser.path} />;
    case "Safari":
      return <BrandIcon path={siSafari.path} />;
    case "Opera":
      return <BrandIcon path={siOpera.path} />;
    case "Edge":
      return <EdgeIcon />; // no MS marks in simple-icons
    default:
      return <GlobeIcon />;
  }
}

// ---- operating systems ----

function WindowsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1" fill="currentColor" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1" fill="currentColor" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1" fill="currentColor" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1" fill="currentColor" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <IconBase>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </IconBase>
  );
}

export function osIcon(name: string): ReactNode {
  switch (name) {
    case "Windows":
      return <WindowsIcon />;
    case "macOS":
    case "iOS":
      return <BrandIcon path={siApple.path} />;
    case "Android":
      return <BrandIcon path={siAndroid.path} />;
    case "Linux":
      return <BrandIcon path={siLinux.path} />;
    default:
      return <MonitorIcon />;
  }
}

// ---- devices ----

function DesktopIcon() {
  return (
    <IconBase>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </IconBase>
  );
}

function MobileIcon() {
  return (
    <IconBase>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 19h2" />
    </IconBase>
  );
}

function TabletIcon() {
  return (
    <IconBase>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M11 19h2" />
    </IconBase>
  );
}

export function deviceIcon(name: string): ReactNode {
  switch (name.toLowerCase()) {
    case "mobile":
      return <MobileIcon />;
    case "tablet":
      return <TabletIcon />;
    default:
      return <DesktopIcon />;
  }
}
