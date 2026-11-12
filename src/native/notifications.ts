import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { ExpiryItem } from "../types";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  buildNotificationPlan,
  normalizeSettings,
  type NotificationSettings
} from "../utils/notifyPlan";

// 端末内のローカル通知（Android アプリ版だけ）。サーバーには何も送らない。
// Web 版では何もしない（isNativePlatform で分ける）。

export const NOTIFICATION_SETTINGS_KEY = "expiry_notification_settings";
const CHANNEL_ID = "expiry-daily";
export const NOTIFICATION_ROUTE_SOON = "soon";

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULT_NOTIFICATION_SETTINGS };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

export function saveNotificationSettings(settings: NotificationSettings): boolean {
  try {
    localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

// 通知の許可（Android 13 以降は実行時の許可が要る）。オンにしたときだけ呼ぶ。
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

export async function hasNotificationPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const current = await LocalNotifications.checkPermissions();
  return current.display === "granted";
}

let channelReady = false;
async function ensureChannel() {
  if (channelReady || Capacitor.getPlatform() !== "android") return;
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: "期限のお知らせ",
    description: "期限が近い品物を1日1回まとめて知らせます",
    importance: 3,
    visibility: 0
  });
  channelReady = true;
}

async function cancelAllPending() {
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length === 0) return;
  await LocalNotifications.cancel({
    notifications: pending.notifications.map((n) => ({ id: n.id }))
  });
}

// 予約し直しを直列にする（品物を続けて変えたとき、消す→入れるが重ならないように）
let queue: Promise<unknown> = Promise.resolve();

// この先30日分を予約し直す（既存の予約は消してから入れ直す）。
export function rescheduleNotifications(
  items: ExpiryItem[],
  settings: NotificationSettings,
  now: Date = new Date()
): Promise<number> {
  if (!isNativeApp()) return Promise.resolve(0);

  const run = async () => {
    await cancelAllPending();
    if (!settings.enabled) return 0;
    if (!(await hasNotificationPermission())) return 0;

    const plan = buildNotificationPlan(items, settings, now);
    if (plan.length === 0) return 0;

    await ensureChannel();
    await LocalNotifications.schedule({
      notifications: plan.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        largeBody: p.body,
        channelId: CHANNEL_ID,
        smallIcon: "ic_stat_notify",
        iconColor: "#2563EB",
        autoCancel: true,
        // 正確なアラームの権限は使わない（数分ずれてよい）。端末が省電力中でも鳴るようにだけする。
        // isExactNotification を false にしないと、プラグインが schedule のたびに
        // Android 12 以降の「アラームとリマインダー」設定画面を開いてしまう（エミュレータで確認）
        isExactNotification: false,
        schedule: { at: p.at, allowWhileIdle: true },
        extra: { route: NOTIFICATION_ROUTE_SOON }
      }))
    });
    return plan.length;
  };

  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

// 通知をタップして開いたとき（アプリが閉じていても、プラグインが起動後に渡してくれる）
export function onNotificationTap(handler: (route: string) => void): () => void {
  if (!isNativeApp()) return () => undefined;
  const listener = LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
    const route = action.notification.extra?.route;
    handler(typeof route === "string" ? route : NOTIFICATION_ROUTE_SOON);
  });
  return () => {
    void listener.then((l) => l.remove());
  };
}

// 確認用：今の予約の数と次の日時
export async function describePending(): Promise<string> {
  if (!isNativeApp()) return "";
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length === 0) return "予約なし";
  const times = pending.notifications
    .map((n) => (n.schedule?.at ? new Date(n.schedule.at).getTime() : Number.NaN))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (times.length === 0) return `予約 ${pending.notifications.length}件`;
  const next = new Date(times[0]);
  const label = `${next.getMonth() + 1}/${next.getDate()} ${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
  return `予約 ${pending.notifications.length}件・次は ${label}`;
}
