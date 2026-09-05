import ContactUnsubClient from "./ContactUnsubClient";

export const dynamic = "force-dynamic";

/**
 * ABONELİKTEN ÇIKMA SAYFASI — her postanın altındaki bağlantı.
 *
 * Jeton burada ÇÖZÜLMÜYOR: doğrulama da çıkarma da tek adımda, kullanıcının
 * düğmesiyle oluyor. Sayfa açılışında çıkarılsaydı posta istemcilerinin
 * ön-getirmesi kişiyi kendi tıklaması olmadan listeden düşürürdü — ve bu,
 * onay vermiş birinin postalarını sessizce kesmek olurdu.
 */
export default async function ContactUnsubPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ContactUnsubClient token={token} />;
}
