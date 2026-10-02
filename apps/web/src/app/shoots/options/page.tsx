import { redirect } from "next/navigation";

/** Eski adres: seçenekler artık Ayarlar → Seçenek Listeleri'nde (Çekimler sekmesi). */
export default function ShootOptionsRedirect() {
  redirect("/settings/options?tab=shoots");
}
