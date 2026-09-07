/**
 * HTML ARŞİVİ — `lib/export-html.ts` + `unwrapArchive`.
 *
 * Bu biçim aynı anda iki söz veriyor: "programsız açılır" ve "geri
 * yüklenebilir". Buradaki sınamalar ikisini de tutuyor — özellikle GİDİŞ-DÖNÜŞ
 * (dışa aktar → içeri al → aynı kişiler) ve KAÇIŞ (kullanıcı metni belgeyi ya
 * da gömülü veri bloğunu kıramaz) tarafını.
 */
import type { Person } from "../types/family.ts";
import { ETIKETLER, VERI_ID, exportHtml, extractEmbedded } from "../lib/export-html.ts";
import { unwrapArchive } from "../lib/import.ts";

let ok = 0;
let fail = 0;
function check(cond: boolean, mesaj: string) {
  if (cond) ok++;
  else {
    fail++;
    console.error("  ✗", mesaj);
  }
}

function kisi(p: Partial<Person> & { id: string }): Person {
  return {
    firstName: "Ad",
    lastName: "Soyad",
    gender: "unknown",
    parentIds: [],
    spouseIds: [],
    ...p,
  } as Person;
}

const SABIT = new Date(Date.UTC(2026, 8, 7, 12, 30));

/**
 * Belgenin GÖRÜNEN kısmı — gömülü veri bloğundan öncesi.
 *
 * Süzgeç iddiaları (şema elemesi, kaçış) buraya daraltılmak ZORUNDA: gömülü
 * blok tanımı gereği ham veriyi taşıyor, yani `javascript:` yazan bir alan
 * orada AYNEN duruyor ve durmalı — yedek, kaydı değiştirmemeli. Tüm belgede
 * arayan bir iddia bu yüzden hep kırmızı yanar ve süzgeci gerçekten sınamaz.
 */
function gorunen(html: string): string {
  const i = html.indexOf('<script type="application/json"');
  return i > 0 ? html.slice(0, i) : html;
}

/* ── 1. Etiket paritesi ────────────────────────────────────────────────────
 * Sözlük `lib/i18n-dict.ts`te olmadığı için oradaki parite testi buraya
 * ulaşmıyor; kural yine geçerli, denetim burada. */
{
  const tr = Object.keys(ETIKETLER.tr).sort();
  const en = Object.keys(ETIKETLER.en).sort();
  check(tr.length > 0 && tr.join("|") === en.join("|"), "tr/en etiket anahtarları eşit değil");
  check(
    Object.values(ETIKETLER.en).every((v) => typeof v === "string" && v.trim().length > 0),
    "boş İngilizce etiket var"
  );
  check(
    Object.values(ETIKETLER.tr).every((v) => typeof v === "string" && v.trim().length > 0),
    "boş Türkçe etiket var"
  );
}

/* ── 2. Belge bütünlüğü ────────────────────────────────────────────────────── */
{
  const html = exportHtml([kisi({ id: "a", firstName: "Ayşe", lastName: "Yılmaz" })], {
    treeName: "Yılmaz Ailesi",
    generatedAt: SABIT,
  });
  check(html.trimStart().startsWith("<!doctype html>"), "belge <!doctype html> ile başlamıyor");
  check(html.trimEnd().endsWith("</html>"), "belge </html> ile bitmiyor");
  check(html.includes('<meta charset="utf-8">'), "charset yok — Türkçe harfler bozulur");
  check(html.includes("<title>Yılmaz Ailesi — Aile Ağacı Arşivi</title>"), "başlıkta ağaç adı yok");
  check(html.includes("Ayşe"), "kişi adı belgede yok");
  check(html.includes("07.09.2026"), "üretim damgası yok");
  // Dış kaynak YOK: dosya ağsız açılmalı. (Fotoğraf <img> hariç — o veri.)
  check(!/<link\s/i.test(html), "belgede <link> var — dış kaynak bağımlılığı");
  check(!/src="https?:\/\/[^"]*\.js/i.test(html), "belgede dış betik var");
}

/* ── 3. Boş ağaç patlamamalı ───────────────────────────────────────────────── */
{
  const html = exportHtml([], { generatedAt: SABIT });
  check(html.includes("</html>"), "boş ağaçta belge üretilmedi");
  check(extractEmbedded(html) !== null, "boş ağaçta gömülü veri bloğu yok");
}

/* ── 4. Kaçış: kullanıcı metni belgeyi kıramaz ─────────────────────────────── */
{
  const zararli = kisi({
    id: "x",
    firstName: "<script>alert(1)</script>",
    lastName: "\"><img src=x onerror=alert(2)>",
    bio: "5 < 7 & 8 > 3",
  });
  const html = exportHtml([zararli], { generatedAt: SABIT });
  const g = gorunen(html);
  check(!g.includes("<script>alert(1)</script>"), "ad alanındaki betik kaçırılmamış");
  check(!g.includes("<img src=x"), "öznitelikten çıkış engellenmemiş — canlı etiket üretildi");
  /* `onerror` metni belgede DURUR — kaçırılmış olduğu için zararsız bir
     yazıdır. Aranacak şey kelimenin yokluğu değil, etiket olarak
     doğmamış olması; iddia da bu yüzden kaçırılmış hâlini bekliyor. */
  check(
    g.includes("&quot;&gt;&lt;img src=x onerror=alert(2)&gt;"),
    "soyad yükü olduğu gibi kaçırılmamış"
  );
  check(g.includes("&lt;script&gt;"), "ad kaçırılmış hâliyle görünmüyor");
  check(g.includes("5 &lt; 7 &amp; 8 &gt; 3"), "yaşam öyküsü kaçışı yanlış");
}

/* ── 5. `</script>` gömülü bloğu erken kapatmamalı ─────────────────────────── */
{
  const p = kisi({ id: "s", firstName: "Not", bio: "burada </script> yazıyor <!-- ve yorum" });
  const html = exportHtml([p], { generatedAt: SABIT });
  const govde = extractEmbedded(html);
  check(govde !== null, "gömülü blok bulunamadı");
  const veri = JSON.parse(govde!);
  check(veri.people[0].bio === p.bio, "`</script>` içeren metin gidiş-dönüşte bozuldu");
  // Gömülü blok içindeki her `<` kaçırılmış olmalı.
  const blokIci = html.slice(html.indexOf(`id="${VERI_ID}"`));
  const blok = blokIci.slice(blokIci.indexOf(">") + 1, blokIci.indexOf("</script>"));
  check(!blok.includes("<"), "gömülü JSON içinde kaçırılmamış `<` var");
}

/* ── 6. Gidiş-dönüş: dışa aktarılan ağaç aynen geri gelir ──────────────────── */
{
  const people = [
    kisi({ id: "baba", firstName: "Ali", gender: "male", spouseIds: ["anne"] }),
    kisi({ id: "anne", firstName: "Fatma", gender: "female", spouseIds: ["baba"] }),
    kisi({
      id: "cocuk",
      firstName: "Zeynep",
      gender: "female",
      parentIds: ["baba", "anne"],
      birthDate: "1990-04-23",
      occupation: "Öğretmen",
      photos: ["https://ornek.test/1.jpg"],
      events: [{ id: "e1", type: "mezuniyet", title: "Lise", date: "2008" }],
    }),
  ];
  const html = exportHtml(people, { treeName: "Test", generatedAt: SABIT });
  const veri = JSON.parse(extractEmbedded(html)!);
  check(veri.format === "soyagaci-json", "gömülü veri biçim damgası yanlış");
  check(
    JSON.stringify(veri.people) === JSON.stringify(people),
    "gidiş-dönüşte kişiler birebir korunmadı"
  );
  // Ham veri MASKELENMEZ: maskelenmiş yedek, geri yüklenince veriyi kaybettirir.
  check(html.includes("1990-04-23") || veri.people[2].birthDate === "1990-04-23", "tarih yedeğe girmemiş");
}

/* ── 7. Bağlar iki yönlü kuruluyor ─────────────────────────────────────────── */
{
  const people = [
    kisi({ id: "p1", firstName: "Ana" }),
    kisi({ id: "p2", firstName: "Yavru", parentIds: ["p1"] }),
    kisi({ id: "p3", firstName: "Eski", formerSpouseIds: [] }),
  ];
  people[0].formerSpouseIds = ["p3"];
  const html = exportHtml(people, { generatedAt: SABIT });
  const bolum = html.slice(html.indexOf('id="k-p1"'), html.indexOf('id="k-p2"') >= 0 ? html.length : html.length);
  const p1 = html.slice(html.indexOf('id="k-p1"'));
  const p1Son = p1.slice(0, p1.indexOf("</article>"));
  check(p1Son.includes('href="#k-p2"'), "ebeveynin bölümünde çocuk bağı yok (çocuklar hesaplanmıyor)");
  check(p1Son.includes('href="#k-p3"'), "eski eş bağı yazılmamış");
  check(bolum.length > 0, "bölüm dilimlenemedi");
  // Her kişinin bir çıpası olmalı — dizindeki bağlantılar buraya atlıyor.
  for (const p of people) check(html.includes(`id="k-${p.id}"`), `çıpa yok: ${p.id}`);
}

/* ── 8. Bağlantı şeması süzgeci ────────────────────────────────────────────── */
{
  const html = exportHtml(
    [
      kisi({
        id: "u",
        firstName: "Foto",
        photo: "javascript:alert(1)",
        photos: ["data:text/html,<script>alert(1)</script>", "https://ornek.test/ok.jpg"],
        sources: [{ id: "s1", title: "Kaynak", url: "javascript:alert(3)" }],
      }),
    ],
    { generatedAt: SABIT }
  );
  const g = gorunen(html);
  check(!g.includes("javascript:"), "javascript: şeması elenmemiş");
  check(!/(src|href)="data:/i.test(g), "data: şeması bağlantıya sızmış");
  check(g.includes("https://ornek.test/ok.jpg"), "geçerli fotoğraf bağlantısı düşmüş");
  // Ham veride ise DURUYOR — yedek kaydı budamaz.
  check(html.includes("javascript:alert(3)"), "gömülü yedek kaynak alanını budamış");
}

/* ── 9. Dil seçimi ─────────────────────────────────────────────────────────── */
{
  const tr = exportHtml([kisi({ id: "d", firstName: "A", birthDate: "1950" })], { generatedAt: SABIT });
  const en = exportHtml([kisi({ id: "d", firstName: "A", birthDate: "1950" })], {
    generatedAt: SABIT,
    lang: "en",
  });
  check(tr.includes('<html lang="tr">'), "TR belgede lang yanlış");
  check(en.includes('<html lang="en">'), "EN belgede lang yanlış");
  check(en.includes("Family Tree Archive"), "EN başlık çevrilmemiş");
  check(en.includes("Birth"), "EN alan etiketi çevrilmemiş");
  check(tr.includes("Doğum"), "TR alan etiketi yok");
}

/* ── 10. unwrapArchive: üç durum da ayrı ───────────────────────────────────── */
{
  const arsiv = exportHtml([kisi({ id: "z", firstName: "Zehra" })], { generatedAt: SABIT });

  const a = unwrapArchive("aile-agaci.html", arsiv);
  check(a.ok && JSON.parse(a.text).people[0].firstName === "Zehra", "arşiv açılamadı");

  const b = unwrapArchive("veri.json", '{"people":[]}');
  check(b.ok && b.text === '{"people":[]}', "HTML olmayan dosya değiştirilmiş");

  const c = unwrapArchive("sayfa.html", "<!doctype html><html><body>a,b,c</body></html>");
  check(!c.ok && c.reason === "html-bos", "yabancı HTML kabul edilmiş");

  // Uzantı yalan söylese bile içerik sezgisi yakalar.
  const d = unwrapArchive("dosya.txt", "<!DOCTYPE HTML>\n<html><body>x,y</body></html>");
  check(!d.ok, "uzantısız HTML sezgiyle yakalanmadı");

  // Ve arşiv .htm uzantısıyla da açılır.
  const e = unwrapArchive("yedek.htm", arsiv);
  check(e.ok && e.text.includes("Zehra"), ".htm uzantısı tanınmıyor");
}

/* ── 11. extractEmbedded bloğu olmayan metinde null ────────────────────────── */
{
  check(extractEmbedded("<html><body>hiç</body></html>") === null, "blok yokken null dönmedi");
  check(
    extractEmbedded(`<script type="application/json" id="${VERI_ID}"></script>`) === null,
    "boş blok null dönmedi"
  );
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
