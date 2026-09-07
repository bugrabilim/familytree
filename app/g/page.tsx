import type { Metadata } from "next";
import OpenShareForm from "./OpenShare";

/**
 * Paylaşılan ağacı açma girişi. `page.tsx` neden sunucu bileşeni:
 * bkz. `app/login/page.tsx`.
 *
 * Arama motorlarına KAPALI: bu sayfanın tek işi bir JETONU almak ve
 * `/g/<jeton>`a götürmek. `/g/<jeton>` zaten dizine kapalı; girişini
 * dizine açık bırakmak arama sonuçlarında hiçbir işe yaramayan bir
 * yaprak sayfa bırakırdı.
 */
export const metadata: Metadata = {
  title: "Paylaşılan ağacı aç",
  description:
    "Sana gönderilen paylaşım kodunu ya da bağlantısını yapıştır, ailenin ağacını üyeliksiz görüntüle.",
  robots: { index: false, follow: false },
};

export default function OpenSharePage() {
  return <OpenShareForm />;
}
