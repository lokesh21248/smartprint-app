"use client";

import { MapPin, Loader2, Navigation, Box } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LocationAddressCardProps {
  address: string;
  placeName?: string;
  isGeocoding: boolean;
  type: "pickup" | "drop";
  onProceed: () => void;
  isValid: boolean;
}

export default function LocationAddressCard({
  address,
  placeName,
  isGeocoding,
  type,
  onProceed,
  isValid
}: LocationAddressCardProps) {
  return (
    <div className="bg-white rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.08)] p-6 space-y-5 relative z-10 border-t border-slate-100">
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-200 rounded-full"></div>
      
      <div className="flex items-start gap-4 mt-2">
        <div className={`mt-1 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          type === "pickup" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
        }`}>
          {type === "pickup" ? <Box className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-extrabold text-slate-900 text-lg truncate">
            {isGeocoding ? "Detecting location..." : (placeName || "Selected Location")}
          </h3>
          {isGeocoding ? (
            <div className="h-4 w-3/4 bg-slate-100 animate-pulse rounded mt-1.5"></div>
          ) : (
            <p className="text-sm text-slate-500 mt-1 line-clamp-2 leading-relaxed">
              {address || "Choose location"}
            </p>
          )}
        </div>
      </div>
      
      <Button 
        onClick={onProceed}
        disabled={!isValid || isGeocoding}
        className="w-full h-14 rounded-2xl text-lg font-black transition-all shadow-xl bg-slate-900 hover:bg-slate-950 text-white disabled:opacity-50 disabled:shadow-none"
      >
        {isGeocoding ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Resolving...
          </span>
        ) : (
          "Proceed"
        )}
      </Button>
    </div>
  );
}
