// Real brand marks for the browser/OS breakdown, from the `simple-icons`
// package (self-hosted path data, MIT-licensed -- no CDN calls). Windows and
// Microsoft Edge aren't in that set (Microsoft's marks are excluded from
// Simple Icons for licensing reasons), so those two -- plus the generic
// "unrecognised" and device-type icons, which have no brand to draw -- stay
// hand-drawn line art in the app's own style.
import type { ReactNode } from "react";
import { siGooglechrome, siFirefoxbrowser, siSafari, siOpera, siApple, siAndroid, siLinux } from "simple-icons";

export type PlatformIcon = {
  icon: ReactNode;
  color?: string; // the brand's own hex, e.g. "#4285F4" -- omitted means "use the theme's ink colour"
};

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

export function browserIcon(name: string): PlatformIcon {
  switch (name) {
    case "Chrome":
      return { icon: <BrandIcon path={siGooglechrome.path} />, color: `#${siGooglechrome.hex}` };
    case "Firefox":
      return { icon: <BrandIcon path={siFirefoxbrowser.path} />, color: `#${siFirefoxbrowser.hex}` };
    case "Safari":
      return { icon: <BrandIcon path={siSafari.path} />, color: `#${siSafari.hex}` };
    case "Opera":
      return { icon: <BrandIcon path={siOpera.path} />, color: `#${siOpera.hex}` };
    case "Edge":
      return { icon: <EdgeIcon /> }; // not in Simple Icons -- see file header
    default:
      return { icon: <GlobeIcon /> };
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

export function osIcon(name: string): PlatformIcon {
  switch (name) {
    case "Windows":
      // not in Simple Icons either, but this schematic four-pane grid *is*
      // the real logo's shape, so it earns the real brand blue.
      return { icon: <WindowsIcon />, color: "#0078D6" };
    case "macOS":
    case "iOS":
      // one Apple mark for both -- same as most breakdown dashboards. No
      // colour override: Apple's own guideline is plain black, which would
      // vanish in dark mode -- the caller falls back to a palette accent.
      return { icon: <BrandIcon path={siApple.path} /> };
    case "Android":
      return { icon: <BrandIcon path={siAndroid.path} />, color: `#${siAndroid.hex}` };
    case "Linux":
      return { icon: <BrandIcon path={siLinux.path} />, color: `#${siLinux.hex}` };
    default:
      return { icon: <MonitorIcon /> };
  }
}

// ---- devices (no brand to draw -- just a shape per form factor) ----

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

export function deviceIcon(name: string): PlatformIcon {
  switch (name.toLowerCase()) {
    case "mobile":
      return { icon: <MobileIcon /> };
    case "tablet":
      return { icon: <TabletIcon /> };
    default:
      return { icon: <DesktopIcon /> };
  }
}
