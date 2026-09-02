import { headers } from "next/headers";
import { getFamilyData } from "@/lib/blob";
import { findValidShare, recordShareVisit } from "@/lib/members";
import { viewAll } from "@/lib/privacy";
import Workspace from "@/app/tree/Workspace";
import Invalid from "./Invalid";

export const dynamic = "force-dynamic";

/** User-Agent'tan kaba cihaz türü (anonim). */
function deviceOf(ua: string): string {
  const s = ua.toLowerCase();
  if (/ipad|tablet/.test(s)) return "tablet";
  if (/mobi|iphone|android/.test(s)) return "mobil";
  return "masaüstü";
}

/**
 * Herkese açık salt-okunur ağaç görünümü — ÜYELİK/GİRİŞ GEREKMEZ.
 *
 * `/g/<token>` — jeton geçerli, etkin ve süresi dolmamışsa ağaç salt-okunur ve
 * (sahibin tercihine göre) yaşayanlar gizlenmiş gösterilir. Her görüntüleme
 * anonim olarak sayılır (sahibin istatistikleri için: ülke/şehir/cihaz/zaman).
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valid = await findValidShare(decodeURIComponent(token));
  if (!valid) return <Invalid />;

  // Ziyaret kaydı (best-effort, anonim). Vercel coğrafi başlıkları varsa kullan.
  try {
    const h = await headers();
    await recordShareVisit(valid.treeId, valid.share.id, {
      country: h.get("x-vercel-ip-country") || undefined,
      city: (() => { const c = h.get("x-vercel-ip-city"); return c ? decodeURIComponent(c) : undefined; })(),
      device: deviceOf(h.get("user-agent") || ""),
    });
  } catch { /* istatistik görüntülemeyi engellemez */ }

  const { people, updatedAt } = await getFamilyData(valid.treeId);

  /*
   * Maskeleme SUNUCUDA yapılır — bu satır bir gizlilik sınırıdır.
   *
   * `Workspace` bir istemci bileşeni ("use client"). Next.js'te sunucu
   * bileşeninden istemci bileşenine geçen proplar RSC yüküne serileştirilip
   * tarayıcıya gönderilir. Yalnız çizim anında maskelemek (istemcideki
   * `PrivacyContext`) ham veriyi zaten göndermiş olmak demekti: yaşayanların
   * doğum tarihi, sağlık kaydı, hikâyesi sayfa kaynağında görünüyordu.
   *
   * Burası girişsiz, herkese açık bir yüzey; ham veri buradan çıkmamalı.
   * İstemci tarafı aynı `viewPerson`'ı yeniden uygular (idempotent).
   */
  const safePeople = viewAll(people, valid.share.hideLiving);

  return (
    <Workspace
      people={safePeople}
      version={updatedAt}
      familyName={valid.share.treeName}
      role="viewer"
      isFounder={false}
      publicView
      hideLivingForced={valid.share.hideLiving}
    />
  );
}
