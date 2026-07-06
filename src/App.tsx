import { FormEvent, useMemo, useState } from "react";
import type { ExpiryItem, FilterMode } from "./types";
import {
  formatDaysLabel,
  getDaysUntil,
  getExpiryStatus,
  sortByExpiryDate
} from "./utils/date";
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
  category: DEFAULT_CATEGORIES[0],
  memo: "",
  notifyDaysBefore: ""
};

function createId(): string {
  if ("crypto" in window && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toLocalDateTime(isoDate?: string): string {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
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
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const activeCount = items.filter((item) => item.status === "active").length;
  const nearCount = items.filter((item) => {
    const days = getDaysUntil(item.expiryDate);
    return item.status === "active" && days >= 0 && days <= 7;
  }).length;
  const expiredCount = items.filter(
    (item) => item.status === "active" && getDaysUntil(item.expiryDate) < 0
  ).length;

  const visibleItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = items.filter((item) => {
      const matchesSearch =
        !query || `${item.name} ${item.memo}`.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;

      if (!matchesSearch || !matchesCategory) return false;

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
  }, [categoryFilter, filter, items, searchQuery]);

  function persist(nextItems: ExpiryItem[]) {
    setItems(nextItems);
    saveItems(nextItems);
  }

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  function openEditForm(item: ExpiryItem) {
    setEditingId(item.id);
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
    const category = form.category;
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
    persist(
      items.map((item) =>
        item.id === id
          ? { ...item, status: "active", completedAt: undefined, updatedAt: now }
          : item
      )
    );
  }

  function deleteItem(id: string) {
    if (!window.confirm("この商品を削除しますか？")) return;
    persist(items.filter((item) => item.id !== id));
  }

  function resetAll() {
    if (!window.confirm("すべてのデータを削除しますか？")) return;
    persist([]);
    setFilter("all");
    setCategoryFilter("all");
    setSearchQuery("");
  }

  return (
    <div className="app-shell">
      <main className="app">
        <header className="hero">
          <div>
            <p className="eyebrow">家庭用ストック管理</p>
            <h1>賞味期限メモ</h1>
            <p>期限が近い食品を忘れずチェック</p>
          </div>
          <button className="primary-button" type="button" onClick={openAddForm}>
            商品を追加
          </button>
        </header>

        <section className="summary" aria-label="登録状況">
          <div>
            <span>{activeCount}</span>
            <p>管理中</p>
          </div>
          <div>
            <span>{nearCount}</span>
            <p>7日以内</p>
          </div>
          <div>
            <span>{expiredCount}</span>
            <p>期限切れ</p>
          </div>
        </section>

        <section className="controls" aria-label="検索と絞り込み">
          <label className="search-box">
            <span aria-hidden="true">検索</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="商品名・メモで検索"
            />
          </label>

          <div className="filter-row" role="tablist" aria-label="状態フィルター">
            <FilterButton
              active={filter === "all"}
              label="すべて"
              onClick={() => setFilter("all")}
            />
            <FilterButton
              active={filter === "near"}
              label="期限間近"
              onClick={() => setFilter("near")}
            />
            <FilterButton
              active={filter === "expired"}
              label="期限切れ"
              onClick={() => setFilter("expired")}
            />
            <FilterButton
              active={filter === "completed"}
              label="食べきった"
              onClick={() => setFilter("completed")}
            />
          </div>

          <div className="select-actions">
            <label>
              <span>カテゴリ</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">すべてのカテゴリ</option>
                {DEFAULT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <button className="quiet-button" type="button" onClick={resetAll}>
              データ初期化
            </button>
          </div>
        </section>

        <section className="item-list" aria-label="商品一覧">
          {visibleItems.length === 0 ? (
            <div className="empty-state">
              <h2>表示できる商品がありません</h2>
              <p>商品を追加するか、検索条件を変えてください。</p>
            </div>
          ) : (
            visibleItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onComplete={completeItem}
                onDelete={deleteItem}
                onEdit={openEditForm}
                onRestore={restoreItem}
              />
            ))
          )}
        </section>
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
                ×
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
                    onChange={(event) => updateForm("category", event.target.value)}
                  >
                    {DEFAULT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
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
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ItemCard({
  item,
  onComplete,
  onDelete,
  onEdit,
  onRestore
}: {
  item: ExpiryItem;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (item: ExpiryItem) => void;
  onRestore: (id: string) => void;
}) {
  const expiryStatus = item.status === "completed" ? "completed" : getExpiryStatus(item.expiryDate);
  const daysLabel = formatDaysLabel(item.expiryDate);
  const notifyLabel =
    item.notifyDaysBefore === undefined
      ? "通知なし"
      : item.notifyDaysBefore === 0
        ? "当日"
        : `${item.notifyDaysBefore}日前`;

  return (
    <article className={`item-card ${expiryStatus}`}>
      <div className="item-main">
        <div className="item-title-row">
          <h2>{item.name}</h2>
          <span className="date-badge">{daysLabel}</span>
        </div>

        <p className="expiry-date">賞味期限: {item.expiryDate}</p>

        <dl className="item-details">
          <div>
            <dt>カテゴリ</dt>
            <dd>{item.category}</dd>
          </div>
          <div>
            <dt>数量</dt>
            <dd>{item.quantity}</dd>
          </div>
          <div>
            <dt>通知</dt>
            <dd>{notifyLabel}</dd>
          </div>
          <div>
            <dt>メモ</dt>
            <dd>{item.memo || "なし"}</dd>
          </div>
          {item.status === "completed" && (
            <div>
              <dt>完了日</dt>
              <dd>{toLocalDateTime(item.completedAt)}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="card-actions">
        {item.status === "completed" ? (
          <button className="primary-button small" type="button" onClick={() => onRestore(item.id)}>
            戻す
          </button>
        ) : (
          <button className="primary-button small" type="button" onClick={() => onComplete(item.id)}>
            食べきった
          </button>
        )}
        <button className="secondary-button small" type="button" onClick={() => onEdit(item)}>
          編集
        </button>
        <button className="danger-button small" type="button" onClick={() => onDelete(item.id)}>
          削除
        </button>
      </div>
    </article>
  );
}

export default App;
