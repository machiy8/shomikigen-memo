import { describe, expect, it } from "vitest";
import { NOTIFY_PROMPTED_KEY, loadPrompted, savePrompted, shouldAskNotification } from "./notifyPrompt";

const base = { native: true, prompted: false, enabled: false, isNewItem: true };

describe("shouldAskNotification（初回の登録で1回だけ聞く）", () => {
  it("アプリ版・未確認・通知オフ・新しい品物なら聞く", () => {
    expect(shouldAskNotification(base)).toBe(true);
  });

  it("Web 版では聞かない", () => {
    expect(shouldAskNotification({ ...base, native: false })).toBe(false);
  });

  it("一度聞いたら（オンにした・断った）もう聞かない", () => {
    expect(shouldAskNotification({ ...base, prompted: true })).toBe(false);
  });

  it("すでに通知オンなら聞かない", () => {
    expect(shouldAskNotification({ ...base, enabled: true })).toBe(false);
  });

  it("編集・食べきった・削除（新しい品物でない）では聞かない", () => {
    expect(shouldAskNotification({ ...base, isNewItem: false })).toBe(false);
  });
});

describe("loadPrompted / savePrompted", () => {
  function memory() {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v)
    };
  }

  it("保存前は false・保存後は true", () => {
    const s = memory();
    expect(loadPrompted(s)).toBe(false);
    savePrompted(s);
    expect(s.getItem(NOTIFY_PROMPTED_KEY)).toBe("1");
    expect(loadPrompted(s)).toBe(true);
  });

  it("読めない（例外）ときは聞かない側（true）", () => {
    expect(
      loadPrompted({
        getItem: () => {
          throw new Error("blocked");
        }
      })
    ).toBe(true);
  });
});
