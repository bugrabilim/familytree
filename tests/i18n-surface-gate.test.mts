import { readFileSync, readdirSync } from "node:fs";
import { tr, en } from "../lib/i18n-dict.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın ihlali değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * KAPI: çevrilmemiş arayüz metni — parite testinin GÖREMEDİĞİ boşluk.
 *
 * `tests/i18n.test.mts` `tr` ve `en` yarılarını karşılaştırır: bir anahtarın
 * bir yarıda eksik olmasını yakalar. Ama `ThemeToggle` için anahtar HİÇ
 * OLUŞTURULMAMIŞTI — `aria-label="Koyu temaya geç"` doğrudan JSX'e yazılmıştı.
 * Parite iki boş kümeyi karşılaştırıp yeşil verdi; EN dilinde yedi genel
 * sayfanın hepsinde ekran okuyucu Türkçe konuşmaya devam etti. Düğmenin ikon
 * dışında metni yok, yani bu onun TEK adıydı.
 *
 * Boşluk iki yönden birden kapatılıyor:
 *   1. Genel yüzeydeki bileşenler `aria-label` / `title`ı SABİT DİZE olarak
 *      yazamaz (Türkçe de İngilizce de — "Language" da yanlıştı).
 *   2. Kaynakta istenen HER statik `t("...")` anahtarı İKİ yarıda da var
 *      olmalı: "anahtar hiç oluşturulmadı" hâli artık yakalanıyor.
 */

/* ══ 1. Genel yüzeyde sabit erişilebilir ad YOK ═════════════════════════ */
/*
 * Kapsam iki halkalı. Dış halka, oturum AÇMADAN görülen yüzey: açılış/tanıtım,
 * kimlik ekranları, hukuki sayfalar, durum ekranları.
 *
 * İç halka B5'te eklendi: UYGULAMANIN İÇİ. İlk turda "ayrı bir iş" diye
 * kapsam dışı bırakılmıştı ve tam olarak orada birikti — kart üzerindeki
 * hızlı-ekleme düğmeleri ("Ebeveyn ekle", "Çocuk ekle"…), odak rozeti
 * ("odak", "Ağacın odak noktası"), çevre ipucu ("Çevre"), pencere kapatma
 * düğmesi ("Kapat") ve kişi formunun on yedi alan etiketi İngilizce arayüzde
 * Türkçe konuşuyordu. Bunların çoğunda sözlük karşılığı ZATEN VARDI
 * (`form.eventDateAria`, `form.parents`…) ama JSX'e bağlanmamıştı: yani
 * eksik olan çeviri değil, kablo idi — ve hiçbir test kabloyu aramıyordu.
 *
 * `PersonDrawer` bilerek dışarıda: tek sabit dizesi `title="Google Maps"`,
 * yani çevrilecek bir şey değil özel ad. Kapsama alınsaydı ya sahte bir
 * kırmızı ya da sahte bir anahtar üretirdi.
 */
const YUZEY = [
  "../components/ThemeToggle.tsx",
  "../components/LanguageSwitch.tsx",
  "../components/AuthShell.tsx",
  "../components/Landing.tsx",
  "../components/LegalPage.tsx",
  "../components/StatusScreen.tsx",
  "../components/NotFoundView.tsx",
  "../components/AboutDialog.tsx",
  "../app/login/LoginForm.tsx",
  "../app/register/RegisterForm.tsx",
  "../app/forgot-password/ForgotForm.tsx",
  /* İç halka (B5) — uygulama içi yüzey. */
  "../components/PersonNode.tsx",
  "../components/PersonForm.tsx",
  "../components/ui/Modal.tsx",
  "../components/CalendarView.tsx",
];
for (const f of YUZEY) {
  const src = kodu(read(f));
  const sabit: string[] = [];
  /*
   * (a) Düz öznitelik:  aria-label="Koyu tema"
   *
   * `label` ve `hint` de burada. Sebebi mutasyonla bulundu: kart üzerindeki
   * hızlı-ekleme düğmesi kendi bileşeni (`AddNub`) ve erişilebilir adını
   * `label` PROPUNDAN alıyor (`title={label} aria-label={label}`). Yalnız
   * `aria-label|title` aranınca `<AddNub label="Ebeveyn ekle">` mutasyonu
   * kapıdan geçiyordu — yani düzeltilen arızanın tam olarak kendisi geri
   * gelebiliyordu. Erişilebilir ad hangi propla taşınıyorsa kural onu da
   * kapsamalı.
   */
  for (const m of src.matchAll(/\b(aria-label|title|label|hint)="([^"]*)"/g)) sabit.push(`${m[1]}="${m[2]}"`);
  /*
   * (b) İfade içindeki dize: aria-label={dark ? "Açık temaya geç" : "…"}
   *
   * Bu dal olmadan mutasyon KAÇIYORDU: sabit metni süslü paranteze almak
   * (a)'yı atlatıp aynı arızayı geri getiriyordu. `t(` geçen ifadeler
   * geçerli — çeviri oradan zaten geliyor.
   */
  for (const m of src.matchAll(/\b(aria-label|title|label|hint)=\{([^}]*)\}/g)) {
    if (/\bt\(/.test(m[2])) continue;
    if (/"[^"]*[A-Za-zçğıöşüÇĞİÖŞÜ][^"]*"|'[^']*[A-Za-zçğıöşüÇĞİÖŞÜ][^']*'/.test(m[2]))
      sabit.push(`${m[1]}={${m[2].slice(0, 60)}}`);
  }
  check(sabit.length === 0, `${f.replace("../", "")}: erişilebilir ad sözlükten geliyor (sabit: ${sabit.join(", ")})`);
}

/* ══ 1b. GÖRÜNÜR etiketler de sözlükten ════════════════════════════════ */
/*
 * 1. bölüm yalnız ERİŞİLEBİLİR ADI (aria-label / title / label / hint)
 * kovalıyordu. `PersonForm`da yirmi görünür alan etiketi tam da bu yüzden
 * kapının dışında kalmıştı: "Soyad", "Cinsiyet", "Doğum tarihi", "Köken
 * bilgileri", "Din", "Meslek", "Hikâyesi", "İptal"… Hepsi `<label>` gövdesine
 * ya da `placeholder`a doğrudan yazılıydı, hiçbiri bir `aria-*` değildi ve
 * sözlükte karşılıkları BÜYÜK ÖLÇÜDE HAZIRDI — eksik olan kabloydu.
 * Sonuç: EN oturumda formun yarısı Türkçe konuşuyordu ve tek bir test bile
 * kırmızı vermiyordu.
 *
 * Bu yüzden kapsam iki yeni yere uzatıldı:
 *   (c) `placeholder="…"`  — ekranda okunan metin.
 *   (d) JSX metin düğümleri: `<label …>Soyad</label>`, `>İptal<` …
 *
 * (d)'de eleme dar tutuldu: yalnız HARF içeren, en az iki karakterlik ve
 * `{}` içermeyen düğümler. Noktalama/ayraç ("·", "—", "*") ve ifade
 * gövdeleri metin değil.
 */
const GORUNUR = ["../components/PersonForm.tsx"];
for (const f of GORUNUR) {
  const src = kodu(read(f));
  const sabit: string[] = [];
  for (const m of src.matchAll(/\bplaceholder="([^"]*[A-Za-zçğıöşüÇĞİÖŞÜ][^"]*)"/g)) sabit.push(`placeholder="${m[1]}"`);
  for (const m of src.matchAll(/\bplaceholder=\{([^}]*)\}/g)) {
    if (/\bt\(/.test(m[1])) continue;
    if (/"[^"]*[A-Za-zçğıöşüÇĞİÖŞÜ][^"]*"|'[^']*[A-Za-zçğıöşüÇĞİÖŞÜ][^']*'/.test(m[1])) sabit.push(`placeholder={${m[1].slice(0, 50)}}`);
  }
  /*
   * JSX metin düğümü. `>` ile `<` arasında, süslü parantez GEÇMEYEN parça:
   * `{t("…")}` ya da `{form.x}` gibi ifadeler zaten bu desene uymuyor.
   * TypeScript jenerikleri (`useState<Foo>(…)`) `<`/`>` taşıdığı için
   * eşleşen parçanın JSX'e benzemesi ayrıca aranıyor: içinde `(`/`)`/`=>`
   * geçenler kod, metin değil.
   */
  for (const m of src.matchAll(/>([^<>{}]+)</g)) {
    const t2 = m[1].replace(/\s+/g, " ").trim();
    if (t2.length < 2) continue;
    if (!/[A-Za-zçğıöşüÇĞİÖŞÜ]/.test(t2)) continue;
    if (/[()=;]|=>/.test(t2)) continue;
    sabit.push(`metin "${t2.slice(0, 40)}"`);
  }
  check(sabit.length === 0, `${f.replace("../", "")}: görünür etiketler sözlükten geliyor (sabit: ${sabit.join(", ")})`);
}
{
  /*
   * Ve bu turda BAĞLANAN anahtarlar gerçekten iki yarıda da dolu. Yalnız
   * varlık değil ÇEVRİLMİŞ olmaları da aranıyor: iki yarıya aynı Türkçeyi
   * yazmak pariteyi geçer, İngilizce kullanıcıya hiçbir şey kazandırmaz.
   */
  for (const k of [
    "form.lastNameBare", "form.lastNameOptional", "form.gender", "form.birthDate",
    "form.deathDate", "form.deathCause", "form.birthPlace", "form.originSection",
    "form.optional", "form.religion", "form.denomination", "form.language",
    "form.ethnicity", "form.nationality", "form.orientation", "form.occupation",
    "form.occupationPlaceholder", "form.patronymic", "form.congenital", "form.health",
    "form.healthNote", "form.bio", "form.cancel", "form.save", "form.update",
    "form.yearOnly", "form.eventsEmpty", "form.sourcesEmpty",
  ]) {
    check(!!tr[k]?.trim() && !!en[k]?.trim(), `${k}: TR+EN dolu`);
    check(tr[k] !== en[k], `${k}: iki yarı birbirinin kopyası değil`);
  }
}

/* ══ 2. Tema düğmesinin adı gerçekten çeviriden geliyor ═════════════════ */
{
  const src = kodu(read("../components/ThemeToggle.tsx"));
  check(/useT/.test(src), "ThemeToggle useT() kullanıyor");
  /*
   * İki hâl de çevrilmeli: yalnız biri bağlansaydı, koyu temadaki kullanıcı
   * İngilizce oturumda yine Türkçe duyardı — hatanın yarısı ayakta kalırdı.
   */
  check(/aria-label=\{dark \? t\("theme\.toLight"\) : t\("theme\.toDark"\)\}/.test(src),
    "aria-label iki hâlde de sözlükten");
  check(/title=\{dark \? t\("theme\.light"\) : t\("theme\.dark"\)\}/.test(src), "title iki hâlde de sözlükten");
}
{
  const src = kodu(read("../components/LanguageSwitch.tsx"));
  check(/aria-label=\{t\("lang\.group"\)\}/.test(src), "dil grubunun adı sözlükten (TR oturumda \"Language\" yazıyordu)");
}

/* ══ 3. İstenen HER statik anahtar İKİ yarıda da var ════════════════════ */
/*
 * Asıl kapı bu: parite yalnız VAR OLAN anahtarların iki yarısını karşılaştırır,
 * hiç oluşturulmamış anahtarı göremez. Burada yön ters — kaynağın istediği
 * anahtardan sözlüğe bakılıyor.
 *
 * Yalnız düz dizeler: `t(`auth.highlight.${k}.title`)` gibi şablonlar
 * çalışma anında kuruluyor, statik olarak çözülemez (parite testi onları
 * zaten kendi yarılarında yakalar).
 */
{
  const eksik: string[] = [];
  let sayi = 0;
  const gez = (d: string) => {
    for (const e of readdirSync(new URL(d + "/", import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) { gez(`${d}/${e.name}`); continue; }
      if (!/\.tsx?$/.test(e.name)) continue;
      const src = kodu(read(`${d}/${e.name}`));
      for (const m of src.matchAll(/\bt\(\s*"([^"]+)"/g)) {
        sayi++;
        const k = m[1];
        if (!(k in tr) || !(k in en)) eksik.push(`${d}/${e.name}: ${k}`);
      }
    }
  };
  for (const d of ["../app", "../components"]) gez(d);
  check(sayi > 1000, `taranan statik anahtar sayısı beklenen büyüklükte (${sayi})`);
  check(eksik.length === 0, `her istenen anahtarın iki karşılığı da var (eksik: ${eksik.slice(0, 6).join(" | ")})`);
}

/* ══ 4. Bu turda eklenen anahtarlar iki yarıda da DOLU ══════════════════ */
for (const k of ["theme.toDark", "theme.toLight", "theme.dark", "theme.light", "lang.group", "land.footer.appearance"]) {
  check(!!tr[k]?.trim() && !!en[k]?.trim(), `${k}: TR+EN dolu`);
  /* Ve gerçekten ÇEVRİLMİŞ olmalı — iki yarıya aynı Türkçeyi kopyalamak
     pariteyi geçerdi ama İngilizce kullanıcıya hiçbir şey kazandırmazdı. */
  check(tr[k] !== en[k], `${k}: iki yarı birbirinin kopyası değil`);
}

/* ══ 5. B5'te eklenen/bağlanan anahtarlar ══════════════════════════════ */
/*
 * Şablonla kurulan anahtarlar (`t(`date.rel.${r.kind}`)`) 3. bölümün statik
 * taramasına GÖRÜNMEZ; burada tek tek yazılı olmalarının sebebi bu. Takvim
 * rozetleri ("Bugün", "3 gün önce") tam olarak böyle kaçmıştı: metin
 * `lib/date.ts` içinde üretiliyordu, ortada anahtar yoktu, parite testi de
 * iki boş kümeyi karşılaştırıp yeşil veriyordu.
 */
for (const k of [
  "date.rel.today", "date.rel.tomorrow", "date.rel.yesterday",
  "date.rel.past", "date.rel.future",
  "node.addParent", "node.addChild", "node.addSpouse", "node.addSibling",
  "node.addAssociate", "node.focus", "node.focusTitle", "node.associate", "node.openHint",
  "modal.close", "ws.depth.label", "ws.depth.gen",
]) {
  check(!!tr[k]?.trim() && !!en[k]?.trim(), `${k}: TR+EN dolu`);
  check(tr[k] !== en[k], `${k}: iki yarı birbirinin kopyası değil`);
}

/* ══ 6. `lib/date.ts` DİLSİZ ═══════════════════════════════════════════ */
/*
 * Göreli gün metni oradan çıkıyordu ve saf bir kütüphanenin dili olamaz:
 * `useT()` bir React kancası, oraya giremez; iki dilin dizesini modüle
 * gömmek de "bütün metin tek sözlükte" kuralını kırardı ve üçüncü dil
 * eklendiğinde burası unutulurdu. Çözüm işlevin METİN değil KARAR
 * döndürmesi. İddia da o kararın geri metne dönmesini yakalıyor.
 */
{
  const d = read("../lib/date.ts");
  const govde = kodu(d);
  check(/export function relativeDays/.test(govde), "göreli gün kararı dilsiz bir işlevden geliyor");
  check(!/return "Bugün"|return "Yarın"|return "Dün"|gün önce`|gün sonra`/.test(govde),
    "lib/date.ts arayüz metni üretmiyor");
  /* Ve tek çağıran metni sözlükten kuruyor. */
  const cal = kodu(read("../components/CalendarView.tsx"));
  check(/relativeDays\(/.test(cal) && /date\.rel\./.test(cal), "takvim rozeti sözlükten besleniyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
