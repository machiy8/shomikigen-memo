export type ExpiryStatus = "expired" | "today" | "soon3" | "soon7" | "normal";

export type ItemStatus = "active" | "completed";

export type ExpiryItem = {
  id: string;
  name: string;
  expiryDate: string;
  quantity: number;
  category: string;
  memo: string;
  opened?: boolean;
  notifyDaysBefore?: number;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type FilterMode = "all" | "opened" | "completed";
