"use client";

/**
 * OrderNavigationHandler
 *
 * Listens for the custom "navigate-to-order" DOM event dispatched by the
 * realtime hook's toast "View Order" action. Using a DOM event decouples the
 * realtime hook (which is not a component and has no access to Next.js router)
 * from the router, avoiding a full-page reload via window.location.href.
 *
 * Mounted once in the authenticated dashboard layout. Renders nothing.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function OrderNavigationHandler() {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: Event) => {
      const href = (e as CustomEvent<string>).detail;
      if (typeof href === "string" && href) {
        router.push(href);
      }
    };

    window.addEventListener("navigate-to-order", handler);
    return () => window.removeEventListener("navigate-to-order", handler);
  }, [router]);

  return null;
}
