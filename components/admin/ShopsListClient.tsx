"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  Store, 
  MapPin, 
  Phone, 
  ExternalLink, 
  CheckCircle2, 
  Clock,
  ArrowRight
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface Shop {
  id: string;
  name: string;
  slug: string;
  address: string;
  phone: string;
  is_approved: boolean;
  is_active: boolean;
  is_open: boolean;
  created_at: string;
}

interface ShopsListClientProps {
  initialShops: Shop[];
}

export function ShopsListClient({ initialShops }: ShopsListClientProps) {
  const [shops] = useState<Shop[]>(initialShops);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {shops.map((shop) => (
        <div key={shop.id} className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <Store className="h-7 w-7 text-emerald-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-gray-900">{shop.name}</h3>
                  {shop.is_approved && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                  <span className={shop.is_active ? "text-emerald-500" : "text-red-500"}>
                    {shop.is_active ? "Active" : "Inactive"}
                  </span>
                  <span>·</span>
                  <span className={shop.is_open ? "text-emerald-500" : "text-gray-400"}>
                    {shop.is_open ? "Open Now" : "Closed"}
                  </span>
                </div>
              </div>
            </div>
            <Link 
              href={`/admin/shops/${shop.id}`}
              className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
            >
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2.5 text-gray-500">
              <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm truncate">{shop.address}</span>
            </div>
            <div className="flex items-center gap-2.5 text-gray-500">
              <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm truncate">{shop.phone}</span>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Clock className="h-3.5 w-3.5" />
              Joined {formatDateTime(shop.created_at)}
            </div>
            <div className="flex items-center gap-3">
              <a 
                href={`/s/${shop.slug}`} 
                target="_blank" 
                className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1"
              >
                Public Link
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      ))}

      {shops.length === 0 && (
        <div className="col-span-full py-20 text-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
          <Store className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No shops onboarded yet.</p>
          <p className="text-sm text-gray-400 mt-1">Start by clicking "Onboard New Shop"</p>
        </div>
      )}
    </div>
  );
}
