"use client";

import { useState } from "react";
import LocationSelector from "./LocationSelector";
import ContactDetailsForm from "./ContactDetailsForm";
import type { LocationData } from "./types";

interface LocationFlowProps {
  type: "pickup" | "drop";
  initialData?: LocationData;
  currentUserMobile?: string;
  onComplete: (data: LocationData) => void;
  onCancel?: () => void;
}

export default function LocationFlow({
  type,
  initialData,
  currentUserMobile,
  onComplete,
  onCancel,
}: LocationFlowProps) {
  const [step, setStep] = useState<"map" | "contact">("map");
  const [locationData, setLocationData] = useState<LocationData | null>(initialData || null);

  const handleMapContinue = (data: LocationData) => {
    // Preserve any existing contact details if they were already entered
    setLocationData((prev) => ({
      ...prev,
      ...data,
      receiverName: prev?.receiverName || "",
      receiverMobile: prev?.receiverMobile || "",
      houseDetails: prev?.houseDetails || "",
      addressLabel: prev?.addressLabel || null,
    }));
    setStep("contact");
  };

  const handleContactContinue = (data: LocationData) => {
    setLocationData(data);
    onComplete(data);
  };

  if (step === "map") {
    return (
      <LocationSelector
        type={type}
        initialCoordinates={locationData ? { lat: locationData.latitude, lng: locationData.longitude } : undefined}
        onContinue={handleMapContinue}
        onBack={onCancel}
      />
    );
  }

  if (step === "contact" && locationData) {
    return (
      <div className="h-[80vh] md:h-[600px]">
        <ContactDetailsForm
          locationData={locationData}
          currentUserMobile={currentUserMobile}
          type={type}
          onContinue={handleContactContinue}
          onBack={() => setStep("map")}
        />
      </div>
    );
  }

  return null;
}
