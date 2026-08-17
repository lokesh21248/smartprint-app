"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface MapEventsProps {
  onCenterChange: (lat: number, lng: number) => void;
  onMapMoveStart: () => void;
}

function MapEvents({ onCenterChange, onMapMoveStart }: MapEventsProps) {
  const map = useMap();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleMoveStart = () => {
      onMapMoveStart();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };

    const handleMoveEnd = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        const center = map.getCenter();
        onCenterChange(center.lat, center.lng);
      }, 500); // Debounce by 500ms
    };

    map.on("movestart", handleMoveStart);
    map.on("moveend", handleMoveEnd);

    return () => {
      map.off("movestart", handleMoveStart);
      map.off("moveend", handleMoveEnd);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [map, onCenterChange, onMapMoveStart]);

  return null;
}

interface LocationMapComponentProps {
  initialLat: number;
  initialLng: number;
  onCenterChange: (lat: number, lng: number) => void;
  onMapMoveStart: () => void;
  type: "pickup" | "drop";
}

export default function LocationMapComponent({
  initialLat,
  initialLng,
  onCenterChange,
  onMapMoveStart,
  type,
}: LocationMapComponentProps) {
  return (
    <div className="w-full h-full relative z-0">
      <MapContainer
        center={[initialLat, initialLng]}
        zoom={16}
        zoomControl={false}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <MapEvents onCenterChange={onCenterChange} onMapMoveStart={onMapMoveStart} />
      </MapContainer>
    </div>
  );
}
