"use client";

import { Suspense, useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { Mail, Lock, KeyRound, ArrowLeft, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthLayout, AuthLoader } from "@/components/auth/AuthLayout";
import Link from "next/link";

function ForgotPasswordForm() {
  const { isLoaded, signIn, setActive } = useSignIn();

  const [stage, setStage] = useState<"email" | "code" | "new-password">("email");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setIsLoading(true);
    setError("");
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      });
      toast.success("Reset code sent! Check your email.");
      setStage("code");
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ message?: string }> };
      setError(clerkErr.errors?.[0]?.message || "Failed to send reset email. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password: newPassword,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        toast.success("Password reset! Redirecting to dashboard...");
        window.location.assign("/dashboard");
      } else {
        setError("Could not complete password reset. Please try again.");
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ code?: string; message?: string }> };
      const code_err = clerkErr.errors?.[0]?.code;
      if (code_err === "form_code_incorrect") {
        setError("Incorrect code. Please check your email and try again.");
      } else {
        setError(clerkErr.errors?.[0]?.message || "Reset failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isLoaded) return <AuthLoader />;

  // ── Shared footer: Back to Login outlined button ──────────────────────────
  const footer = (
    <div className="mt-6 pt-5 border-t border-[#E5E7EB]">
      <Link
        href="/login"
        className="flex items-center justify-center gap-2 w-full h-12 rounded-[10px] border-2 border-[#16A34A] bg-white text-[#16A34A] font-semibold text-[15px] px-5 shadow-sm transition-all duration-200 hover:bg-[#F0FDF4] hover:border-[#15803D] hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A] focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" />
        Back to Login
      </Link>
    </div>
  );

  return (
    <AuthLayout
      icon={<KeyRound className="h-5 w-5 text-[#16A34A]" />}
      title={
        stage === "email"
          ? "Forgot Password"
          : stage === "code"
          ? "Enter Reset Code"
          : "Set New Password"
      }
      description={
        stage === "email"
          ? "Enter your email and we'll send a reset code."
          : stage === "code"
          ? `We sent a code to ${email}. Enter it below with your new password.`
          : "Enter your new password below."
      }
      footer={footer}
    >
      {/* ── Stage 1: Email ───────────────────────────────────────────────── */}
      {stage === "email" && (
        <form onSubmit={handleSendCode} className="space-y-4">
          <Input
            id="email"
            label="Email Address"
            type="email"
            placeholder="owner@example.com"
            required
            leftIcon={<Mail className="h-4 w-4" />}
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
          />
          {error && (
            <p className="text-[13px] text-red-500 font-medium" role="alert">
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Send Reset Code"
            )}
          </Button>
        </form>
      )}

      {/* ── Stage 2: Code + New Password ─────────────────────────────────── */}
      {stage === "code" && (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <Input
            id="code"
            label="Reset Code"
            type="text"
            placeholder="Enter 6-digit code"
            required
            leftIcon={<KeyRound className="h-4 w-4" />}
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(""); }}
          />
          <Input
            id="newPassword"
            label="New Password"
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
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
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
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
          />
          {error && (
            <p className="text-[13px] text-red-500 font-medium" role="alert">
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
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              "Reset Password"
            )}
          </Button>
          {/* Resend code — subtle secondary action */}
          <button
            type="button"
            onClick={() => { setStage("email"); setError(""); }}
            className="w-full text-[13px] text-slate-400 hover:text-[#16A34A] text-center transition-colors"
          >
            Didn&apos;t receive a code? Resend
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<AuthLoader />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
