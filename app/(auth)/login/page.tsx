"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSignIn, useUser } from "@clerk/nextjs";
import { Mail, Lock, LogIn, ArrowRight, Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

function LoginForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Safely parse redirect URL
  let redirectTo = searchParams.get("redirect_url") || "/dashboard";
  if (redirectTo.includes("/login") || redirectTo.includes("/signup") || redirectTo.includes("/verify-email")) {
    redirectTo = "/dashboard";
  }

  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  // Handle hydration safely
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (userLoaded && user) {
      window.location.assign(redirectTo);
    }
  }, [user, userLoaded, redirectTo]);

  // Prevent UI flicker while checking auth state or during hydration
  if (!isMounted || !userLoaded || user) {
    return (
      <div className="flex w-full min-h-[400px] items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-[#2E8B57]" />
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setIsLoading(true);
    try {
      const result = await signIn.create({
        identifier: formData.email,
        password: formData.password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        
        // Provision shop if it's their first time logging in
        try {
          await fetch("/api/auth/complete-signup", { method: "POST" });
        } catch (err) {
          console.error("Failed to provision shop:", err);
        }

        toast.success("Welcome back!");
        window.location.assign(redirectTo);
      } else {
        console.error(result);
        toast.error("More steps required to sign in.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.errors?.[0]?.message || "Invalid email or password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-lg border border-[#E5E7EB] p-8 animate-slide-in-up w-full max-w-md mx-auto">
      <div className="mb-8">
        <div className="w-12 h-12 rounded-2xl bg-[#E8F5EE] flex items-center justify-center mb-4">
          <Store className="h-6 w-6 text-[#2E8B57]" />
        </div>
        <h2 className="text-2xl font-bold text-[#111827] mb-2">Welcome back</h2>
        <p className="text-[#6B7280]">Sign in to manage your shop</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-4">
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
          <div className="space-y-1">
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
            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm text-[#2E8B57] hover:underline font-medium"
              >
                Forgot password?
              </Link>
            </div>
          </div>
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
              Signing in...
            </>
          ) : (
            <>
              Sign In
              <LogIn className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-[#E5E7EB] text-center">
        <p className="text-sm text-[#6B7280]">
          Don't have an account?{" "}
          <Link href="/signup" className="text-[#2E8B57] font-semibold hover:underline">
            Create a shop
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex w-full min-h-[400px] items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-[#2E8B57]" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
