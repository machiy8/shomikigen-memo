import type { ExpiryItem } from "../types";

export const STORAGE_KEY = "expiry_items";

function isExpiryItem(value: unknown): value is ExpiryItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.expiryDate === "string" &&
    typeof item.category === "string" &&
    typeof item.status === "string"
  );
}

export function getItems(): ExpiryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isExpiryItem).map((item) => ({
      ...item,
      quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1,
      memo: item.memo ?? "",
      status: item.status === "completed" ? "completed" : "active"
    }));
  } catch {
    return [];
  }
}

export function saveItems(items: ExpiryItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}
