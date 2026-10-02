import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api-auth";

/** Servis "bulunamadı" (404) verirse sayfa hata ekranı yerine standart 404 sayfasını gösterir. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
