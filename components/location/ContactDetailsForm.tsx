"use client";

import { useState } from "react";
import { MapPin, User, Phone, Home, Building2, Map, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LocationData } from "./types";

interface ContactDetailsFormProps {
  locationData: LocationData;
  currentUserMobile?: string;
  onContinue: (data: LocationData) => void;
  onBack: () => void;
  type: "pickup" | "drop";
}

export default function ContactDetailsForm({
  locationData,
  currentUserMobile,
  onContinue,
  onBack,
  type
}: ContactDetailsFormProps) {
  const [houseDetails, setHouseDetails] = useState(locationData.houseDetails || "");
  const [receiverName, setReceiverName] = useState(locationData.receiverName || "");
  const [receiverMobile, setReceiverMobile] = useState(locationData.receiverMobile || "");
  const [useMyMobile, setUseMyMobile] = useState(false);
  const [addressLabel, setAddressLabel] = useState<"home" | "shop" | "other" | null>(
    locationData.addressLabel || null
  );

  const handleUseMyMobileToggle = () => {
    const newState = !useMyMobile;
    setUseMyMobile(newState);
    if (newState && currentUserMobile) {
      setReceiverMobile(currentUserMobile);
    } else if (!newState && receiverMobile === currentUserMobile) {
      setReceiverMobile("");
    }
  };

  const handleMobileChange = (val: string) => {
    const clean = val.replace(/\D/g, "");
    if (clean.length <= 10) {
      setReceiverMobile(clean);
      if (useMyMobile && clean !== currentUserMobile) {
        setUseMyMobile(false);
      }
    }
  };

  // Validation
  const isNameValid = receiverName.trim().length >= 2;
  const isMobileValid = /^[6-9]\d{9}$/.test(receiverMobile);
  const isValid = isNameValid && isMobileValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    onContinue({
      ...locationData,
      houseDetails,
      receiverName: receiverName.trim(),
      receiverMobile,
      addressLabel,
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 rounded-3xl overflow-hidden border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
      
      {/* Map Header Preview (Read-only) */}
      <div className="bg-white p-5 border-b border-slate-100 flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
          type === "pickup" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
        }`}>
          <MapPin className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-0.5">
            {type === "pickup" ? "Pickup Location" : "Drop Location"}
          </p>
          <p className="font-extrabold text-slate-900 truncate">
            {locationData.placeName || "Selected Location"}
          </p>
          <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
            {locationData.formattedAddress}
          </p>
        </div>
        <button 
          onClick={onBack}
          className="text-xs font-bold text-emerald-600 hover:text-emerald-700 hover:underline shrink-0 pt-1"
        >
          Change
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 md:p-6">
        <form id="contact-form" onSubmit={handleSubmit} className="space-y-6">
          
          {/* Address Details */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 ml-1">House / Apartment / Shop (Optional)</label>
            <input 
              type="text" 
              placeholder="e.g. Flat 402, B Block"
              value={houseDetails}
              onChange={e => setHouseDetails(e.target.value)}
              className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none font-medium transition-all"
            />
          </div>

          <div className="h-px bg-slate-200/50 w-full"></div>

          {/* Receiver Details */}
          <div className="space-y-4">
            <h3 className="font-extrabold text-slate-900 flex items-center gap-2">
              <User className="w-5 h-5 text-emerald-600" /> Receiver Details
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 ml-1">Receiver's Name</label>
              <input 
                type="text" 
                placeholder="Enter full name"
                value={receiverName}
                onChange={e => setReceiverName(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none font-medium transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 ml-1 flex justify-between">
                <span>Mobile Number</span>
                {currentUserMobile && (
                  <label className="flex items-center gap-1.5 cursor-pointer text-emerald-600 font-extrabold">
                    <input 
                      type="checkbox" 
                      className="w-3.5 h-3.5 accent-emerald-600"
                      checked={useMyMobile}
                      onChange={handleUseMyMobileToggle}
                    />
                    Use my number
                  </label>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-400">+91</span>
                <input 
                  type="tel" 
                  placeholder="9876543210"
                  maxLength={10}
                  value={receiverMobile}
                  onChange={e => handleMobileChange(e.target.value)}
                  className="w-full pl-14 pr-5 py-4 rounded-2xl border border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none font-medium text-lg tracking-wider transition-all"
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-slate-200/50 w-full"></div>

          {/* Save As */}
          <div className="space-y-3 pb-8">
            <label className="text-xs font-bold text-slate-700 ml-1">Save address as (Optional)</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "home", label: "Home", icon: Home },
                { id: "shop", label: "Shop", icon: Building2 },
                { id: "other", label: "Other", icon: Map }
              ].map(opt => {
                const isSelected = addressLabel === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAddressLabel(isSelected ? null : (opt.id as any))}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all ${
                      isSelected 
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700" 
                        : "border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className={`w-5 h-5 mb-1.5 ${isSelected ? "text-emerald-600" : ""}`} />
                    <span className="text-[10px] font-extrabold uppercase tracking-widest">{opt.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </form>
      </div>

      <div className="p-5 bg-white border-t border-slate-100">
        <Button 
          type="submit"
          form="contact-form"
          disabled={!isValid}
          className="w-full h-14 rounded-2xl text-lg font-black transition-all shadow-xl bg-slate-900 hover:bg-slate-950 text-white disabled:opacity-50 disabled:shadow-none"
        >
          {isValid ? (
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" /> Confirm Details
            </span>
          ) : (
            "Enter Contact Details"
          )}
        </Button>
      </div>
    </div>
  );
}
