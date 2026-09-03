import VerifyEmailClient from "./VerifyEmailClient";

export const dynamic = "force-dynamic";

/**
 * E-posta doğrulama sayfası (Faz 3e). Oturum İSTEMEZ: bağlantı postadan
 * geliyor ve başka bir cihazda açılabilir. Kimlik jetonun kendisinde.
 *
 * Jeton sunucuda burada KULLANILMIYOR — istemci POST ediyor. Sebep: bir
 * sayfa görüntülemesi yan etki üretmemeli; posta istemcilerinin bağlantı
 * ön-getirmesi doğrulamayı kullanıcı görmeden tüketirdi.
 */
export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <VerifyEmailClient token={token} />;
}
