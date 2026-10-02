import { describe, expect, it } from "vitest";
import { checkEnv, formatEnvProblems } from "./env";

const valid = {
  DATABASE_URL: "postgresql://postgres@localhost:5432/sosyalcan_dev",
  AUTH_SECRET: "Zx8k2Lq9Vw4Rt7Yp1Mn6Bc3Df5Gh0Jk2Lq9",
};

describe("checkEnv", () => {
  it("geçerli değerlerde sorun yok", () => {
    expect(checkEnv(valid)).toEqual([]);
    expect(checkEnv({ ...valid, REDIS_URL: "redis://localhost:6379", CRON_SECRET: "a1b2c3d4e5f6g7h8i9j0" })).toEqual([]);
  });

  it("eksik AUTH_SECRET ve DATABASE_URL yakalanır", () => {
    expect(checkEnv({}).map((p) => p.name).sort()).toEqual(["AUTH_SECRET", "DATABASE_URL"]);
    expect(checkEnv({ ...valid, AUTH_SECRET: "" }).map((p) => p.name)).toEqual(["AUTH_SECRET"]);
  });

  it("kısa, örnek değerde bırakılmış ya da tekdüze anahtar reddedilir", () => {
    expect(checkEnv({ ...valid, AUTH_SECRET: "kisa-anahtar" })[0].message).toContain("en az 32");
    expect(checkEnv({ ...valid, AUTH_SECRET: "degistir-en-az-32-karakterlik-rastgele-bir-metin" })[0].message).toContain("örnek değerde");
    expect(checkEnv({ ...valid, AUTH_SECRET: "a".repeat(40) })[0].message).toContain("tekdüze");
  });

  it("isteğe bağlı değerler tanımlıysa biçimleri kontrol edilir", () => {
    expect(checkEnv({ ...valid, REDIS_URL: "localhost:6379" })[0].name).toBe("REDIS_URL");
    expect(checkEnv({ ...valid, CRON_SECRET: "degistir-cron-icin-rastgele-bir-metin" })[0].name).toBe("CRON_SECRET");
    expect(checkEnv({ ...valid, API_RATE_LIMIT_PER_MINUTE: "abc" })[0].name).toBe("API_RATE_LIMIT_PER_MINUTE");
  });

  it("hata mesajı gizli değerin kendisini içermez", () => {
    const text = formatEnvProblems(checkEnv({ ...valid, AUTH_SECRET: "gizli-kisa" }));
    expect(text).toContain("AUTH_SECRET");
    expect(text).not.toContain("gizli-kisa");
  });
});
