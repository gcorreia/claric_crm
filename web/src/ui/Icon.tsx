// File: web/src/ui/Icon.tsx
import type { ReactNode } from "react";

export function IconWrap({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--panel-2))]">
      {children}
    </span>
  );
}

/**
 * Salesforce-like "App Launcher" icon: 3x3 colorful tiles.
 * Uses fixed fills (consistent branding-like) and works on dark/light.
 */
export function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="4" height="4" rx="1.1" fill="#2D9CDB" />
      <rect x="10" y="4" width="4" height="4" rx="1.1" fill="#56CCF2" />
      <rect x="16" y="4" width="4" height="4" rx="1.1" fill="#9B51E0" />

      <rect x="4" y="10" width="4" height="4" rx="1.1" fill="#27AE60" />
      <rect x="10" y="10" width="4" height="4" rx="1.1" fill="#F2C94C" />
      <rect x="16" y="10" width="4" height="4" rx="1.1" fill="#F2994A" />

      <rect x="4" y="16" width="4" height="4" rx="1.1" fill="#EB5757" />
      <rect x="10" y="16" width="4" height="4" rx="1.1" fill="#2F80ED" />
      <rect x="16" y="16" width="4" height="4" rx="1.1" fill="#00BFA6" />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M16.5 16.5 21 21"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconBell() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M18 10a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
