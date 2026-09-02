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

const sharePage = readFileSync(new URL("../app/g/[token]/page.tsx", import.meta.url), "utf8");
check(/viewAll\s*\(/.test(sharePage),
  "herkese açık paylaşım sayfası viewAll ile SUNUCUDA maskeliyor");
check(!/people=\{people\}/.test(sharePage),
  "ham people dizisi Workspace'e verilmiyor");
check(/people=\{safePeople\}/.test(sharePage),
  "maskelenmiş dizi veriliyor");

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

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
