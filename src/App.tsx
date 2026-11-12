import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import type { ExpiryItem, FilterMode } from "./types";
import {
  formatDaysLabel,
  getExpiryStatus,
  getLocalDateStamp,
  sortByExpiryDate
} from "./utils/date";
import { normalizeForSearch } from "./utils/text";
import {
  createBackup,
  getCategories,
  getItems,
  parseBackup,
  saveCategories,
  saveItems
} from "./utils/storage";
import {
  describePending,
  ensureNotificationPermission,
  hasNotificationPermission,
  isNativeApp,
  loadNotificationSettings,
  onNotificationTap,
  rescheduleNotifications,
  saveNotificationSettings
} from "./native/notifications";
import { shareBackupFile } from "./native/backup";
import { MAX_DAYS_BEFORE, type NotificationSettings } from "./utils/notifyPlan";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=jp.revoapp.shomikigen" +
  "&utm_source=web&utm_medium=app_footer&utm_campaign=install";

// TWA（Playからインストールしたアプリ）で開いているときは、Playへの導線を出さない。
// ブラウザでWeb版を使っている人にだけ出す。
function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeApp()) return true;
  if (document.referrer.startsWith("android-app://")) return true;
  return window.matchMedia("(display-mode: standalone)").matches;
}

const SAVE_FAILED_MESSAGE =
  "保存できませんでした。端末の空き容量やブラウザの設定を確認してください。直前の変更は元に戻しました。";

const MANAGE_CATEGORY_VALUE = "__manage_category__";

// 通知は Android アプリ版（Capacitor）だけ：1日1回のまとめ通知を端末内で予約する（src/native/notifications.ts）。
// 品物ごとの notifyDaysBefore は使わない（設定の「何日前から」で全体を決める）。
// 既存バックアップとの互換のため型・保存処理には残してある。

const WEB_APP_URL = "https://shomikigen.revoapp.jp/?migrate=1";

// Web 版を「アプリへ引っ越すため」に開いたとき（アプリの案内のリンクから）
function isMigrateVisit(): boolean {
  if (typeof window === "undefined" || isNativeApp()) return false;
  return new URLSearchParams(window.location.search).get("migrate") === "1";
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTE_OPTIONS = [0, 15, 30, 45];

type FormState = {
  name: string;
  expiryDate: string;
  quantity: string;
  category: string;
  memo: string;
  opened: boolean;
  notifyDaysBefore: string;
};

type ViewMode = "home" | "categories";

const emptyForm: FormState = {
  name: "",
  expiryDate: "",
  quantity: "1",
  category: "",
  memo: "",
  opened: false,
  notifyDaysBefore: ""
};

function createId(): string {
  if ("crypto" in window && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatShortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${month}/${day}`;
}

function toLocalDateTime(isoDate?: string): string {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(isoDate));
}

function App() {
  const [items, setItems] = useState<ExpiryItem[]>(() => getItems());
  const [categories, setCategories] = useState<string[]>(() => getCategories(getItems()));
  const [filter, setFilter] = useState<FilterMode>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [draggingCategory, setDraggingCategory] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);
  const [consumingItem, setConsumingItem] = useState<ExpiryItem | null>(null);
  const [consumeAmount, setConsumeAmount] = useState("1");
  // カテゴリ管理へ寄り道したあと、入力途中のフォームへ戻すためのフラグ
  const [resumeFormAfterCategories, setResumeFormAfterCategories] = useState(false);
  const [categoryAddedForForm, setCategoryAddedForForm] = useState<string | null>(null);
  const native = isNativeApp();
  const [notifySettings, setNotifySettings] = useState<NotificationSettings>(() =>
    loadNotificationSettings()
  );
  const [notifyStatus, setNotifyStatus] = useState("");
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [showMigrateBanner, setShowMigrateBanner] = useState(() => isMigrateVisit());
  const importInputRef = useRef<HTMLInputElement>(null);

  // 品物・通知設定が変わったとき、起動したとき、アプリに戻ってきたときに30日分を予約し直す
  const itemsRef = useRef(items);
  const settingsRef = useRef(notifySettings);
  itemsRef.current = items;
  settingsRef.current = notifySettings;

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    rescheduleNotifications(items, notifySettings)
      .then(async () => {
        const [status, granted] = await Promise.all([describePending(), hasNotificationPermission()]);
        if (cancelled) return;
        setNotifyStatus(status);
        setPermissionBlocked(notifySettings.enabled && !granted);
      })
      .catch(() => {
        if (!cancelled) setNotifyStatus("通知の予約に失敗しました");
      });
    return () => {
      cancelled = true;
    };
  }, [native, items, notifySettings]);

  useEffect(() => {
    if (!native) return;
    const resume = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      // 日付が変わっている・端末の設定で通知を切り替えた、などに追いつく
      void rescheduleNotifications(itemsRef.current, settingsRef.current)
        .then(async () => {
          setNotifyStatus(await describePending());
          setPermissionBlocked(settingsRef.current.enabled && !(await hasNotificationPermission()));
        })
        .catch(() => undefined);
    });
    const stopTap = onNotificationTap(() => showSoonList());
    return () => {
      void resume.then((l) => l.remove());
      stopTap();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native]);

  // Android の戻るボタン：開いている画面を閉じる。何も開いていなければアプリを閉じる
  const backStateRef = useRef({ isFormOpen, isMaintenanceOpen, consumingItem, viewMode, openMenuId });
  backStateRef.current = { isFormOpen, isMaintenanceOpen, consumingItem, viewMode, openMenuId };
  useEffect(() => {
    if (!native) return;
    const back = CapApp.addListener("backButton", () => {
      const state = backStateRef.current;
      if (state.consumingItem) setConsumingItem(null);
      else if (state.isFormOpen) closeFormRef.current();
      else if (state.isMaintenanceOpen) setIsMaintenanceOpen(false);
      else if (state.viewMode === "categories") closeCategoryManagerRef.current();
      else if (state.openMenuId) setOpenMenuId(null);
      else void CapApp.exitApp();
    });
    return () => {
      void back.then((l) => l.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native]);

  function showSoonList() {
    setViewMode("home");
    setIsFormOpen(false);
    setIsMaintenanceOpen(false);
    setConsumingItem(null);
    setOpenMenuId(null);
    setSearchQuery("");
    setCategoryFilter("all");
    setFilter("soon");
  }

  async function updateNotifySettings(patch: Partial<NotificationSettings>) {
    const next = { ...notifySettings, ...patch };

    // オンにするときだけ通知の許可を求める（Android 13 以降）
    if (patch.enabled === true) {
      const granted = await ensureNotificationPermission().catch(() => false);
      if (!granted) {
        setPermissionBlocked(true);
        window.alert(
          "通知が許可されていません。端末の「設定」→「アプリ」→「賞味期限メモ」→「通知」から許可してから、もう一度オンにしてください。"
        );
        return;
      }
      setPermissionBlocked(false);
    }

    if (!saveNotificationSettings(next)) {
      window.alert(SAVE_FAILED_MESSAGE);
      return;
    }
    setNotifySettings(next);
  }

  const visibleItems = useMemo(() => {
    const keyword = normalizeForSearch(searchQuery.trim());

    const filtered = items.filter((item) => {
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;

      if (!matchesCategory) return false;

      if (keyword) {
        const haystack = normalizeForSearch(`${item.name} ${item.memo}`);
        if (!haystack.includes(keyword)) return false;
      }

      if (filter === "completed") return item.status === "completed";
      if (item.status === "completed") return false;

      if (filter === "opened") return Boolean(item.opened);

      if (filter === "expired") return getExpiryStatus(item.expiryDate) === "expired";

      if (filter === "soon") {
        const status = getExpiryStatus(item.expiryDate);
        return status === "today" || status === "soon3" || status === "soon7";
      }

      return true;
    });

    return sortByExpiryDate(filtered);
  }, [categoryFilter, filter, items, searchQuery]);

  // 保存できなかったときは画面も元に戻す。
  // 「表示されているのに保存されていない」状態を作らないため。
  function persistItems(nextItems: ExpiryItem[]): boolean {
    const previous = items;
    setItems(nextItems);

    if (!saveItems(nextItems)) {
      setItems(previous);
      window.alert(SAVE_FAILED_MESSAGE);
      return false;
    }

    return true;
  }

  function persistCategories(nextCategories: string[]): boolean {
    const previous = categories;
    const normalized = nextCategories
      .map((category) => category.trim())
      .filter((category, index, list) => category && list.indexOf(category) === index);

    setCategories(normalized);

    if (!saveCategories(normalized)) {
      setCategories(previous);
      window.alert(SAVE_FAILED_MESSAGE);
      return false;
    }

    return true;
  }

  function openAddForm() {
    setEditingId(null);
    setOpenMenuId(null);
    setForm({
      ...emptyForm,
      category: categoryFilter !== "all" ? categoryFilter : categories[0] ?? ""
    });
    setIsFormOpen(true);
  }

  function openEditForm(item: ExpiryItem) {
    setEditingId(item.id);
    setOpenMenuId(null);
    setForm({
      name: item.name,
      expiryDate: item.expiryDate,
      quantity: String(item.quantity || 1),
      category: item.category,
      memo: item.memo,
      opened: Boolean(item.opened),
      notifyDaysBefore:
        item.notifyDaysBefore === undefined ? "" : String(item.notifyDaysBefore)
    });
    setIsFormOpen(true);
  }

  // fromForm=true のときは、入力途中のフォーム内容を保持したまま寄り道し、
  // 「戻る」で同じフォームへ復帰する（新しいカテゴリで登録したい場面のため）。
  function openCategoryManager(fromForm = false) {
    setOpenMenuId(null);
    setIsFormOpen(false);
    setIsMaintenanceOpen(false);
    setResumeFormAfterCategories(fromForm);
    setCategoryAddedForForm(null);
    setViewMode("categories");
  }

  function closeCategoryManager() {
    setViewMode("home");

    if (!resumeFormAfterCategories) return;

    setResumeFormAfterCategories(false);
    setForm((current) => {
      if (categoryAddedForForm && categories.includes(categoryAddedForForm)) {
        return { ...current, category: categoryAddedForForm };
      }
      if (categories.includes(current.category)) return current;
      return { ...current, category: categories[0] ?? "" };
    });
    setCategoryAddedForForm(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setResumeFormAfterCategories(false);
    setCategoryAddedForForm(null);
  }

  const closeFormRef = useRef(closeForm);
  closeFormRef.current = closeForm;
  const closeCategoryManagerRef = useRef(closeCategoryManager);
  closeCategoryManagerRef.current = closeCategoryManager;

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleCategorySelect(value: string) {
    if (value === MANAGE_CATEGORY_VALUE) {
      openCategoryManager(true);
      return;
    }
    updateForm("category", value);
  }

  function handleCategoryFilterSelect(value: string) {
    if (value === MANAGE_CATEGORY_VALUE) {
      openCategoryManager();
      return;
    }
    setCategoryFilter(value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = form.name.trim();
    const expiryDate = form.expiryDate;
    const category = form.category.trim();
    const memo = form.memo.trim();
    const opened = form.opened;
    const quantity = Math.max(1, Number(form.quantity) || 1);
    const notifyDaysBefore =
      form.notifyDaysBefore === "" ? undefined : Number(form.notifyDaysBefore);

    if (!name || !expiryDate || !category) {
      window.alert("商品名、賞味期限、カテゴリを入力してください。");
      return;
    }

    if (!categories.includes(category) && !persistCategories([...categories, category])) {
      return;
    }

    const now = new Date().toISOString();

    // 保存に失敗したときはフォームを閉じない（入力内容を失わせない）。
    const saved = editingId
      ? persistItems(
          items.map((item) =>
          item.id === editingId
            ? {
                ...item,
                name,
                expiryDate,
                quantity,
                category,
                memo,
                opened,
                notifyDaysBefore,
                updatedAt: now
              }
            : item
          )
        )
      : persistItems([
          {
            id: createId(),
            name,
            expiryDate,
            quantity,
            category,
            memo,
            opened,
            notifyDaysBefore,
            status: "active",
            createdAt: now,
            updatedAt: now
          },
          ...items
        ]);

    if (saved) closeForm();
  }

  function completeItem(id: string) {
    const now = new Date().toISOString();
    setOpenMenuId(null);
    persistItems(
      items.map((item) =>
        item.id === id
          ? { ...item, status: "completed", completedAt: now, updatedAt: now }
          : item
      )
    );
  }

  function requestConsume(item: ExpiryItem) {
    setOpenMenuId(null);

    if (item.quantity <= 1) {
      completeItem(item.id);
      return;
    }

    setConsumingItem(item);
    setConsumeAmount("1");
  }

  function closeConsumeModal() {
    setConsumingItem(null);
    setConsumeAmount("1");
  }

  function handleConsumeSubmit(event: FormEvent) {
    event.preventDefault();
    if (!consumingItem) return;

    const amount = Math.min(
      Math.max(1, Math.round(Number(consumeAmount)) || 1),
      consumingItem.quantity
    );
    const now = new Date().toISOString();
    const remaining = consumingItem.quantity - amount;

    persistItems(
      items.map((item) => {
        if (item.id !== consumingItem.id) return item;

        if (remaining <= 0) {
          return { ...item, status: "completed", completedAt: now, updatedAt: now };
        }

        return { ...item, quantity: remaining, updatedAt: now };
      })
    );

    closeConsumeModal();
  }

  function restoreItem(id: string) {
    const now = new Date().toISOString();
    setOpenMenuId(null);
    persistItems(
      items.map((item) =>
        item.id === id
          ? { ...item, status: "active", completedAt: undefined, updatedAt: now }
          : item
      )
    );
  }

  function toggleOpenedItem(id: string) {
    const now = new Date().toISOString();
    setOpenMenuId(null);
    persistItems(
      items.map((item) =>
        item.id === id ? { ...item, opened: !item.opened, updatedAt: now } : item
      )
    );
  }

  function deleteItem(id: string) {
    setOpenMenuId(null);
    if (!window.confirm("この商品を削除しますか？")) return;
    persistItems(items.filter((item) => item.id !== id));
  }

  function resetAll() {
    if (!window.confirm("すべてのデータを削除しますか？")) return;
    persistItems([]);
    setFilter("all");
    setCategoryFilter("all");
    setOpenMenuId(null);
  }

  function exportBackup() {
    const backup = createBackup(items, categories);
    const json = JSON.stringify(backup, null, 2);
    const fileName = `shomikigen-memo-backup-${getLocalDateStamp()}.json`;

    if (native) {
      shareBackupFile(fileName, json).catch((error: unknown) => {
        // 共有シートを閉じただけのときは何も言わない
        const message = error instanceof Error ? error.message : "";
        if (/cancel/i.test(message)) return;
        window.alert("バックアップを書き出せませんでした。");
      });
      return;
    }

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = parseBackup(String(reader.result ?? ""));
        const ok = window.confirm(
          `バックアップを読み込みます。現在のデータは置き換わります。\n\n商品: ${backup.items.length}件\nカテゴリ: ${backup.categories.length}件\n\nよろしいですか？`
        );
        if (!ok) return;

        persistItems(backup.items);
        persistCategories(backup.categories);
        setFilter("all");
        setCategoryFilter("all");
        setOpenMenuId(null);
        setIsMaintenanceOpen(false);
        window.alert("バックアップを読み込みました。");
      } catch (error) {
        const message = error instanceof Error ? error.message : "バックアップを読み込めませんでした。";
        window.alert(message);
      }
    };
    reader.onerror = () => {
      window.alert("ファイルを読み込めませんでした。");
    };
    reader.readAsText(file);
  }

  function addCategory() {
    const name = window.prompt("追加するカテゴリ名を入力してください。");
    const category = name?.trim();
    if (!category) return;
    if (categories.includes(category)) {
      window.alert("同じ名前のカテゴリがあります。");
      return;
    }
    if (persistCategories([...categories, category])) {
      // 登録フォームから来ている場合、戻ったときにこのカテゴリを選んだ状態にする
      setCategoryAddedForForm(category);
    }
  }

  function renameCategory(oldName: string) {
    const name = window.prompt("新しいカテゴリ名を入力してください。", oldName);
    const newName = name?.trim();
    if (!newName || newName === oldName) return;
    if (categories.includes(newName)) {
      window.alert("同じ名前のカテゴリがあります。");
      return;
    }

    persistCategories(categories.map((category) => (category === oldName ? newName : category)));
    persistItems(
      items.map((item) =>
        item.category === oldName ? { ...item, category: newName, updatedAt: new Date().toISOString() } : item
      )
    );
    if (categoryFilter === oldName) setCategoryFilter(newName);
    if (form.category === oldName) updateForm("category", newName);
  }

  function deleteCategory(name: string) {
    if (categories.length <= 1) {
      window.alert("カテゴリは1つ以上必要です。");
      return;
    }

    const usedCount = items.filter((item) => item.category === name).length;
    const rest = categories.filter((category) => category !== name);

    if (usedCount > 0) {
      const fallback = rest[0];
      const ok = window.confirm(
        `「${name}」を使っている商品が${usedCount}件あります。削除すると「${fallback}」へ移動します。よろしいですか？`
      );
      if (!ok) return;
      persistItems(
        items.map((item) =>
          item.category === name ? { ...item, category: fallback, updatedAt: new Date().toISOString() } : item
        )
      );
    } else if (!window.confirm(`「${name}」を削除しますか？`)) {
      return;
    }

    persistCategories(rest);
    if (categoryFilter === name) setCategoryFilter("all");
    if (form.category === name) updateForm("category", rest[0] ?? "");
  }

  function moveCategory(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= categories.length || fromIndex === toIndex) return;
    const next = [...categories];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    persistCategories(next);
  }

  function handleCategoryDrop(event: DragEvent<HTMLLIElement>, targetCategory: string) {
    event.preventDefault();
    if (!draggingCategory || draggingCategory === targetCategory) return;
    moveCategory(categories.indexOf(draggingCategory), categories.indexOf(targetCategory));
    setDraggingCategory(null);
  }

  if (viewMode === "categories") {
    return (
      <div className="app-shell">
        <main className="app">
          <header className="app-header">
            <div>
              <h1>カテゴリ管理</h1>
              <p>{resumeFormAfterCategories ? "戻ると入力中の登録画面に戻ります" : "追加・名前変更・削除・並び替え"}</p>
            </div>
            <button className="secondary-button" type="button" onClick={closeCategoryManager}>
              戻る
            </button>
          </header>

          <section className="category-manager">
            <button className="primary-button full-button" type="button" onClick={addCategory}>
              カテゴリを追加
            </button>

            <ol className="category-list">
              {categories.map((category, index) => (
                <li
                  key={category}
                  className="category-row"
                  draggable
                  onDragStart={() => setDraggingCategory(category)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleCategoryDrop(event, category)}
                >
                  <span className="drag-handle" aria-hidden="true">
                    =
                  </span>
                  <span className="category-name">{category}</span>
                  <div className="category-actions">
                    <button type="button" onClick={() => moveCategory(index, index - 1)} disabled={index === 0}>
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCategory(index, index + 1)}
                      disabled={index === categories.length - 1}
                    >
                      ↓
                    </button>
                    <button type="button" onClick={() => renameCategory(category)}>
                      名前
                    </button>
                    <button className="danger-inline" type="button" onClick={() => deleteCategory(category)}>
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell" onClick={() => setOpenMenuId(null)}>
      <main className="app">
        <header className="app-header">
          <div>
            <h1>賞味期限メモ</h1>
            <p>{visibleItems.length}件表示中</p>
          </div>
          <div className="header-actions">
            <button
              className="icon-button"
              type="button"
              aria-label="データ管理"
              onClick={() => setIsMaintenanceOpen(true)}
            >
              ⚙
            </button>
            <button className="add-button" type="button" onClick={openAddForm}>
              追加
            </button>
          </div>
        </header>

        {showMigrateBanner && (
          <section className="migrate-card" aria-label="アプリへの引っ越し">
            <h2>Androidアプリへの引っ越し</h2>
            <p>
              この画面のデータ（{items.length}件）をバックアップに書き出し、アプリの「バックアップから戻す」で読み込んでください。
            </p>
            <div className="migrate-actions">
              <button className="primary-button" type="button" onClick={exportBackup}>
                バックアップを書き出す
              </button>
              <button className="secondary-button" type="button" onClick={() => setShowMigrateBanner(false)}>
                閉じる
              </button>
            </div>
          </section>
        )}

        <section className="list-tools" aria-label="絞り込み">
          <div className="search-row">
            <input
              type="search"
              className="search-input"
              value={searchQuery}
              placeholder="商品名・メモで検索"
              aria-label="商品名・メモで検索"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear"
                aria-label="検索をクリア"
                onClick={() => setSearchQuery("")}
              >
                ×
              </button>
            )}
          </div>

          <select
            value={categoryFilter}
            onChange={(event) => handleCategoryFilterSelect(event.target.value)}
          >
            <option value="all">すべてのカテゴリ</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
            <option value={MANAGE_CATEGORY_VALUE}>追加・変更</option>
          </select>

          <div className="filter-row" role="tablist" aria-label="状態フィルター">
            <FilterButton active={filter === "all"} label="すべて" onClick={() => setFilter("all")} />
            <FilterButton active={filter === "soon"} label="期限間近" onClick={() => setFilter("soon")} />
            <FilterButton
              active={filter === "expired"}
              label="期限切れ"
              onClick={() => setFilter("expired")}
            />
            <FilterButton active={filter === "opened"} label="開封済み" onClick={() => setFilter("opened")} />
            <FilterButton
              active={filter === "completed"}
              label="食べきった"
              onClick={() => setFilter("completed")}
            />
          </div>
        </section>

        <section className="item-list" aria-label="商品一覧">
          {visibleItems.length === 0 && native && items.length === 0 ? (
            <div className="empty-state migrate-card">
              <h2>以前のデータを戻しますか？</h2>
              <p>
                アプリを新しくしたため、以前の版で登録した品物はこの画面に引き継がれていません。以前のデータはブラウザ（Chrome
                など）に残っています。
              </p>
              <ol className="migrate-steps">
                <li>
                  「Web版を開く」でブラウザの賞味期限メモを開き、「バックアップを書き出す」を押す（保存先は「ダウンロード」など）
                </li>
                <li>このアプリに戻り「バックアップから戻す」で、書き出したファイルを選ぶ</li>
              </ol>
              <div className="migrate-actions">
                <a className="secondary-button link-button" href={WEB_APP_URL} target="_blank" rel="noopener">
                  Web版を開く
                </a>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                >
                  バックアップから戻す
                </button>
              </div>
              <p className="migrate-note">初めて使う方は、右上の「追加」から登録できます。</p>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="empty-state">
              <h2>表示できる商品がありません</h2>
              <p>右上の追加から登録できます。</p>
            </div>
          ) : (
            visibleItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                menuOpen={openMenuId === item.id}
                onComplete={requestConsume}
                onDelete={deleteItem}
                onEdit={openEditForm}
                onMenuToggle={(id) => setOpenMenuId((current) => (current === id ? null : id))}
                onToggleOpened={toggleOpenedItem}
                onRestore={restoreItem}
              />
            ))
          )}
        </section>

        <input
          ref={importInputRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={importBackup}
          tabIndex={-1}
          aria-hidden="true"
        />

        {!isInstalledApp() && (
          <footer className="app-footer">
            <a className="play-link" href={PLAY_STORE_URL} target="_blank" rel="noopener">
              Androidアプリ版を Google Play で入手
            </a>
          </footer>
        )}

      </main>

      {isMaintenanceOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setIsMaintenanceOpen(false)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="maintenance-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="maintenance-title">{native ? "設定とデータ" : "データ管理"}</h2>
              <button
                className="icon-button"
                type="button"
                aria-label="閉じる"
                onClick={() => setIsMaintenanceOpen(false)}
              >
                x
              </button>
            </div>

            {native && (
              <div className="notify-panel" aria-label="通知の設定">
                <h3>期限のお知らせ</h3>
                <label className="notify-toggle">
                  <input
                    type="checkbox"
                    checked={notifySettings.enabled}
                    onChange={(event) => void updateNotifySettings({ enabled: event.target.checked })}
                  />
                  1日1回まとめて通知する
                </label>
                <div className="notify-grid">
                  <label>
                    時刻
                    <span className="notify-time">
                      <select
                        value={notifySettings.hour}
                        disabled={!notifySettings.enabled}
                        onChange={(event) => void updateNotifySettings({ hour: Number(event.target.value) })}
                        aria-label="時"
                      >
                        {HOUR_OPTIONS.map((hour) => (
                          <option key={hour} value={hour}>
                            {hour}時
                          </option>
                        ))}
                      </select>
                      <select
                        value={notifySettings.minute}
                        disabled={!notifySettings.enabled}
                        onChange={(event) => void updateNotifySettings({ minute: Number(event.target.value) })}
                        aria-label="分"
                      >
                        {(MINUTE_OPTIONS.includes(notifySettings.minute)
                          ? MINUTE_OPTIONS
                          : [...MINUTE_OPTIONS, notifySettings.minute].sort((a, b) => a - b)
                        ).map((minute) => (
                          <option key={minute} value={minute}>
                            {String(minute).padStart(2, "0")}分
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                  <label>
                    何日前から
                    <select
                      value={notifySettings.daysBefore}
                      disabled={!notifySettings.enabled}
                      onChange={(event) => void updateNotifySettings({ daysBefore: Number(event.target.value) })}
                    >
                      {Array.from({ length: MAX_DAYS_BEFORE + 1 }, (_, days) => days).map((days) => (
                        <option key={days} value={days}>
                          {days === 0 ? "当日だけ" : `${days}日前から`}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="notify-help">
                  期限が近い品物がある日だけ、指定の時刻ごろに知らせます（数分ずれることがあります）。0件の日は通知しません。
                </p>
                {permissionBlocked && (
                  <p className="notify-warning">
                    端末の設定で通知がオフになっています。「設定」→「アプリ」→「賞味期限メモ」→「通知」から許可してください。
                  </p>
                )}
                {notifySettings.enabled && notifyStatus && <p className="notify-status">{notifyStatus}</p>}
              </div>
            )}

            <div className="maintenance-panel">
              <button
                className="text-link-button"
                type="button"
                onClick={() => openCategoryManager()}
              >
                カテゴリを管理
              </button>
              <button className="text-link-button" type="button" onClick={exportBackup}>
                バックアップを書き出し
              </button>
              <label className="text-link-button file-import-label">
                バックアップを読み込み
                <input type="file" accept="application/json,.json" onChange={importBackup} />
              </label>
              <button className="text-danger-button" type="button" onClick={resetAll}>
                データを初期化
              </button>
            </div>
          </section>
        </div>
      )}

      {consumingItem && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeConsumeModal}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consume-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="consume-title">{consumingItem.name}</h2>
              <button
                className="icon-button"
                type="button"
                aria-label="閉じる"
                onClick={closeConsumeModal}
              >
                x
              </button>
            </div>

            <form className="item-form" onSubmit={handleConsumeSubmit}>
              <p className="consume-stock">残り{consumingItem.quantity}個</p>

              <label>
                いくつ使いましたか？
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={consumingItem.quantity}
                  value={consumeAmount}
                  onChange={(event) => setConsumeAmount(event.target.value)}
                  autoFocus
                />
              </label>

              <button
                type="button"
                className="text-link-button"
                onClick={() => setConsumeAmount(String(consumingItem.quantity))}
              >
                全部使いきった（{consumingItem.quantity}個）
              </button>

              <div className="form-actions">
                <button className="secondary-button" type="button" onClick={closeConsumeModal}>
                  キャンセル
                </button>
                <button className="primary-button" type="submit">
                  記録する
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {isFormOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeForm}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="form-title">{editingId ? "商品を編集" : "商品を登録"}</h2>
              <button className="icon-button" type="button" aria-label="閉じる" onClick={closeForm}>
                x
              </button>
            </div>

            <form className="item-form" onSubmit={handleSubmit}>
              <label>
                商品名 <strong>必須</strong>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="例: 牛乳"
                />
              </label>

              <label>
                賞味期限 <strong>必須</strong>
                <input
                  required
                  type="date"
                  value={form.expiryDate}
                  onChange={(event) => updateForm("expiryDate", event.target.value)}
                />
              </label>

              <div className="form-grid">
                <label>
                  数量
                  <input
                    min="1"
                    inputMode="numeric"
                    type="number"
                    value={form.quantity}
                    onChange={(event) => updateForm("quantity", event.target.value)}
                  />
                </label>

                <label>
                  カテゴリ <strong>必須</strong>
                  <select
                    required
                    value={form.category}
                    onChange={(event) => handleCategorySelect(event.target.value)}
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                    <option value={MANAGE_CATEGORY_VALUE}>追加・変更</option>
                  </select>
                </label>
              </div>

              <label>
                メモ
                <textarea
                  value={form.memo}
                  onChange={(event) => updateForm("memo", event.target.value)}
                  placeholder="開封済み、冷蔵庫の奥など"
                />
              </label>

              <div className="form-actions">
                <button className="secondary-button" type="button" onClick={closeForm}>
                  キャンセル
                </button>
                <button className="primary-button" type="submit">
                  保存
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function FilterButton({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "filter-chip active" : "filter-chip"}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

function ItemRow({
  item,
  menuOpen,
  onComplete,
  onDelete,
  onEdit,
  onMenuToggle,
  onToggleOpened,
  onRestore
}: {
  item: ExpiryItem;
  menuOpen: boolean;
  onComplete: (item: ExpiryItem) => void;
  onDelete: (id: string) => void;
  onEdit: (item: ExpiryItem) => void;
  onMenuToggle: (id: string) => void;
  onToggleOpened: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const expiryStatus = item.status === "completed" ? "completed" : getExpiryStatus(item.expiryDate);
  const completedText = item.completedAt ? `完了 ${toLocalDateTime(item.completedAt)}` : "完了済み";

  const isCompleted = item.status === "completed";

  return (
    <article className={`item-row ${expiryStatus}`}>
      {!isCompleted && (
        <div className="row-date">
          <span className="days-label">{formatDaysLabel(item.expiryDate)}</span>
          <span>{formatShortDate(item.expiryDate)}</span>
        </div>
      )}

      <div className="row-body">
        <h2>{item.name}</h2>
        <p>
          {/* 食べきった項目の「数量」は完了時点の在庫で、残数ではないため出さない */}
          {!isCompleted && <span>数量:{item.quantity}</span>}
          <span>{item.category}</span>
          {!isCompleted && item.opened && <span className="opened-label">開封済み</span>}
          {isCompleted && <span>{completedText}</span>}
        </p>
        {item.memo && <p className="row-memo">{item.memo}</p>}
      </div>

      <div className="row-menu" onClick={(event) => event.stopPropagation()}>
        <button
          className="menu-button"
          type="button"
          aria-label={`${item.name}のメニュー`}
          aria-expanded={menuOpen}
          onClick={() => onMenuToggle(item.id)}
        >
          ...
        </button>

        {menuOpen && (
          <div className="menu-popover">
            {item.status === "completed" ? (
              <button type="button" onClick={() => onRestore(item.id)}>
                戻す
              </button>
            ) : (
              <>
                <button type="button" onClick={() => onComplete(item)}>
                  {item.quantity > 1 ? "使った数を記録" : "食べた・使い切った"}
                </button>
                <button type="button" onClick={() => onToggleOpened(item.id)}>
                  {item.opened ? "未開封に戻す" : "開封済みにする"}
                </button>
              </>
            )}
            <button type="button" onClick={() => onEdit(item)}>
              編集
            </button>
            <button className="danger-menu-item" type="button" onClick={() => onDelete(item.id)}>
              削除
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export default App;

