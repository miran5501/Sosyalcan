import { z } from "zod";
import { VAT_RATES } from "@/lib/vat";

/** KDV oranı: listedeki oranlardan biri (formdan metin olarak da gelebilir). Boş = belirtilmedi. */
const vatRate = z.coerce
  .number()
  .int()
  .refine((v) => (VAT_RATES as readonly number[]).includes(v), `KDV oranı ${VAT_RATES.map((r) => `%${r}`).join(", ")} olmalı`)
  .optional();
const invoiceNo = z.string().trim().max(40, "Fatura no en fazla 40 karakter olabilir").optional();

export const TRANSACTION_TYPES = ["INCOME", "EXPENSE"] as const;

export const createTransactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  amountKurus: z.number().int().positive("Tutar sıfırdan büyük olmalı"),
  category: z.string().optional(),
  description: z.string().max(300, "Açıklama en fazla 300 karakter olabilir").optional(),
  /** Kime ödendi / kimden alındı (tedarikçi, kişi, kurum). */
  counterparty: z.string().trim().max(100, "Kime / Kimden en fazla 100 karakter olabilir").optional(),
  paymentMethodId: z.string().optional(),
  /** Tutar KDV dahildir; KDV payı serviste hesaplanır. */
  vatRate,
  invoiceNo,
  // ISO tarih-saat; verilmezse "şimdi". Formdaki datetime-local değeri de kabul edilir.
  occurredAt: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), "Geçersiz tarih"),
  customerId: z.string().optional(),
});

export const transactionQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

/** Finans listesi süzgeçleri (hepsi isteğe bağlı). `category: "__none__"` kategorisiz kayıtlar. */
export const transactionFilterSchema = z.object({
  type: z.enum(TRANSACTION_TYPES).optional().catch(undefined),
  category: z.string().trim().max(60).optional(),
  paymentMethodId: z.string().trim().max(60).optional(),
  q: z.string().trim().max(100).optional(),
});

export type TransactionFilters = z.infer<typeof transactionFilterSchema>;

export const createPaymentPlanSchema = z.object({
  customerId: z.string().min(1, "Müşteri seçilmeli"),
  title: z.string().min(2, "Başlık en az 2 karakter olmalı"),
  monthlyAmountKurus: z.number().int().positive("Tutar sıfırdan büyük olmalı"),
  billingDay: z.number().int().min(1).max(28, "Ayın 1-28. günü arasında olmalı"),
  /** "Ödeme alındı" ile oluşan gelir kaydına aktarılır. */
  vatRate,
});

export const markPaidSchema = z.object({
  paymentMethodId: z.string().min(1).optional(),
  invoiceNo,
});

export const updatePaymentPlanSchema = createPaymentPlanSchema.partial().omit({ customerId: true });

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type CreatePaymentPlanInput = z.infer<typeof createPaymentPlanSchema>;
export type UpdatePaymentPlanInput = z.infer<typeof updatePaymentPlanSchema>;
