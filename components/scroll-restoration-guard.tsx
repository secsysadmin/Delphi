"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const OWN_SCROLL_ROUTE = /^\/events\/[^/]+$/;
const NEW_EVENT_PATH = "/admin/events/new";
const EDIT_EVENT_ROUTE = /^\/admin\/events\/[^/]+\/edit$/;

function isDraftPromotion(previous: string, next: string) {
  return previous === NEW_EVENT_PATH && EDIT_EVENT_ROUTE.test(next);
}

export function ScrollRestorationGuard() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  }, []);

  useEffect(() => {
    const previous = previousPathname.current;
    previousPathname.current = pathname;
    if (OWN_SCROLL_ROUTE.test(pathname) || isDraftPromotion(previous, pathname)) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
