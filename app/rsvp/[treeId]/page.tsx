import type { Metadata } from "next";
import RsvpForm from "./RsvpForm";

export const dynamic = "force-dynamic";

/**
 * Anonim katılım bildirimi sayfası — `/rsvp/<treeId>?token=<jeton>`.
 *
 * Davetli bağlantıyı WhatsApp'tan alıyor; hesabı yok ve olması da
 * beklenmiyor. Sayfa jetonla çalışıyor, veri istemciden çekiliyor.
 *
 * Arama motorlarına KAPALI: jeton bir davet anahtarı ve dizine girmesi onu
 * arananabilir hâle getirirdi.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function RsvpPage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { treeId } = await params;
  const { token } = await searchParams;
  return <RsvpForm treeId={treeId} token={(token ?? "").trim()} />;
}
