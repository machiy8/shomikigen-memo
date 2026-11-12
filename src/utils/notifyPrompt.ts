// 最初に品物を登録したときに1回だけ「通知をオンにしますか？」と聞くかどうか。
// Capacitor に触れない純粋関数（単体テストのため）。

export const NOTIFY_PROMPTED_KEY = "expiry_notification_prompted";

export type NotifyPromptInput = {
  // アプリ版（Capacitor）か。Web 版では聞かない
  native: boolean;
  // もう聞いたか（オンにした・断った、どちらでも true）
  prompted: boolean;
  // 通知がすでにオンか
  enabled: boolean;
  // 今回の保存が新しい品物の登録か（編集・食べきった・削除では聞かない）
  isNewItem: boolean;
};

export function shouldAskNotification(input: NotifyPromptInput): boolean {
  return input.native && input.isNewItem && !input.prompted && !input.enabled;
}

export function loadPrompted(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  try {
    return storage.getItem(NOTIFY_PROMPTED_KEY) === "1";
  } catch {
    // 読めないときは聞かない側に倒す（毎回聞いてしまうのを避ける）
    return true;
  }
}

export function savePrompted(storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(NOTIFY_PROMPTED_KEY, "1");
  } catch {
    // 保存できなくても動作は続ける
  }
}
