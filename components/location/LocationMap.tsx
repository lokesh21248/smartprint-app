"use client";

import dynamic from "next/dynamic";
import { MapPin, Box } from "lucide-react";
import { useState } from "react";
import { Loader2 } from "lucide-react";

// Dynamically import the Leaflet map to avoid SSR issues
const LocationMapComponent = dynamic(
  () => import("./LocationMapComponent"),
  { ssr: false, loading: () => <div className="w-full h-full flex items-center justify-center bg-gray-100"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div> }
);

interface LocationMapProps {
  initialLat: number;
  initialLng: number;
  onCenterChange: (lat: number, lng: number) => void;
  onMapMoveStart: () => void;
  type: "pickup" | "drop";
  isMoving: boolean;
}

export default function LocationMap({
  initialLat,
  initialLng,
  onCenterChange,
  onMapMoveStart,
  type,
  isMoving,
}: LocationMapProps) {
  return (
    <div className="relative w-full h-full bg-slate-100">
      <LocationMapComponent
        initialLat={initialLat}
        initialLng={initialLng}
        onCenterChange={onCenterChange}
        onMapMoveStart={onMapMoveStart}
        type={type}
      />
      
      {/* Fixed Center Pin */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none flex flex-col items-center">
        <div className={`
          flex items-center justify-center text-white
          w-10 h-10 rounded-full shadow-lg border-2 border-white
          transition-transform duration-300
          ${isMoving ? "-translate-y-4 shadow-xl" : "translate-y-0"}
          ${type === "pickup" ? "bg-emerald-600" : "bg-red-500"}
        `}>
          {type === "pickup" ? <Box className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
        </div>
        <div className="w-2 h-2 bg-black/20 rounded-full blur-[2px] mt-1"></div>
      </div>
    </div>
  );
}
