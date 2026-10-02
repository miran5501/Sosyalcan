import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Nav } from "@/components/nav";
import { CustomerImport } from "@/components/customer-import";

/** Excel/CSV'den toplu müşteri aktarma (Admin, Operasyon). */
export default async function CustomerImportPage() {
  const session = await auth();
  const user = session!.user;
  if (user.role !== "ADMIN" && user.role !== "OPERATIONS") {
    redirect("/customers");
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:pl-64 print:pl-0">
      <Nav userName={user.name} userRole={user.role} />
      <main className="animate-fade-up mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <Link href="/customers" className="text-sm text-neutral-500 hover:text-neutral-800">
          ← Müşteriler
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-neutral-900">Excel/CSV&apos;den Müşteri Aktar</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Önce önizleme gösterilir, onaylamadan kaydedilmez. Aynı adda müşteri varsa atlanır.
        </p>
        <CustomerImport />
      </main>
    </div>
  );
}
