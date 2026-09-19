import Link from "next/link";

export function Header({ right }: { right?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between border-b border-line px-6 py-3">
      <nav className="flex gap-6 font-mono text-sm">
        <Link href="/" className="text-fg">POOL</Link>
        <Link href="/attack" className="text-muted hover:text-fg">ATTACK</Link>
      </nav>
      <div>{right}</div>
    </header>
  );
}
