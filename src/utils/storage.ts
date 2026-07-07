import type { ExpiryItem } from "../types";

export const STORAGE_KEY = "expiry_items";
export const CATEGORY_STORAGE_KEY = "expiry_categories";
export const DEFAULT_CATEGORIES = ["食材", "お菓子", "調味料", "レトルト・保存食", "飲料"];

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

export function getCategories(items: ExpiryItem[] = []): string[] {
  try {
    const raw = localStorage.getItem(CATEGORY_STORAGE_KEY);
    const saved: unknown = raw ? JSON.parse(raw) : null;
    const categories = Array.isArray(saved)
      ? saved.filter((value): value is string => typeof value === "string" && value.trim() !== "")
      : DEFAULT_CATEGORIES;

    const names = new Set(categories.map((category) => category.trim()));
    items.forEach((item) => {
      if (item.category.trim()) names.add(item.category.trim());
    });

    return [...names];
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export function saveCategories(categories: string[]): void {
  const normalized = categories
    .map((category) => category.trim())
    .filter((category, index, list) => category && list.indexOf(category) === index);

  localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(normalized));
}
