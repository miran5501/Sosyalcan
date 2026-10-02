import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { generateMonthlyInstances } from "@/lib/services/payment-plan-service";
import { makeCustomer, makePlan, resetDb } from "@/test/db-helpers";
import { GET } from "./payment-instances/route";

const SECRET = "cron-test-anahtari-uzun-ve-rastgele";
const call = (authorization?: string) =>
  GET(new NextRequest("http://localhost/api/cron/payment-instances", authorization ? { headers: { authorization } } : {}));

beforeEach(async () => {
  await resetDb();
  process.env.CRON_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/payment-instances: kimlik doğrulama", () => {
  it("başlık yoksa 401 verir ve hiçbir örnek üretmez", async () => {
    await makePlan((await makeCustomer()).id);
    expect((await call()).status).toBe(401);
    expect(await prisma.paymentInstance.count()).toBe(0);
  });

  it("yanlış anahtar 401 verir", async () => {
    expect((await call("Bearer yanlis-anahtar")).status).toBe(401);
    expect((await call(`Bearer ${SECRET}x`)).status).toBe(401);
    expect((await call(SECRET)).status).toBe(401); // "Bearer" öneki olmadan
  });

  it("CRON_SECRET tanımlı değilse doğru görünen başlık bile reddedilir", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer undefined")).status).toBe(401);
    expect((await call("Bearer ")).status).toBe(401);
  });
});

describe("GET /api/cron/payment-instances: üretim", () => {
  it("doğru anahtarla her aktif plan için bu ayın örneğini plan tutarında üretir", async () => {
    const customer = await makeCustomer();
    await makePlan(customer.id, { title: "A", monthlyAmount: 100_000 });
    await makePlan(customer.id, { title: "B", monthlyAmount: 250_000 });

    const response = await call(`Bearer ${SECRET}`);
    const now = new Date();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ year: now.getFullYear(), month: now.getMonth() + 1, plans: 2, created: 2 });
    const amounts = (await prisma.paymentInstance.findMany({ orderBy: { amount: "asc" } })).map((i) => i.amount);
    expect(amounts).toEqual([100_000, 250_000]);
  });

  it("arşivlenmiş planlar için üretmez", async () => {
    const customer = await makeCustomer();
    await makePlan(customer.id, { title: "Aktif" });
    await makePlan(customer.id, { title: "Arşivli", archivedAt: new Date() });

    const body = await (await call(`Bearer ${SECRET}`)).json();

    expect(body).toMatchObject({ plans: 1, created: 1 });
  });

  it("tekrar çalıştırmak güvenlidir: yeni kayıt açmaz, ödenmiş örneğe dokunmaz", async () => {
    const plan = await makePlan((await makeCustomer()).id);
    await call(`Bearer ${SECRET}`);
    const instance = await prisma.paymentInstance.findFirstOrThrow();
    await prisma.paymentInstance.update({ where: { id: instance.id }, data: { status: "PAID", paidAt: new Date() } });

    const second = await (await call(`Bearer ${SECRET}`)).json();

    expect(second).toMatchObject({ plans: 1, created: 0 });
    expect(await prisma.paymentInstance.count()).toBe(1);
    expect((await prisma.paymentInstance.findUniqueOrThrow({ where: { id: instance.id } })).status).toBe("PAID");
    expect(plan.id).toBe(instance.paymentPlanId);
  });

  it("ay ortasında eklenen plan bir sonraki çalıştırmada alınır", async () => {
    const customer = await makeCustomer();
    await makePlan(customer.id, { title: "Eski" });
    await call(`Bearer ${SECRET}`);
    await makePlan(customer.id, { title: "Yeni" });

    const body = await (await call(`Bearer ${SECRET}`)).json();

    expect(body).toMatchObject({ plans: 2, created: 1 });
  });
});

describe("generateMonthlyInstances", () => {
  it("verilen tarihin ayı için üretir (ay ve yıl sınırı)", async () => {
    await makePlan((await makeCustomer()).id);

    const result = await generateMonthlyInstances(new Date(2027, 0, 1, 3, 0)); // 1 Ocak 2027

    expect(result).toEqual({ year: 2027, month: 1, plans: 1, created: 1 });
    expect(await prisma.paymentInstance.findFirstOrThrow()).toMatchObject({ year: 2027, month: 1 });
  });

  it("plan yoksa hiçbir şey üretmez ve hata vermez", async () => {
    expect(await generateMonthlyInstances()).toMatchObject({ plans: 0, created: 0 });
  });
});
