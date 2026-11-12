import { describe, expect, it } from "vitest";
import type { ExpiryItem } from "../types";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_ID_BASE,
  buildNotificationPlan,
  daysUntilFrom,
  formatBody,
  normalizeSettings,
  summarizeDay
} from "./notifyPlan";

function item(name: string, expiryDate: string, extra: Partial<ExpiryItem> = {}): ExpiryItem {
  return {
    id: name,
    name,
    expiryDate,
    quantity: 1,
    category: "食材",
    memo: "",
    status: "active",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...extra
  };
}

const on = { ...DEFAULT_NOTIFICATION_SETTINGS, enabled: true };

describe("daysUntilFrom", () => {
  it("同じ日は0・翌日は1・前日は-1", () => {
    const day = new Date(2026, 10, 13, 8, 0);
    expect(daysUntilFrom("2026-11-13", day)).toBe(0);
    expect(daysUntilFrom("2026-11-14", day)).toBe(1);
    expect(daysUntilFrom("2026-11-12", day)).toBe(-1);
  });

  it("月またぎ・年またぎ・うるう年", () => {
    expect(daysUntilFrom("2026-12-01", new Date(2026, 10, 30))).toBe(1);
    expect(daysUntilFrom("2027-01-02", new Date(2026, 11, 31))).toBe(2);
    expect(daysUntilFrom("2028-03-01", new Date(2028, 1, 28))).toBe(2); // 2/29 がある
    expect(daysUntilFrom("2027-03-01", new Date(2027, 1, 28))).toBe(1);
  });
});

describe("summarizeDay（何日前から知らせるか）", () => {
  const day = new Date(2026, 10, 13);
  const items = [
    item("期限切れ", "2026-11-12"),
    item("今日", "2026-11-13"),
    item("1日後", "2026-11-14"),
    item("3日後", "2026-11-16"),
    item("4日後", "2026-11-17"),
    item("食べきった", "2026-11-13", { status: "completed" }),
    item("日付なし", "")
  ];

  it("既定（3日前）：今日1件・3日以内2件。期限切れ・4日後・食べきった・日付なしは数えない", () => {
    const s = summarizeDay(items, day, 3);
    expect(s.todayItems.map((i) => i.name)).toEqual(["今日"]);
    expect(s.soonItems.map((i) => i.name)).toEqual(["1日後", "3日後"]);
  });

  it("0日前（当日だけ）", () => {
    const s = summarizeDay(items, day, 0);
    expect(s.todayItems).toHaveLength(1);
    expect(s.soonItems).toHaveLength(0);
  });

  it("7日前なら4日後も入る", () => {
    expect(summarizeDay(items, day, 7).soonItems.map((i) => i.name)).toEqual(["1日後", "3日後", "4日後"]);
  });
});

describe("formatBody", () => {
  it("件数と品名（3件まで・残りは「ほかN件」）", () => {
    const body = formatBody(
      {
        todayItems: [item("牛乳", "2026-11-13")],
        soonItems: [item("卵", "2026-11-14"), item("豆腐", "2026-11-15"), item("納豆", "2026-11-16")]
      },
      3
    );
    expect(body).toBe("今日までが1件・3日以内が3件（牛乳、卵、豆腐 ほか1件）");
  });

  it("今日の分が無い日は「N日以内」だけ", () => {
    expect(formatBody({ todayItems: [], soonItems: [item("卵", "2026-11-14")] }, 3)).toBe(
      "3日以内が1件（卵）"
    );
  });
});

describe("buildNotificationPlan", () => {
  it("通知オフなら何も予約しない", () => {
    expect(buildNotificationPlan([item("牛乳", "2026-11-13")], DEFAULT_NOTIFICATION_SETTINGS, new Date(2026, 10, 13, 7))).toEqual([]);
  });

  it("品物0件なら0件（0件の日は出さない）", () => {
    expect(buildNotificationPlan([], on, new Date(2026, 10, 13, 7))).toEqual([]);
  });

  it("通知時刻より前に開いたら今日から・後なら明日から", () => {
    const items = [item("牛乳", "2026-11-14")];
    const before = buildNotificationPlan(items, on, new Date(2026, 10, 13, 7, 59));
    expect(before.map((p) => p.at)).toEqual([new Date(2026, 10, 13, 8, 0), new Date(2026, 10, 14, 8, 0)]);
    expect(before[0].body).toBe("3日以内が1件（牛乳）");
    expect(before[1].body).toBe("今日までが1件（牛乳）");

    const after = buildNotificationPlan(items, on, new Date(2026, 10, 13, 8, 0));
    expect(after.map((p) => p.at)).toEqual([new Date(2026, 10, 14, 8, 0)]);
  });

  it("期限の3日前から当日まで4日間だけ鳴り、間の0件の日は飛ばす", () => {
    const items = [item("A", "2026-11-20"), item("B", "2026-11-30")];
    const plan = buildNotificationPlan(items, on, new Date(2026, 10, 13, 9));
    const days = plan.map((p) => p.at.getDate());
    expect(days).toEqual([17, 18, 19, 20, 27, 28, 29, 30]);
    // ID は「明日から何日目か」で決まる（予約し直しで同じ日に同じ ID）
    expect(plan[0].id).toBe(NOTIFICATION_ID_BASE + 3);
  });

  it("月またぎ（11/30→12/1）と30日の窓の端", () => {
    const items = [item("年末", "2026-12-02")];
    const plan = buildNotificationPlan(items, on, new Date(2026, 10, 29, 6));
    expect(plan.map((p) => `${p.at.getMonth() + 1}/${p.at.getDate()}`)).toEqual([
      "11/29",
      "11/30",
      "12/1",
      "12/2"
    ]);

    // 30日の窓の外（31日後以降）は入らない
    const far = buildNotificationPlan([item("遠い", "2027-01-31")], on, new Date(2026, 11, 1, 6));
    expect(far).toEqual([]);
    const edge = buildNotificationPlan([item("端", "2026-12-30")], on, new Date(2026, 11, 1, 6));
    expect(edge.map((p) => p.at.getDate())).toEqual([27, 28, 29, 30]);
    expect(edge[edge.length - 1].id).toBe(NOTIFICATION_ID_BASE + 29);
  });

  it("年またぎ・時刻の設定（21:30）", () => {
    const plan = buildNotificationPlan(
      [item("おせち", "2027-01-01")],
      { ...on, hour: 21, minute: 30, daysBefore: 1 },
      new Date(2026, 11, 31, 22, 0)
    );
    expect(plan.map((p) => p.at)).toEqual([new Date(2027, 0, 1, 21, 30)]);
    expect(plan[0].body).toBe("今日までが1件（おせち）");
  });
});

describe("normalizeSettings", () => {
  it("壊れた値は既定に戻す", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(normalizeSettings({ enabled: true, hour: 25, minute: -1, daysBefore: 99 })).toEqual({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      enabled: true
    });
    expect(normalizeSettings({ enabled: true, hour: 6, minute: 45, daysBefore: 0 })).toEqual({
      enabled: true,
      hour: 6,
      minute: 45,
      daysBefore: 0
    });
  });
});
