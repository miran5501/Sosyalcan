import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { handleApiError, requireSession } from "@/lib/api-auth";
import { ApiError } from "@/lib/api-error";
import { listAttachments, uploadAttachment, type AttachmentOwner } from "@/lib/services/attachment-service";

/** `?shootId=` ya da `?transactionId=` (form alanı olarak da) → hangi kaydın dosyaları. */
function ownerFrom(get: (name: string) => unknown): AttachmentOwner {
  const shootId = get("shootId");
  const transactionId = get("transactionId");
  if (typeof shootId === "string" && shootId) return { kind: "shoot", id: shootId };
  if (typeof transactionId === "string" && transactionId) return { kind: "transaction", id: transactionId };
  throw new ApiError(400, "shootId ya da transactionId gerekli");
}

/** Bir kaydın dosyaları. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await listAttachments(ownerFrom((n) => params.get(n)), session.user.role as Role));
  } catch (error) {
    return handleApiError(error);
  }
}

/** Dosya yükleme: multipart/form-data `file` + `shootId` | `transactionId`. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Dosya seçilmedi");
    const created = await uploadAttachment(
      ownerFrom((n) => form.get(n)),
      { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) },
      { id: session.user.id, role: session.user.role as Role },
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
