"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSignUp, useUser } from "@clerk/nextjs";
import { Mail, Lock, User, Store, Phone, MapPin, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout, AuthLoader } from "@/components/auth/AuthLayout";
import { validateEmail } from "@/lib/utils";
import Link from "next/link";

export default function SignupPage() {
  const { isLoaded, signUp } = useSignUp();
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();

  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    ownerName: "",
    shopName: "",
    email: "",
    phone: "",
    location: "",
    password: "",
    confirmPassword: "",
  });

  // Handle hydration safely
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (userLoaded && user) {
      window.location.assign("/dashboard");
    }
  }, [user, userLoaded]);

  // Prevent UI flicker while checking auth state
  if (!isMounted || !userLoaded || user) {
    return <AuthLoader />;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    // Validation
    if (!validateEmail(formData.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    if (formData.password.length < 8) {
      toast.error("Password must be at least 8 characters long.");
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
          location: formData.location,
        },
      });

      // Send verification email
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });

      toast.success("Verification code sent to your email!");
      router.push("/verify-email");
    } catch (err: any) {
      console.error(err);
      toast.error(err.errors?.[0]?.message || "Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={<Store className="h-6 w-6 text-[#2E8B57]" />}
      title="Create your shop"
      description="Join SmartPrint and start managing your orders."
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
        <div className="grid grid-cols-1 gap-4">
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
            id="shopName"
            label="Shop Name"
            placeholder="Quick Print Solutions"
            required
            leftIcon={<Store className="h-4 w-4" />}
            value={formData.shopName}
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
            id="phone"
            label="Phone Number"
            type="tel"
            placeholder="+91 98765 43210"
            required
            leftIcon={<Phone className="h-4 w-4" />}
            value={formData.phone}
            onChange={handleChange}
          />
          <Input
            id="location"
            label="Location"
            placeholder="City, State"
            required
            leftIcon={<MapPin className="h-4 w-4" />}
            value={formData.location}
            onChange={handleChange}
          />
          <Input
            id="password"
            label="Password"
            type="password"
            placeholder="••••••••"
            required
            leftIcon={<Lock className="h-4 w-4" />}
            value={formData.password}
            onChange={handleChange}
          />
          <Input
            id="confirmPassword"
            label="Confirm Password"
            type="password"
            placeholder="••••••••"
            required
            leftIcon={<Lock className="h-4 w-4" />}
            value={formData.confirmPassword}
            onChange={handleChange}
          />
        </div>

        <Button
          type="submit"
          className="w-full mt-6"
          size="lg"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Account...
            </>
          ) : (
            <>
              Create Shop
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
