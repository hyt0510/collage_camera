import { PrintPanel } from "@/components/features/collage/PrintPanel";

export const metadata = { title: "印刷受付 | collage" };

export default function PrintReceptionPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl p-4 print:m-0 print:min-h-0 print:w-auto print:max-w-none print:p-0">
      <header className="print:hidden">
        <h1 className="text-xl font-bold text-zinc-900">印刷受付</h1>
        <p className="mt-1 text-sm text-zinc-600">6文字の受付番号を入力するか、参加者のQRを読み取って作品を開いてください。従来の作品IDも使えます。</p>
      </header>
      <PrintPanel access="print" />
    </main>
  );
}
