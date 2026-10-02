import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { flushAuditQueue, prisma } from "@/lib/prisma";
import { signMobileToken } from "@/lib/mobile-token";
import { createUser, verifyCredentials } from "@/lib/services/user-service";
import { createUserByAdmin, updateUserByAdmin } from "@/lib/services/user-admin-service";
import { resetDb } from "@/test/db-helpers";
import * as accountPassword from "./account/password/route";
import * as mobileMe from "./mobile/me/route";
import * as tasks from "./tasks/route";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const headersMock = headers as unknown as ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  authMock.mockResolvedValue(null);
  headersMock.mockReset();
});

async function bearer(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  headersMock.mockResolvedValue(new Headers({ authorization: `Bearer ${await signMobileToken(user.id, user.sessionVersion)}` }));
}

const changePassword = (body: unknown) =>
  accountPassword.POST(
    new NextRequest("http://localhost/api/account/password", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );

describe("ilk girişte şifre değiştirme zorunluluğu", () => {
  it("admin'in oluşturduğu ve şifresini sıfırladığı kullanıcı şifre değiştirmeye zorlanır", async () => {
    const admin = await createUser({ name: "Admin", email: "admin@x.co", password: "sifre-123456", role: "ADMIN" });
    const created = await createUserByAdmin({ name: "Yeni", email: "yeni@x.co", password: "gecici-sifre1", role: "OPERATIONS" });
    expect(created.mustChangePassword).toBe(true);
    expect((await verifyCredentials("yeni@x.co", "gecici-sifre1"))?.mustChangePassword).toBe(true);

    const plain = await createUser({ name: "Eski", email: "eski@x.co", password: "sifre-123456", role: "VIEWER" });
    expect(plain.mustChangePassword).toBe(false);
    await updateUserByAdmin(admin.id, plain.id, { password: "sifirlanan-1" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: plain.id } })).mustChangePassword).toBe(true);
  });

  it("şifresini değiştirmeden veri uçlarına erişemez (403), kendi bilgisini ve şifre değiştirmeyi kullanabilir", async () => {
    const user = await createUserByAdmin({ name: "Yeni", email: "yeni@x.co", password: "gecici-sifre1", role: "OPERATIONS" });
    await bearer(user.id);

    const blocked = await tasks.GET();
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error).toContain("şifrenizi değiştirmeniz");

    const me = await mobileMe.GET();
    expect(me.status).toBe(200);
    expect((await me.json()).mustChangePassword).toBe(true);
  });

  it("şifre değişince bayrak kalkar, eski token geçersizleşir, yeni girişle her şey açılır", async () => {
    const user = await createUserByAdmin({ name: "Yeni", email: "yeni@x.co", password: "gecici-sifre1", role: "OPERATIONS" });
    await bearer(user.id);

    expect((await changePassword({ currentPassword: "yanlis-1", newPassword: "kendiSifrem9" })).status).toBe(400);
    expect((await changePassword({ currentPassword: "gecici-sifre1", newPassword: "zayif" })).status).toBe(400);
    expect((await changePassword({ currentPassword: "gecici-sifre1", newPassword: "kendiSifrem9" })).status).toBe(204);

    expect((await tasks.GET()).status).toBe(401); // aynı (eski) token artık geçersiz
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.mustChangePassword).toBe(false);

    await bearer(user.id);
    expect((await tasks.GET()).status).toBe(200);
  });

  it("web oturumunda da bayrak varsa API 403 döner", async () => {
    headersMock.mockResolvedValue(new Headers());
    authMock.mockResolvedValue({ user: { id: "u1", name: "W", email: "w@x.co", role: "ADMIN", mustChangePassword: true } });
    expect((await tasks.GET()).status).toBe(403);
  });
});

describe("denetim kaydında eski / yeni değerler", () => {
  it("güncelleme eski → yeni, şifre maskeli olarak kaydedilir", async () => {
    headersMock.mockResolvedValue(new Headers());
    const admin = await createUser({ name: "Admin", email: "admin@x.co", password: "sifre-123456", role: "ADMIN" });
    const customer = await prisma.customer.create({ data: { name: "Atlas", contact: "0555" } });
    await prisma.customer.update({ where: { id: customer.id }, data: { contact: "0532", notes: "VIP" } });
    await updateUserByAdmin(admin.id, admin.id, { password: "yeni-sifre-9" });
    await flushAuditQueue();

    const update = await prisma.auditLog.findFirstOrThrow({ where: { entityId: customer.id, action: "UPDATE" } });
    expect(update.changes).toEqual({ contact: { from: "0555", to: "0532" }, notes: { from: null, to: "VIP" } });

    const pw = await prisma.auditLog.findFirstOrThrow({ where: { entityId: admin.id, action: "UPDATE" } });
    expect(JSON.stringify(pw.changes)).not.toContain("$2");
    expect(pw.changes).toMatchObject({ passwordHash: { from: "••••••", to: "••••••" } });
  });
});
