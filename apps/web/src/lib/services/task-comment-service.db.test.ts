import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resetDb, taskDefaults } from "@/test/db-helpers";
import { createUser } from "./user-service";
import { addTaskComment, listTaskComments } from "./task-comment-service";
import { createTaskCommentSchema } from "@/lib/validations/task";

beforeEach(resetDb);

async function setup() {
  const author = await createUser({ name: "Operasyon", email: "op@sosyalcan.local", password: "sifre-123456", role: "OPERATIONS" });
  const task = await prisma.task.create({ data: { ...taskDefaults, title: "Reels kurgusu" } });
  return { author, task };
}

describe("görev yorumları", () => {
  it("yorum eklenir, yazarın yalnızca id ve adıyla döner (şifre özeti sızmaz)", async () => {
    const { author, task } = await setup();

    const comment = await addTaskComment(task.id, author.id, { body: "Müşteri müzik değişikliği istedi" });

    expect(comment.body).toBe("Müşteri müzik değişikliği istedi");
    expect(comment.author).toEqual({ id: author.id, name: "Operasyon" });
    expect(JSON.stringify(comment)).not.toContain("passwordHash");
  });

  it("yorumlar eskiden yeniye sıralanır", async () => {
    const { author, task } = await setup();
    await addTaskComment(task.id, author.id, { body: "birinci" });
    await addTaskComment(task.id, author.id, { body: "ikinci" });
    await addTaskComment(task.id, author.id, { body: "üçüncü" });

    expect((await listTaskComments(task.id)).map((c) => c.body)).toEqual(["birinci", "ikinci", "üçüncü"]);
  });

  it("yorumlar görevler arasında karışmaz", async () => {
    const { author, task } = await setup();
    const other = await prisma.task.create({ data: { ...taskDefaults, title: "Başka görev" } });
    await addTaskComment(task.id, author.id, { body: "bu görevin" });
    await addTaskComment(other.id, author.id, { body: "başkasının" });

    expect((await listTaskComments(task.id)).map((c) => c.body)).toEqual(["bu görevin"]);
  });

  it("olmayan göreve yorum eklenemez ve olmayan görevin yorumları okunamaz (404)", async () => {
    const { author } = await setup();
    await expect(addTaskComment("olmayan", author.id, { body: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(listTaskComments("olmayan")).rejects.toMatchObject({ status: 404 });
  });

  it("arşivlenmiş göreve yorum eklenemez (409) ama eski yorumlar okunabilir kalır", async () => {
    const { author, task } = await setup();
    await addTaskComment(task.id, author.id, { body: "arşivden önce" });
    await prisma.task.update({ where: { id: task.id }, data: { archivedAt: new Date() } });

    await expect(addTaskComment(task.id, author.id, { body: "sonra" })).rejects.toMatchObject({ status: 409 });
    expect((await listTaskComments(task.id)).map((c) => c.body)).toEqual(["arşivden önce"]);
  });
});

describe("createTaskCommentSchema", () => {
  it("boş veya yalnızca boşluktan oluşan yorumu reddeder, baştaki/sondaki boşluğu kırpar", () => {
    expect(createTaskCommentSchema.safeParse({ body: "" }).success).toBe(false);
    expect(createTaskCommentSchema.safeParse({ body: "   \n " }).success).toBe(false);
    expect(createTaskCommentSchema.parse({ body: "  merhaba  " }).body).toBe("merhaba");
  });

  it("2000 karakterden uzun yorumu reddeder", () => {
    expect(createTaskCommentSchema.safeParse({ body: "a".repeat(2000) }).success).toBe(true);
    expect(createTaskCommentSchema.safeParse({ body: "a".repeat(2001) }).success).toBe(false);
  });
});
