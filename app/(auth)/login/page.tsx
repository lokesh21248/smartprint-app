"use client";

import { Suspense, useState, useEffect, useRef } from "react";
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

  // ── Timing instrumentation ─────────────────────────────────────────────
  // Measures how long Clerk takes to resolve the session on this page.
  const hasEndedResolveTimer = useRef(false);

  useEffect(() => {
    console.time("login-page:clerk-session-resolve");
    return () => {
      if (!hasEndedResolveTimer.current) {
        console.timeEnd("login-page:clerk-session-resolve");
        hasEndedResolveTimer.current = true;
      }
    };
  }, []);

  useEffect(() => {
    if (userLoaded && !hasEndedResolveTimer.current) {
      console.timeEnd("login-page:clerk-session-resolve");
      hasEndedResolveTimer.current = true;
      console.log(
        `[login-page] Clerk session resolved. isSignedIn=${!!user}, willRedirect=${!!user}`
      );
    }
  }, [userLoaded, user]);

  // ── isRedirecting: shown ONLY when a live session is found ─────────────
  // This prevents the spinner from blocking the form on every cold visit.
  const [isRedirecting, setIsRedirecting] = useState(false);

  // ── Form state (declared unconditionally — no hooks after early return) ──
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (userLoaded && user) {
      setIsRedirecting(true);
      window.location.assign(redirectTo);
    }
  }, [user, userLoaded, redirectTo]);

  // Show spinner only while a confirmed redirect is in flight
  if (isRedirecting) {
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
        <div className="mt-6 pt-5 border-t border-[#E5E7EB]">
          <Link
            href="/signup"
            className="flex items-center justify-center gap-2 w-full h-12 rounded-[10px] border-2 border-[#16A34A] bg-white text-[#16A34A] font-semibold text-[15px] px-5 shadow-sm transition-all duration-200 hover:bg-[#F0FDF4] hover:border-[#15803D] hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A] focus-visible:ring-offset-2"
          >
            <Store className="h-4 w-4 shrink-0" />
            Create Your Shop
          </Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="flex justify-end mt-1">
              <Link
                href="/forgot-password"
                className="text-[13px] font-medium text-[#16A34A] hover:text-[#15803D] hover:underline transition-colors"
              >
                Forgot password?
              </Link>
            </div>
          </div>
        </div>

        {error && (
          <p
            className="text-sm text-red-600 font-medium"
            role="alert"
            aria-live="assertive"
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={isLoading}
          className="w-full h-12 rounded-[10px] text-base font-semibold px-6 bg-[#16A34A] text-white shadow-sm hover:bg-[#15803D] hover:shadow-md active:scale-[0.98] transition-all duration-200 focus-visible:ring-[#16A34A] focus-visible:ring-offset-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              Sign In
              <LogIn className="ml-2 h-5 w-5" />
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
