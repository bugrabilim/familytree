import ResetPasswordClient from "./ResetPasswordClient";

export const dynamic = "force-dynamic";

/**
 * Şifre sıfırlama sayfası (madde 51) — jeton URL'de.
 *
 * Sunucuda jeton DOĞRULANMIYOR ve bu bilinçli: doğrulasaydık, sayfanın
 * yüklenip yüklenmemesi jetonun geçerli olup olmadığını ele verirdi ve
 * saldırgan tarayıcıyla jeton tarayabilirdi. Geçerlilik yalnız gönderim
 * anında, tek bir uçta ve hız sınırının arkasında denetleniyor.
 */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ResetPasswordClient token={token} />;
}
