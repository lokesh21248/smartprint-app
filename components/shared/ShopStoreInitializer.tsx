"use client";

import { useEffect } from "react";
import { useShopStore } from "@/stores/shopStore";
import type { Shop } from "@/types";

export function ShopStoreInitializer({ shop }: { shop: Shop | null }) {
  const setShop = useShopStore((s) => s.setShop);
  useEffect(() => {
    if (shop) setShop(shop);
  }, [shop, setShop]);
  return null;
}
