import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb } from "@/test/db-helpers";
import { createCustomerSchema, updateCustomerSchema } from "@/lib/validations/customer";
import { createCustomer, listCustomerTags, listCustomers, updateCustomer } from "./customer-service";

beforeEach(resetDb);

const make = (name: string, tags: string) => createCustomer(createCustomerSchema.parse({ name, tags }));

describe("müşteri etiketleri", () => {
  it("etiketlerle oluşturulur, temizlenmiş halde saklanır", async () => {
    const customer = await make("Atlas Spor", " VIP , Spor;vip ");
    expect(customer.tags).toEqual(["vip", "spor"]);
  });

  it("etiketsiz müşterinin etiket listesi boştur", async () => {
    const customer = await createCustomer(createCustomerSchema.parse({ name: "Atlas Spor" }));
    expect(customer.tags).toEqual([]);
  });

  it("güncellemede etiket gönderilmezse korunur, boş gönderilirse temizlenir", async () => {
    const customer = await make("Atlas Spor", "vip");

    const renamed = await updateCustomer(customer.id, updateCustomerSchema.parse({ name: "Atlas Spor Merkezi" }));
    expect(renamed.tags).toEqual(["vip"]);

    const cleared = await updateCustomer(customer.id, updateCustomerSchema.parse({ tags: "" }));
    expect(cleared.tags).toEqual([]);
  });

  it("etikete göre süzer (büyük/küçük harf fark etmez) ve diğer süzgeçlerle birlikte çalışır", async () => {
    await make("Atlas Spor", "vip, spor");
    await make("Lezzet Durağı", "restoran, vip");
    await make("Mavi Kırtasiye", "restoran");

    expect((await listCustomers({ tag: "VIP" })).map((c) => c.name)).toEqual(["Atlas Spor", "Lezzet Durağı"]);
    expect((await listCustomers({ tag: "restoran", search: "lezzet" })).map((c) => c.name)).toEqual(["Lezzet Durağı"]);
    expect(await listCustomers({ tag: "olmayan" })).toEqual([]);
  });

  it("etiket süzgeci arşivlenmişleri varsayılan olarak göstermez", async () => {
    const archived = await make("Eski Müşteri", "vip");
    await prisma.customer.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });

    expect(await listCustomers({ tag: "vip" })).toEqual([]);
    expect(await listCustomers({ tag: "vip", includeArchived: true })).toHaveLength(1);
  });

  it("listCustomerTags etiketleri kullanım sayısıyla, çoktan aza sıralar; arşivli müşteriler sayılmaz", async () => {
    await make("Müşteri A", "vip, spor");
    await make("Müşteri B", "vip, restoran");
    await make("Müşteri C", "vip");
    const archived = await make("Müşteri D", "spor, restoran");
    await prisma.customer.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });

    expect(await listCustomerTags()).toEqual([
      { tag: "vip", count: 3 },
      { tag: "restoran", count: 1 },
      { tag: "spor", count: 1 },
    ]);
  });
});
