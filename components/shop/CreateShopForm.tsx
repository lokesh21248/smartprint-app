"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Store, User, Phone, MapPin, Building2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CreateShopFormProps {
  initialOwnerName: string;
  ownerEmail: string;
}

export function CreateShopForm({ initialOwnerName, ownerEmail }: CreateShopFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    shopName: "",
    ownerName: initialOwnerName,
    phone: "",
    addressLine1: "",
    city: "",
    state: "",
    pincode: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!/^[0-9]{10}$/.test(formData.phone)) {
      toast.error("Phone must be exactly 10 digits.");
      return;
    }
    if (!/^[0-9]{6}$/.test(formData.pincode)) {
      toast.error("Pincode must be exactly 6 digits.");
      return;
    }
    if (formData.shopName.trim().length < 2) {
      toast.error("Shop name is too short.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/shop/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create shop.");
        return;
      }

      toast.success("Shop created! Welcome to your dashboard.");
      window.location.assign("/dashboard");
    } catch (err) {
      console.error(err);
      toast.error("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl bg-[#F9FAFB] px-4 py-3 text-sm text-[#6B7280]">
        Signed in as <span className="font-medium text-[#111827]">{ownerEmail}</span>
      </div>

      <Input
        id="shopName"
        label="Shop Name"
        placeholder="Quick Print Solutions"
        required
        leftIcon={<Store className="h-4 w-4" />}
        value={formData.shopName}
        onChange={handleChange}
      />
      <Input
        id="ownerName"
        label="Owner Name"
        placeholder="John Doe"
        required
        leftIcon={<User className="h-4 w-4" />}
        value={formData.ownerName}
        onChange={handleChange}
      />
      <Input
        id="phone"
        label="Phone (10 digits)"
        type="tel"
        placeholder="9876543210"
        required
        maxLength={10}
        leftIcon={<Phone className="h-4 w-4" />}
        value={formData.phone}
        onChange={handleChange}
      />
      <Input
        id="addressLine1"
        label="Address"
        placeholder="123 Main St"
        required
        leftIcon={<MapPin className="h-4 w-4" />}
        value={formData.addressLine1}
        onChange={handleChange}
      />
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="city"
          label="City"
          placeholder="Mumbai"
          required
          leftIcon={<Building2 className="h-4 w-4" />}
          value={formData.city}
          onChange={handleChange}
        />
        <Input
          id="state"
          label="State"
          placeholder="Maharashtra"
          required
          value={formData.state}
          onChange={handleChange}
        />
      </div>
      <Input
        id="pincode"
        label="Pincode (6 digits)"
        placeholder="400001"
        required
        maxLength={6}
        value={formData.pincode}
        onChange={handleChange}
      />

      <Button type="submit" className="w-full mt-6" size="lg" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating Shop...
          </>
        ) : (
          <>
            Create Shop
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
