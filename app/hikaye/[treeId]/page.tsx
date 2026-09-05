import type { Metadata } from "next";
import StoryForm from "./StoryForm";

export const dynamic = "force-dynamic";

/**
 * Hikâye talebi yanıt sayfası — `/hikaye/<treeId>?token=<jeton>`.
 *
 * Bağlantıyı alan akrabanın hesabı yok ve olması da beklenmiyor; kimlik
 * jetonda. `lib/gathering.ts`teki (madde 36) RSVP kalıbının aynısı.
 *
 * Arama motorlarına KAPALI: jeton bir YAZMA anahtarı ve dizine girmesi onu
 * aranabilir hâle getirirdi.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { treeId } = await params;
  const { token } = await searchParams;
  return <StoryForm treeId={treeId} token={(token ?? "").trim()} />;
}
