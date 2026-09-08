import { readFileSync } from "node:fs";
import {
  isLiving, isMasked, maskPerson, stripPrivateFields, viewPerson, viewAll,
} from "../lib/privacy.ts";
import { PRIVATE_GROUPS } from "../types/family.ts";
import { tr, en } from "../lib/i18n-dict.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) ok++; else { fail++; console.log(`✗ ${msg}: bekl ${w}, geldi ${g}`); }
}

/**
 * `maskPerson`'ın taşımasına İZİN VERİLEN alanlar. Bu liste, kaynak koddaki
 * beyaz listenin aynadaki hâlidir: yeni bir hassas alan eklenip yanlışlıkla
 * maskeye sızarsa test kırılır.
 */
const ALLOWED = new Set([
  "id", "firstName", "lastName", "gender", "parentIds", "spouseIds",
  "code", "nickname", "patronymic", "deathDate", "confidential", "kind",
  "parentLinks", "formerSpouseIds",
]);

/** Hassas alanlar — hepsine iz bırakan bir değer konur. */
const SENSITIVE: Record<string, unknown> = {
  birthDate: "GIZLI-1900-01-01",
  officialBirthDate: "GIZLI-1899",
  birthPlace: "GIZLI-Sivas",
  burialPlace: "GIZLI-Mezarlik",
  photo: "https://gizli.example/foto.jpg",
  photos: ["https://gizli.example/a.jpg"],
  videos: ["https://gizli.example/v.mp4"],
  documents: ["https://gizli.example/d.pdf"],
  bio: "GIZLI hikaye",
  occupation: "GIZLI meslek",
  education: "GIZLI okul",
  congenitalCondition: "GIZLI dogustan",
  healthCondition: "GIZLI saglik",
  healthNote: "GIZLI not",
  deathCause: "GIZLI olum nedeni",
  orientation: "GIZLI yonelim",
  memories: [{ id: "m1", prompt: "childhood", text: "GIZLI ani" }],
  events: [{ id: "e1", type: "goc-tasinma", date: "1950" }],
  sources: [{ id: "s1", title: "GIZLI kaynak" }],
  associations: [{ id: "a1", personId: "x", type: "kirve" }],
  phone: "GIZLI-05551112233",
  email: "gizli@example.com",
  address: "GIZLI adres",
  notes: "GIZLI notlar",
};

const full = (over: Partial<Person> = {}): Person => ({
  id: "p1", firstName: "Ali", lastName: "Yılmaz", gender: "male",
  parentIds: ["par"], spouseIds: ["es"], formerSpouseIds: ["eski"],
  nickname: "Topal", patronymic: "Veli oğlu", code: "K1",
  parentLinks: { par: { kind: "biological" } },
  ...SENSITIVE, ...over,
} as unknown as Person);

/* --- ASIL KORUMA: beyaz liste dışına hiçbir alan çıkmamalı -------------- */

const masked = maskPerson(full());
const leaked = Object.keys(masked).filter((k) => !ALLOWED.has(k));
eq(leaked, [], "maskede beyaz liste dışı alan yok");

// Değer düzeyinde: hiçbir "GIZLI" izi serileştirilmiş çıktıda kalmamalı
const blob = JSON.stringify(masked);
check(!blob.includes("GIZLI"), "maskelenmiş çıktıda hassas değer izi yok");
check(!blob.includes("gizli.example"), "maskelenmiş çıktıda medya adresi yok");

// Ağaç yapısı korunmalı — maskeleme bağları koparmamalı
eq(masked.parentIds, ["par"], "ebeveyn bağı korunur");
eq(masked.spouseIds, ["es"], "eş bağı korunur");
eq(masked.formerSpouseIds, ["eski"], "eski eş bağı korunur");
eq(masked.id, "p1", "kimlik korunur");
eq(masked.firstName, "Ali", "ad korunur");
// associations BİLEREK taşınmaz — gizli kişinin çevresi sızmasın
check(!("associations" in masked), "çevre bağları maskede taşınmaz");

/* --- viewPerson: iki yolun birleşimi ------------------------------------ */

const yasayan = full({ deathDate: undefined });
const vefat = full({ deathDate: "2010-01-01" });

check(isLiving(yasayan) && !isLiving(vefat), "yaşıyor/vefat ayrımı");

// Gizleme AÇIK: yaşayan maskelenir, vefat eden maskelenmez
check(!JSON.stringify(viewPerson(yasayan, true)).includes("GIZLI"),
  "gizleme açıkken yaşayan maskelenir");
check(JSON.stringify(viewPerson(vefat, true)).includes("GIZLI"),
  "gizleme açıkken vefat eden maskelenmez");

// Gizleme KAPALI: yaşayan da maskelenmez
check(JSON.stringify(viewPerson(yasayan, false)).includes("GIZLI"),
  "gizleme kapalıyken yaşayan maskelenmez");

// confidential her hâlükârda maskelenir
const gizliKisi = full({ deathDate: "2010-01-01", confidential: true });
check(!JSON.stringify(viewPerson(gizliKisi, false)).includes("GIZLI"),
  "confidential kişi gizleme kapalıyken bile maskelenir");
check(isMasked(gizliKisi, false), "confidential her zaman maskeli");

/* --- Alan-bazlı gizlilik (privateFields) -------------------------------- */

const kismi = full({ deathDate: "2010-01-01", privateFields: ["health"] });
const kismiView = JSON.stringify(viewPerson(kismi, false));
check(!kismiView.includes("GIZLI saglik"), "health grubu gizlenir");
check(!kismiView.includes("GIZLI olum nedeni"), "ölüm nedeni health grubunda");
check(kismiView.includes("GIZLI hikaye"), "gizlenmeyen grup kalır");

/* --- Idempotentlik: sunucu + istemci iki kez uygular -------------------- */

const once = viewPerson(yasayan, true);
const twice = viewPerson(once, true);
eq(twice, once, "maskeleme iki kez uygulanınca değişmez");
// Maskelenmiş kopyada da isMasked doğru çalışmalı (deathDate/confidential korunur)
eq(isMasked(once, true), true, "maskelenmiş kopyada da maskeli görünür");
eq(isMasked(maskPerson(vefat), true), false, "vefat eden maskeli kopyada da vefat");

eq(viewAll([yasayan, vefat], true).length, 2, "viewAll liste döndürür");
check(!JSON.stringify(viewAll([yasayan], true)).includes("GIZLI"), "viewAll maskeler");
eq(viewAll([], true), [], "boş liste");

/* --- Yapısal kilit: herkese açık yüzey SUNUCUDA maskelemeli ------------- */

/*
 * Bu denetim ÖNCE yalnız `/g/[token]` için yazılmıştı ve tam da bu yüzden
 * bir sızıntı fark edilmeden yaşadı: `Workspace`e ham dizi veren İKİNCİ bir
 * sunucu sayfası daha vardı (`/p/[treeId]`, eşleşmiş komşu ağacın
 * görünümü). Orada sınır başka bir HESAP; `confidential` işaretli bir
 * kişinin sağlık kaydı, hikâyesi, doğum tarihi ve yeri RSC yüküne
 * giriyordu.
 *
 * Ders: kural bir dosyaya değil, "Workspace'e kişi veren her sunucu
 * sayfası"na ait. Liste bu yüzden çoğul.
 */
const SUNUCU_SAYFALARI = [
  "../app/g/[token]/page.tsx",   // girişsiz paylaşım
  "../app/p/[treeId]/page.tsx",  // eşleşmiş komşu ağaç (başka hesap)
];

for (const yol of SUNUCU_SAYFALARI) {
  const src = readFileSync(new URL(yol, import.meta.url), "utf8");
  check(/viewAll\s*\(/.test(src), `${yol} viewAll ile SUNUCUDA maskeliyor`);
  check(!/people=\{people\}/.test(src), `${yol} ham people dizisini vermiyor`);
  /*
   * MASKELENMİŞ DİZİYİ VERİYOR — ama artık doğrudan `safePeople` olmak
   * zorunda değil.
   *
   * `/g/` paylaşım kapsamı geldiğinden beri kişi listesi kapsam dışıysa BOŞ
   * geçiyor (`needsPeople`). Bu iddia `people={safePeople}` diye yazılıydı ve
   * o düzeltmeyi kırmızıya düşürüyordu — oysa kural "maskeliden türeyen bir
   * dizi ver", "tam olarak şu değişkeni ver" değil.
   *
   * Kilitlenen şey: ana alana giden dizi ya `safePeople`in kendisi ya da
   * ondan türetilmiş bir değişken olmalı; ham `people` ASLA.
   */
  {
    const m = src.match(/people=\{([A-Za-z0-9_]+)\}/);
    const degisken = m?.[1] ?? "";
    check(!!degisken, `${yol} Workspace'e bir kişi dizisi veriyor`);
    const turemis =
      degisken === "safePeople" ||
      new RegExp(`(const|let)\\s+${degisken}\\s*=[^;]*safePeople`).test(src);
    check(turemis, `${yol} verdiği dizi maskeliden (safePeople) türüyor`);
  }
  // Sunucu bileşeni olmalı: "use client" olsaydı ham veri zaten tarayıcıda olurdu.
  check(!/^\s*"use client"/m.test(src), `${yol} sunucu bileşeni`);
}

// Gizlilik tek kaynaktan gelmeli — istemci kendi kopyasını kurmamalı
const ctx = readFileSync(new URL("../components/PrivacyContext.tsx", import.meta.url), "utf8");
check(/viewPerson\s*\(/.test(ctx), "PrivacyContext tek kaynağı (viewPerson) kullanıyor");
check(!/isMasked\([^)]*\)\s*\?\s*maskPerson/.test(ctx),
  "istemcide maskeleme mantığı tekrarlanmıyor");

/* --- SINIF KORUMASI: hassas alanların hiçbiri gruplarsız kalmasın --------- */

/**
 * `maskPerson` beyaz liste olduğu için yeni alanlar orada varsayılan gizli.
 * Ama `stripPrivateFields` KARA listedir: eşlemede adı geçmeyen bir alan
 * hiçbir grupla gizlenemez ve sessizce açıkta kalır.
 *
 * `birthCoords` tam olarak böyle kaçmıştı: `birthPlace` grubu metni
 * gizlerken koordinat kopyada duruyordu — yani aynı bilgi daha yüksek
 * çözünürlükle. Bu tablo o hatanın tekrarını engeller.
 */
const MUST_BE_COVERABLE: Record<string, unknown> = {
  bio: "GIZLI hikaye",
  congenitalCondition: "GIZLI dogustan",
  healthCondition: "GIZLI saglik",
  healthNote: "GIZLI not",
  deathCause: "GIZLI olum nedeni",
  photo: "https://gizli.example/foto.jpg",
  photos: ["https://gizli.example/a.jpg"],
  videos: ["https://gizli.example/v.mp4"],
  documents: ["https://gizli.example/d.pdf"],
  orientation: "GIZLI yonelim",
  memories: [{ id: "m1", text: "GIZLI ani" }],
  events: [{ id: "e1", type: "goc-tasinma", date: "1950" }],
  birthPlace: "GIZLI-Sivas",
  birthCoords: { lat: 39.8878, lng: 37.7561 },
  burialPlace: "GIZLI-Mezarlik",
  burialCoords: { lat: 40.1, lng: 38.2 },
  // KVKK md. 6 — özel nitelikli kişisel veri
  religion: "GIZLI din",
  denomination: "GIZLI mezhep",
  ethnicity: "GIZLI koken",
  nationality: "GIZLI uyruk",
  language: "GIZLI dil",
};

const base = (over: Partial<Person> = {}): Person => ({
  id: "p9", firstName: "Ali", lastName: "Yılmaz", gender: "male",
  parentIds: [], spouseIds: [], ...MUST_BE_COVERABLE, ...over,
} as unknown as Person);

// Her alan EN AZ BİR grupla gizlenebilmeli
const groups = [...PRIVATE_GROUPS];
const uncovered: string[] = [];
for (const field of Object.keys(MUST_BE_COVERABLE)) {
  const hidden = groups.some((g) => {
    const v = stripPrivateFields(base({ privateFields: [g] })) as unknown as Record<string, unknown>;
    return v[field] === undefined;
  });
  if (!hidden) uncovered.push(field);
}
eq(uncovered, [], "hassas alanların hepsi bir grupla gizlenebiliyor");

// Koordinat, metniyle AYNI grupta olmalı — ayrı kalırsa biri açıkta unutulur
const bp = stripPrivateFields(base({ privateFields: ["birthPlace"] })) as unknown as Record<string, unknown>;
eq(bp.birthPlace, undefined, "birthPlace grubu metni gizler");
eq(bp.birthCoords, undefined, "birthPlace grubu KOORDİNATI da gizler");

const bur = stripPrivateFields(base({ privateFields: ["burialPlace"] })) as unknown as Record<string, unknown>;
eq(bur.burialPlace, undefined, "burialPlace grubu metni gizler");
eq(bur.burialCoords, undefined, "burialPlace grubu koordinatı da gizler");

// KVKK özel nitelikli veriler
const bel = stripPrivateFields(base({ privateFields: ["belief"] })) as unknown as Record<string, unknown>;
eq(bel.religion, undefined, "din gizlenebiliyor");
eq(bel.denomination, undefined, "mezhep gizlenebiliyor");

const org = stripPrivateFields(base({ privateFields: ["origin"] })) as unknown as Record<string, unknown>;
eq(org.ethnicity, undefined, "etnik köken gizlenebiliyor");
eq(org.nationality, undefined, "uyruk gizlenebiliyor");

// Grup SEÇİCİ olmalı: bir grup başka grubun alanını götürmemeli
const only = stripPrivateFields(base({ privateFields: ["belief"] })) as unknown as Record<string, unknown>;
check(only.birthPlace !== undefined, "belief grubu doğum yerine dokunmuyor");
check(only.bio !== undefined, "belief grubu hikâyeye dokunmuyor");

// Her grubun i18n etiketi olmalı — arayüz PRIVATE_GROUPS'u map ediyor
let labelMiss = 0;
for (const g of groups) {
  if (!(`private.${g}` in tr) || !(`private.${g}` in en)) {
    labelMiss++; console.log(`  ✗ etiket eksik: private.${g}`);
  }
}
eq(labelMiss, 0, "tüm gizlilik gruplarının TR ve EN etiketi var");

// Tam maskede zaten hiçbiri yok (beyaz liste)
const fullMask = JSON.stringify(maskPerson(base()));
check(!fullMask.includes("GIZLI"), "tam maskede hassas değer izi yok");
check(!fullMask.includes("39.8878"), "tam maskede koordinat yok");

/* --- H8: maskeli kopya ham veriyle dizi PAYLAŞMAMALI --------------------- */

// "Buradaki hiçbir şey veriyi değiştirmez" sözü, kopyaya değiştirilebilir bir
// EL vermemeyi de kapsar: sığ taşımada kopyaya push yapan ham veriyi bozuyordu.
const shared = {
  id: "s1", firstName: "A", lastName: "B", gender: "male",
  parentIds: ["anne"], spouseIds: ["es"], formerSpouseIds: ["eski"],
  parentLinks: { anne: { kind: "biological" } },
} as unknown as Person;

const copy = maskPerson(shared);
check(copy.parentIds !== shared.parentIds, "parentIds ayrı dizi");
check(copy.spouseIds !== shared.spouseIds, "spouseIds ayrı dizi");
check(copy.formerSpouseIds !== shared.formerSpouseIds, "formerSpouseIds ayrı dizi");
check(copy.parentLinks !== shared.parentLinks, "parentLinks ayrı nesne");

// İçerik korunmalı — kopyalama bağları bozmamalı
eq(copy.parentIds, ["anne"], "içerik aynı");
eq(copy.spouseIds, ["es"], "eş bağı aynı");
eq(Object.keys(copy.parentLinks ?? {}), ["anne"], "parentLinks içeriği aynı");

// Kopyayı değiştirmek ham veriyi BOZMAMALI
copy.parentIds.push("SIZDI");
copy.spouseIds.push("SIZDI");
(copy.formerSpouseIds ?? []).push("SIZDI");
eq(shared.parentIds, ["anne"], "ham parentIds bozulmadı");
eq(shared.spouseIds, ["es"], "ham spouseIds bozulmadı");
eq(shared.formerSpouseIds, ["eski"], "ham formerSpouseIds bozulmadı");

// viewPerson üzerinden de aynı garanti
const viewed = viewPerson(shared, true);
check(viewed.parentIds !== shared.parentIds, "viewPerson maskeleyince de ayrı dizi");

/* ── Paylaşımda yan koleksiyonlar: kapsam dışıysa RSC yüküne HİÇ girmiyor ── */
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Yorumları ayıkla: kuralı ANLATAN metin, kuralın kanıtı değildir. */
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
/*
 * "tarifler", "mektup" ve "taziye" sekmeleri verisini oturum isteyen
 * uçlardan okuyordu ve `/g/<token>` ziyaretçisinin oturumu yok: istek 401
 * dönüyor, sekme hata gösteriyordu. Kapsam listesinde SEÇİLEBİLEN üç sekme,
 * seçildiğinde çalışmıyordu.
 *
 * Veri artık sunucuda okunuyor — ama YALNIZ kapsam izin veriyorsa. "Getir
 * ama gösterme" demek, veriyi sayfa kaynağında bırakmak olurdu; taziye
 * şeridinde de aynı gerekçe yazılı ve orada baştan doğru yapılmıştı.
 */
{
  const sayfa = kodu(read("../app/g/[token]/page.tsx"));
  for (const [kapsam, cagri] of [
    ["tarifler", "listRecipes(valid.treeId)"],
    ["mektup", "readLetters(valid.treeId)"],
  ] as const) {
    const i = sayfa.indexOf(`allows(valid.share.scope, "${kapsam}")`);
    check(i > -1, `${kapsam}: kapsam soruluyor`);
    const dal = sayfa.slice(i, i + 220);
    check(dal.includes(cagri), `${kapsam}: veri kapsam KOŞULUNUN içinde okunuyor`);
    check(/: undefined;/.test(dal), `${kapsam}: kapsam dışında prop hiç geçilmiyor`);
  }
  /* Taziye sekmesi şeritle AYNI kümeyi kullanıyor: yayımlanmış olanlar. */
  check(/const taziyeler = allows\(valid\.share\.scope, "taziye"\) \? obits : undefined;/.test(sayfa),
    "taziye sekmesi şeritle aynı yayımlanmış kümeden besleniyor");
  check(/readPublicObituaries\(/.test(sayfa) && !/readObituaries\(/.test(sayfa),
    "yayımlanmamış duyuru hiçbir yüzeyden geçmiyor");
  /* Ve proplar gerçekten geçiliyor — okunup kullanılmadan bırakılmıyor. */
  for (const prop of ["publicRecipes={tarifler}", "publicLetters={mektuplar}", "publicObituaries={taziyeler}"])
    check(sayfa.includes(prop), `prop geçiliyor: ${prop.split("=")[0]}`);
}
{
  /*
   * Ve görünümler propu ALDIKLARINDA uca GİTMİYOR: gitselerdi 401 yiyip
   * hata gösterirlerdi ve düzeltme yalnız yarım olurdu.
   */
  for (const [ad, dosya] of [
    ["tarifler", "../components/RecipesView.tsx"],
    ["mektup", "../components/LettersView.tsx"],
    ["taziye", "../components/ObituaryView.tsx"],
  ] as const) {
    const src = kodu(read(dosya));
    check(/if \(initial\) return;/.test(src), `${ad}: prop varken uca gidilmiyor`);
    check(/useState<[^>]+>\(initial \?\? null\)/.test(src), `${ad}: ilk durum proptan`);
  }
}

/* ── Kişi ÇİZEN her görünüm `view()`ten geçiyor ─────────────────────────── */
/*
 * Bulunan hata: `TableView` gizlilik katmanının TAMAMEN dışındaydı. Ham
 * `people` dizisini okuyup her sütunu düz metin basıyordu — doğum tarihi/yeri,
 * din, mezhep, etnik köken, yönelim, ölüm nedeni, hastalıklar, biyografi.
 * `confidential` bir kayıt ve `privateFields` ile gizlenmiş her alan, davetli
 * her üyeye açıktı; üstelik sütun süzgeci o sütunun TÜM farklı değerlerini
 * liste hâlinde açtığı için sütun daraltılmış olsa bile okunabiliyordu.
 *
 * Ham veri zaten istemcide (belgelenmiş tasarım: maske bir EKRAN katmanı).
 * Tam da bu yüzden maskelemeyi atlayan TEK bir bileşen yetiyor — kapı bu
 * listeyi tutuyor.
 */
{
  const GORUNUMLER = [
    "../components/TableView.tsx",
    "../components/CalendarView.tsx",
    "../components/PanelView.tsx",
    "../components/BookView.tsx",
    "../components/PrintView.tsx",
  ];
  for (const yol of GORUNUMLER) {
    const ad = yol.split("/").pop()!;
    const src = kodu(read(yol));
    check(/usePrivacy\(\)/.test(src), `${ad}: gizlilik bağlamını alıyor`);
    check(/\bview\(|map\(view\)/.test(src), `${ad}: kişileri view()'ten geçiriyor`);
  }
}
{
  /*
   * DÜZENLENEBİLİR görünümde ek kural: gizli hücre SALT-OKUNUR olmalı.
   * Boş bir girdi kutusu gösterilseydi, kullanıcının oraya yazdığı her şey
   * arkasındaki gerçek veriyi sessizce silerdi — göremediği bir alanı
   * düzenlemiş olurdu.
   */
  const src = kodu(read("../components/TableView.tsx"));
  check(/const gorunen = /.test(src) && /people\.map\(view\)/.test(src),
    "TableView: satırlar maskeli listeden besleniyor");
  check(/\[\.\.\.gorunen\]/.test(src), "TableView: sıralama/arama da maskeli listeden");
  check(/gizliMi\(/.test(src), "TableView: gizli hücre ayrı ele alınıyor");
  {
    // Gizli dal, düzenlenebilir `Cell`den ÖNCE dönmeli.
    const g = src.indexOf("gizliMi(p, c)");
    const c = src.indexOf("<Cell", g);
    check(g > -1 && c > g, "TableView: gizli hücre düzenlenebilir hücreden ÖNCE dönüyor");
  }
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
