"use client";

import { useEffect } from "react";
import { useShopStore } from "@/stores/shopStore";
import { useOrderStore } from "@/stores/orderStore";
import type { Shop } from "@/types";

interface ShopStoreInitializerProps {
  shop: Shop | null;
  pendingCount?: number;
}

export function ShopStoreInitializer({ shop, pendingCount }: ShopStoreInitializerProps) {
  const setShop = useShopStore((s) => s.setShop);
  const setPendingCount = useOrderStore((s) => s.setPendingCount);

  useEffect(() => {
    if (shop) setShop(shop);
  }, [shop, setShop]);

  // Seed the bell badge from the server-fetched count so it shows immediately.
  // Realtime increments take over from here.
  useEffect(() => {
    if (typeof pendingCount === "number") {
      setPendingCount(pendingCount);
    }
  }, [pendingCount, setPendingCount]);

  return null;
}

