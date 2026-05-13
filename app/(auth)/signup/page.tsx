"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSignUp, useUser } from "@clerk/nextjs";
import { Mail, Lock, User, Store, Phone, MapPin, Building2, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout, AuthLoader } from "@/components/auth/AuthLayout";
import { validateEmail } from "@/lib/utils/index";
import Link from "next/link";

export default function SignupPage() {
  const { isLoaded, signUp } = useSignUp();
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();

  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    ownerName: "",
    shopName: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    if (userLoaded && user) {
      window.location.assign("/dashboard");
    }
  }, [user, userLoaded]);

  if (!isMounted || !userLoaded || user) {
    return <AuthLoader />;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    if (!formData.ownerName.trim()) {
      toast.error("Please enter your full name.");
      return;
    }
    if (!formData.shopName.trim() || formData.shopName.trim().length < 2) {
      toast.error("Shop name must be at least 2 characters.");
      return;
    }
    if (!/^[0-9]{10}$/.test(formData.phone)) {
      toast.error("Phone number must be exactly 10 digits.");
      return;
    }
    if (!formData.address.trim()) {
      toast.error("Please enter your address.");
      return;
    }
    if (!formData.city.trim() || !formData.state.trim()) {
      toast.error("Please enter city and state.");
      return;
    }
    if (!/^[0-9]{6}$/.test(formData.pincode)) {
      toast.error("Pincode must be exactly 6 digits.");
      return;
    }
    if (!validateEmail(formData.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    if (formData.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      await signUp.create({
        emailAddress: formData.email,
        password: formData.password,
        unsafeMetadata: {
          ownerName: formData.ownerName,
          shopName: formData.shopName,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode,
        },
      });

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });

      toast.success("Verification code sent to your email!");
      router.push("/verify-email");
    } catch (err: unknown) {
      console.error(err);
      const clerkErr = err as { errors?: Array<{ message?: string }> };
      toast.error(
        clerkErr.errors?.[0]?.message || "Something went wrong. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={<Store className="h-6 w-6 text-[#2E8B57]" />}
      title="Create your shop"
      description="Fill in your details to get started — you'll verify your email next."
      footer={
        <div className="mt-6 text-center">
          <p className="text-sm text-[#6B7280]">
            Already have an account?{" "}
            <Link href="/login" className="text-[#2E8B57] font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="ownerName"
          label="Full Name"
          placeholder="John Doe"
          required
          leftIcon={<User className="h-4 w-4" />}
          value={formData.ownerName}
          onChange={handleChange}
        />
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
          id="phone"
          label="Phone Number (10 digits)"
          type="tel"
          placeholder="9876543210"
          required
          maxLength={10}
          leftIcon={<Phone className="h-4 w-4" />}
          value={formData.phone}
          onChange={handleChange}
        />
        <Input
          id="address"
          label="Address"
          placeholder="123 Main St"
          required
          leftIcon={<MapPin className="h-4 w-4" />}
          value={formData.address}
          onChange={handleChange}
        />
        <div className="grid grid-cols-2 gap-3">
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
        <Input
          id="email"
          label="Email Address"
          type="email"
          placeholder="owner@example.com"
          required
          leftIcon={<Mail className="h-4 w-4" />}
          value={formData.email}
          onChange={handleChange}
        />
        <Input
          id="password"
          label="Password"
          type={showPassword ? "text" : "password"}
          placeholder="••••••••"
          required
          leftIcon={<Lock className="h-4 w-4" />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-gray-500 hover:text-black focus:outline-none transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          }
          value={formData.password}
          onChange={handleChange}
        />
        <Input
          id="confirmPassword"
          label="Confirm Password"
          type={showConfirmPassword ? "text" : "password"}
          placeholder="••••••••"
          required
          leftIcon={<Lock className="h-4 w-4" />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="text-gray-500 hover:text-black focus:outline-none transition-colors"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          }
          value={formData.confirmPassword}
          onChange={handleChange}
        />

        <Button type="submit" className="w-full mt-2" size="lg" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Account...
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
