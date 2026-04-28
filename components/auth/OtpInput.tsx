"use client";

import { useRef, useCallback, useEffect, type KeyboardEvent, type ClipboardEvent } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  length?: number;
}

export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  error = false,
  length = 6,
}: OtpInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const OTP_LENGTH = length;

  // Auto-focus first input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputs.current[0]) {
        inputs.current[0].focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Build an array of 6 chars from the value string
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  const focusInput = (index: number) => {
    const el = inputs.current[index];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const handleChange = useCallback(
    (index: number, char: string) => {
      // Accept only a single digit
      const digit = char.replace(/\D/g, "").slice(-1);
      const newDigits = [...digits];
      newDigits[index] = digit;
      const newValue = newDigits.join("");
      onChange(newValue);

      if (digit && index < OTP_LENGTH - 1) {
        focusInput(index + 1);
      }

      if (newValue.length === OTP_LENGTH && newValue.replace(/\D/g, "").length === OTP_LENGTH) {
        onComplete(newValue);
      }
    },
    [digits, onChange, onComplete]
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        e.preventDefault();
        const newDigits = [...digits];
        if (newDigits[index]) {
          // Clear current box
          newDigits[index] = "";
          onChange(newDigits.join(""));
        } else if (index > 0) {
          // Move to previous and clear it
          newDigits[index - 1] = "";
          onChange(newDigits.join(""));
          focusInput(index - 1);
        }
      } else if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        focusInput(index - 1);
      } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
        e.preventDefault();
        focusInput(index + 1);
      }
    },
    [digits, onChange]
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, OTP_LENGTH);
      if (!pasted) return;

      const newDigits = Array.from({ length: OTP_LENGTH }, (_, i) => pasted[i] ?? "");
      const newValue = newDigits.join("");
      onChange(newValue);

      // Focus last filled or last box
      const lastIndex = Math.min(pasted.length, OTP_LENGTH - 1);
      focusInput(lastIndex);

      if (pasted.length === OTP_LENGTH) {
        onComplete(newValue);
      }
    },
    [onChange, onComplete]
  );

  return (
    <div
      className="flex gap-3 justify-center"
      role="group"
      aria-label="One-time password input"
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { inputs.current[index] = el; }}
          id={`otp-digit-${index}`}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "w-12 h-14 text-center text-xl font-bold rounded-xl border-2 transition-all duration-150",
            "focus:outline-none focus:ring-0",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            digit
              ? error
                ? "border-red-400 bg-red-50 text-red-700"
                : "border-[#2E8B57] bg-[#E8F5EE] text-[#111827]"
              : error
              ? "border-red-300 bg-white text-[#111827]"
              : "border-[#D1D5DB] bg-white text-[#111827] hover:border-[#2E8B57]/50 focus:border-[#2E8B57]",
            "shadow-sm"
          )}
        />
      ))}
    </div>
  );
}
