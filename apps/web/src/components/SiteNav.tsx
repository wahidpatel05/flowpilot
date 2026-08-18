"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const LINKS = [
  { href: "/", label: "Live Queues" },
  { href: "/control", label: "Control" },
  { href: "/desk", label: "Desk" },
] as const;

/**
 * The website's top-level navigation. Hidden on the Visitor PWA route, which
 * is a single-purpose surface in a stranger's hand (docs/adr/0004) rather than
 * a page of the operator website.
 */
export function SiteNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/visitor")) return null;

  return (
    <nav className="fp-nav" aria-label="Primary">
      <Link href="/" className="fp-nav-brand">
        <span className="fp-nav-mark" aria-hidden="true">
          D
        </span>
        DeQueue
      </Link>

      <div className="fp-nav-links">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="fp-nav-link"
            aria-current={pathname === link.href ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
