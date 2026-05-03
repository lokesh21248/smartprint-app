"use client";

import { Suspense, useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { Mail, Lock, KeyRound, ArrowLeft, Loader2 } from "lucide-react";
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

  return (
    <AuthLayout
      icon={<KeyRound className="h-6 w-6 text-[#2E8B57]" />}
      title={stage === "email" ? "Forgot Password" : stage === "code" ? "Enter Reset Code" : "Set New Password"}
      description={
        stage === "email"
          ? "Enter your email and we'll send a reset code"
          : stage === "code"
          ? `We sent a code to ${email}. Enter it below with your new password.`
          : "Enter your new password"
      }
      footer={
        <div className="mt-8 pt-6 border-t border-[#E5E7EB] text-center">
          <Link href="/login" className="text-sm text-[#2E8B57] font-semibold hover:underline flex items-center justify-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Back to Login
          </Link>
        </div>
      }
    >
      {stage === "email" ? (
        <form onSubmit={handleSendCode} className="space-y-5">
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
          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          <Button type="submit" className="w-full mt-2" size="lg" disabled={isLoading}>
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : "Send Reset Code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} className="space-y-5">
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
            type="password"
            placeholder="••••••••"
            required
            leftIcon={<Lock className="h-4 w-4" />}
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
          />
          <Input
            id="confirmPassword"
            label="Confirm Password"
            type="password"
            placeholder="••••••••"
            required
            leftIcon={<Lock className="h-4 w-4" />}
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
          />
          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          <Button type="submit" className="w-full mt-2" size="lg" disabled={isLoading}>
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resetting...</> : "Reset Password"}
          </Button>
          <button
            type="button"
            onClick={() => setStage("email")}
            className="w-full text-sm text-[#6B7280] hover:text-[#2E8B57] text-center"
          >
            Resend code
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
