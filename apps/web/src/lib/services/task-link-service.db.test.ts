import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb, taskDefaults } from "@/test/db-helpers";
import { createTaskLinkSchema } from "@/lib/validations/task";
import { createUser } from "./user-service";
import { addTaskLink, listTaskLinks, removeTaskLink } from "./task-link-service";

beforeEach(resetDb);

async function setup() {
  const author = await createUser({ name: "Operasyon", email: "op@sosyalcan.local", password: "sifre-123456", role: "OPERATIONS" });
  const task = await prisma.task.create({ data: { ...taskDefaults, title: "Reels kurgusu" } });
  return { author, task };
}

describe("görev bağlantıları", () => {
  it("bağlantı eklenir; yazarın yalnızca id ve adı döner", async () => {
    const { author, task } = await setup();

    const link = await addTaskLink(task.id, author.id, { url: "https://drive.google.com/x", label: "Ham görüntüler" });

    expect(link).toMatchObject({ url: "https://drive.google.com/x", label: "Ham görüntüler", archivedAt: null });
    expect(link.author).toEqual({ id: author.id, name: "Operasyon" });
  });

  it("etiket boşsa null saklanır; bağlantılar eskiden yeniye listelenir", async () => {
    const { author, task } = await setup();
    await addTaskLink(task.id, author.id, { url: "https://a.com/1" });
    await addTaskLink(task.id, author.id, { url: "https://a.com/2", label: "İkinci" });

    const links = await listTaskLinks(task.id);

    expect(links.map((l) => [l.url, l.label])).toEqual([
      ["https://a.com/1", null],
      ["https://a.com/2", "İkinci"],
    ]);
  });

  it("kaldırılan bağlantı listeden düşer ama veritabanında arşivli olarak kalır (fiziksel silme yok)", async () => {
    const { author, task } = await setup();
    const link = await addTaskLink(task.id, author.id, { url: "https://a.com/1" });

    await removeTaskLink(task.id, link.id);

    expect(await listTaskLinks(task.id)).toEqual([]);
    expect((await prisma.taskLink.findUniqueOrThrow({ where: { id: link.id } })).archivedAt).toBeInstanceOf(Date);
  });

  it("aynı bağlantı iki kez kaldırılamaz (404); başka görevin bağlantısı bu görev üzerinden kaldırılamaz", async () => {
    const { author, task } = await setup();
    const other = await prisma.task.create({ data: { ...taskDefaults, title: "Başka görev" } });
    const link = await addTaskLink(task.id, author.id, { url: "https://a.com/1" });

    await expect(removeTaskLink(other.id, link.id)).rejects.toMatchObject({ status: 404 });
    await removeTaskLink(task.id, link.id);
    await expect(removeTaskLink(task.id, link.id)).rejects.toMatchObject({ status: 404 });
  });

  it("olmayan görevde 404; arşivli görevde ekleme/kaldırma 409, okuma serbest", async () => {
    const { author, task } = await setup();
    const link = await addTaskLink(task.id, author.id, { url: "https://a.com/1" });
    await expect(addTaskLink("olmayan", author.id, { url: "https://a.com/1" })).rejects.toMatchObject({ status: 404 });

    await prisma.task.update({ where: { id: task.id }, data: { archivedAt: new Date() } });

    await expect(addTaskLink(task.id, author.id, { url: "https://a.com/2" })).rejects.toMatchObject({ status: 409 });
    await expect(removeTaskLink(task.id, link.id)).rejects.toMatchObject({ status: 409 });
    expect(await listTaskLinks(task.id)).toHaveLength(1);
  });
});

describe("createTaskLinkSchema", () => {
  it("yalnızca http(s) adres kabul eder (javascript: gibi adresler tıklanınca kod çalıştırabilir)", () => {
    for (const url of ["https://drive.google.com/x", "http://ornek.com/a"]) {
      expect(createTaskLinkSchema.safeParse({ url }).success).toBe(true);
    }
    for (const url of ["javascript:alert(1)", "data:text/html,x", "ftp://x.com/a", "drive.google.com/x", "https://a b.com", ""]) {
      expect(createTaskLinkSchema.safeParse({ url }).success).toBe(false);
    }
  });

  it("adresi ve etiketi kırpar; etiket en fazla 100 karakter", () => {
    expect(createTaskLinkSchema.parse({ url: "  https://a.com/x  ", label: "  Ham  " })).toEqual({ url: "https://a.com/x", label: "Ham" });
    expect(createTaskLinkSchema.safeParse({ url: "https://a.com/x", label: "a".repeat(101) }).success).toBe(false);
  });
});
