import { handleApiError, requireRole } from "@/lib/api-auth";
import { OPERATIONS_MANAGE_ROLES } from "@/lib/roles";
import { customerImportTemplate } from "@/lib/services/customer-import-service";

/** Müşteri aktarma şablonu (CSV, Excel'de doğrudan açılır). */
export async function GET() {
  try {
    await requireRole(OPERATIONS_MANAGE_ROLES);
    return new Response(customerImportTemplate(), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="musteri-aktarma-sablonu.csv"',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
