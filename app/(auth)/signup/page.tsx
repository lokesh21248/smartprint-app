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
import Script from "next/script";

export default function SignupPage() {
  const { isLoaded, signUp } = useSignUp();
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();

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
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isTurnstileActive, setIsTurnstileActive] = useState(false);
  const [isCustomTurnstileVerified, setIsCustomTurnstileVerified] = useState(false);

  const isProduction = process.env.NODE_ENV === "production";
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const useTurnstile = isProduction && !!siteKey;

  useEffect(() => {
    if (!useTurnstile) return;

    (window as any).onTurnstileSuccess = (token: string) => {
      setTurnstileToken(token);
      setIsCustomTurnstileVerified(true);
    };
    (window as any).onTurnstileExpired = () => {
      setTurnstileToken("");
      setIsCustomTurnstileVerified(false);
    };
    (window as any).onTurnstileError = () => {
      setTurnstileToken("");
      setIsCustomTurnstileVerified(false);
    };

    return () => {
      delete (window as any).onTurnstileSuccess;
      delete (window as any).onTurnstileExpired;
      delete (window as any).onTurnstileError;
    };
  }, [useTurnstile]);

  useEffect(() => {
    // Monitor if Turnstile is active inside the captcha container or custom class
    const checkActive = setInterval(() => {
      const captchaEl = document.getElementById("clerk-captcha");
      const hasChildren = captchaEl && captchaEl.children.length > 0;
      const hasCustomWidget = document.querySelector(".cf-turnstile");
      setIsTurnstileActive(!!(hasChildren || hasCustomWidget));
    }, 1000);

    // Monitor Turnstile response value
    const checkResponse = setInterval(() => {
      const turnstileInput = document.getElementsByName("cf-turnstile-response")[0] as HTMLTextAreaElement;
      if (turnstileInput && turnstileInput.value) {
        setTurnstileToken(turnstileInput.value);
      } else if (!isCustomTurnstileVerified) {
        setTurnstileToken("");
      }
    }, 500);

    return () => {
      clearInterval(checkActive);
      clearInterval(checkResponse);
    };
  }, [isCustomTurnstileVerified]);

  const resetTurnstile = () => {
    if (typeof window !== "undefined" && (window as any).turnstile) {
      try {
        const el = document.querySelector(".cf-turnstile") || document.getElementById("clerk-captcha");
        if (el && (el.children.length > 0 || el.querySelector("iframe"))) {
          (window as any).turnstile.reset(el);
        }
      } catch (e) {
        // Silently ignore "Nothing to reset" errors to keep console clean
      }
    }
    setTurnstileToken("");
    setIsCustomTurnstileVerified(false);
  };

  // ── Timing instrumentation ───────────────────────────────────────────
  useEffect(() => {
    console.time("signup-page:clerk-session-resolve");
    return () => { console.timeEnd("signup-page:clerk-session-resolve"); };
  }, []);

  useEffect(() => {
    if (userLoaded) {
      console.timeEnd("signup-page:clerk-session-resolve");
      console.log(`[signup-page] Clerk resolved. isSignedIn=${!!user}`);
    }
  }, [userLoaded, user]);

  // ── Redirect already-signed-in users without blocking the form ───────
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (userLoaded && user) {
      setIsRedirecting(true);
      window.location.assign("/dashboard");
    }
  }, [user, userLoaded]);

  if (isRedirecting) {
    return <AuthLoader />;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) {
      toast.error("Sign up service is not ready yet. Please try again in a moment.");
      return;
    }

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
      if (useTurnstile && isCustomTurnstileVerified) {
        if (!turnstileToken) {
          toast.error("Please complete the verification.");
          setIsLoading(false);
          return;
        }

        // Verify token with backend (with a 10-second timeout)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
          const verifyRes = await fetch("/api/auth/verify-turnstile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: turnstileToken }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!verifyRes.ok) {
            toast.error("Please complete the verification.");
            resetTurnstile();
            setIsLoading(false);
            return;
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          console.error("Turnstile verification client error:", fetchErr);
          toast.error("Verification failed or timed out. Please try again.");
          resetTurnstile();
          setIsLoading(false);
          return;
        }
      }

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
      console.error("Signup failed:", err);
      resetTurnstile();
      const clerkErr = err as { errors?: Array<{ message?: string }> };
      const errorMessage = (err as Error).message || clerkErr.errors?.[0]?.message || "Something went wrong. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {useTurnstile && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
        />
      )}
      <AuthLayout
        icon={<Store className="h-6 w-6 text-[#2E8B57]" />}
        title="Create your shop"
        description="Fill in your details to get started — you'll verify your email next."
        footer={
          <div className="mt-6 pt-5 border-t border-[#E5E7EB]">
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 w-full h-12 rounded-[10px] border-2 border-[#16A34A] bg-white text-[#16A34A] font-semibold text-[15px] px-5 shadow-sm transition-all duration-200 hover:bg-[#F0FDF4] hover:border-[#15803D] hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A] focus-visible:ring-offset-2"
            >
              Already have an account? Sign In
            </Link>
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
                className="text-slate-400 hover:text-slate-700 focus:outline-none transition-colors"
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
                className="text-slate-400 hover:text-slate-700 focus:outline-none transition-colors"
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

          {/* Turnstile / Clerk CAPTCHA Container */}
          <div className="flex justify-center w-full min-h-[74px] my-4">
            <div id="clerk-captcha" className="w-full flex justify-center">
              {useTurnstile && (
                <div
                  className="cf-turnstile"
                  data-sitekey={siteKey}
                  data-callback="onTurnstileSuccess"
                  data-expired-callback="onTurnstileExpired"
                  data-error-callback="onTurnstileError"
                />
              )}
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading || (isTurnstileActive && !turnstileToken)}
            className="w-full h-12 rounded-[10px] text-base font-semibold px-6 bg-[#16A34A] text-white shadow-sm hover:bg-[#15803D] hover:shadow-md active:scale-[0.98] transition-all duration-200 focus-visible:ring-[#16A34A] focus-visible:ring-offset-2"
          >
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
    </>
  );
}
