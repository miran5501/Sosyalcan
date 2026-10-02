import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      /** true ise kişi şifresini değiştirene kadar yalnızca Hesabım sayfasına erişebilir. */
      mustChangePassword?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    sessionVersion?: number;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    /** Kullanıcının oturum sürümü; DB'deki değerle eşleşmezse oturum düşer. */
    sv?: number;
    /** Şifre değiştirme zorunlu mu (her istekte DB'den güncellenir). */
    mcp?: boolean;
  }
}
