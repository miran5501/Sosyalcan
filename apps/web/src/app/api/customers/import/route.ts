import { NextRequest, NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/api-auth";
import { ApiError } from "@/lib/api-error";
import { OPERATIONS_MANAGE_ROLES } from "@/lib/roles";
import { commitCustomerImport, previewCustomerImport } from "@/lib/services/customer-import-service";

/**
 * Toplu müşteri aktarma (Admin, Operasyon). multipart/form-data: `file` (.xlsx / .csv) + `mode`
 * ("preview": yalnızca kontrol, hiçbir şey kaydedilmez · "commit": yeni satırları kaydeder).
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(OPERATIONS_MANAGE_ROLES);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Dosya seçilmedi");
    const buffer = Buffer.from(await file.arrayBuffer());
    if (form.get("mode") === "commit") {
      return NextResponse.json(await commitCustomerImport(buffer, file.name));
    }
    return NextResponse.json(await previewCustomerImport(buffer, file.name));
  } catch (error) {
    return handleApiError(error);
  }
}
