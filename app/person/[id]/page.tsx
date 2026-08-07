import { redirect } from "next/navigation";

/**
 * Kişi ayrıntıları artık ağaç çalışma alanındaki kayan panelde gösteriliyor.
 * Eski bağlantıların çalışmaya devam etmesi için yönlendiriyoruz.
 */
export default async function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/tree?kisi=${encodeURIComponent(id)}`);
}
