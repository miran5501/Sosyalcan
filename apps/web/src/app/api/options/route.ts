import { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { ApiError, requireSession, handleApiError } from "@/lib/api-auth";
import { OPTION_KINDS } from "@/lib/options";
import { canCreateOption, createOption, listOptions } from "@/lib/services/option-service";
import { createOptionSchema } from "@/lib/validations/option";

const kindParam = z.enum(OPTION_KINDS).optional();

/**
 * Seçenek listeleri (çekim türü, teslim durumu, platform, paylaşım türü). Formlar ve mobil uygulama
 * için tüm roller okuyabilir; kaldırılanlar (`includeArchived=true`) yalnızca Admin'e döner.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const kind = kindParam.parse(searchParams.get("kind") ?? undefined);
    const includeArchived = searchParams.get("includeArchived") === "true" && session.user.role === "ADMIN";
    return NextResponse.json(await listOptions({ kind, includeArchived }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Yeni seçenek: Admin her listeye ekler. Ekipman listesine Operasyon, finans kategorilerine Finans
 * da formdan hızlı ekleme yapabilir (OPTION_KIND_CONFIG.quickAddRoles). Diğer roller 403.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const kind = kindParam.parse(body?.kind);
    if (!kind ? session.user.role !== "ADMIN" : !canCreateOption(session.user.role as Role, kind)) {
      throw new ApiError(403, "Bu işlem için yetkiniz yok");
    }
    const data = createOptionSchema.parse(body);
    return NextResponse.json(await createOption(data), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
