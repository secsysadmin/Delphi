"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const ownScrollRoute = /^\/events\/[^/]+$/;

export function ScrollRestorationGuard() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    const previous = previousPathname.current;
    previousPathname.current = pathname;
    if (ownScrollRoute.test(pathname)) return;
    // A new event's first autosave swaps /new for /edit in place; the admin is still on the same page.
    if (previous === "/admin/events/new" && /^\/admin\/events\/[^/]+\/edit$/.test(pathname)) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
