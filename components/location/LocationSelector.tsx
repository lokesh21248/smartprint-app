"use client";

import { useState, useCallback, useEffect } from "react";
import LocationMap from "./LocationMap";
import LocationAddressCard from "./LocationAddressCard";
import { ArrowLeft } from "lucide-react";
import type { LocationData } from "./types";

interface LocationSelectorProps {
  type: "pickup" | "drop";
  initialCoordinates?: { lat: number; lng: number };
  onContinue: (location: LocationData) => void;
  onBack?: () => void;
}

export default function LocationSelector({
  type,
  initialCoordinates,
  onContinue,
  onBack
}: LocationSelectorProps) {
  // Default to somewhere (e.g. Hyderabad, or user's current location)
  const defaultLat = 17.385044;
  const defaultLng = 78.486671;

  const [lat, setLat] = useState(initialCoordinates?.lat || defaultLat);
  const [lng, setLng] = useState(initialCoordinates?.lng || defaultLng);
  const [address, setAddress] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [hasResolvedOnce, setHasResolvedOnce] = useState(false);

  const fetchAddress = useCallback(async (latitude: number, longitude: number) => {
    setIsGeocoding(true);
    try {
      // Use Nominatim (OpenStreetMap) for free reverse geocoding
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`, {
        headers: {
          'Accept-Language': 'en'
        }
      });
      const data = await res.json();
      if (data && data.display_name) {
        setAddress(data.display_name);
        // Extract a simpler place name from address breakdown if available
        const ad = data.address;
        const name = ad.road || ad.suburb || ad.neighbourhood || ad.city || "Selected Location";
        setPlaceName(name);
        setHasResolvedOnce(true);
      }
    } catch (err) {
      console.error("Geocoding failed", err);
      if (!hasResolvedOnce) {
        setAddress("Unable to detect this address. Please move the map.");
      }
    } finally {
      setIsGeocoding(false);
    }
  }, [hasResolvedOnce]);

  // Initial geocode
  useEffect(() => {
    if (initialCoordinates?.lat && initialCoordinates?.lng && !hasResolvedOnce) {
      fetchAddress(initialCoordinates.lat, initialCoordinates.lng);
    }
  }, [initialCoordinates, fetchAddress, hasResolvedOnce]);

  // Attempt HTML5 Geolocation on mount if no initial coordinates
  useEffect(() => {
    if (!initialCoordinates && !hasResolvedOnce) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLat(pos.coords.latitude);
            setLng(pos.coords.longitude);
            fetchAddress(pos.coords.latitude, pos.coords.longitude);
          },
          (err) => {
            console.warn("Location permission denied", err);
            // Fallback to default fetch
            fetchAddress(defaultLat, defaultLng);
          }
        );
      } else {
        fetchAddress(defaultLat, defaultLng);
      }
    }
  }, [initialCoordinates, fetchAddress, hasResolvedOnce]);

  const handleCenterChange = useCallback((newLat: number, newLng: number) => {
    setIsMoving(false);
    setLat(newLat);
    setLng(newLng);
    fetchAddress(newLat, newLng);
  }, [fetchAddress]);

  const handleMapMoveStart = useCallback(() => {
    setIsMoving(true);
  }, []);

  const handleProceed = () => {
    onContinue({
      latitude: lat,
      longitude: lng,
      formattedAddress: address,
      placeName: placeName,
    });
  };

  return (
    <div className="flex flex-col h-[80vh] md:h-[600px] bg-slate-100 rounded-3xl overflow-hidden relative border border-slate-200 shadow-sm animate-in fade-in zoom-in-95 duration-300">
      
      {/* Top Bar with Back Button */}
      <div className="absolute top-4 left-4 z-20">
        <button 
          onClick={onBack}
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative">
        <LocationMap 
          initialLat={lat}
          initialLng={lng}
          onCenterChange={handleCenterChange}
          onMapMoveStart={handleMapMoveStart}
          type={type}
          isMoving={isMoving}
        />
      </div>

      {/* Bottom Sheet Address Card */}
      <div className="-mt-4 relative z-20">
        <LocationAddressCard 
          address={address}
          placeName={placeName}
          isGeocoding={isGeocoding}
          type={type}
          onProceed={handleProceed}
          isValid={hasResolvedOnce && !isMoving}
        />
      </div>
    </div>
  );
}
