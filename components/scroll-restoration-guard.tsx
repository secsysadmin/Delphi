"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const ownScrollRoute = /^\/events\/[^/]+$/;

export function ScrollRestorationGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    if (ownScrollRoute.test(pathname)) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
