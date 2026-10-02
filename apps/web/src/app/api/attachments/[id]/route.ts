import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { handleApiError, requireSession } from "@/lib/api-auth";
import { INLINE_TYPES, deleteAttachment, downloadAttachment } from "@/lib/services/attachment-service";

type Context = { params: Promise<{ id: string }> };

/**
 * Dosyayı indirir. `?inline=1` ile PDF ve resimler tarayıcıda açılır; diğer türler her zaman indirilir.
 * Yüklenen dosya sayfa gibi çalışamasın diye: türü tahmin ettirme, betik çalıştırma, dışarıdan gömme yok.
 */
export async function GET(request: NextRequest, { params }: Context) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const { attachment, bytes } = await downloadAttachment(id, session.user.role as Role);
    const inline = new URL(request.url).searchParams.get("inline") === "1" && INLINE_TYPES.has(attachment.contentType);
    const encoded = encodeURIComponent(attachment.fileName);
    const ascii = attachment.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": attachment.contentType,
        "content-length": String(bytes.length),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await deleteAttachment(id, session.user.role as Role);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
