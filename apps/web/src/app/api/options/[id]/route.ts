import { NextRequest, NextResponse } from "next/server";
import { requireRole, handleApiError } from "@/lib/api-auth";
import { ADMIN_ONLY } from "@/lib/roles";
import { archiveOption, updateOption } from "@/lib/services/option-service";
import { updateOptionSchema } from "@/lib/validations/option";

type Params = { params: Promise<{ id: string }> };

/** Ad veya (teslim durumlarında) renk değişikliği. */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireRole(ADMIN_ONLY);
    const { id } = await params;
    const data = updateOptionSchema.parse(await request.json());
    return NextResponse.json(await updateOption(id, data));
  } catch (error) {
    return handleApiError(error);
  }
}

/** Kaldırma = arşivleme (fiziksel silme yok); eski çekimlerde görünmeye devam eder. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireRole(ADMIN_ONLY);
    const { id } = await params;
    return NextResponse.json(await archiveOption(id));
  } catch (error) {
    return handleApiError(error);
  }
}
