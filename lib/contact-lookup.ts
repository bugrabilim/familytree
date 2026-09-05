import { getFamilyData, saveFamilyData } from "@/lib/blob";
import type { Person } from "@/types/family";
import { matchesHash, parseToken, verifyUnsubToken, type Locator } from "@/lib/contact-token";
import { applyAnswer, applyUnsubscribe } from "@/lib/contact-consent";

/**
 * JETONDAN KİŞİYE — oturumsuz yanıt yolunun tek okuma/yazma yeri.
 *
 * Bağlantıyı açan kişinin uygulamada hesabı YOK ve olması da beklenemez:
 * kendisi bu ağacı hiç görmemiş olabilir, yalnız adresi girilmiş. Bu yüzden
 * kimlik bütünüyle jetonda.
 *
 * ## Tek dosya olmasının sebebi
 *
 * Aynı arama üç yerde gerekiyor: soru sayfası (göstermek için), yanıt ucu
 * (yazmak için), çıkış ucu. Üçü ayrı yazılsaydı biri gevşek kalabilirdi —
 * ve gevşeyecek yer belli: sayfa yalnız "göstermek" için diye sırrı
 * doğrulamayı atlamak. O atlama, kimlikleri tahmin eden birine kaydın adını
 * okutur.
 *
 * `@/` çalışma zamanı içe aktarımı taşıdığı için birim testi koşulamaz;
 * sınırları `tests/contact-answer-gate.test.mts` kaynak düzeyinde denetliyor.
 */

export type LookupFail = "gecersiz" | "bulunamadi";

export interface Found {
  loc: Locator;
  person: Person;
}

async function bul(loc: Locator, personId: string) {
  const data = await getFamilyData(loc.treeId, { skipCache: true });
  const index = data.people.findIndex((p) => p.id === personId);
  return index === -1 ? null : { data, index };
}

/**
 * Onay jetonunu ÇÖZER ve doğrular — ama TÜKETMEZ.
 *
 * Tüketmemesi şart: soru sayfası da bunu çağırıyor ve bir sayfa görüntülemesi
 * yan etki üretmemeli. Posta istemcileri bağlantıları ön-getiriyor; tüketen
 * bir okuma, kullanıcı postayı açar açmaz kararı onun yerine vermiş olurdu.
 */
export async function readAskToken(token: unknown): Promise<Found | LookupFail> {
  const p = parseToken(token);
  if (!p) return "gecersiz";
  const r = await bul(p, p.personId);
  if (!r) return "bulunamadi";
  const kisi = r.data.people[r.index];
  // Sır kayıttaki özete uymuyorsa kayıt HİÇ açılmamış gibi davranılıyor.
  if (!matchesHash(p.proof, kisi.contactTokenHash)) return "gecersiz";
  return { loc: p, person: kisi };
}

/**
 * Yanıtı yazar ve jetonu DÜŞÜRÜR.
 *
 * Jeton burada, yazmayla aynı işlemde düşüyor: ayrı bir adımda düşseydi,
 * arada gelen ikinci bir tıklama aynı jetonla ikinci kez karar değiştirirdi.
 */
export async function answerWithToken(
  token: unknown,
  answer: "onayla" | "reddet"
): Promise<{ ok: true; name: string } | { ok: false; error: LookupFail }> {
  const p = parseToken(token);
  if (!p) return { ok: false, error: "gecersiz" };
  const r = await bul(p, p.personId);
  if (!r) return { ok: false, error: "bulunamadi" };
  const kisi = r.data.people[r.index];
  if (!matchesHash(p.proof, kisi.contactTokenHash)) return { ok: false, error: "gecersiz" };

  r.data.people[r.index] = { ...kisi, ...applyAnswer(kisi, answer) };
  await saveFamilyData(p.treeId, r.data);
  return { ok: true, name: kisi.firstName };
}

/**
 * Abonelikten çıkarır. Jeton KALICI (HMAC) — her postadaki çıkış bağlantısı
 * yıllar sonra da çalışmalı; hesabı olmayan biri fikrini değiştirmek için
 * uygulamaya giremez.
 *
 * Adres SİLİNMİYOR, "red" işaretleniyor: silinseydi aynı adres yarın yeniden
 * girilip yeniden sorulurdu ve "bu kişi istemedi" bilgisi kaybolurdu.
 */
export async function unsubscribeWithToken(
  token: unknown
): Promise<{ ok: true; name: string } | { ok: false; error: LookupFail }> {
  const loc = verifyUnsubToken(token);
  if (!loc) return { ok: false, error: "gecersiz" };
  const r = await bul(loc, loc.personId);
  if (!r) return { ok: false, error: "bulunamadi" };
  const kisi = r.data.people[r.index];
  r.data.people[r.index] = { ...kisi, ...applyUnsubscribe(kisi) };
  await saveFamilyData(loc.treeId, r.data);
  return { ok: true, name: kisi.firstName };
}
