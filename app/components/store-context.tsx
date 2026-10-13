"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CartRow = { id: string; qty: number };
type StoreContextValue = {
  cart: CartRow[];
  wishlist: string[];
  ready: boolean;
  addToCart: (id: string, qty?: number) => void;
  setQuantity: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
  toggleWishlist: (id: string) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

function parseStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function normalizeCart(value: unknown): CartRow[] {
  if (!Array.isArray(value)) return [];
  const quantities = new Map<string, number>();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const { id, qty } = row as { id?: unknown; qty?: unknown };
    if (typeof id !== "string" || !id || typeof qty !== "number" || !Number.isFinite(qty) || qty < 1) continue;
    quantities.set(id, (quantities.get(id) ?? 0) + Math.floor(qty));
  }
  return [...quantities].filter(([, qty]) => qty > 0).map(([id, qty]) => ({ id, qty }));
}

export function StoreProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [cart, setCart] = useState<CartRow[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCart(normalizeCart(parseStored<unknown>("cn_cart", [])));
    setWishlist(parseStored<string[]>("cn_wishlist", []));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("cn_cart", JSON.stringify(cart));
      localStorage.setItem("cn_wishlist", JSON.stringify(wishlist));
    } catch { /* Keep in-memory state usable when browser storage is unavailable. */ }
  }, [cart, wishlist, ready]);

  const value = useMemo<StoreContextValue>(() => ({
    cart,
    wishlist,
    addToCart: (id, qty = 1) => {
      const amount = Number.isFinite(qty) ? Math.max(1, Math.floor(qty)) : 1;
      setCart((rows) => rows.some((row) => row.id === id)
        ? rows.map((row) => row.id === id ? { ...row, qty: row.qty + amount } : row)
        : [...rows, { id, qty: amount }]);
    },
    setQuantity: (id, qty) => setCart((rows) => qty <= 0 ? rows.filter((row) => row.id !== id) : rows.map((row) => row.id === id ? { ...row, qty } : row)),
    removeFromCart: (id) => setCart((rows) => rows.filter((row) => row.id !== id)),
    toggleWishlist: (id) => setWishlist((rows) => rows.includes(id) ? rows.filter((item) => item !== id) : [...rows, id]),
    ready,
  }), [cart, wishlist, ready]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used within StoreProvider");
  return store;
}
