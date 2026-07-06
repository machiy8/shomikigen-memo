import { FormEvent, useMemo, useState } from "react";
import type { ExpiryItem, FilterMode } from "./types";
import { formatDaysLabel, getDaysUntil, getExpiryStatus, sortByExpiryDate } from "./utils/date";
import { getItems, saveItems } from "./utils/storage";

const DEFAULT_CATEGORIES = ["食材", "お菓子", "調味料", "レトルト・保存食", "飲料"];

const NOTIFY_OPTIONS = [
  { label: "通知しない", value: "" },
  { label: "当日", value: "0" },
  { label: "1日前", value: "1" },
  { label: "3日前", value: "3" },
  { label: "7日前", value: "7" },
  { label: "30日前", value: "30" }
];

type FormState = {
  name: string;
  expiryDate: string;
  quantity: string;
  category: string;
  memo: string;
  notifyDaysBefore: string;
};

const emptyForm: FormState = {
  name: "",
  expiryDate: "",
  quantity: "1",
  category: "",
  memo: "",
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
  const [filter, setFilter] = useState<FilterMode>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const categories = useMemo(() => {
    const names = new Set(DEFAULT_CATEGORIES);
    items.forEach((item) => {
      if (item.category.trim()) names.add(item.category.trim());
    });
    return [...names].sort((a, b) => a.localeCompare(b, "ja"));
  }, [items]);

  const visibleItems = useMemo(() => {
    const filtered = items.filter((item) => {
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;

      if (!matchesCategory) return false;
      if (filter === "completed") return item.status === "completed";
      if (item.status === "completed") return false;

      if (filter === "near") {
        const days = getDaysUntil(item.expiryDate);
        return days >= 0 && days <= 7;
      }

      if (filter === "expired") return getDaysUntil(item.expiryDate) < 0;

      return true;
    });

    return sortByExpiryDate(filtered);
  }, [categoryFilter, filter, items]);

  function persist(nextItems: ExpiryItem[]) {
    setItems(nextItems);
    saveItems(nextItems);
  }

  function openAddForm() {
    setEditingId(null);
    setOpenMenuId(null);
    setForm({ ...emptyForm, category: categories[0] ?? "" });
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
      notifyDaysBefore:
        item.notifyDaysBefore === undefined ? "" : String(item.notifyDaysBefore)
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = form.name.trim();
    const expiryDate = form.expiryDate;
    const category = form.category.trim();
    const memo = form.memo.trim();
    const quantity = Math.max(1, Number(form.quantity) || 1);
    const notifyDaysBefore =
      form.notifyDaysBefore === "" ? undefined : Number(form.notifyDaysBefore);

    if (!name || !expiryDate || !category) {
      window.alert("商品名、賞味期限、カテゴリを入力してください。");
      return;
    }

    const now = new Date().toISOString();

    if (editingId) {
      persist(
        items.map((item) =>
          item.id === editingId
            ? {
                ...item,
                name,
                expiryDate,
                quantity,
                category,
                memo,
                notifyDaysBefore,
                updatedAt: now
              }
            : item
        )
      );
    } else {
      persist([
        {
          id: createId(),
          name,
          expiryDate,
          quantity,
          category,
          memo,
          notifyDaysBefore,
          status: "active",
          createdAt: now,
          updatedAt: now
        },
        ...items
      ]);
    }

    closeForm();
  }

  function completeItem(id: string) {
    const now = new Date().toISOString();
    setOpenMenuId(null);
    persist(
      items.map((item) =>
        item.id === id
          ? { ...item, status: "completed", completedAt: now, updatedAt: now }
          : item
      )
    );
  }

  function restoreItem(id: string) {
    const now = new Date().toISOString();
    setOpenMenuId(null);
    persist(
      items.map((item) =>
        item.id === id
          ? { ...item, status: "active", completedAt: undefined, updatedAt: now }
          : item
      )
    );
  }

  function deleteItem(id: string) {
    setOpenMenuId(null);
    if (!window.confirm("この商品を削除しますか？")) return;
    persist(items.filter((item) => item.id !== id));
  }

  function resetAll() {
    if (!window.confirm("すべてのデータを削除しますか？")) return;
    persist([]);
    setFilter("all");
    setCategoryFilter("all");
    setOpenMenuId(null);
  }

  return (
    <div className="app-shell" onClick={() => setOpenMenuId(null)}>
      <main className="app">
        <header className="app-header">
          <div>
            <h1>賞味期限メモ</h1>
            <p>{visibleItems.length}件表示中</p>
          </div>
          <button className="add-button" type="button" onClick={openAddForm}>
            追加
          </button>
        </header>

        <section className="list-tools" aria-label="絞り込み">
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">すべてのカテゴリ</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <div className="filter-row" role="tablist" aria-label="状態フィルター">
            <FilterButton active={filter === "all"} label="すべて" onClick={() => setFilter("all")} />
            <FilterButton active={filter === "near"} label="期限間近" onClick={() => setFilter("near")} />
            <FilterButton active={filter === "expired"} label="期限切れ" onClick={() => setFilter("expired")} />
            <FilterButton
              active={filter === "completed"}
              label="食べきった"
              onClick={() => setFilter("completed")}
            />
          </div>
        </section>

        <section className="item-list" aria-label="商品一覧">
          {visibleItems.length === 0 ? (
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
                onComplete={completeItem}
                onDelete={deleteItem}
                onEdit={openEditForm}
                onMenuToggle={(id) => setOpenMenuId((current) => (current === id ? null : id))}
                onRestore={restoreItem}
              />
            ))
          )}
        </section>

        <details className="maintenance">
          <summary>データ管理</summary>
          <button className="text-danger-button" type="button" onClick={resetAll}>
            データを初期化
          </button>
        </details>
      </main>

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
                  <input
                    required
                    list="category-options"
                    type="text"
                    value={form.category}
                    onChange={(event) => updateForm("category", event.target.value)}
                    placeholder="例: 冷蔵庫"
                  />
                  <datalist id="category-options">
                    {categories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
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

              <label>
                通知メモ
                <select
                  value={form.notifyDaysBefore}
                  onChange={(event) => updateForm("notifyDaysBefore", event.target.value)}
                >
                  {NOTIFY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
  onRestore
}: {
  item: ExpiryItem;
  menuOpen: boolean;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (item: ExpiryItem) => void;
  onMenuToggle: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const expiryStatus = item.status === "completed" ? "completed" : getExpiryStatus(item.expiryDate);
  const completedText = item.completedAt ? `完了 ${toLocalDateTime(item.completedAt)}` : "完了済み";

  return (
    <article className={`item-row ${expiryStatus}`}>
      <div className="row-date">
        <span className="days-label">{formatDaysLabel(item.expiryDate)}</span>
        <span>{formatShortDate(item.expiryDate)}</span>
      </div>

      <div className="row-body">
        <h2>{item.name}</h2>
        <p>
          数量:{item.quantity} <span>{item.category}</span>
          {item.status === "completed" && <span>{completedText}</span>}
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
              <button type="button" onClick={() => onComplete(item.id)}>
                食べた・使い切った
              </button>
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
