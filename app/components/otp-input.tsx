"use client";

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";

const LENGTH = 6;

/**
 * Six single-character boxes behaving as one logical field: type to advance,
 * backspace to retreat, paste to fill, auto-submit when complete.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  describedBy,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const submitted = useRef("");

  useEffect(() => {
    // Auto-submit once, as soon as all six digits are present.
    if (value.length === LENGTH && submitted.current !== value) {
      submitted.current = value;
      onComplete(value);
    }
    if (value.length < LENGTH) submitted.current = "";
  }, [value, onComplete]);

  const focusBox = (index: number) => {
    const box = refs.current[Math.max(0, Math.min(LENGTH - 1, index))];
    box?.focus();
    box?.select();
  };

  const setDigit = (index: number, digit: string) => {
    const next = value.padEnd(LENGTH, " ").split("");
    next[index] = digit || " ";
    onChange(next.join("").replace(/\s+$/, "").replace(/\s/g, ""));
  };

  const handleKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (value[index]) setDigit(index, "");
      else if (index > 0) { setDigit(index - 1, ""); focusBox(index - 1); }
      return;
    }
    if (event.key === "ArrowLeft") { event.preventDefault(); focusBox(index - 1); }
    if (event.key === "ArrowRight") { event.preventDefault(); focusBox(index + 1); }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    focusBox(pasted.length >= LENGTH ? LENGTH - 1 : pasted.length);
  };

  return (
    <div className="otp-boxes" role="group" aria-label="6-digit verification code">
      {Array.from({ length: LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(element) => { refs.current[index] = element; }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={`Digit ${index + 1} of ${LENGTH}`}
          aria-describedby={describedBy}
          className="otp-box"
          value={value[index] ?? ""}
          disabled={disabled}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown(index)}
          onChange={(event) => {
            const digit = event.target.value.replace(/\D/g, "").slice(-1);
            if (!digit) return;
            setDigit(index, digit);
            if (index < LENGTH - 1) focusBox(index + 1);
          }}
        />
      ))}
    </div>
  );
}
