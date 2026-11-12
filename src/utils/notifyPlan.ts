import type { ExpiryItem } from "../types";
import { parseLocalDate } from "./date";

// 期限のお知らせ（1日1回のまとめ通知）の予定を作る純粋関数。
// Capacitor には触れない（単体テストで日付計算だけを確かめるため）。

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type NotificationSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
  // 期限の何日前から知らせるか（0＝当日分だけ）
  daysBefore: number;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  hour: 8,
  minute: 0,
  daysBefore: 3
};

export const SCHEDULE_DAYS = 30;
export const NOTIFICATION_ID_BASE = 1000;
export const MAX_DAYS_BEFORE = 7;
export const NOTIFICATION_TITLE = "賞味期限メモ";

export type DaySummary = {
  todayItems: ExpiryItem[];
  soonItems: ExpiryItem[];
};

export type PlannedNotification = {
  id: number;
  at: Date;
  title: string;
  body: string;
};

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// day（その日の0時）から見て、期限まであと何日か
export function daysUntilFrom(expiryDate: string, day: Date): number {
  const expiry = parseLocalDate(expiryDate);
  return Math.round((expiry.getTime() - startOfLocalDay(day).getTime()) / MS_PER_DAY);
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(parseLocalDate(value).getTime());
}

// その日に知らせる品物：食べきっていないもの・期限が当日〜daysBefore日後のもの。
// 期限切れ（マイナス）は知らせない（毎朝同じ品物で鳴り続けるため）。
export function summarizeDay(items: ExpiryItem[], day: Date, daysBefore: number): DaySummary {
  const todayItems: ExpiryItem[] = [];
  const soonItems: ExpiryItem[] = [];

  for (const item of items) {
    if (item.status !== "active") continue;
    if (!isValidDateString(item.expiryDate)) continue;
    const days = daysUntilFrom(item.expiryDate, day);
    if (days === 0) todayItems.push(item);
    else if (days > 0 && days <= daysBefore) soonItems.push(item);
  }

  const byDate = (a: ExpiryItem, b: ExpiryItem) => a.expiryDate.localeCompare(b.expiryDate);
  return { todayItems, soonItems: soonItems.sort(byDate) };
}

const NAME_LIMIT = 3;

export function formatBody(summary: DaySummary, daysBefore: number): string {
  const parts: string[] = [];
  if (summary.todayItems.length > 0) parts.push(`今日までが${summary.todayItems.length}件`);
  if (summary.soonItems.length > 0) parts.push(`${daysBefore}日以内が${summary.soonItems.length}件`);

  const all = [...summary.todayItems, ...summary.soonItems];
  const names = all.slice(0, NAME_LIMIT).map((item) => item.name);
  const rest = all.length - names.length;
  const nameText = rest > 0 ? `${names.join("、")} ほか${rest}件` : names.join("、");

  return `${parts.join("・")}（${nameText}）`;
}

export function normalizeSettings(value: unknown): NotificationSettings {
  const d = DEFAULT_NOTIFICATION_SETTINGS;
  if (!value || typeof value !== "object") return { ...d };
  const v = value as Record<string, unknown>;
  const int = (x: unknown, min: number, max: number, fallback: number) =>
    typeof x === "number" && Number.isInteger(x) && x >= min && x <= max ? x : fallback;

  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : d.enabled,
    hour: int(v.hour, 0, 23, d.hour),
    minute: int(v.minute, 0, 59, d.minute),
    daysBefore: int(v.daysBefore, 0, MAX_DAYS_BEFORE, d.daysBefore)
  };
}

// now から SCHEDULE_DAYS 日分の通知予定を作る。
// 今日の通知時刻をもう過ぎていれば明日から数える。0件の日は入れない。
export function buildNotificationPlan(
  items: ExpiryItem[],
  settings: NotificationSettings,
  now: Date,
  days: number = SCHEDULE_DAYS
): PlannedNotification[] {
  if (!settings.enabled) return [];

  const todayFire = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    settings.hour,
    settings.minute
  );
  const offset = todayFire.getTime() > now.getTime() ? 0 : 1;
  const plan: PlannedNotification[] = [];

  for (let i = 0; i < days; i += 1) {
    // 日付の繰り上がり（月末・年末）は Date に任せる
    const at = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset + i,
      settings.hour,
      settings.minute
    );
    const summary = summarizeDay(items, at, settings.daysBefore);
    if (summary.todayItems.length + summary.soonItems.length === 0) continue;

    plan.push({
      id: NOTIFICATION_ID_BASE + i,
      at,
      title: NOTIFICATION_TITLE,
      body: formatBody(summary, settings.daysBefore)
    });
  }

  return plan;
}
