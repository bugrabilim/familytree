import { readFileSync } from "node:fs";
import { viewAll, viewPerson } from "../lib/privacy.ts";
import { EXCLUDED_FIELDS, PERSON_FIELDS } from "../lib/person-fields.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: ağaçtaki kişinin e-posta adresi (madde 47/48 uzantısı).
 *
 * İki ayrı şeyi kilitliyor.
 *
 * ## 1. Adres GÖRÜNTÜ KATMANINDAN çıkamaz
 *
 * Ağaç yükü ağacın bütün üyelerine VE paylaşım bağlantısını açan herkese
 * gidiyor. Adres oraya binseydi tek bir paylaşım bağlantısı, ağaçtaki herkesin
 * e-posta adresini dışarı taşırdı — üstelik o adresler kullanıcının kendi
 * adresi değil, akrabalarının.
 *
 * ## 2. Onayı KULLANICI veremez
 *
 * Adresi giren kişi, adresin sahibi değil. Onay bayrağı istemci gövdesinden
 * yazılabilseydi çift onay tamamen anlamsız olurdu.
 */

const ALANLAR = ["contactEmail", "contactConsent", "contactTokenHash", "contactAskedAt"] as const;

const KISI = (o: Partial<Person> = {}): Person => ({
  id: "p1",
  firstName: "Ayşe",
  lastName: "Y",
  gender: "female",
  parentIds: [],
  spouseIds: [],
  contactEmail: "teyze@ornek.com",
  contactConsent: "onayli",
  contactTokenHash: "ozet",
  contactAskedAt: "2026-09-01T00:00:00Z",
  ...o,
});

/* --- 1. HİÇBİR görüntü yolundan çıkmıyor -------------------------------- */
/*
 * Dört durum ayrı ayrı deneniyor çünkü `viewPerson`ın İKİ dalı var ve
 * `maskPerson` (beyaz liste) zaten güvenli. Asıl risk MASKESİZ dal: vefat
 * etmiş biri, ya da gizleme kapalıyken yaşayan biri. Yalnız maskeli durumu
 * denemek, tam da açık olan kapıyı denememek olurdu.
 */
const durumlar: Array<[string, Person, boolean]> = [
  ["yaşayan + gizleme açık", KISI(), true],
  ["yaşayan + gizleme KAPALI", KISI(), false],
  ["vefat etmiş + gizleme açık", KISI({ deathDate: "2001-05-05" }), true],
  ["vefat etmiş + gizleme kapalı", KISI({ deathDate: "2001-05-05" }), false],
  ["gizli kayıt", KISI({ confidential: true }), false],
  ["alan-bazlı gizli", KISI({ privateFields: ["story"] }), false],
];
for (const [ad, kisi, gizle] of durumlar) {
  const g = viewPerson(kisi, gizle) as unknown as Record<string, unknown>;
  for (const alan of ALANLAR)
    check(g[alan] === undefined, `${ad}: "${alan}" görüntüye çıkmıyor`);
}

/* Liste hâli de aynı kapıdan geçiyor — `viewAll` ayrı bir yol açmasın. */
{
  const g = viewAll([KISI()], false)[0] as unknown as Record<string, unknown>;
  for (const alan of ALANLAR) check(g[alan] === undefined, `viewAll: "${alan}" çıkmıyor`);
}

/* Ham kayıt KİRLENMİYOR: görüntü katmanı veriyi değiştirmez. */
{
  const ham = KISI();
  viewPerson(ham, false);
  check(ham.contactEmail === "teyze@ornek.com", "ham kayıttaki adres silinmiyor");
}

/* Adres yoksa gereksiz kopya üretilmiyor (aynı nesne dönüyor). */
{
  const sade: Person = { id: "p2", firstName: "A", lastName: "B", gender: "male", parentIds: [], spouseIds: [] };
  check(viewPerson(sade, false) === sade, "iletişim alanı yoksa aynı nesne dönüyor");
}

/* --- `stripContact` gerçekten viewPerson'ın İÇİNDE ---------------------- */
/*
 * İki dala ayrı ayrı yazılsaydı biri unutulduğunda kimse fark etmezdi; bu
 * yüzden sarmalama tek yerde ve dışta.
 */
{
  const src = kodu(read("../lib/privacy.ts"));
  check(/return stripContact\(/.test(src), "viewPerson stripContact ile sarmalanmış");
}

/* --- 2. Alan kayıt defterinden GEÇMİYOR --------------------------------- */
/*
 * Kayıt defteri düz metin birleştirmesi yapıyor ("boş temizler, değer
 * ayarlar"). Adres oradan geçseydi, onaylı bir adresin üstüne başka bir adres
 * yazılır ve o kişi hiç onay vermeden "onaylı" görünürdü.
 */
{
  const kayitli = new Set(PERSON_FIELDS.map((f) => String(f.key)));
  for (const alan of ALANLAR) {
    check(!kayitli.has(alan), `"${alan}" kayıt defterinde DEĞİL`);
    check(alan in EXCLUDED_FIELDS, `"${alan}" gerekçesiyle dışarıda bırakılmış`);
  }
}

/* --- 3. Uç: yalnız düzenleyici, onay istemciden yazılamaz --------------- */
{
  const src = read("../app/api/family/person/[id]/contact/route.ts");
  const k = kodu(src);
  check(/canEdit\(ctx\.role\)/.test(k), "uç düzenleme yetkisi istiyor");
  check(/resolveActiveTree\(\)/.test(k), "uç ağaç bağlamından geçiyor");
  /*
   * Gövdeden OKUNAN tek alan adres. `contactConsent` gövdeden okunsaydı,
   * adresi giren kişi kendi adına onay verebilirdi.
   */
  check(/body\.contactEmail/.test(k), "adres gövdeden okunuyor");
  /*
   * Düz `body.contactConsent` aramak YETMEZ: bir dönüşümle (`(body as
   * Record<string, unknown>).contactConsent`) aynı okuma yapılabilir ve
   * desen kaçar. Bu yüzden kural satır düzeyinde: iletişim alanlarından
   * birinin geçtiği hiçbir satırda `body` geçemez.
   */
  for (const satir of k.split("\n")) {
    if (!/contactConsent|contactTokenHash|contactAskedAt/.test(satir)) continue;
    check(!/\bbody\b/.test(satir), `onay alanı gövdeyle aynı satırda değil: ${satir.trim().slice(0, 60)}`);
  }
  // Onay sıfırlama kararı saf katmanda; rota kendi kuralını uydurmuyor.
  check(/applyContactChange\(/.test(k) && /planContactChange\(/.test(k),
    "karar `lib/contact-consent.ts`e bırakılmış");
  check(!/contactConsent: "onayli"/.test(k), "rota kendi başına onay YAZMIYOR");
}

/* --- 4. Form adresi kişi yüküyle GÖNDERMİYOR ---------------------------- */
/*
 * Gönderseydi, kişinin adını düzeltmek için formu kaydeden biri farkında
 * olmadan adresi de yeniden yazmış olurdu — ve adres yazımı onayı sıfırlıyor.
 */
{
  const form = kodu(read("../components/PersonForm.tsx"));
  check(!/contactEmail/.test(form), "PersonForm kayıt yükünde adres yok");
  check(/<ContactSection personId=/.test(form), "adres bölümü ayrı bileşen olarak bağlı");
  const bolum = kodu(read("../components/ContactSection.tsx"));
  check(/\/contact`/.test(bolum), "bileşen kendi ucunu çağırıyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
