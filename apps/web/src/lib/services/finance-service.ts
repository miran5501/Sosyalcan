import type { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { vatFromGross, vatSummary } from "@/lib/vat";
import { ApiError } from "@/lib/api-error";
import { assertSelectable } from "@/lib/services/option-service";
import { foldCase } from "@/lib/tags";
import type { CreateTransactionInput, TransactionFilters } from "@/lib/validations/finance";

const transactionInclude = {
  customer: { select: { id: true, name: true } },
  paymentMethod: { select: { id: true, label: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.TransactionInclude;

/** Tek finans kaydı (detay sayfası: bilgiler + dosyalar). */
export async function getTransaction(id: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: { ...transactionInclude, paymentInstance: { select: { month: true, year: true, paymentPlan: { select: { id: true, title: true } } } } },
  });
  if (!transaction) throw new ApiError(404, "Finans kaydı bulunamadı");
  return transaction;
}

/** Takvim yılı/ayı aralığı (yerel saat). Ay verilmezse yılın tamamı. */
function periodRange(year?: number, month?: number) {
  if (year && month) return { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
  if (year) return { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) };
  return undefined;
}

/**
 * Finans kayıtları, en yeniden eskiye. Dönem (yıl/ay) ve süzgeçler: tür, kategori, ödeme yöntemi,
 * serbest arama (açıklama, kime/kimden, müşteri adı; büyük/küçük harf duyarsız).
 */
export async function listTransactions(params: { year?: number; month?: number } & TransactionFilters = {}) {
  const range = periodRange(params.year, params.month);
  const q = params.q?.trim();
  return prisma.transaction.findMany({
    where: {
      ...(range ? { occurredAt: range } : {}),
      ...(params.type ? { type: params.type } : {}),
      ...(params.category ? { category: params.category === "__none__" ? null : params.category } : {}),
      ...(params.paymentMethodId ? { paymentMethodId: params.paymentMethodId } : {}),
      ...(q
        ? {
            OR: [
              { description: { contains: q, mode: "insensitive" } },
              { counterparty: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: transactionInclude,
    orderBy: { occurredAt: "desc" },
  });
}

/**
 * Finans kayıtları muhasebe mantığıyla değişmez (immutable) tutulur —
 * gerçek hayatta da bir işlem kaydı düzeltilmez, ters kayıt (storno)
 * girilir. Bu yüzden update/delete kasıtlı olarak yok.
 */
export async function createTransaction(input: CreateTransactionInput) {
  // Kategori admin'in finans kategorisi listesinden seçilir; kayıt adını metin olarak saklar
  // (kategori sonradan yeniden adlandırılsa da geçmiş kayıt değişmez).
  const category = input.category?.trim() ? await resolveCategoryLabel(input.category) : undefined;
  const paymentMethodId = input.paymentMethodId ? await assertSelectable(input.paymentMethodId, ["PAYMENT_METHOD"]) : undefined;
  return prisma.transaction.create({
    data: {
      type: input.type,
      amount: input.amountKurus,
      category,
      description: input.description,
      counterparty: input.counterparty?.trim() || undefined,
      vatRate: input.vatRate,
      vatAmount: input.vatRate !== undefined ? vatFromGross(input.amountKurus, input.vatRate) : undefined,
      invoiceNo: input.invoiceNo?.trim() || undefined,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
      customerId: input.customerId || undefined,
      paymentMethodId,
    },
    include: transactionInclude,
  });
}

async function resolveCategoryLabel(label: string) {
  const wanted = foldCase(label.trim());
  const options = await prisma.optionItem.findMany({ where: { kind: "FINANCE_CATEGORY", archivedAt: null }, select: { label: true } });
  const match = options.find((o) => foldCase(o.label.trim()) === wanted);
  if (!match) {
    throw new ApiError(400, `"${label.trim()}" finans kategorileri listesinde yok`);
  }
  return match.label;
}

/** Daha önce yazılmış "kime / kimden" adları (en çok kullanılandan başlayarak), formda öneri için. */
export async function listCounterparties(limit = 50) {
  const rows = await prisma.transaction.groupBy({
    by: ["counterparty"],
    where: { counterparty: { not: null } },
    _count: { counterparty: true },
    orderBy: { _count: { counterparty: "desc" } },
    take: limit,
  });
  return rows.map((r) => r.counterparty).filter((c): c is string => Boolean(c));
}

export async function monthlySummary(year: number, month: number) {
  const rows = await prisma.transaction.findMany({
    where: { occurredAt: periodRange(year, month) },
    select: { type: true, amount: true, vatAmount: true },
  });
  // KDV: gelirlerdeki (hesaplanan) − giderlerdeki (indirilecek) = o ay ödenecek KDV.
  return { ...summarize(rows), ...vatSummary(rows) };
}

function summarize(rows: { type: TransactionType; amount: number }[]) {
  const income = rows.filter((t) => t.type === "INCOME").reduce((sum, t) => sum + t.amount, 0);
  const expense = rows.filter((t) => t.type === "EXPENSE").reduce((sum, t) => sum + t.amount, 0);
  return { incomeKurus: income, expenseKurus: expense, netKurus: income - expense };
}

export type ExpenseCategoryRow = { category: string; amountKurus: number; count: number; percent: number };

/**
 * Bir dönemin (ay ya da yıl) kayıtlarını kategoriye göre toplar (kategori bazlı gider takibi).
 * "Kira" / "kira " gibi yazımlar tek kategori sayılır; kategorisi boş
 * olanlar "Kategorisiz" altında toplanır. Sonuç büyükten küçüğe; `percent` dönem toplamının yüzdesi (bir ondalık).
 */
export async function categoryBreakdown(type: TransactionType, year: number, month?: number) {
  const rows = await prisma.transaction.groupBy({
    by: ["category"],
    where: { type, occurredAt: periodRange(year, month) },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const merged = new Map<string, { category: string; amountKurus: number; count: number }>();
  for (const row of rows) {
    const label = row.category?.trim() || "Kategorisiz";
    const key = foldCase(label);
    const amount = row._sum.amount ?? 0;
    const existing = merged.get(key);
    if (existing) {
      existing.amountKurus += amount;
      existing.count += row._count._all;
    } else {
      merged.set(key, { category: label, amountKurus: amount, count: row._count._all });
    }
  }

  const totalKurus = [...merged.values()].reduce((sum, r) => sum + r.amountKurus, 0);
  const categories: ExpenseCategoryRow[] = [...merged.values()]
    .sort((a, b) => b.amountKurus - a.amountKurus || a.category.localeCompare(b.category, "tr"))
    .map((r) => ({ ...r, percent: totalKurus === 0 ? 0 : Math.round((r.amountKurus * 1000) / totalKurus) / 10 }));

  return { totalKurus, categories };
}

/** Geriye dönük ad: aylık gider dağılımı. */
export const monthlyExpenseByCategory = (year: number, month: number) => categoryBreakdown("EXPENSE", year, month);

/**
 * Yıllık rapor: 12 ayın gelir/gider/net'i, yıl toplamı, gelir ve gider kategorileri, ödeme yöntemine
 * göre dağılım (yöntemsiz kayıtlar "Belirtilmemiş").
 */
export async function yearlyReport(year: number) {
  const rows = await prisma.transaction.findMany({
    where: { occurredAt: periodRange(year) },
    select: { type: true, amount: true, occurredAt: true, paymentMethod: { select: { label: true } } },
  });

  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, incomeKurus: 0, expenseKurus: 0, netKurus: 0, count: 0 }));
  const methods = new Map<string, { label: string; incomeKurus: number; expenseKurus: number; count: number }>();
  for (const t of rows) {
    const m = months[t.occurredAt.getMonth()];
    m.count += 1;
    if (t.type === "INCOME") m.incomeKurus += t.amount;
    else m.expenseKurus += t.amount;
    const label = t.paymentMethod?.label ?? "Belirtilmemiş";
    const method = methods.get(label) ?? { label, incomeKurus: 0, expenseKurus: 0, count: 0 };
    method.count += 1;
    if (t.type === "INCOME") method.incomeKurus += t.amount;
    else method.expenseKurus += t.amount;
    methods.set(label, method);
  }
  for (const m of months) m.netKurus = m.incomeKurus - m.expenseKurus;

  const [expenses, incomes] = await Promise.all([categoryBreakdown("EXPENSE", year), categoryBreakdown("INCOME", year)]);
  return {
    year,
    total: { ...summarize(rows), count: rows.length },
    months,
    expenses,
    incomes,
    methods: [...methods.values()].sort((a, b) => b.incomeKurus + b.expenseKurus - (a.incomeKurus + a.expenseKurus)),
  };
}

/**
 * Bütün yılların özeti (yıllar içinde biriken veride karşılaştırma): kaydı olan her yıl için
 * gelir/gider/net ve kayıt sayısı, yeniden eskiye. Yıl bazında veritabanında toplanır.
 */
export async function yearsOverview() {
  const rows = await prisma.$queryRaw<{ year: number; type: TransactionType; total: bigint; count: bigint }[]>`
    SELECT EXTRACT(YEAR FROM "occurredAt")::int AS year, "type", SUM("amount")::bigint AS total, COUNT(*)::bigint AS count
    FROM "transactions" GROUP BY 1, 2 ORDER BY 1 DESC`;
  const years = new Map<number, { year: number; incomeKurus: number; expenseKurus: number; netKurus: number; count: number }>();
  for (const r of rows) {
    const y = years.get(r.year) ?? { year: r.year, incomeKurus: 0, expenseKurus: 0, netKurus: 0, count: 0 };
    if (r.type === "INCOME") y.incomeKurus += Number(r.total);
    else y.expenseKurus += Number(r.total);
    y.count += Number(r.count);
    y.netKurus = y.incomeKurus - y.expenseKurus;
    years.set(r.year, y);
  }
  return [...years.values()];
}
