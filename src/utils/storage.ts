import type { ExpiryItem } from "../types";

export const STORAGE_KEY = "expiry_items";
export const CATEGORY_STORAGE_KEY = "expiry_categories";
export const DEFAULT_CATEGORIES = ["食材", "お菓子", "調味料", "レトルト・保存食", "飲料"];
export const BACKUP_VERSION = 1;

export type AppBackup = {
  app: "shomikigen-memo";
  version: number;
  exportedAt: string;
  items: ExpiryItem[];
  categories: string[];
};

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

function normalizeItem(item: ExpiryItem): ExpiryItem {
  return {
    ...item,
    quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1,
    memo: item.memo ?? "",
    opened: Boolean(item.opened),
    status: item.status === "completed" ? "completed" : "active"
  };
}

function normalizeCategories(items: ExpiryItem[], categories: string[]): string[] {
  const names = new Set(
    categories.map((category) => category.trim()).filter((category) => category !== "")
  );

  items.forEach((item) => {
    if (item.category.trim()) names.add(item.category.trim());
  });

  return [...names];
}

export function getItems(): ExpiryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isExpiryItem).map(normalizeItem);
  } catch {
    return [];
  }
}

// 保存は失敗しうる（端末の空き容量不足、ブラウザ設定でストレージが無効など）。
// 失敗を握りつぶすと「画面には登録できているのに次回起動で消える」ため、
// 呼び出し側が巻き戻せるように成否を返す。
export function saveItems(items: ExpiryItem[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function getCategories(items: ExpiryItem[] = []): string[] {
  try {
    const raw = localStorage.getItem(CATEGORY_STORAGE_KEY);
    const saved: unknown = raw ? JSON.parse(raw) : null;
    const categories = Array.isArray(saved)
      ? saved.filter((value): value is string => typeof value === "string" && value.trim() !== "")
      : DEFAULT_CATEGORIES;

    return normalizeCategories(items, categories);
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export function saveCategories(categories: string[]): boolean {
  const normalized = categories
    .map((category) => category.trim())
    .filter((category, index, list) => category && list.indexOf(category) === index);

  try {
    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function createBackup(items: ExpiryItem[], categories: string[]): AppBackup {
  return {
    app: "shomikigen-memo",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    items,
    categories
  };
}

export function parseBackup(raw: string): AppBackup {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    // JSON.parse の例外文は英語なので、そのままユーザーに出さない。
    throw new Error("バックアップファイルの形式が正しくありません。");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("バックアップファイルの形式が正しくありません。");
  }

  const backup = parsed as Partial<AppBackup>;
  if (backup.app !== "shomikigen-memo" || !Array.isArray(backup.items)) {
    throw new Error("賞味期限メモのバックアップファイルではありません。");
  }

  const items = backup.items.filter(isExpiryItem).map(normalizeItem);
  const categories = Array.isArray(backup.categories)
    ? backup.categories.filter(
        (value): value is string => typeof value === "string" && value.trim() !== ""
      )
    : DEFAULT_CATEGORIES;

  return {
    app: "shomikigen-memo",
    version: typeof backup.version === "number" ? backup.version : BACKUP_VERSION,
    exportedAt: typeof backup.exportedAt === "string" ? backup.exportedAt : "",
    items,
    categories: normalizeCategories(items, categories)
  };
}
