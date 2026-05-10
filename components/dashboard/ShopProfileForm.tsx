"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Store, IndianRupee, Clock, Wrench, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useShopStore } from "@/stores/shopStore";
import { ShopProfileSchema, type ShopProfileInput } from "@/lib/validators";
import type { Shop } from "@/types";
import type { z } from "zod";


const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const SERVICES_LIST = [
  "B&W Printing", "Color Printing", "Scanning", "Photocopying",
  "Spiral Binding", "Soft Binding", "Hard Binding",
  "Lamination", "ID Card Printing", "Banner Printing",
];

interface ShopProfileFormProps {
  shop: Shop;
}

type ShopProfileFormValues = z.input<typeof ShopProfileSchema>;

export function ShopProfileForm({ shop: initialShop }: ShopProfileFormProps) {
  const { shop: storeShop, setShop, toggleShopOpen } = useShopStore();
  const shop = storeShop ?? initialShop;
  const shopRecord = shop as unknown as {
    id: string;
    name?: string;
    address_line1?: string;
    owner_phone?: string;
    owner_email?: string;
    price_bw_per_page?: number;
    price_color_per_page?: number;
    business_hours?: {
      opening_time?: string;
      closing_time?: string;
      working_days?: string[];
      services?: string[];
    };
    is_open?: boolean;
  };

  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [activeSection, setActiveSection] = useState<"info" | "pricing" | "timings" | "services">("info");

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ShopProfileFormValues>({
    resolver: zodResolver(ShopProfileSchema),
    defaultValues: {
      name: shopRecord.name || "",
      address: shopRecord.address_line1 || "",
      phone: shopRecord.owner_phone || "",
      owner_email: shopRecord.owner_email || "",
      price_bw_per_page: shopRecord.price_bw_per_page || 1,
      price_color_per_page: shopRecord.price_color_per_page || 5,
      opening_time: shopRecord.business_hours?.opening_time || "09:00",
      closing_time: shopRecord.business_hours?.closing_time || "21:00",
      working_days: shopRecord.business_hours?.working_days || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      services: shopRecord.business_hours?.services || [],
    },
  });

  const currentServices = watch("services") || [];
  const currentDays = watch("working_days") || [];

  const handleSave = async (data: ShopProfileFormValues) => {
    setSaving(true);
    try {
      const normalizedData = ShopProfileSchema.parse(data) as ShopProfileInput;
      const res = await fetch("/api/shop/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedData),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || "Failed to save profile");
      }
      
      // Map payload back to frontend Shop interface before updating store
      const updatedShop = {
        ...shop,
        name: normalizedData.name,
        address_line1: normalizedData.address,
        owner_phone: normalizedData.phone,
        owner_email: normalizedData.owner_email,
        price_bw_per_page: normalizedData.price_bw_per_page,
        price_color_per_page: normalizedData.price_color_per_page,
        business_hours: {
          opening_time: normalizedData.opening_time,
          closing_time: normalizedData.closing_time,
          working_days: normalizedData.working_days,
          services: normalizedData.services,
        },
      };
      
      setShop(updatedShop as Shop);
      toast.success("✅ Shop profile updated!");
    } catch (err) {
      console.error("Shop Profile Save Error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to save. Please try again.";
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleOpen = async () => {
    setToggling(true);
    try {
      const res = await fetch("/api/shop/toggle-open", { method: "POST" });
      if (res.ok) {
        toggleShopOpen();
        toast.success(shop.is_open ? "🔴 Shop is now closed" : "🟢 Shop is now open");
      }
    } finally {
      setToggling(false);
    }
  };

  const sections = [
    { id: "info", label: "Basic Info", icon: Store },
    { id: "pricing", label: "Pricing", icon: IndianRupee },
    { id: "timings", label: "Timings", icon: Clock },
    { id: "services", label: "Services", icon: Wrench },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Open/Closed hero toggle */}
      <div className={`rounded-2xl p-6 flex items-center justify-between gap-4 ${
        shopRecord.is_open
          ? "bg-gradient-to-r from-emerald-600 to-emerald-800 text-white shadow-lg"
          : "bg-gradient-to-r from-gray-600 to-gray-800 text-white shadow-lg"
      }`}>
        <div>
          <p className="text-2xl font-black">
            {shopRecord.is_open ? "🟢 Shop is Open" : "🔴 Shop is Closed"}
          </p>
          <p className="text-sm opacity-80 mt-1">
            {shopRecord.is_open
              ? "Customers can place orders right now"
              : "Toggle to start accepting orders"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium opacity-90">
            {shopRecord.is_open ? "Open" : "Closed"}
          </span>
          <Switch
            checked={shopRecord.is_open ?? true}
            onCheckedChange={handleToggleOpen}
            disabled={toggling}
            aria-label="Toggle shop open/closed"
            className="data-[state=checked]:bg-white/30"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Section nav */}
        <div className="space-y-1">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`flex items-center gap-3 w-full p-4 rounded-xl text-sm font-medium transition-all ${
                  activeSection === s.id 
                    ? "bg-emerald-50 text-emerald-700 shadow-sm border border-emerald-100" 
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon className={`h-5 w-5 ${activeSection === s.id ? "text-emerald-600" : "text-gray-400"}`} />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          <form onSubmit={handleSubmit(handleSave)} className="space-y-6">
            {/* Basic Info */}
            {activeSection === "info" && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 mb-5">Basic Information</h2>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Shop Name</label>
                    <Input placeholder="Enter shop name" error={errors.name?.message} {...register("name")} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Full Address</label>
                    <Input placeholder="Shop address" error={errors.address?.message} {...register("address")} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-700">Phone Number</label>
                      <Input placeholder="10-digit mobile" error={errors.phone?.message} {...register("phone")} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-gray-700">Owner Email</label>
                      <Input placeholder="Contact email" error={errors.owner_email?.message} {...register("owner_email")} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pricing */}
            {activeSection === "pricing" && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 mb-5">Pricing (₹ per page)</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                    <label className="block text-sm font-bold text-emerald-800 mb-2">Black & White</label>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600 font-bold">₹</span>
                      <Input 
                        type="number" 
                        step="0.5" 
                        className="bg-white" 
                        error={errors.price_bw_per_page?.message} 
                        {...register("price_bw_per_page")} 
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                    <label className="block text-sm font-bold text-orange-800 mb-2">Full Color</label>
                    <div className="flex items-center gap-2">
                      <span className="text-orange-600 font-bold">₹</span>
                      <Input 
                        type="number" 
                        step="0.5" 
                        className="bg-white" 
                        error={errors.price_color_per_page?.message} 
                        {...register("price_color_per_page")} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Timings */}
            {activeSection === "timings" && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 mb-5">Shop Timings</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Opening Time</label>
                    <Input type="time" error={errors.opening_time?.message} {...register("opening_time")} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">Closing Time</label>
                    <Input type="time" error={errors.closing_time?.message} {...register("closing_time")} />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700 block">Working Days</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => {
                      const isActive = currentDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            const next = isActive 
                              ? currentDays.filter(d => d !== day)
                              : [...currentDays, day];
                            setValue("working_days", next);
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                            isActive 
                              ? "bg-emerald-600 border-emerald-600 text-white" 
                              : "bg-white border-gray-200 text-gray-600 hover:border-emerald-300"
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Services */}
            {activeSection === "services" && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900 mb-5">Services Offered</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SERVICES_LIST.map((svc) => {
                    const isChecked = currentServices.includes(svc);
                    return (
                      <button
                        key={svc}
                        type="button"
                        onClick={() => {
                          const next = isChecked 
                            ? currentServices.filter(s => s !== svc)
                            : [...currentServices, svc];
                          setValue("services", next);
                        }}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                          isChecked
                            ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                            : "border-gray-100 bg-gray-50 text-gray-600 hover:border-emerald-200"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                          isChecked ? "bg-emerald-600 border-emerald-600" : "bg-white border-gray-300"
                        }`}>
                          {isChecked && <Save className="w-3 h-3 text-white" />}
                        </div>
                        <span className="text-sm font-semibold">{svc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" loading={saving} size="lg" className="px-8 shadow-md">
                <Save className="h-4 w-4" /> Save All Changes
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
