import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintPanel } from "@/components/features/collage/PrintPanel";
import { isValidId } from "@/lib/submission-validation";

export const metadata = { title: "作品の印刷 | collage" };

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidId(id)) notFound();

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl p-4 print:m-0 print:min-h-0 print:w-auto print:max-w-none print:p-0">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-bold text-zinc-900">作品の印刷</h1>
        <Link href="/print" prefetch={false} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700">次の作品を受け付ける</Link>
      </header>
      <PrintPanel key={id} initialSubmissionId={id} access="print" />
    </main>
  );
}
