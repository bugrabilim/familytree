import { readAskToken } from "@/lib/contact-lookup";
import ContactAnswerClient from "./ContactAnswerClient";

export const dynamic = "force-dynamic";

/**
 * ONAY SORUSU SAYFASI — oturumsuz (madde 47/48).
 *
 * Bu sayfayı açan kişinin uygulamada hesabı YOK: bir akrabası ağaca ekledi ve
 * adresini yazdı. Oturum duvarına takılsaydı onay hiçbir zaman verilemezdi.
 *
 * ## Sayfa jetonu TÜKETMİYOR
 *
 * `readAskToken` yalnız okuyup doğruluyor. Posta istemcileri ve önizleme
 * botları bağlantıları ön-getiriyor; karar sayfa yüklenirken verilseydi,
 * kullanıcı postayı açar açmaz onun yerine karar verilmiş olurdu.
 *
 * ## Jeton geçersizse HİÇBİR ŞEY gösterilmiyor
 *
 * Ad, ağaç, "böyle bir kayıt var mı" — hiçbiri. Yoksa kimlik tahmin eden biri
 * bu sayfayı bir sorgu aracı gibi kullanır.
 */
export default async function ContactAskPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const r = await readAskToken(token);
  const gecerli = typeof r !== "string";
  return (
    <ContactAnswerClient
      token={token}
      valid={gecerli}
      name={gecerli ? r.person.firstName : ""}
      family={gecerli ? r.person.lastName : ""}
      already={gecerli ? r.person.contactConsent === "onayli" : false}
    />
  );
}
