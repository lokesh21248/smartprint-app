"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSignUp, useUser } from "@clerk/nextjs";
import { ShieldCheck, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/auth/OtpInput";
import { ResendTimer } from "@/components/auth/ResendTimer";

export default function VerifyEmailPage() {
  const { isLoaded, signUp } = useSignUp();
  const { user, isLoaded: userLoaded } = useUser();
  const router = useRouter();

  const [isMounted, setIsMounted] = useState(false);
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetKey, setResetKey] = useState(0);

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
    return (
      <div className="flex w-full min-h-[400px] items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-[#2E8B57]" />
      </div>
    );
  }

  const handleVerify = async (codeToVerify: string) => {
    if (!isLoaded || !signUp || codeToVerify.length !== 6) return;

    setIsLoading(true);
    setError("");

    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code: codeToVerify,
      });

      if (completeSignUp.status === "complete") {
        // Requirement 5: Redirect to Login page after verification
        toast.success("Email verified successfully! Please sign in.");
        router.push("/login");
      } else {
        console.error(JSON.stringify(completeSignUp, null, 2));
        setError("Verification incomplete. Please try again.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.errors?.[0]?.message || "Invalid code. Please try again.");
      toast.error("Verification failed");
      setCode(""); // Clear on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!isLoaded || !signUp) return;
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      toast.success("New code sent!");
      setCode("");
      setResetKey(k => k + 1);
    } catch (err: any) {
      toast.error("Failed to resend code");
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-lg border border-[#E5E7EB] p-8 animate-slide-in-up w-full max-w-md mx-auto">
      <div className="mb-7 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#E8F5EE] flex items-center justify-center mb-4 mx-auto">
          <ShieldCheck className="h-6 w-6 text-[#2E8B57]" />
        </div>
        <h2 className="text-2xl font-bold text-[#111827]">Verify your email</h2>
        <p className="text-[#6B7280] mt-1">
          We sent a 6-digit verification code to your email address.
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex justify-center">
          <OtpInput
            length={6}
            value={code}
            onChange={(val) => {
              setCode(val);
              if (error) setError("");
            }}
            onComplete={(val) => {
              setCode(val);
              handleVerify(val); // Auto-submit
            }}
            disabled={isLoading}
            error={!!error}
          />
        </div>

        {error && (
          <p className="text-center text-sm text-red-600 font-medium">
            {error}
          </p>
        )}

        <Button
          onClick={() => handleVerify(code)}
          className="w-full"
          size="lg"
          disabled={isLoading || code.length !== 6}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Verify Email
            </>
          )}
        </Button>

        <div className="text-center">
          <ResendTimer onResend={handleResend} resetKey={resetKey} />
        </div>

        <button
          onClick={() => router.push("/signup")}
          className="w-full flex items-center justify-center gap-1.5 text-sm text-[#6B7280] hover:text-[#111827] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to signup
        </button>
      </div>
    </div>
  );
}
