import type { OrderAddress } from "./orders";

/**
 * Saved addresses live at users/{uid}/addresses/{id}.
 *
 * Browsers never touch them directly: firestore.rules denies the whole `users`
 * tree, and every read or write goes through /api/account/addresses, which
 * derives the uid from a verified ID token. A caller therefore cannot address
 * another customer's subcollection by changing a path or a body field.
 *
 * A saved address is a convenience for filling the checkout form. The order
 * stores its own independent snapshot, so editing or deleting a saved address
 * later never changes where an existing order is delivered.
 */
export const USERS_COLLECTION = "users";
export const ADDRESSES_SUBCOLLECTION = "addresses";

export const MAX_SAVED_ADDRESSES = 10;

export type SavedAddress = OrderAddress & {
  id: string;
  /** "Home", "Office", … purely a label for the customer. */
  label: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export const addressLabel = (value: unknown) =>
  (typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 40) : "") || "Address";
