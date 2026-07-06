import type { ExpiryItem, ExpiryStatus } from "../types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getLocalToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function getDaysUntil(expiryDate: string): number {
  const expiry = parseLocalDate(expiryDate);
  return Math.round((expiry.getTime() - getLocalToday().getTime()) / MS_PER_DAY);
}

export function getExpiryStatus(expiryDate: string): ExpiryStatus {
  const days = getDaysUntil(expiryDate);
  if (days < 0) return "expired";
  if (days === 0) return "today";
  if (days <= 3) return "soon3";
  if (days <= 7) return "soon7";
  return "normal";
}

export function formatDaysLabel(expiryDate: string): string {
  const days = getDaysUntil(expiryDate);
  if (days < 0) return `期限切れ ${Math.abs(days)}日`;
  if (days === 0) return "今日まで";
  if (days === 1) return "あと1日";
  return `あと${days}日`;
}

export function sortByExpiryDate(items: ExpiryItem[]): ExpiryItem[] {
  return [...items].sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (a.status !== "completed" && b.status === "completed") return -1;

    if (a.status === "completed" && b.status === "completed") {
      return (
        new Date(b.completedAt ?? b.updatedAt).getTime() -
        new Date(a.completedAt ?? a.updatedAt).getTime()
      );
    }

    return parseLocalDate(a.expiryDate).getTime() - parseLocalDate(b.expiryDate).getTime();
  });
}
