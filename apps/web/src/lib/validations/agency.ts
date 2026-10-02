import { z } from "zod";

export const agencySettingsSchema = z.object({
  name: z.string().trim().min(2, "Ajans adı en az 2 karakter olmalı").max(60, "Ajans adı en fazla 60 karakter olabilir"),
  // Logo dosya olarak yüklenmez, bir adres verilir. Menüde <img> olarak gösterildiği için yalnızca http(s).
  logoUrl: z
    .string()
    .trim()
    .max(500, "Logo adresi en fazla 500 karakter olabilir")
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Logo adresi http:// veya https:// ile başlamalı")
    .optional(),
});

export type AgencySettingsInput = z.infer<typeof agencySettingsSchema>;
