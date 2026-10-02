import Link from "next/link";
import Image from "next/image";
import { BriefcaseBusiness, Camera, ExternalLink, Mail, MapPin } from "lucide-react";
import { isAdmin } from "@/lib/auth";

function SecMark({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`sec-wordmark ${compact ? "sec-wordmark--compact" : ""}`}
      aria-label="Texas A&M University Student Engineers' Council"
      role="img"
    >
      <span className="sec-wordmark__institution">Texas A&amp;M University<sup>®</sup></span>
      <span className="sec-wordmark__rule" />
      <span className="sec-wordmark__symbol" aria-hidden="true" />
      <span className="sec-wordmark__rule" />
      <span className="sec-wordmark__council">Student Engineers&apos; Council</span>
    </span>
  );
}

function TamuWordmark() {
  return (
    <a href="https://www.tamu.edu" className="tamu-wordmark" target="_blank" rel="noreferrer" aria-label="Texas A&M University">
      <Image src="/tamu-horizontal-maroon.svg" alt="Texas A&M University" width={939} height={204} priority />
    </a>
  );
}

export async function SiteHeader() {
  const admin = await isAdmin();
  return (
    <header className="site-header">
      <div className="brand-bar">
        <div className="shell brand-bar__inner">
          <Link href="/" className="brand-link" aria-label="SEC Registration Hub home"><SecMark /></Link>
          <div className="brand-title">
            <span className="brand-title__kicker">Student Engineers&apos; Council</span>
            <strong>Registration Hub</strong>
          </div>
          <TamuWordmark />
        </div>
      </div>
      <nav className="main-nav" aria-label="Primary navigation">
        <div className="shell main-nav__inner">
          <div className="nav-links">
            <Link href="/">Events</Link>
            {admin && <Link href="/admin">Dashboard</Link>}
          </div>
          {admin ? (
            <form action="/api/auth/logout" method="post"><button className="nav-action" type="submit">Log out</button></form>
          ) : <Link href="/admin/login" className="nav-action">Admin sign in</Link>}
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div><SecMark compact /><p className="footer-copy">Connecting Aggies with the experiences,<br />people, and ideas that shape engineering.</p></div>
        <div className="footer-contact">
          <h3>Student Engineers&apos; Council</h3>
          <p><MapPin size={16} /> Texas A&amp;M University · TAMU 3127<br />College Station, TX 77843</p>
          <a href="mailto:sec@tamu.edu"><Mail size={16} /> sec@tamu.edu</a>
        </div>
        <div className="footer-links">
          <h3>Stay connected</h3>
          <div><a href="https://instagram.com/tamusec" aria-label="Instagram"><Camera size={20} /></a><a href="https://linkedin.com/company/texas-a&m-student-engineers'-council" aria-label="LinkedIn"><BriefcaseBusiness size={20} /></a><a href="https://sec.tamu.edu" aria-label="SEC website"><ExternalLink size={20} /></a></div>
        </div>
      </div>
      <div className="shell footer-bottom"><span>© {new Date().getFullYear()} Student Engineers&apos; Council</span><span>An organization of Texas A&amp;M University</span></div>
    </footer>
  );
}
