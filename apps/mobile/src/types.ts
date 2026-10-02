export type Role = "ADMIN" | "OPERATIONS" | "FINANCE" | "VIEWER";

export type User = {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  /** Admin'in verdiği geçici şifreyle girildiyse true: önce kendi şifresini belirlemeli. */
  mustChangePassword?: boolean;
};

type WithNames = { customer: { name: string } | null };

export type DashboardTask = WithNames & {
  id: string;
  title: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  assignee: { name: string } | null;
};

/** Admin'in yönettiği seçenek (çekim türü, teslim durumu, platform, paylaşım türü). */
export type Option = {
  id: string;
  kind: "SHOOT_TYPE" | "DELIVERY_STATUS" | "PLATFORM" | "POST_FORMAT" | "TASK_STATUS" | "EQUIPMENT_CATEGORY" | "EQUIPMENT" | "FINANCE_CATEGORY";
  label: string;
  color: string | null;
  isDone: boolean;
  sortOrder: number;
  parentId: string | null;
  parent: { id: string; label: string } | null;
};

type OptionRef = { id: string; label: string };
/** Alt seçenek: paylaşım türü (üstü platform) ya da ekipman (üstü kategori). */
type ChildRef = OptionRef & { parent: { label: string } | null };

export type DashboardShoot = WithNames & {
  id: string;
  type: OptionRef;
  scheduledAt: string;
  location: string | null;
  assignee: { name: string } | null;
};

export type DashboardAppointment = WithNames & { id: string; title: string; startsAt: string };

export type PaymentAlert = {
  instanceId: string;
  planTitle: string;
  customerName: string;
  amountKurus: number;
  /** "YYYY-MM-DD" takvim günü (saat dilimsiz). */
  dueDate: string;
};

export type Dashboard = {
  activeCustomers: number;
  todayTasks: DashboardTask[];
  todayShoots: DashboardShoot[];
  todayAppointments: DashboardAppointment[];
  /** Operasyon rolünde sunucu bu alanı hiç göndermez (null). */
  finance: {
    summary: { incomeKurus: number; expenseKurus: number; netKurus: number };
    overduePayments: PaymentAlert[];
    upcomingPayments: PaymentAlert[];
  } | null;
};

export type Priority = "LOW" | "MEDIUM" | "HIGH";

type NameRef = { id: string; name: string } | null;

export type Task = {
  id: string;
  title: string;
  description: string | null;
  /** Admin'in tanımladığı görev durumu (Kanban sütunu). */
  status: OptionRef & { color: string | null; isDone: boolean };
  statusId: string;
  priority: Priority;
  dueDate: string | null;
  customer: NameRef;
  assignee: NameRef;
  publishTargets: ChildRef[];
};

export type TaskComment = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null };
};

export type TaskLink = {
  id: string;
  url: string;
  label: string | null;
};

export type Shoot = {
  id: string;
  type: OptionRef;
  scheduledAt: string;
  location: string | null;
  brief: string | null;
  /** Her satıra bir ekipman. */
  equipment: string | null;
  deliveryStatus: OptionRef & { color: string | null };
  deliveryStatusId: string;
  /** Nerede paylaşılacak: platform ya da platformun paylaşım türü. */
  publishTargets: ChildRef[];
  /** Admin'in ekipman listesinden seçilenler (kategoriye göre sıralı). */
  equipmentItems: ChildRef[];
  deliveryLink: string | null;
  customer: NameRef;
  assignee: NameRef;
  revisionCount: number;
  /** Teslim kontrol listesi (sıralı). */
  checklist: ChecklistItem[];
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  /** Web'deki sayfa yolu (mobilde ilgili sekmeye çevrilir). */
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ChecklistItem = { id: string; label: string; done: boolean; doneAt: string | null; doneBy: { id: string; name: string } | null };

export type Appointment = {
  id: string;
  title: string;
  startsAt: string;
  customer: NameRef;
  participants: { id: string; name: string | null }[];
};
