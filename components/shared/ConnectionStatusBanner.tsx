"use client";

import { useEffect, useRef, useState } from "react";
import { WifiOff, RefreshCw, Wifi } from "lucide-react";
import { useOrderStore } from "@/stores/orderStore";
import { forceReconnect } from "@/lib/hooks/useRealtimeOrders";

/**
 * ConnectionStatusBanner
 *
 * Slides in from below the Header when Supabase Realtime disconnects.
 * Automatically hides 3 s after the connection is restored.
 *
 * Layout contract:
 *   - `position: sticky; top: 0` so it sits just below the fixed Header.
 *   - z-index 40 (below Header's z-50, above main content).
 *   - Height is CSS-animated so the layout doesn't jump.
 */
export function ConnectionStatusBanner() {
  const status = useOrderStore((s) => s.realtimeStatus);
  const [visible, setVisible] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === "connected") {
      // Keep banner visible briefly so the user sees "Reconnected ✓"
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), 3000);
    } else {
      // disconnected | reconnecting → show immediately
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setVisible(true);
    }

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [status]);

  const handleReconnect = () => {
    setIsSpinning(true);
    forceReconnect();
    // Stop spinner after 4 s regardless — the status update will drive UI from there
    setTimeout(() => setIsSpinning(false), 4000);
  };

  const isConnected = status === "connected";
  const isReconnecting = status === "reconnecting";

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{
        maxHeight: visible ? "52px" : "0px",
        opacity: visible ? 1 : 0,
        overflow: "hidden",
        transition: "max-height 350ms cubic-bezier(0.4,0,0.2,1), opacity 300ms ease",
        willChange: "max-height, opacity",
      }}
      className="sticky top-0 z-40 w-full"
    >
      <div
        className={[
          "flex items-center justify-between px-4 py-2.5 text-sm font-medium",
          isConnected
            ? "bg-emerald-500 text-white"
            : isReconnecting
            ? "bg-amber-500 text-white"
            : "bg-red-500 text-white",
        ].join(" ")}
      >
        {/* Left — icon + message */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi className="w-4 h-4 shrink-0" />
          ) : (
            <WifiOff className="w-4 h-4 shrink-0" />
          )}
          <span>
            {isConnected
              ? "Live connection restored"
              : isReconnecting
              ? "Connection lost — reconnecting…"
              : "Connection lost — live updates paused"}
          </span>
        </div>

        {/* Right — Reconnect button (only when fully disconnected) */}
        {!isConnected && !isReconnecting && (
          <button
            onClick={handleReconnect}
            disabled={isSpinning}
            className="flex items-center gap-1.5 rounded-md bg-white/20 hover:bg-white/30 active:bg-white/10 px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={["w-3.5 h-3.5", isSpinning ? "animate-spin" : ""].join(" ")}
            />
            Reconnect
          </button>
        )}

        {/* Reconnecting — show a spinner only */}
        {isReconnecting && (
          <RefreshCw className="w-4 h-4 animate-spin shrink-0 opacity-80" />
        )}
      </div>
    </div>
  );
}
