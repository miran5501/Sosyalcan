import { beforeEach, describe, expect, it } from "vitest";
import { daysFromToday, resetDb } from "@/test/db-helpers";
import { createShootSchema, updateShootSchema } from "@/lib/validations/shoot";
import { createShoot, getShootById, updateShoot } from "./shoot-service";

beforeEach(resetDb);

const at = () => daysFromToday(2).toISOString();

describe("çekim ekipman listesi", () => {
  it("ekipmanla oluşturulur ve geri okunur (satır sonları korunur)", async () => {
    const shoot = await createShoot(createShootSchema.parse({ scheduledAt: at(), equipment: "Sony A7\nDrone Mavic\nYaka mikrofonu" }));
    expect((await getShootById(shoot.id)).equipment).toBe("Sony A7\nDrone Mavic\nYaka mikrofonu");
  });

  it("ekipman verilmezse boştur", async () => {
    const shoot = await createShoot(createShootSchema.parse({ scheduledAt: at() }));
    expect(shoot.equipment).toBeNull();
  });

  it("güncellemede gönderilmezse korunur, boş gönderilirse temizlenir", async () => {
    const shoot = await createShoot(createShootSchema.parse({ scheduledAt: at(), equipment: "Kamera" }));

    const renamed = await updateShoot(shoot.id, updateShootSchema.parse({ location: "Stüdyo" }));
    expect(renamed.equipment).toBe("Kamera");

    const cleared = await updateShoot(shoot.id, updateShootSchema.parse({ equipment: "" }));
    expect(cleared.equipment).toBe("");
  });

  it("çekim güncellemesi tür ve teslim durumunu kendiliğinden değiştirmez", async () => {
    const shoot = await createShoot(createShootSchema.parse({ scheduledAt: at(), typeId: "opt_type_drone" }));

    const updated = await updateShoot(shoot.id, updateShootSchema.parse({ deliveryStatusId: "opt_status_shot", location: "Sahil" }));

    expect(updated).toMatchObject({ typeId: "opt_type_drone", deliveryStatusId: "opt_status_shot", location: "Sahil" });
    expect(updated.type.label).toBe("Drone");
    expect(updated.deliveryStatus.label).toBe("Çekildi");
  });
});

describe("çekim şeması", () => {
  it("ekipman listesi en fazla 2000 karakter", () => {
    expect(createShootSchema.safeParse({ scheduledAt: at(), equipment: "a".repeat(2000) }).success).toBe(true);
    expect(createShootSchema.safeParse({ scheduledAt: at(), equipment: "a".repeat(2001) }).success).toBe(false);
  });
});
