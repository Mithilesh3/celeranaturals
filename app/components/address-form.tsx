"use client";

import { PINCODE, type OrderAddress } from "../../lib/orders";

/**
 * The delivery-address form, shared by checkout and the saved-addresses
 * manager so both collect exactly the same fields in the same shape.
 *
 * Client-side checks here are for feedback only; the server re-validates and
 * re-normalises every field before anything is stored.
 */
export const EMPTY_ADDRESS: OrderAddress = {
  fullName: "", phone: "", line1: "", line2: "",
  locality: "", city: "", state: "", pincode: "", landmark: "",
};

const MOBILE = /^[6-9]\d{9}$/;

/** Mirrors lib/orders validateAddress, for disabling the submit button. */
export function addressIncomplete(address: OrderAddress): boolean {
  return (
    !address.fullName.trim() ||
    !MOBILE.test(address.phone.replace(/\D/g, "").slice(-10)) ||
    !address.line1.trim() ||
    !(address.locality ?? "").trim() ||
    !address.city.trim() ||
    !address.state.trim() ||
    !PINCODE.test(address.pincode)
  );
}

export function AddressFields({
  address, onChange, disabled = false, idPrefix = "addr",
}: {
  address: OrderAddress;
  onChange: (next: OrderAddress) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const set = (key: keyof OrderAddress, value: string) => onChange({ ...address, [key]: value });

  const text = (key: keyof OrderAddress, label: string, extra: Record<string, unknown> = {}) => (
    <label className="checkout-field" htmlFor={`${idPrefix}-${key}`}>
      <span>{label}</span>
      <input
        id={`${idPrefix}-${key}`}
        value={(address[key] as string) ?? ""}
        disabled={disabled}
        onChange={(event) => set(key, event.target.value)}
        {...extra}
      />
    </label>
  );

  const phoneInvalid = address.phone.length > 0 && !MOBILE.test(address.phone);

  return (
    <div className="checkout-fields">
      {text("fullName", "Full name", { autoComplete: "name", maxLength: 80 })}

      <label className="checkout-field" htmlFor={`${idPrefix}-phone`}>
        <span>Mobile number</span>
        <div className="phone-auth-field">
          <span className="phone-auth-prefix" aria-hidden="true">+91</span>
          <input
            id={`${idPrefix}-phone`}
            value={address.phone}
            inputMode="numeric"
            maxLength={10}
            disabled={disabled}
            autoComplete="tel-national"
            aria-invalid={phoneInvalid}
            onChange={(event) => set("phone", event.target.value.replace(/\D/g, "").slice(0, 10))}
          />
        </div>
        {phoneInvalid && <small className="phone-auth-error">Enter a valid 10-digit mobile number.</small>}
      </label>

      {text("line1", "House / flat no., building and street", { autoComplete: "address-line1", maxLength: 160 })}
      {text("locality", "Locality / area", { autoComplete: "address-level3", maxLength: 120 })}
      {text("landmark", "Landmark (optional)", { maxLength: 120 })}
      {text("city", "City", { autoComplete: "address-level2", maxLength: 80 })}
      {text("state", "State", { autoComplete: "address-level1", maxLength: 80 })}

      <label className="checkout-field" htmlFor={`${idPrefix}-pincode`}>
        <span>PIN code</span>
        <input
          id={`${idPrefix}-pincode`}
          value={address.pincode}
          inputMode="numeric"
          maxLength={6}
          disabled={disabled}
          autoComplete="postal-code"
          aria-invalid={address.pincode.length > 0 && !PINCODE.test(address.pincode)}
          onChange={(event) => set("pincode", event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        {address.pincode.length > 0 && !PINCODE.test(address.pincode) && (
          <small className="phone-auth-error">PIN code must be exactly 6 digits.</small>
        )}
      </label>
    </div>
  );
}
