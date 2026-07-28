"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

// Typed shape matching the Supabase select query
type ShopEntry = { name: string; slug: string; address_line1: string; city: string };

/**
 * FindShopForm — client-only interactive part of /find-shop.
 *
 * Extracted from the main page so the parent Server Component can render
 * static H1 / description content that Googlebot indexes without executing JS.
 */
export function FindShopForm() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [shops, setShops] = useState<ShopEntry[]>([]);
  const [shopsFetched, setShopsFetched] = useState(false);
  const router = useRouter();

  // Lazy-fetch shops on first interaction / focus
  const fetchShops = async () => {
    if (shopsFetched) return;
    setShopsFetched(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("shops")
        .select("name, slug, address_line1, city")
        .eq("is_approved", true)
        .limit(10);
      if (data) setShops(data);
    } catch (err) {
      console.error("Failed to fetch partner shops:", err);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedCode = code.trim().toUpperCase();
    if (trimmedCode.length !== 6) {
      toast.error("Code must be exactly 6 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/shop/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmedCode }),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || "Shop not found");
        return;
      }

      if (!json.slug) {
        toast.error(
          "Shop is missing a valid web link. Please contact the shop owner."
        );
        return;
      }

      router.push(`/s/${json.slug}`);
    } catch {
      toast.error("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSearch} className="space-y-4">
        <input
          type="text"
          placeholder="ABC123"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          onFocus={fetchShops}
          maxLength={6}
          autoFocus
          autoComplete="off"
          aria-label="6-letter shop code"
          className="w-full h-16 text-center text-3xl font-bold tracking-[0.5em] font-mono border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none uppercase"
        />

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" /> Finding shop...
            </>
          ) : (
            <>
              Find Shop <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            You can also scan the shop&apos;s QR code with your camera to skip
            typing.
          </span>
        </p>
      </div>

      {shops.length > 0 && (
        <div className="mt-8 border-t border-gray-100 pt-6">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest text-center mb-4">
            Our Print Network
          </h2>
          <div className="space-y-2.5">
            {shops.map((shop) => (
              <Link
                key={shop.slug}
                href={`/s/${shop.slug}`}
                className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100/50 rounded-xl hover:bg-slate-100 hover:border-slate-200 transition group"
              >
                <div className="min-w-0">
                  <h3 className="font-extrabold text-slate-800 text-xs truncate group-hover:text-emerald-700 transition">
                    {shop.name}
                  </h3>
                  <p className="text-slate-400 text-[10px] truncate mt-0.5">
                    {shop.address_line1}, {shop.city}
                  </p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-450 group-hover:text-emerald-600 transition group-hover:translate-x-0.5 shrink-0 ml-4" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
