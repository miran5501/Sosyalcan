import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireSession } from "@/lib/api-auth";
import { changeOwnPassword } from "@/lib/services/user-service";
import { changePasswordSchema } from "@/lib/validations/auth";

/**
 * Oturumdaki kişinin kendi şifresini değiştirmesi (web çerezi ya da mobil Bearer).
 * Şifre değiştirme zorunlu olan kişi de buraya erişebilir. Başarılı olursa bu cihaz dahil
 * tüm oturumlar kapanır (204); istemci yeni şifreyle yeniden giriş yaptırır.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession({ allowMustChangePassword: true });
    const { currentPassword, newPassword } = changePasswordSchema.parse(await request.json());
    await changeOwnPassword(session.user.id, currentPassword, newPassword);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
