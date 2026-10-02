import { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { signMobileToken } from "@/lib/mobile-token";
import { createUser } from "@/lib/services/user-service";
import { makeCustomer, makePlan, resetDb } from "@/test/db-helpers";

import * as appointments from "./appointments/route";
import * as appointmentById from "./appointments/[id]/route";
import * as customers from "./customers/route";
import * as customerById from "./customers/[id]/route";
import * as customerRestore from "./customers/[id]/restore/route";
import * as dashboard from "./dashboard/route";
import * as financeExport from "./finance/export/route";
import * as financeSummary from "./finance/summary/route";
import * as financeTransactions from "./finance/transactions/route";
import * as mobileMe from "./mobile/me/route";
import * as optionById from "./options/[id]/route";
import * as optionMove from "./options/[id]/move/route";
import * as optionRestore from "./options/[id]/restore/route";
import * as options from "./options/route";
import * as markPaid from "./payment-instances/[id]/mark-paid/route";
import * as instancesGenerate from "./payment-plans/[id]/instances/generate/route";
import * as paymentPlanRestore from "./payment-plans/[id]/restore/route";
import * as paymentPlanById from "./payment-plans/[id]/route";
import * as paymentPlans from "./payment-plans/route";
import * as partners from "./revenue-share/partners/route";
import * as revenueShare from "./revenue-share/route";
import * as settingsUserById from "./settings/users/[id]/route";
import * as settingsUsers from "./settings/users/route";
import * as shoots from "./shoots/route";
import * as shootById from "./shoots/[id]/route";
import * as shootChecklist from "./shoots/[id]/checklist/route";
import * as shootChecklistItem from "./shoots/[id]/checklist/[itemId]/route";
import * as accountPassword from "./account/password/route";
import * as notifications from "./notifications/route";
import * as accountTwoFactor from "./account/2fa/route";
import * as accountExport from "./account/export/route";
import * as search from "./search/route";
import * as customerImport from "./customers/import/route";
import * as customerImportTemplate from "./customers/import/template/route";
import * as attachments from "./attachments/route";
import * as attachmentById from "./attachments/[id]/route";
import * as notificationsRead from "./notifications/read/route";
import * as notificationById from "./notifications/[id]/route";
import * as notificationPrefs from "./notifications/preferences/route";
import * as taskById from "./tasks/[id]/route";
import * as taskComments from "./tasks/[id]/comments/route";
import * as taskLinks from "./tasks/[id]/links/route";
import * as taskLinkById from "./tasks/[id]/links/[linkId]/route";
import * as taskStatus from "./tasks/[id]/status/route";
import * as tasks from "./tasks/route";
import * as users from "./users/route";

/**
 * Yetki matrisi testi: her API ucunda hem oturum hem rol denetlenir.
 * Her uç nokta için: oturumsuz -> 401; her rol için izinliyse 401/403 DIŞINDA bir sonuç,
 * izinsizse tam olarak 403. İzinli rollerde gövde boş gönderilir; 400/404 gibi sonuçlar
 * "yetki geçti" demektir. Kayıt id'leri olmadığı için hiçbir veri değişmez.
 */
const ALL: Role[] = ["ADMIN", "OPERATIONS", "FINANCE", "VIEWER"];
const OPS: Role[] = ["ADMIN", "OPERATIONS"]; // ekleme/düzenleme (müşteri, görev, çekim, randevu)
const FINANCE_VIEW: Role[] = ["ADMIN", "FINANCE", "VIEWER"]; // Operasyon finansı HİÇ göremez
const FINANCE_MANAGE: Role[] = ["ADMIN", "FINANCE"];
const ADMIN: Role[] = ["ADMIN"];

type Handler = (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>;
type Endpoint = { name: string; method: string; handler: Handler; allowed: Role[] };

const endpoints: Endpoint[] = [
  { name: "GET /customers", method: "GET", handler: customers.GET, allowed: ALL },
  { name: "POST /customers", method: "POST", handler: customers.POST, allowed: OPS },
  { name: "GET /customers/[id]", method: "GET", handler: customerById.GET, allowed: ALL },
  { name: "PATCH /customers/[id]", method: "PATCH", handler: customerById.PATCH, allowed: OPS },
  { name: "DELETE /customers/[id]", method: "DELETE", handler: customerById.DELETE, allowed: OPS },
  { name: "POST /customers/[id]/restore", method: "POST", handler: customerRestore.POST, allowed: OPS },
  { name: "POST /customers/import", method: "POST", handler: customerImport.POST as Handler, allowed: OPS },
  { name: "GET /customers/import/template", method: "GET", handler: customerImportTemplate.GET as unknown as Handler, allowed: OPS },
  { name: "GET /search", method: "GET", handler: search.GET as Handler, allowed: ALL },
  // Dosya eklerinde yetki kayıt türüne göre değişir (çekim / finans); ayrıntılı testi extras.db.test.ts'te.
  // Burada yalnızca oturum zorunluluğu ve olmayan dosyanın hiçbir role açılmaması denetlenir.
  { name: "GET /attachments/[id]", method: "GET", handler: attachmentById.GET, allowed: ALL },
  { name: "DELETE /attachments/[id]", method: "DELETE", handler: attachmentById.DELETE, allowed: ALL },
  { name: "GET /attachments", method: "GET", handler: attachments.GET as Handler, allowed: ALL },

  { name: "GET /tasks", method: "GET", handler: tasks.GET, allowed: ALL },
  { name: "POST /tasks", method: "POST", handler: tasks.POST, allowed: OPS },
  { name: "GET /tasks/[id]", method: "GET", handler: taskById.GET, allowed: ALL },
  { name: "PATCH /tasks/[id]", method: "PATCH", handler: taskById.PATCH, allowed: OPS },
  { name: "DELETE /tasks/[id]", method: "DELETE", handler: taskById.DELETE, allowed: OPS },
  { name: "PATCH /tasks/[id]/status", method: "PATCH", handler: taskStatus.PATCH, allowed: OPS },
  { name: "GET /tasks/[id]/comments", method: "GET", handler: taskComments.GET, allowed: ALL },
  { name: "POST /tasks/[id]/comments", method: "POST", handler: taskComments.POST, allowed: OPS },
  { name: "GET /tasks/[id]/links", method: "GET", handler: taskLinks.GET, allowed: ALL },
  { name: "POST /tasks/[id]/links", method: "POST", handler: taskLinks.POST, allowed: OPS },
  // linkId de alan bu uç için yola eklenir; matris yalnızca id verir, yetki kontrolü ondan önce çalışır.
  { name: "DELETE /tasks/[id]/links/[linkId]", method: "DELETE", handler: taskLinkById.DELETE as unknown as Handler, allowed: OPS },

  { name: "GET /shoots", method: "GET", handler: shoots.GET, allowed: ALL },
  { name: "POST /shoots", method: "POST", handler: shoots.POST, allowed: OPS },
  { name: "GET /shoots/[id]", method: "GET", handler: shootById.GET, allowed: ALL },
  { name: "PATCH /shoots/[id]", method: "PATCH", handler: shootById.PATCH, allowed: OPS },
  { name: "DELETE /shoots/[id]", method: "DELETE", handler: shootById.DELETE, allowed: OPS },
  { name: "POST /shoots/[id]/checklist", method: "POST", handler: shootChecklist.POST, allowed: OPS },
  { name: "PATCH /shoots/[id]/checklist/[itemId]", method: "PATCH", handler: shootChecklistItem.PATCH as unknown as Handler, allowed: OPS },
  { name: "DELETE /shoots/[id]/checklist/[itemId]", method: "DELETE", handler: shootChecklistItem.DELETE as unknown as Handler, allowed: OPS },
  { name: "POST /account/password", method: "POST", handler: accountPassword.POST as Handler, allowed: ALL },
  { name: "GET /notifications", method: "GET", handler: notifications.GET as Handler, allowed: ALL },
  { name: "GET /account/2fa", method: "GET", handler: accountTwoFactor.GET as unknown as Handler, allowed: ALL },
  { name: "POST /account/2fa", method: "POST", handler: accountTwoFactor.POST as Handler, allowed: ALL },
  { name: "GET /account/export", method: "GET", handler: accountExport.GET as unknown as Handler, allowed: ALL },
  { name: "POST /notifications/read", method: "POST", handler: notificationsRead.POST as Handler, allowed: ALL },
  { name: "DELETE /notifications/[id]", method: "DELETE", handler: notificationById.DELETE, allowed: ALL },
  { name: "GET /notifications/preferences", method: "GET", handler: notificationPrefs.GET as unknown as Handler, allowed: ALL },
  { name: "PUT /notifications/preferences", method: "PUT", handler: notificationPrefs.PUT as Handler, allowed: ALL },

  { name: "GET /appointments", method: "GET", handler: appointments.GET, allowed: ALL },
  { name: "POST /appointments", method: "POST", handler: appointments.POST, allowed: OPS },
  { name: "GET /appointments/[id]", method: "GET", handler: appointmentById.GET, allowed: ALL },
  { name: "PATCH /appointments/[id]", method: "PATCH", handler: appointmentById.PATCH, allowed: OPS },
  { name: "DELETE /appointments/[id]", method: "DELETE", handler: appointmentById.DELETE, allowed: OPS },

  { name: "GET /users (atama listesi)", method: "GET", handler: users.GET, allowed: ALL },
  { name: "GET /dashboard", method: "GET", handler: dashboard.GET, allowed: ALL },
  { name: "GET /mobile/me", method: "GET", handler: mobileMe.GET, allowed: ALL },

  { name: "GET /finance/transactions", method: "GET", handler: financeTransactions.GET, allowed: FINANCE_VIEW },
  { name: "POST /finance/transactions", method: "POST", handler: financeTransactions.POST, allowed: FINANCE_MANAGE },
  { name: "GET /finance/summary", method: "GET", handler: financeSummary.GET, allowed: FINANCE_VIEW },
  { name: "GET /finance/export", method: "GET", handler: financeExport.GET, allowed: FINANCE_VIEW },
  { name: "GET /payment-plans", method: "GET", handler: paymentPlans.GET, allowed: FINANCE_VIEW },
  { name: "POST /payment-plans", method: "POST", handler: paymentPlans.POST, allowed: FINANCE_MANAGE },
  { name: "GET /payment-plans/[id]", method: "GET", handler: paymentPlanById.GET, allowed: FINANCE_VIEW },
  { name: "PATCH /payment-plans/[id]", method: "PATCH", handler: paymentPlanById.PATCH, allowed: FINANCE_MANAGE },
  { name: "DELETE /payment-plans/[id]", method: "DELETE", handler: paymentPlanById.DELETE, allowed: FINANCE_MANAGE },
  { name: "POST /payment-plans/[id]/restore", method: "POST", handler: paymentPlanRestore.POST, allowed: FINANCE_MANAGE },
  { name: "POST /payment-plans/[id]/instances/generate", method: "POST", handler: instancesGenerate.POST, allowed: FINANCE_MANAGE },
  { name: "POST /payment-instances/[id]/mark-paid", method: "POST", handler: markPaid.POST, allowed: FINANCE_MANAGE },
  { name: "GET /revenue-share", method: "GET", handler: revenueShare.GET, allowed: FINANCE_VIEW },
  { name: "GET /revenue-share/partners", method: "GET", handler: partners.GET, allowed: FINANCE_VIEW },
  { name: "PUT /revenue-share/partners", method: "PUT", handler: partners.PUT, allowed: ADMIN },

  { name: "GET /settings/users", method: "GET", handler: settingsUsers.GET, allowed: ADMIN },
  { name: "POST /settings/users", method: "POST", handler: settingsUsers.POST, allowed: ADMIN },
  { name: "PATCH /settings/users/[id]", method: "PATCH", handler: settingsUserById.PATCH, allowed: ADMIN },

  // Seçenek listeleri: herkes okur (formlar ve mobil), yalnızca Admin yönetir.
  { name: "GET /options", method: "GET", handler: options.GET as unknown as Handler, allowed: ALL },
  { name: "POST /options", method: "POST", handler: options.POST as unknown as Handler, allowed: ADMIN },
  { name: "PATCH /options/[id]", method: "PATCH", handler: optionById.PATCH, allowed: ADMIN },
  { name: "DELETE /options/[id]", method: "DELETE", handler: optionById.DELETE, allowed: ADMIN },
  { name: "POST /options/[id]/move", method: "POST", handler: optionMove.POST, allowed: ADMIN },
  { name: "POST /options/[id]/restore", method: "POST", handler: optionRestore.POST, allowed: ADMIN },
];

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const headersMock = headers as unknown as ReturnType<typeof vi.fn>;

function call(endpoint: Endpoint) {
  const hasBody = endpoint.method !== "GET";
  const request = new NextRequest("http://localhost/api/test", {
    method: endpoint.method,
    ...(hasBody ? { body: "{}", headers: { "content-type": "application/json" } } : {}),
  });
  return endpoint.handler(request, { params: Promise.resolve({ id: "olmayan-id" }) });
}

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  headersMock.mockReset();
  headersMock.mockResolvedValue(new Headers());
});

describe("oturumsuz istek", () => {
  it.each(endpoints)("$name -> 401", async (endpoint) => {
    authMock.mockResolvedValue(null);
    expect((await call(endpoint)).status).toBe(401);
  });
});

describe.each(ALL)("%s rolü", (role) => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: "kullanici-1", name: "Test", email: "t@t.co", role } });
  });

  it.each(endpoints)("$name", async (endpoint) => {
    const status = (await call(endpoint)).status;
    if (endpoint.allowed.includes(role)) {
      expect([401, 403]).not.toContain(status);
    } else {
      expect(status).toBe(403);
    }
  });
});

describe("mobil Bearer token", () => {
  const request = (token: string) => {
    headersMock.mockResolvedValue(new Headers({ authorization: `Bearer ${token}` }));
    return tasks.GET();
  };

  it("geçerli token ile oturum açılır", async () => {
    const user = await createUser({ name: "Mobil", email: "mobil@sosyalcan.local", password: "sifre-123456", role: "VIEWER" });
    expect((await request(await signMobileToken(user.id))).status).toBe(200);
  });

  it("devre dışı bırakılan hesabın açık token'ı anında 401 alır", async () => {
    const user = await createUser({ name: "Mobil", email: "mobil@sosyalcan.local", password: "sifre-123456", role: "VIEWER" });
    const token = await signMobileToken(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });

    expect((await request(token)).status).toBe(401);
  });

  it("silinmiş kullanıcının, kurcalanmış ve çöp token'lar 401 alır", async () => {
    const user = await createUser({ name: "Mobil", email: "mobil@sosyalcan.local", password: "sifre-123456", role: "VIEWER" });
    const token = await signMobileToken(user.id);
    await prisma.user.delete({ where: { id: user.id } });

    expect((await request(token)).status).toBe(401);
    expect((await request(token.slice(0, -3) + "abc")).status).toBe(401);
    expect((await request("bu-bir-token-degil")).status).toBe(401);
  });

  it("rol her istekte veritabanından okunur: token verildikten sonra düşürülen rol hemen geçerli olur", async () => {
    const user = await createUser({ name: "Mobil", email: "mobil@sosyalcan.local", password: "sifre-123456", role: "OPERATIONS" });
    const token = await signMobileToken(user.id);
    headersMock.mockResolvedValue(new Headers({ authorization: `Bearer ${token}` }));
    const create = () =>
      tasks.POST(new NextRequest("http://localhost/api/tasks", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));

    expect((await create()).status).toBe(400); // Operasyon: yetki geçti, gövde geçersiz

    await prisma.user.update({ where: { id: user.id }, data: { role: "VIEWER" } });
    expect((await create()).status).toBe(403); // aynı token, artık Viewer
  });
});

describe("GET /customers/[id]: ödeme planları finans verisidir", () => {
  it.each(ALL)("%s rolü", async (role) => {
    const customer = await makeCustomer();
    await makePlan(customer.id, { monthlyAmount: 350_000 });
    authMock.mockResolvedValue({ user: { id: "kullanici-1", name: "Test", email: "t@t.co", role } });

    const response = await customerById.GET(new NextRequest("http://localhost/api/customers/x"), {
      params: Promise.resolve({ id: customer.id }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    if (FINANCE_VIEW.includes(role)) {
      expect(body.paymentPlans).toHaveLength(1);
    } else {
      // Operasyon finans verisini göremez: ne tutar ne de plan alanı dönmeli.
      expect(body).not.toHaveProperty("paymentPlans");
      expect(JSON.stringify(body)).not.toContain("350000");
    }
  });
});

describe("POST /options: formdan hızlı ekleme yetkisi listeye göre değişir", () => {
  const post = (body: object) =>
    options.POST(new NextRequest("http://localhost/api/options", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

  it.each([
    ["ADMIN", { EQUIPMENT_CATEGORY: 201, FINANCE_CATEGORY: 201, TASK_STATUS: 201, PLATFORM: 201 }],
    ["OPERATIONS", { EQUIPMENT_CATEGORY: 201, FINANCE_CATEGORY: 403, TASK_STATUS: 403, PLATFORM: 403 }],
    ["FINANCE", { EQUIPMENT_CATEGORY: 403, FINANCE_CATEGORY: 201, TASK_STATUS: 403, PLATFORM: 403 }],
    ["VIEWER", { EQUIPMENT_CATEGORY: 403, FINANCE_CATEGORY: 403, TASK_STATUS: 403, PLATFORM: 403 }],
  ] as const)("%s", async (role, expected) => {
    authMock.mockResolvedValue({ user: { id: "kullanici-1", name: "Test", email: "t@t.co", role } });
    for (const [kind, status] of Object.entries(expected)) {
      expect([kind, (await post({ kind, label: `Yeni ${kind}` })).status]).toEqual([kind, status]);
    }
  });
});

describe("GET /options: kaldırılan seçenekler yalnızca Admin'e döner", () => {
  it.each(ALL)("%s rolü", async (role) => {
    await prisma.optionItem.update({ where: { id: "opt_type_other" }, data: { archivedAt: new Date() } });
    authMock.mockResolvedValue({ user: { id: "kullanici-1", name: "Test", email: "t@t.co", role } });

    const response = await options.GET(new NextRequest("http://localhost/api/options?kind=SHOOT_TYPE&includeArchived=true"));
    const body: { id: string }[] = await response.json();

    expect(response.status).toBe(200);
    expect(body.some((o) => o.id === "opt_type_other")).toBe(role === "ADMIN");
  });
});
