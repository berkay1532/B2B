"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "POOL" },
  { href: "/attack", label: "ATTACK" },
] as const;

export function Header({ right }: { right?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <header
      className={`relative flex h-[60px] items-center justify-between px-9 ${
        pathname === "/attack" ? "border-b border-line" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <circle cx="13" cy="13" r="4" className="fill-accent" />
          <ellipse
            cx="13"
            cy="13"
            rx="11"
            ry="4.5"
            className="stroke-accent"
            strokeWidth="1.2"
            transform="rotate(-25 13 13)"
          />
          <ellipse
            cx="13"
            cy="13"
            rx="11"
            ry="4.5"
            stroke="#5b7bff"
            strokeOpacity="0.6"
            strokeWidth="1.2"
            transform="rotate(35 13 13)"
          />
        </svg>
        <span className="text-[17px] font-bold tracking-[0.12em]">ORBITAL</span>
        <span className="font-mono text-[11px] tracking-[0.08em] text-muted">on Stellar · testnet</span>
      </div>

      <nav className="flex gap-7">
        {NAV.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`border-b pb-1 font-mono text-xs tracking-[0.14em] no-underline ${
                active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div>{right}</div>
    </header>
  );
}
