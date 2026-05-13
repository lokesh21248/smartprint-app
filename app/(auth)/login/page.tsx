"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useSignIn, useUser } from "@clerk/nextjs";
import { Mail, Lock, LogIn, Store, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout, AuthLoader } from "@/components/auth/AuthLayout";
import Link from "next/link";

function LoginForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { user, isLoaded: userLoaded } = useUser();
  const searchParams = useSearchParams();

  let redirectTo = searchParams.get("redirect_url") || "/dashboard";
  if (
    redirectTo.includes("/login") ||
    redirectTo.includes("/signup") ||
    redirectTo.includes("/verify-email")
  ) {
    redirectTo = "/dashboard";
  }

  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    if (userLoaded && user) {
      window.location.assign(redirectTo);
    }
  }, [user, userLoaded, redirectTo]);

  if (!isMounted || !userLoaded || user) {
    return <AuthLoader />;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.id]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setIsLoading(true);
    setError("");
    try {
      const result = await signIn.create({
        identifier: formData.email,
        password: formData.password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        toast.success("Welcome back!");
        window.location.assign(redirectTo);
      } else if (result.status === "needs_second_factor") {
        setError("Two-factor authentication required. Please check your authenticator app.");
      } else if (result.status === "needs_new_password") {
        setError("You need to set a new password. Please use 'Forgot password'.");
      } else {
        // Log for debugging
        console.error("Unexpected sign-in status:", result.status);
        setError(`Sign-in incomplete (status: ${result.status}). Please try again.`);
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ code?: string; message?: string }> };
      const code = clerkErr.errors?.[0]?.code;
      const message = clerkErr.errors?.[0]?.message;

      if (code === "form_password_incorrect") {
        setError("Incorrect password. Try again or reset your password.");
      } else if (code === "form_identifier_not_found") {
        setError("No account found for this email.");
      } else if (code === "session_exists") {
        window.location.assign(redirectTo);
      } else if (code === "form_param_nil" || code === "strategy_for_user_invalid") {
        setError("This account uses a different sign-in method (e.g. Google). Please try another way.");
      } else {
        console.error("Clerk sign-in error:", code, message);
        setError(message || "Unable to sign in. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <AuthLayout
      icon={<Store className="h-6 w-6 text-[#2E8B57]" />}
      title="Welcome back"
      description="Sign in to manage your shop"
      footer={
        <div className="mt-8 pt-6 border-t border-[#E5E7EB] text-center">
          <p className="text-sm text-[#6B7280]">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-[#2E8B57] font-semibold hover:underline">
              Create a shop
            </Link>
          </p>
        </div>
      }
    >
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

        {error && (
          <p className="text-sm text-red-600 font-medium">{error}</p>
        )}

        <Button type="submit" className="w-full mt-2" size="lg" disabled={isLoading}>
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
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthLoader />}>
      <LoginForm />
    </Suspense>
  );
}
