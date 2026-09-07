/**
 * TEK DOSYALIK HTML ARŞİVİ — "programsız açılan yedek".
 *
 * ## Neden bir biçim daha
 *
 * Elimizdeki dışa aktarımların hepsinin bir okuyucusu var: GEDCOM bir soy
 * ağacı programı ister, CSV/Excel bir hesap tablosu, JSON bir yazılımcı.
 * Kullanıcı dosyayı indirip bir klasöre attığında bunların hiçbiri "aç ve
 * bak" değil. Yedek dediğimiz şey, açılamadığı gün yedek değildir.
 *
 * HTML bu listede TEK başına ayrı duruyor: her işletim sisteminde, her
 * telefonda, kurulum gerektirmeden açılıyor — ve bugünden yirmi yıl sonra da
 * açılacak. Bu yüzden "insan tarafı" bu biçimde.
 *
 * ## Neden ham veri de İÇİNDE
 *
 * Bakılabilen ama geri yüklenemeyen bir yedek yarım yedektir. Dosyanın
 * sonuna `<script type="application/json">` içinde tam JSON gömülüyor:
 *
 *  · Tarayıcı `application/json` türündeki bir `script`i ÇALIŞTIRMAZ ve
 *    EKRANA BASMAZ — yani gömülü veri sayfanın görünümünü hiç bozmuyor.
 *  · `lib/import.ts` aynı bloğu geri okuyor; yani bu dosya hem bakılan hem
 *    geri yüklenebilen bir yedek.
 *
 * Çıkarma işi (`extractEmbedded`) bilerek BU dosyada: gömme ile çıkarma ayrı
 * dosyalara düşseydi, birinin biçimi değişince öteki sessizce kırılırdı.
 *
 * ## Neden maskelenmemiş veri
 *
 * `lib/privacy.ts` görüntü katmanı burada UYGULANMIYOR. Maskelenmiş bir
 * yedekten maskelenmiş bir ağaç geri gelir; yaşayan kişilerin tarihleri bir
 * daha bulunamaz. Dosya zaten ağacı görebilen birinin eline geçiyor —
 * mevcut GEDCOM/CSV/JSON aktarımları da aynı kuralı izliyor.
 *
 * ## Neden fotoğraflar gömülü değil
 *
 * Fotoğraflar Cloudinary'de ve bağlantı olarak yazılıyor. Yüzlerce görseli
 * `data:` olarak gömmek dosyayı yüz megabaytlara çıkarır ve sunucusuz işlevin
 * süresini aşar. Dosya, ağı olan bir tarayıcıda resimli; ağsız açıldığında
 * metnin tamamı yine yerinde — kaybolan şey yalnız görseller.
 *
 * ## Bağımlılık
 *
 * Yalnız saf `./name.ts` + `./date.ts` (ve tür-düzeyi `@/types`). Böylece
 * `tests/export-html.test.mts` dosyayı doğrudan içe aktarıp sınayabiliyor.
 */

import type { Person } from "@/types/family";
import { fullName, primaryName, secondaryName } from "./name.ts";
import { lifeSpan, storedToDisplay } from "./date.ts";

/** Gömülü veri bloğunun `id`si. Değiştirilirse eski dosyalar okunamaz olur. */
export const VERI_ID = "soyagaci-veri";

/** Gömülü verinin biçim damgası — `exportJson` ile aynı ad/sürüm. */
export const VERI_BICIM = "soyagaci-json";

export interface HtmlExportOpts {
  /** Belgenin başlığında görünecek ağaç adı. */
  treeName?: string;
  /** Üretim anı — testlerin sabit çıktı alabilmesi için parametre. */
  generatedAt?: Date;
  lang?: "tr" | "en";
}

/* ── Etiketler ─────────────────────────────────────────────────────────────
 *
 * Bu tablo bilerek `lib/i18n-dict.ts`te DEĞİL: oradaki anahtarlar React
 * arayüzünün sözlüğü, buradakiler ise üretilen belgenin içine YAZILAN metin.
 * Karıştırmak, arayüzde hiç kullanılmayan kırk anahtarı sözlüğe taşırdı.
 * Parite kuralı yine geçerli — `tests/export-html.test.mts` tr/en anahtar
 * eşitliğini sınıyor.
 */
const TR = {
  belge: "Aile Ağacı Arşivi",
  uretildi: "Oluşturulma",
  kisiSayisi: "kişi",
  ara: "Ara…",
  sonucYok: "Eşleşen kişi yok.",
  dizin: "Dizin",
  ozet: "Özet",
  toplam: "Toplam kişi",
  uye: "Aile üyesi",
  cevre: "Yakın çevre",
  yasayan: "Yaşayan",
  vefat: "Vefat eden",
  aciklama:
    "Bu dosya ailenizin tam kaydıdır. İnternet olmadan da açılır; " +
    "fotoğraflar yalnızca bağlantı olarak durur. Dosyanın içinde ham veri de " +
    "gömülüdür — uygulamada “İçe aktar” ile bu HTML dosyasını seçerek ağacı " +
    "geri yükleyebilirsiniz.",
  kimlik: "Kimlik",
  kod: "Kod",
  cinsiyet: "Cinsiyet",
  erkek: "Erkek",
  kadin: "Kadın",
  diger: "Diğer",
  bilinmiyor: "Bilinmiyor",
  lakap: "Lakap",
  babaAdi: "Baba adı",
  sulale: "Sülale",
  yonelim: "Yönelim",
  tarihler: "Tarihler",
  dogum: "Doğum",
  resmiDogum: "Nüfusa göre doğum",
  dogumSaati: "Doğum saati",
  olum: "Vefat",
  yerler: "Yerler",
  dogumYeri: "Doğum yeri",
  defin: "Defin yeri",
  yasam: "Yaşam",
  meslek: "Meslek",
  egitim: "Eğitim",
  din: "Din",
  mezhep: "Mezhep",
  dil: "Ana dil",
  etnik: "Etnik köken",
  uyruk: "Uyruk",
  saglik: "Sağlık",
  dogustan: "Doğuştan",
  sonradan: "Sonradan",
  olumNedeni: "Vefat nedeni",
  saglikNotu: "Sağlık notu",
  baglar: "Bağlar",
  anneBaba: "Anne / baba",
  es: "Eş",
  eskiEs: "Eski eş",
  cocuk: "Çocuk",
  cevreBagi: "Yakın çevre",
  hayat: "Yaşam öyküsü",
  olaylar: "Yaşam olayları",
  kaynaklar: "Kaynaklar",
  anilar: "Anılar",
  medya: "Medya",
  fotograf: "Fotoğraf",
  video: "Video",
  belgeler: "Belgeler",
  ses: "Sesli anı",
  isimsiz: "İsimsiz",
  gizliKayit: "Gizli kayıt",
} as const;

const EN: Record<keyof typeof TR, string> = {
  belge: "Family Tree Archive",
  uretildi: "Created",
  kisiSayisi: "people",
  ara: "Search…",
  sonucYok: "No matching person.",
  dizin: "Index",
  ozet: "Summary",
  toplam: "Total people",
  uye: "Family member",
  cevre: "Close circle",
  yasayan: "Living",
  vefat: "Deceased",
  aciklama:
    "This file is the complete record of your family. It opens without an " +
    "internet connection; photos are kept as links only. The raw data is " +
    "embedded inside the file — you can restore the tree by choosing this " +
    "HTML file under “Import” in the app.",
  kimlik: "Identity",
  kod: "Code",
  cinsiyet: "Gender",
  erkek: "Male",
  kadin: "Female",
  diger: "Other",
  bilinmiyor: "Unknown",
  lakap: "Nickname",
  babaAdi: "Patronymic",
  sulale: "Lineage",
  yonelim: "Orientation",
  tarihler: "Dates",
  dogum: "Birth",
  resmiDogum: "Official birth date",
  dogumSaati: "Time of birth",
  olum: "Death",
  yerler: "Places",
  dogumYeri: "Birthplace",
  defin: "Burial place",
  yasam: "Life",
  meslek: "Occupation",
  egitim: "Education",
  din: "Religion",
  mezhep: "Denomination",
  dil: "Mother tongue",
  etnik: "Ethnicity",
  uyruk: "Nationality",
  saglik: "Health",
  dogustan: "Congenital",
  sonradan: "Acquired",
  olumNedeni: "Cause of death",
  saglikNotu: "Health note",
  baglar: "Relations",
  anneBaba: "Parents",
  es: "Spouse",
  eskiEs: "Former spouse",
  cocuk: "Children",
  cevreBagi: "Close circle",
  hayat: "Life story",
  olaylar: "Life events",
  kaynaklar: "Sources",
  anilar: "Memories",
  medya: "Media",
  fotograf: "Photo",
  video: "Video",
  belgeler: "Documents",
  ses: "Voice memory",
  isimsiz: "Unnamed",
  gizliKayit: "Confidential record",
};

export const ETIKETLER = { tr: TR, en: EN };

/* ── Kaçışlar ──────────────────────────────────────────────────────────────
 *
 * Kişi adları, notlar ve yer adları kullanıcı metnidir; `<`, `&` ve tırnak
 * kaçırılmazsa hem belgeyi bozar hem de dosyayı açan tarayıcıda betik
 * çalıştırır. `esc` hem gövde metni hem öznitelik için kullanılıyor: ikisini
 * ayırmak, "hangisiydi" hatasının kapısını açar.
 */
function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Bağlantılar için: yalnız `http(s)` geçer.
 *
 * `javascript:` ve `data:` şemaları elenir — kayıttaki bir URL alanı, dosyayı
 * açan kişinin tarayıcısında betik çalıştırma yoluna dönüşmemeli.
 */
function url(s?: string): string {
  const v = (s ?? "").trim();
  return /^https?:\/\//i.test(v) ? esc(v) : "";
}

const CINSIYET: Record<string, keyof typeof TR> = {
  male: "erkek",
  female: "kadin",
  other: "diger",
  unknown: "bilinmiyor",
};

/* ── Belge parçaları ───────────────────────────────────────────────────────── */

type Etiket = Record<keyof typeof TR, string>;

/** `<dt>/<dd>` çifti — değer boşsa hiç yazılmaz (boş satır göstermeyiz). */
function satir(baslik: string, deger?: string): string {
  const v = (deger ?? "").trim();
  return v ? `<div class="s"><dt>${esc(baslik)}</dt><dd>${esc(v)}</dd></div>` : "";
}

/** Kişi bağlantısı — ad tıklanınca belgenin içinde o kişiye atlar. */
function bag(p: Person | undefined, L: Etiket): string {
  if (!p) return "";
  const ad = fullName(p) || L.isimsiz;
  const yil = lifeSpan(p.birthDate, p.deathDate);
  return `<a href="#k-${esc(p.id)}">${esc(ad)}</a>${yil ? ` <span class="y">(${esc(yil)})</span>` : ""}`;
}

function bagSatiri(baslik: string, kisiler: Person[], L: Etiket): string {
  if (kisiler.length === 0) return "";
  const liste = kisiler.map((k) => bag(k, L)).join(", ");
  return `<div class="s"><dt>${esc(baslik)}</dt><dd>${liste}</dd></div>`;
}

function bolum(baslik: string, icerik: string): string {
  return icerik.trim()
    ? `<section class="b"><h3>${esc(baslik)}</h3><dl>${icerik}</dl></section>`
    : "";
}

function medyaBolumu(baslik: string, adresler: string[], L: Etiket): string {
  const gecerli = adresler.map(url).filter(Boolean);
  if (gecerli.length === 0) return "";
  const ogeler = gecerli
    .map((u, i) => `<li><a href="${u}" target="_blank" rel="noopener">${esc(baslik)} ${i + 1}</a></li>`)
    .join("");
  void L;
  return `<section class="b"><h3>${esc(baslik)}</h3><ul class="m">${ogeler}</ul></section>`;
}

function kisiBolumu(p: Person, byId: Map<string, Person>, cocuklar: Person[], L: Etiket): string {
  const ust = primaryName(p) || L.isimsiz;
  const alt = secondaryName(p);
  const yil = lifeSpan(p.birthDate, p.deathDate);
  const foto = url(p.photo);

  const kimlik =
    satir(L.kod, p.code) +
    satir(L.cinsiyet, L[CINSIYET[p.gender] ?? "bilinmiyor"]) +
    satir(L.lakap, p.nickname) +
    satir(L.babaAdi, p.patronymic) +
    satir(L.sulale, p.lineage) +
    satir(L.yonelim, p.orientation);

  const tarihler =
    satir(L.dogum, storedToDisplay(p.birthDate)) +
    satir(L.resmiDogum, storedToDisplay(p.officialBirthDate)) +
    satir(L.dogumSaati, p.birthTime) +
    satir(L.olum, storedToDisplay(p.deathDate));

  const yerler = satir(L.dogumYeri, p.birthPlace) + satir(L.defin, p.burialPlace);

  const yasam =
    satir(L.meslek, p.occupation) +
    satir(L.egitim, p.education) +
    satir(L.din, p.religion) +
    satir(L.mezhep, p.denomination) +
    satir(L.dil, p.language) +
    satir(L.etnik, p.ethnicity) +
    satir(L.uyruk, p.nationality);

  const saglik =
    satir(L.dogustan, p.congenitalCondition) +
    satir(L.sonradan, p.healthCondition) +
    satir(L.olumNedeni, p.deathCause) +
    satir(L.saglikNotu, p.healthNote);

  const kisi = (id: string) => byId.get(id);
  const baglar =
    bagSatiri(L.anneBaba, (p.parentIds ?? []).map(kisi).filter((x): x is Person => !!x), L) +
    bagSatiri(L.es, (p.spouseIds ?? []).map(kisi).filter((x): x is Person => !!x), L) +
    bagSatiri(L.eskiEs, (p.formerSpouseIds ?? []).map(kisi).filter((x): x is Person => !!x), L) +
    bagSatiri(L.cocuk, cocuklar, L) +
    bagSatiri(
      L.cevreBagi,
      (p.associations ?? []).map((a) => kisi(a.personId)).filter((x): x is Person => !!x),
      L
    );

  const olaylar = (p.events ?? [])
    .map((e) => {
      const bas = [storedToDisplay(e.date), e.title || e.type].filter(Boolean).join(" — ");
      const ek = [e.place, e.note].filter(Boolean).join(" · ");
      return `<li>${esc(bas)}${ek ? ` <span class="y">${esc(ek)}</span>` : ""}</li>`;
    })
    .join("");

  const kaynaklar = (p.sources ?? [])
    .map((s) => {
      const u = url(s.url);
      const bas = u ? `<a href="${u}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title);
      const ek = [s.kind, s.note].filter(Boolean).join(" · ");
      return `<li>${bas}${ek ? ` <span class="y">${esc(ek)}</span>` : ""}</li>`;
    })
    .join("");

  const anilar = (p.memories ?? [])
    .map((m) => {
      const u = url(m.audio);
      const bas = [storedToDisplay(m.date), m.prompt].filter(Boolean).join(" — ");
      const govde = m.text ? `<p>${esc(m.text)}</p>` : "";
      const sesBag = u ? `<p><a href="${u}" target="_blank" rel="noopener">${esc(L.ses)}</a></p>` : "";
      return `<li>${bas ? `<strong>${esc(bas)}</strong>` : ""}${govde}${sesBag}</li>`;
    })
    .join("");

  const liste = (baslik: string, ogeler: string) =>
    ogeler ? `<section class="b"><h3>${esc(baslik)}</h3><ul class="m">${ogeler}</ul></section>` : "";

  /*
   * `data-ara`: arama kutusunun eşleştirdiği metin. Küçük harfe ÇEVİRMİYORUZ
   * — betik `toLowerCase()` uyguladığında Türkçe "I/İ" ikilisi kaynak metinde
   * de aynı dönüşümden geçmiş olsun diye eşleştirme betiğin içinde yapılıyor.
   */
  const aranan = [fullName(p), p.code, p.birthPlace, p.occupation, p.lineage, p.nickname]
    .filter(Boolean)
    .join(" ");

  return `
<article class="k" id="k-${esc(p.id)}" data-ara="${esc(aranan)}">
  <header>
    ${foto ? `<img src="${foto}" alt="" loading="lazy">` : `<div class="ph"></div>`}
    <div>
      <h2>${esc(ust)}${alt ? ` <span class="sn">${esc(alt)}</span>` : ""}</h2>
      <p class="y">${esc(yil)}${p.confidential ? ` · ${esc(L.gizliKayit)}` : ""}</p>
    </div>
  </header>
  ${bolum(L.kimlik, kimlik)}
  ${bolum(L.tarihler, tarihler)}
  ${bolum(L.yerler, yerler)}
  ${bolum(L.yasam, yasam)}
  ${bolum(L.saglik, saglik)}
  ${bolum(L.baglar, baglar)}
  ${p.bio ? `<section class="b"><h3>${esc(L.hayat)}</h3><p>${esc(p.bio)}</p></section>` : ""}
  ${liste(L.olaylar, olaylar)}
  ${liste(L.kaynaklar, kaynaklar)}
  ${liste(L.anilar, anilar)}
  ${medyaBolumu(L.fotograf, p.photos ?? [], L)}
  ${medyaBolumu(L.video, p.videos ?? [], L)}
  ${medyaBolumu(L.belgeler, p.documents ?? [], L)}
</article>`;
}

const STIL = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#f6f4ef;color:#22201c;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.w{max-width:900px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:26px;margin:0 0 4px}
h2{font-size:18px;margin:0}
h3{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#8a8378;margin:0 0 6px}
a{color:#7a5c2e}
.lead{color:#5f594f;margin:0 0 20px;max-width:60ch}
.sum{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px;padding:0;list-style:none}
.sum li{background:#fff;border:1px solid #e3ded4;border-radius:10px;padding:8px 12px;font-size:13px}
.sum b{display:block;font-size:20px}
#q{width:100%;padding:10px 12px;font-size:15px;border:1px solid #d8d2c6;border-radius:10px;background:#fff;margin:0 0 20px}
.idx{columns:3 190px;gap:14px;margin:0 0 28px;padding:0;list-style:none;font-size:13px}
.idx li{break-inside:avoid;margin-bottom:2px}
.k{background:#fff;border:1px solid #e3ded4;border-radius:14px;padding:16px;margin:0 0 14px}
.k>header{display:flex;gap:12px;align-items:center;margin-bottom:12px}
.k img,.ph{width:56px;height:56px;border-radius:12px;object-fit:cover;background:#eae5db;flex:none}
.sn{font-weight:400;color:#5f594f}
.y{color:#8a8378;font-size:13px;margin:2px 0 0}
.b{margin:0 0 10px}
.b:last-child{margin-bottom:0}
dl{margin:0}
.s{display:flex;gap:8px;font-size:14px;padding:1px 0}
dt{color:#8a8378;flex:0 0 34%;max-width:190px}
dd{margin:0;flex:1}
.m{margin:0;padding-left:18px;font-size:14px}
.m p{margin:2px 0}
.hide{display:none}
#bos{display:none;color:#8a8378}
@media print{body{background:#fff}.k{break-inside:avoid;border-color:#ccc}#q,.idx{display:none}}
`;

/*
 * ARAMA BETİĞİ — tek girdi, tek geçiş. Dosyanın ağsız da çalışması gerektiği
 * için hiçbir kütüphane yok. Türkçe küçültme (`tr`) her iki tarafa da
 * uygulanıyor: yalnız girdiyi küçültmek "İzmir" araması "izmir"i bulmuyor
 * demek olurdu.
 */
const BETIK = `
(function(){
  var q=document.getElementById('q'),bos=document.getElementById('bos');
  if(!q)return;
  var ks=[].slice.call(document.querySelectorAll('.k'));
  var kk=function(s){try{return s.toLocaleLowerCase('tr')}catch(e){return s.toLowerCase()}};
  ks.forEach(function(k){k._a=kk(k.getAttribute('data-ara')||'')});
  q.addEventListener('input',function(){
    var t=kk(q.value.trim()),n=0;
    ks.forEach(function(k){
      var g=!t||k._a.indexOf(t)>-1;
      k.classList.toggle('hide',!g);
      if(g)n++;
    });
    bos.style.display=n?'none':'block';
  });
})();
`;

/** ISO tarihini "GG.AA.YYYY SS:DD" olarak yazar (yerel değil, UTC — sabit çıktı). */
function damga(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/**
 * Ağacın tamamını tek bir HTML belgesine yazar.
 *
 * Dönen dize eksiksiz bir belgedir (`<!doctype html>` … `</html>`): dosyaya
 * yazılıp çift tıklanabilir.
 */
export function exportHtml(people: Person[], opts: HtmlExportOpts = {}): string {
  const L = opts.lang === "en" ? EN : TR;
  const dil = opts.lang === "en" ? "en" : "tr";
  const ad = (opts.treeName ?? "").trim();
  const baslik = ad ? `${ad} — ${L.belge}` : L.belge;

  const byId = new Map(people.map((p) => [p.id, p]));

  /* Çocuk listesi tek geçişte kuruluyor: kişi başına tüm ağacı taramak
     büyük ağaçta O(n²) olurdu. */
  const cocukları = new Map<string, Person[]>();
  for (const p of people) {
    for (const pid of p.parentIds ?? []) {
      const dizi = cocukları.get(pid);
      if (dizi) dizi.push(p);
      else cocukları.set(pid, [p]);
    }
  }

  const sirali = [...people].sort((a, b) =>
    fullName(a).localeCompare(fullName(b), dil === "en" ? "en" : "tr")
  );

  const uye = people.filter((p) => p.kind !== "cevre").length;
  const cevre = people.length - uye;
  const vefat = people.filter((p) => !!p.deathDate).length;

  const ozet = [
    { s: people.length, l: L.toplam },
    { s: uye, l: L.uye },
    { s: cevre, l: L.cevre },
    { s: people.length - vefat, l: L.yasayan },
    { s: vefat, l: L.vefat },
  ]
    .filter((x) => x.s > 0 || x.l === L.toplam)
    .map((x) => `<li><b>${x.s}</b>${esc(x.l)}</li>`)
    .join("");

  const dizin = sirali
    .map((p) => `<li>${bag(p, L)}</li>`)
    .join("");

  const govde = sirali
    .map((p) => kisiBolumu(p, byId, cocukları.get(p.id) ?? [], L))
    .join("");

  /*
   * GÖMÜLÜ VERİ — `<` dizisi `\\u003c`e çevriliyor. Bu, bir kişinin notunda
   * geçen `</script>` metninin bloğu erkenden kapatmasını engelliyor;
   * `\\u003c` JSON dize kaçışı olduğu için `JSON.parse` onu kendiliğinden
   * geri çözüyor, ayrı bir çözme adımı gerekmiyor.
   */
  const veri = JSON.stringify({ format: VERI_BICIM, version: 1, people }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="${dil}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="${esc(VERI_BICIM)}">
<title>${esc(baslik)}</title>
<style>${STIL}</style>
</head>
<body>
<div class="w">
<h1>${esc(baslik)}</h1>
<p class="y">${esc(L.uretildi)}: ${esc(damga(opts.generatedAt ?? new Date()))} · ${people.length} ${esc(L.kisiSayisi)}</p>
<p class="lead">${esc(L.aciklama)}</p>
<ul class="sum">${ozet}</ul>
<input id="q" type="search" placeholder="${esc(L.ara)}" autocomplete="off">
<p id="bos">${esc(L.sonucYok)}</p>
<h3>${esc(L.dizin)}</h3>
<ul class="idx">${dizin}</ul>
${govde}
</div>
<script type="application/json" id="${VERI_ID}">${veri}</script>
<script>${BETIK}</script>
</body>
</html>
`;
}

/**
 * Arşiv HTML'inden gömülü JSON'u çıkarır. Blok yoksa `null`.
 *
 * `lib/import.ts` bunu kullanıyor; dönen dize doğrudan `parseJson`e verilir.
 * Kaçırılmış `\\u003c` dizileri JSON'un kendi kaçışı olduğundan burada elle
 * çözülmüyor.
 */
export function extractEmbedded(html: string): string | null {
  const re = new RegExp(
    `<script[^>]*\\bid=["']${VERI_ID}["'][^>]*>([\\s\\S]*?)<\\/script>`,
    "i"
  );
  const m = re.exec(html);
  const govde = m?.[1]?.trim();
  return govde ? govde : null;
}
