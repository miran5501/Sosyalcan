import type { Role } from "@prisma/client";

/**
 * Modül bazlı rol grupları.
 *
 * Finans modülü diğerlerinden farklı: Operasyon burada sadece düzenleyemez
 * değil, HİÇ GÖREMEZ ("finans verisini göremez"). Diğer modüllerde ise
 * Finans/Viewer görebilir ama düzenleyemez. Bu asimetriyi kaçırmamak için
 * rol gruplarını burada tek yerde tanımlıyoruz.
 */
export const FINANCE_VIEW_ROLES: Role[] = ["ADMIN", "FINANCE", "VIEWER"];
export const FINANCE_MANAGE_ROLES: Role[] = ["ADMIN", "FINANCE"];

export const OPERATIONS_MANAGE_ROLES: Role[] = ["ADMIN", "OPERATIONS"];

/** Ayarlar (kullanıcı yönetimi) ve gelir dağıtım oranları yalnızca Admin'e açık. */
export const ADMIN_ONLY: Role[] = ["ADMIN"];
