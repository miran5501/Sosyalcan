import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { handleApiError, requestMeta, requireSession } from "@/lib/api-auth";
import { exportUserData } from "@/lib/services/privacy-service";

/** "Verilerimi indir" (KVKK m.11): kişinin kendi verisinin JSON kopyası, dosya olarak indirilir. */
export async function GET() {
  try {
    const session = await requireSession({ allowMustChangePassword: true });
    const data = await exportUserData(session.user.id);
    await audit({ action: "DATA_EXPORTED", userId: session.user.id, ip: (await requestMeta()).ip });
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="sosyalcan-verilerim-${date}.json"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
