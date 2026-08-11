import type { Gender, ParentLink, Person } from "@/types/family";

/**
 * Kapsamlı demo soy ağacı — 11 kuşak (8 geri, ego, 2 ileri).
 *
 * Gerçek dünyada karşılaşılan durumları bilinçli olarak içerir:
 *  · Soyadı Kanunu (1934) öncesi lakap/baba adı, sonrası resmî soyadlar —
 *    kardeşlerin farklı soyadı seçmesi dahil
 *  · Çok eşlilik (aynı anda 4 kadın) ve seri evlilik (6 evlilik, boşanmalar)
 *  · Akraba evlilikleri (birinci ve ikinci dereceden kuzen)
 *  · Bebek ölümleri, doğumda ölüm, çocuk yaşta ölümler, savaş kayıpları
 *  · İnterseks ve trans bireyler, cinsiyeti kayıtlarda geçmeyenler
 *  · Muhacirlik (Selanik, Filibe), Almanya'ya işçi göçü, Kıbrıs
 *  · İkizler, evlat edinme, tek ebeveynli çocuk, hiç evlenmemişler
 *  · Eski kuşaklarda bilinmeyen/yaklaşık tarihler
 *
 * Fotoğraflar gömülü SVG olarak üretilir (bkz. demo-avatar.ts) — dış
 * servise bağımlılık yok. Fotoğrafçılık yaygınlaşmadan önceki kuşaklarda
 * bilinçli olarak fotoğraf yoktur; arayüz orada baş harfleri gösterir.
 */

/* ----------------------------------------------------------------
   Gömülü avatar üretici

   Dış bir servise (DiceBear vb.) bağlanmıyoruz: demo çevrimdışı da,
   kısıtlı ağlarda da eksiksiz görünsün. Çıktı `data:` URI olduğu için
   ek ağ isteği yok.

   Görünüm kişinin kimliğinden deterministik türetilir; aynı kişi her
   zaman aynı avatarı alır. Doğum yılı ve cinsiyet dönemin görünümünü
   yansıtır: yaşlı kuşakta ak saç, bıyık, başörtüsü.
   ---------------------------------------------------------------- */

const TEN = ["#f4d7bd", "#eac09b", "#d6a074", "#b87f55", "#96603f", "#7a4a30"];
const SAC = ["#241a12", "#3d2a1c", "#5a3f2b", "#7d5a3c", "#2f2f33", "#151515"];
const AK = ["#b9b4ab", "#cfcac1", "#9a958c", "#e0dcd4"];
const GIYSI = ["#4f7fb8", "#c06585", "#7d6aa8", "#4f8a6b", "#a8763e", "#5c6b7a", "#8f5a5a", "#3f6b8a"];
const ZEMIN = ["#eef2f7", "#faeef2", "#f2eefa", "#eef6f1", "#f9f2e8", "#eff1f4"];

/** Deterministik 32-bit karma (FNV-1a) */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const pick = <T,>(arr: T[], n: number) => arr[n % arr.length];

export function demoAvatar(seed: string, gender: Gender, birthYear?: number): string {
  const h = hash(seed);
  const b1 = (h >> 3) & 0xff;
  const b2 = (h >> 11) & 0xff;
  const b3 = (h >> 19) & 0xff;
  const b4 = (h >> 27) & 0x1f;

  const yasli = birthYear !== undefined && birthYear < 1935;
  const cokEski = birthYear !== undefined && birthYear < 1900;

  const ten = pick(TEN, b1);
  const sac = yasli && b2 % 3 !== 0 ? pick(AK, b2) : pick(SAC, b2);
  const giysi = pick(GIYSI, b3);
  const zemin = pick(ZEMIN, b4);

  const kadin = gender === "female";
  const erkek = gender === "male";

  // Yaşlı kuşakta başörtüsü, erkeklerde bıyık — dönemin görünümü
  const basortusu = kadin && (cokEski || (yasli && b1 % 3 !== 0) || b2 % 7 === 0);
  const biyik = erkek && (cokEski || (yasli && b3 % 3 !== 0) || b1 % 5 === 0);
  const sakal = erkek && cokEski && b2 % 3 === 0;
  const gozluk = !cokEski && b4 % 6 === 0;

  const parcalar: string[] = [];

  parcalar.push(`<rect width="100" height="100" fill="${zemin}"/>`);
  // Omuzlar
  parcalar.push(`<path d="M14 100c0-19 16-30 36-30s36 11 36 30z" fill="${giysi}"/>`);
  // Boyun
  parcalar.push(`<rect x="43" y="56" width="14" height="16" rx="6" fill="${ten}"/>`);

  if (basortusu) {
    // Örtü, saçın yerine geçer ve omuzlara iner
    parcalar.push(`<path d="M22 46a28 30 0 0 1 56 0v10c0 16-9 26-12 30H34c-3-4-12-14-12-30z" fill="${giysi}" opacity="0.92"/>`);
    parcalar.push(`<ellipse cx="50" cy="46" rx="15" ry="18" fill="${ten}"/>`);
  } else {
    parcalar.push(`<ellipse cx="50" cy="45" rx="17" ry="20" fill="${ten}"/>`);
    // Saç biçimleri — uzun saç ve topuz erkeklerde kullanılmıyor
    const sacTipi = erkek ? [0, 1, 4][b2 % 3] : b2 % 5;
    if (sacTipi === 0) {
      parcalar.push(`<path d="M33 42a17 19 0 0 1 34 0c0-13-7-19-17-19s-17 6-17 19z" fill="${sac}"/>`);
    } else if (sacTipi === 1) {
      parcalar.push(`<path d="M32 44c0-15 8-22 18-22s18 7 18 22c0 0 2-26-18-26S32 44 32 44z" fill="${sac}"/>`);
      parcalar.push(`<path d="M31 40h4v22h-4zM65 40h4v22h-4z" fill="${sac}"/>`);
    } else if (sacTipi === 2) {
      // Uzun saç
      parcalar.push(`<path d="M30 44c0-16 9-24 20-24s20 8 20 24v26c0 4-4 6-6 3-2-10-2-24-2-24s-6 5-12 5-12-5-12-5 0 14-2 24c-2 3-6 1-6-3z" fill="${sac}"/>`);
    } else if (sacTipi === 3) {
      // Topuz
      parcalar.push(`<path d="M33 43a17 18 0 0 1 34 0c0-14-7-20-17-20s-17 6-17 20z" fill="${sac}"/>`);
      parcalar.push(`<circle cx="50" cy="19" r="7" fill="${sac}"/>`);
    } else {
      // Kısa/dağınık
      parcalar.push(`<path d="M34 41c2-12 8-18 16-18s14 6 16 18c1-18-6-24-16-24s-17 6-16 24z" fill="${sac}"/>`);
      parcalar.push(`<circle cx="38" cy="30" r="5" fill="${sac}"/><circle cx="50" cy="26" r="6" fill="${sac}"/><circle cx="62" cy="30" r="5" fill="${sac}"/>`);
    }
  }

  // Gözler
  parcalar.push(`<circle cx="44" cy="45" r="1.9" fill="#2b2b2b"/><circle cx="56" cy="45" r="1.9" fill="#2b2b2b"/>`);
  // Ağız
  parcalar.push(`<path d="M46 54q4 3 8 0" stroke="#9c6a58" stroke-width="1.6" fill="none" stroke-linecap="round"/>`);

  if (biyik) parcalar.push(`<path d="M42 51q8 4 16 0" stroke="${sac}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`);
  if (sakal) parcalar.push(`<path d="M35 48c0 12 7 19 15 19s15-7 15-19c0 18-5 24-15 24s-15-6-15-24z" fill="${sac}" opacity="0.9"/>`);
  if (gozluk) {
    parcalar.push(`<g stroke="#4a4a4a" stroke-width="1.4" fill="none"><circle cx="44" cy="45" r="5.5"/><circle cx="56" cy="45" r="5.5"/><path d="M49.5 45h1"/></g>`);
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${parcalar.join("")}</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

interface Seed {
  id: string;
  ad: string;
  soyad: string;
  c: Gender;
  /** doğum */ d?: string;
  /** ölüm */ o?: string;
  yer?: string;
  bio?: string;
  /** ebeveynler */ eb?: string[];
  /** eşler */ es?: string[];
  /** eski eşler */ eski?: string[];
  /** ebeveyn bağının niteliği — evlat edinme, üvey, kopukluk */
  bag?: Record<string, ParentLink>;
  /** fotoğraf ata */ f?: boolean;
}

function build(seeds: Seed[]): Person[] {
  const people: Person[] = seeds.map((s) => ({
    id: s.id,
    firstName: s.ad,
    lastName: s.soyad,
    gender: s.c,
    birthDate: s.d,
    deathDate: s.o,
    birthPlace: s.yer,
    bio: s.bio,
    photo: s.f
      ? demoAvatar(s.id, s.c, s.d ? Number(s.d.slice(0, 4)) : undefined)
      : undefined,
    parentIds: s.eb ?? [],
    parentLinks: s.bag,
    spouseIds: s.es ?? [],
    formerSpouseIds: s.eski ?? [],
  }));

  // Eş ve eski eş bağlarını çift yönlü tamamla
  const byId = new Map(people.map((p) => [p.id, p]));
  for (const p of people) {
    for (const sid of p.spouseIds) {
      const o = byId.get(sid);
      if (o && !o.spouseIds.includes(p.id)) o.spouseIds.push(p.id);
    }
    for (const sid of p.formerSpouseIds ?? []) {
      const o = byId.get(sid);
      if (o && !(o.formerSpouseIds ?? []).includes(p.id)) {
        o.formerSpouseIds = [...(o.formerSpouseIds ?? []), p.id];
      }
    }
  }
  return people;
}

/* ================================================================
   1. KUŞAK — ~1730'lar · Develi, Kayseri
   Kayıt yok; isimler mezar taşı ve sözlü aktarımdan.
   ================================================================ */
const K1: Seed[] = [
  {
    id: "k1-veli", ad: "Veli", soyad: "Karaosmanoğlu", c: "male", yer: "Develi",
    bio: "Ailenin bilinen en eski atası. Doğum ve ölüm tarihi bilinmiyor; Develi'deki aile mezarlığında adı okunabilen en eski taş ona ait. Rivayete göre Karaman'dan gelip yerleşmiş.",
  },
  {
    id: "k1-ayse", ad: "Ayşe", soyad: "Karaosmanoğlu", c: "female", yer: "Develi",
    es: ["k1-veli"],
    bio: "Hakkında yalnızca adı biliniyor. Mezar taşı yok.",
  },
  {
    id: "k1-bilinmeyen", ad: "Adı bilinmeyen", soyad: "Karaosmanoğlu", c: "unknown",
    eb: ["k1-veli", "k1-ayse"],
    bio: "Aile defterinde \"bir evlat daha\" diye geçiyor; adı, cinsiyeti ve akıbeti bilinmiyor. Muhtemelen küçük yaşta vefat etti.",
  },
];

/* ================================================================
   2. KUŞAK — ~1765 · Çok eşlilik
   ================================================================ */
const K2: Seed[] = [
  {
    id: "k2-ibrahim", ad: "İbrahim", soyad: "Değirmencioğlu", c: "male", d: "1764", o: "1831", yer: "Develi",
    eb: ["k1-veli", "k1-ayse"],
    bio: "Su değirmeni işlettiği için aile \"Değirmencioğlu\" diye anılmaya başladı. İki eşi vardı; her ikisinden de çocukları oldu. Tarihler tahminî.",
  },
  {
    id: "k2-zeliha", ad: "Zeliha", soyad: "Değirmencioğlu", c: "female", d: "1770", o: "1802", yer: "Develi",
    es: ["k2-ibrahim"],
    bio: "İbrahim'in ilk eşi. Altıncı doğumunda hayatını kaybetti.",
  },
  {
    id: "k2-meryem", ad: "Meryem", soyad: "Değirmencioğlu", c: "female", d: "1778", o: "1849", yer: "Talas",
    es: ["k2-ibrahim"],
    bio: "İbrahim'in ikinci eşi. Zeliha'nın vefatından sonra evin idaresini üstlendi, üvey çocuklarını da büyüttü.",
  },
];

/* ================================================================
   3. KUŞAK — ~1795
   ================================================================ */
const K3: Seed[] = [
  {
    id: "k3-mustafa", ad: "Mustafa", soyad: "Değirmencioğlu", c: "male", d: "1793", o: "1861", yer: "Develi",
    eb: ["k2-ibrahim", "k2-zeliha"],
    bio: "Değirmeni babasından devraldı. Okuma yazma bilirdi; aile kayıtlarını tutmaya başlayan ilk kişi.",
  },
  {
    id: "k3-emine", ad: "Emine", soyad: "Değirmencioğlu", c: "female", d: "1799", o: "1870", yer: "Develi",
    es: ["k3-mustafa"],
  },
  {
    id: "k3-hasan", ad: "Hasan", soyad: "Değirmencioğlu", c: "male", d: "1801", o: "1804", yer: "Develi",
    eb: ["k2-ibrahim", "k2-zeliha"],
    bio: "Üç yaşında çiçek hastalığından vefat etti.",
  },
  {
    id: "k3-fatma", ad: "Fatma", soyad: "Değirmencioğlu", c: "female", d: "1797", yer: "Develi",
    eb: ["k2-ibrahim", "k2-zeliha"],
    bio: "Ölüm tarihi bilinmiyor. Talas'a gelin gitti, sonrasının izi kaybolmuş.",
  },
  {
    id: "k3-huseyin", ad: "Hüseyin", soyad: "Değirmencioğlu", c: "male", d: "1806", o: "1878", yer: "Develi",
    eb: ["k2-ibrahim", "k2-meryem"],
    es: ["k3-huseyin-es", "k3-huseyin-es2", "k3-huseyin-es3"],
    bio: "Meryem'den olan ilk çocuk. Ağabeyi Mustafa ile değirmen yüzünden yıllarca küs kaldılar.\n\nÜç eşi vardı; ailedeki ikinci çok eşli kuşak başı. Üçünden de çocukları oldu.",
  },
  {
    id: "k3-havva", ad: "Havva", soyad: "Değirmencioğlu", c: "female", d: "1809", o: "1884",
    eb: ["k2-ibrahim", "k2-meryem"], es: ["k3-havva-es"],
  },
  { id: "k3-havva-es", ad: "Bekir", soyad: "Tokmakçı", c: "male", d: "1804", o: "1869", yer: "Develi" },
  {
    id: "k3-huseyin-es", ad: "Zeynep", soyad: "Kadıoğlu", c: "female", d: "1812", o: "1889", yer: "Talas",
    bio: "Hüseyin'in ilk eşi.",
  },
  {
    id: "k3-huseyin-es2", ad: "Ümmühan", soyad: "Değirmencioğlu", c: "female", d: "1818", o: "1871", yer: "Develi",
    bio: "Hüseyin'in ikinci eşi.",
  },
  {
    id: "k3-huseyin-es3", ad: "Elif", soyad: "Değirmencioğlu", c: "female", d: "1826", o: "1902", yer: "Develi",
    bio: "Hüseyin'in üçüncü eşi. Kocasından 20 yaş küçüktü.",
  },
];

/* ================================================================
   4. KUŞAK — ~1825 · Dört eşli Ahmet
   ================================================================ */
const K4: Seed[] = [
  {
    id: "k4-ahmet", ad: "Ahmet", soyad: "Değirmencioğlu", c: "male", d: "1826", o: "1899", yer: "Develi",
    eb: ["k3-mustafa", "k3-emine"],
    bio: "Ailenin en çok anlatılan ismi. Dört eşi vardı ve dördü de aynı konakta yaşadı. On dört çocuğundan dokuzu yetişkinliğe ulaştı. Halı ticaretiyle zenginleşti, Kayseri'ye taşındı.",
  },
  { id: "k4-hanife", ad: "Hanife", soyad: "Değirmencioğlu", c: "female", d: "1830", o: "1888", yer: "Develi", es: ["k4-ahmet"], bio: "Ahmet'in ilk eşi." },
  { id: "k4-rukiye", ad: "Rukiye", soyad: "Değirmencioğlu", c: "female", d: "1836", o: "1901", yer: "Kayseri", es: ["k4-ahmet"], bio: "Ahmet'in ikinci eşi. Okuma yazma bilir, konağın hesaplarını tutardı." },
  { id: "k4-zeynep", ad: "Zeynep", soyad: "Değirmencioğlu", c: "female", d: "1841", o: "1863", yer: "Develi", es: ["k4-ahmet"], bio: "Ahmet'in üçüncü eşi. Yirmi iki yaşında lohusa humması nedeniyle vefat etti." },
  { id: "k4-serife", ad: "Şerife", soyad: "Değirmencioğlu", c: "female", d: "1848", o: "1922", yer: "Kayseri", es: ["k4-ahmet"], bio: "Ahmet'in dördüncü ve en genç eşi. Ahmet'ten 22 yaş küçüktü, ondan 23 yıl fazla yaşadı." },

  {
    id: "k4-ismail", ad: "İsmail", soyad: "Değirmencioğlu", c: "male", d: "1829", o: "1902", yer: "Develi",
    eb: ["k3-mustafa", "k3-emine"],
    bio: "Ahmet'in kardeşi. Bu koldan gelenler 1934'te \"Yıldırım\" soyadını aldı.",
  },
  { id: "k4-nazli", ad: "Nazlı", soyad: "Değirmencioğlu", c: "female", d: "1834", o: "1897", es: ["k4-ismail"] },

  {
    id: "k4-osman", ad: "Osman", soyad: "Değirmencioğlu", c: "male", d: "1838", o: "1911", yer: "Develi",
    eb: ["k3-huseyin", "k3-huseyin-es"],
    bio: "Hüseyin kolundan. Bu dal Adana'ya göç etti.",
  },
  { id: "k4-hatice", ad: "Hatice", soyad: "Kozanoğlu", c: "female", d: "1845", o: "1918", yer: "Kozan", es: ["k4-osman"] },

  // Hüseyin'in ikinci ve üçüncü eşlerinden
  { id: "k4-veli-h", ad: "Veli", soyad: "Değirmencioğlu", c: "male", d: "1843", o: "1901", yer: "Develi", eb: ["k3-huseyin", "k3-huseyin-es2"], bio: "Adını, ailenin bilinen ilk atası Veli'den aldı — kuşak atlayan ad tekrarının ilk örneği." },
  { id: "k4-guller", ad: "Güller", soyad: "Değirmencioğlu", c: "female", d: "1849", o: "1912", yer: "Develi", eb: ["k3-huseyin", "k3-huseyin-es2"] },
  { id: "k4-mahmut", ad: "Mahmut", soyad: "Değirmencioğlu", c: "male", d: "1855", o: "1923", yer: "Develi", eb: ["k3-huseyin", "k3-huseyin-es3"] },
];

/* ================================================================
   5. KUŞAK — ~1855 · Dört anneden çocuklar, muhacirlik
   ================================================================ */
const K5: Seed[] = [
  // Hanife'den
  { id: "k5-omer", ad: "Ömer", soyad: "Değirmencioğlu", c: "male", d: "1852", o: "1924", yer: "Develi", eb: ["k4-ahmet", "k4-hanife"], bio: "Babasının halı işini büyüttü. Ana kolun devamı." },
  { id: "k5-zehra", ad: "Zehra", soyad: "Değirmencioğlu", c: "female", d: "1855", o: "1931", yer: "Develi", eb: ["k4-ahmet", "k4-hanife"] },
  { id: "k5-bekir", ad: "Bekir", soyad: "Değirmencioğlu", c: "male", d: "1858", o: "1858", yer: "Develi", eb: ["k4-ahmet", "k4-hanife"], bio: "Doğduğu gün vefat etti." },
  // Rukiye'den
  { id: "k5-halil", ad: "Halil", soyad: "Değirmencioğlu", c: "male", d: "1860", o: "1915", yer: "Kayseri", eb: ["k4-ahmet", "k4-rukiye"] },
  { id: "k5-naciye", ad: "Naciye", soyad: "Değirmencioğlu", c: "female", d: "1864", o: "1943", yer: "Kayseri", eb: ["k4-ahmet", "k4-rukiye"], bio: "Hiç evlenmedi. Konakta kalıp yeğenlerini büyüttü, hepsi ona \"Naciye Ana\" derdi." },
  // Zeynep'ten
  { id: "k5-suleyman", ad: "Süleyman", soyad: "Değirmencioğlu", c: "male", d: "1863", o: "1934", yer: "Develi", eb: ["k4-ahmet", "k4-zeynep"], bio: "Annesi onu doğururken öldü. Şerife tarafından büyütüldü." },
  // Şerife'den
  { id: "k5-emine", ad: "Emine", soyad: "Değirmencioğlu", c: "female", d: "1867", o: "1949", yer: "Kayseri", eb: ["k4-ahmet", "k4-serife"] },
  { id: "k5-yakup", ad: "Yakup", soyad: "Değirmencioğlu", c: "male", d: "1871", o: "1876", yer: "Kayseri", eb: ["k4-ahmet", "k4-serife"], bio: "Beş yaşında kızamıktan vefat etti." },
  { id: "k5-kizi", ad: "Adı bilinmeyen", soyad: "Değirmencioğlu", c: "unknown", d: "1874", o: "1874", yer: "Kayseri", eb: ["k4-ahmet", "k4-serife"], bio: "Ölü doğdu; nüfusa kaydedilmedi. Aile defterinde yalnızca tarih var." },

  {
    id: "k5-hayriye", ad: "Hayriye", soyad: "Değirmencioğlu", c: "female", d: "1869", o: "1934", yer: "Yozgat",
    eb: ["k4-ahmet", "k4-serife"],
    bag: {
      "k4-ahmet": { kind: "foster", note: "Yedi yaşında konağa evlatlık verildi; resmî evlat edinme yapılmadı." },
      "k4-serife": { kind: "foster", note: "Yedi yaşında konağa evlatlık verildi; resmî evlat edinme yapılmadı." },
    },
    bio: "Yozgat'tan, kıtlık yıllarında konağa \"evlatlık\" verildi. Dönemin yaygın ama ağır bir uygulamasıydı: ev işlerine bakar, aileden sayılır ama miras alamazdı.\n\nHiç evlenmedi. Şerife Hanım'ın ölümüne dek onunla kaldı, aynı mezarlığa gömüldü.",
  },

  // Eşler
  { id: "k5-omer-es", ad: "Saliha", soyad: "Selanikli", c: "female", d: "1858", o: "1929", yer: "Selanik", es: ["k5-omer"], bio: "Selanik'ten muhacir olarak gelen bir ailenin kızı. Türkçeyi sonradan öğrendi, evde Rumeli şivesiyle konuşurdu." },
  { id: "k5-zehra-es", ad: "Tahir", soyad: "Şahinkaya", c: "male", d: "1850", o: "1919", yer: "Kayseri", es: ["k5-zehra"] },
  { id: "k5-halil-es", ad: "Melek", soyad: "Filibeli", c: "female", d: "1868", o: "1941", yer: "Filibe", es: ["k5-halil"], bio: "93 Harbi sonrası Filibe'den göç eden ailenin kızı." },
  { id: "k5-suleyman-es", ad: "Şaziye", soyad: "Küçükoğlu", c: "female", d: "1870", o: "1938", es: ["k5-suleyman"] },

  // İsmail kolu (ileride Yıldırım)
  { id: "k5-nuri", ad: "Nuri", soyad: "Değirmencioğlu", c: "male", d: "1857", o: "1928", yer: "Develi", eb: ["k4-ismail", "k4-nazli"] },
  { id: "k5-nuri-es", ad: "Ayşe", soyad: "Bozkurt", c: "female", d: "1862", o: "1933", es: ["k5-nuri"] },
  // Osman kolu (Adana)
  { id: "k5-cemal", ad: "Cemal", soyad: "Değirmencioğlu", c: "male", d: "1868", o: "1936", yer: "Adana", eb: ["k4-osman", "k4-hatice"] },
  { id: "k5-cemal-es", ad: "Perihan", soyad: "Toroslu", c: "female", d: "1874", o: "1945", yer: "Adana", es: ["k5-cemal"] },
];

/* ================================================================
   6. KUŞAK — ~1885 · SOYADI KANUNU (1934) KUŞAĞI
   Kardeşler farklı soyadları seçti. Birinci dereceden kuzen evliliği.
   ================================================================ */
const K6: Seed[] = [
  {
    id: "k6-mehmet", ad: "Mehmet", soyad: "Demirtaş", c: "male", d: "1886-04-12", o: "1961-11-03", yer: "Kayseri", f: true,
    eb: ["k5-omer", "k5-omer-es"],
    bio: "1934 Soyadı Kanunu çıkınca \"Demirtaş\" soyadını aldı; demirci çıraklığından gelen bir tercihti. Kardeşi Ali ise \"Yıldırım\"ı seçti, iki kardeşin torunları bugün farklı soyadları taşıyor.\n\nAmcasının kızı Naz ile evlendi — o dönem yaygın olan bir akraba evliliği.",
  },
  {
    id: "k6-naz", ad: "Naz", soyad: "Demirtaş", c: "female", d: "1892-07-30", o: "1975-02-18", yer: "Kayseri", f: true,
    eb: ["k5-zehra", "k5-zehra-es"], es: ["k6-mehmet"],
    bio: "Mehmet'in birinci dereceden kuzeni (halasının kızı). Evlilikleri aile içinde \"amca kızı\" evliliği olarak anılır. Yedi çocuk doğurdu, beşi yetişkinliğe ulaştı.",
  },
  {
    id: "k6-ali", ad: "Ali", soyad: "Yıldırım", c: "male", d: "1889-01-22", o: "1957-06-09", yer: "Kayseri", f: true,
    eb: ["k5-omer", "k5-omer-es"],
    bio: "Mehmet'in kardeşi. 1934'te ağabeyinden farklı olarak \"Yıldırım\" soyadını aldı — nüfus memuruyla yaşadığı bir tartışma sonucu olduğu anlatılır. İzmir'e yerleşti.",
  },
  { id: "k6-ali-es", ad: "Şükran", soyad: "Yıldırım", c: "female", d: "1896-03-05", o: "1980-12-01", yer: "İzmir", es: ["k6-ali"], f: true },

  {
    id: "k6-riza", ad: "Rıza", soyad: "Demirtaş", c: "male", d: "1893-09-14", o: "1915-08-10", yer: "Kayseri", f: true,
    eb: ["k5-omer", "k5-omer-es"],
    bio: "Çanakkale'de, Conkbayırı'nda şehit düştü. Yirmi bir yaşındaydı, hiç evlenmedi. Soyadı kanunu çıkmadan öldüğü için resmî soyadı hiç olmadı; kayıtlara sonradan ailesinin soyadıyla geçildi.",
  },
  {
    id: "k6-hatice", ad: "Hatice", soyad: "Akgün", c: "female", d: "1891-05-20", o: "1972-04-11", yer: "Kayseri", f: true,
    eb: ["k5-omer", "k5-omer-es"], es: ["k6-hatice-es"],
    bio: "Evlenince kocasının soyadını aldı; kardeşleriyle farklı soyadları taşıdılar.",
  },
  { id: "k6-hatice-es", ad: "Şevket", soyad: "Akgün", c: "male", d: "1888-02-28", o: "1965-07-19", yer: "Ankara", f: true },

  {
    id: "k6-fikret", ad: "Fikret", soyad: "Demirtaş", c: "male", d: "1898-11-02", o: "1921-09-13", yer: "Kayseri",
    eb: ["k5-omer", "k5-omer-es"],
    bio: "Sakarya Meydan Muharebesi'nde kayboldu; naaşı bulunamadı. Ölüm tarihi tahminî.",
  },

  // Halil kolu
  { id: "k6-turgut", ad: "Turgut", soyad: "Demirtaş", c: "male", d: "1895-06-17", o: "1968-03-22", yer: "Kayseri", eb: ["k5-halil", "k5-halil-es"], f: true },
  { id: "k6-turgut-es", ad: "Nermin", soyad: "Demirtaş", c: "female", d: "1902-10-08", o: "1988-01-30", yer: "İstanbul", es: ["k6-turgut"], f: true },
  {
    id: "k6-sitki", ad: "Sıtkı", soyad: "Demirtaş", c: "male", d: "1908-05-02", o: "1979-04-17", yer: "Manastır", f: true,
    eb: ["k5-halil", "k5-halil-es"],
    bag: {
      "k5-halil": { kind: "adoptive", note: "Balkan Savaşı yetimi; 1913'te evlat edinildi." },
      "k5-halil-es": { kind: "adoptive", note: "Balkan Savaşı yetimi; 1913'te evlat edinildi." },
    },
    bio: "Balkan Savaşı'nda ailesini kaybetti, Manastır'dan gelen muhacir kafilesiyle Kayseri'ye ulaştı. 1913'te Halil ve Melek tarafından evlat edinildi.\n\nÖz soyadını hiç öğrenemedi; 1934'te ailesinin soyadını aldı. \"Beni bulan aile benim ailemdir\" derdi.",
  },
  { id: "k6-sitki-es", ad: "Refika", soyad: "Demirtaş", c: "female", d: "1915-08-11", o: "1988-02-20", yer: "Kayseri", es: ["k6-sitki"], f: true },

  // Süleyman kolu
  { id: "k6-zekiye", ad: "Zekiye", soyad: "Demirtaş", c: "female", d: "1900-08-25", o: "2003-05-14", yer: "Develi", eb: ["k5-suleyman", "k5-suleyman-es"], f: true, bio: "102 yaşında vefat etti. Ailenin en uzun yaşayan ferdi; dört kuşağı bir arada gördü." },
  { id: "k6-zekiye-es", ad: "Kâzım", soyad: "Ergin", c: "male", d: "1894-12-19", o: "1970-08-08", es: ["k6-zekiye"] },
  // Nuri kolu (Yıldırım'a geçmeyen dal)
  { id: "k6-sadik", ad: "Sadık", soyad: "Yıldırım", c: "male", d: "1890-03-11", o: "1959-10-25", yer: "Develi", eb: ["k5-nuri", "k5-nuri-es"], f: true },
  { id: "k6-sadik-es", ad: "Münevver", soyad: "Yıldırım", c: "female", d: "1897-07-07", o: "1979-06-16", es: ["k6-sadik"] },
  // Adana kolu
  { id: "k6-nihat", ad: "Nihat", soyad: "Toroslu", c: "male", d: "1899-04-30", o: "1974-02-02", yer: "Adana", eb: ["k5-cemal", "k5-cemal-es"], f: true },
  { id: "k6-nihat-es", ad: "Melahat", soyad: "Toroslu", c: "female", d: "1905-09-21", o: "1991-11-11", yer: "Adana", es: ["k6-nihat"], f: true },
];

/* ================================================================
   7. KUŞAK — ~1915-1930 · Cumhuriyet, göç, bebek ölümleri
   ================================================================ */
const K7: Seed[] = [
  {
    id: "k7-kemal", ad: "Kemal", soyad: "Demirtaş", c: "male", d: "1918-03-08", o: "1994-12-27", yer: "Kayseri", f: true,
    eb: ["k6-mehmet", "k6-naz"],
    bio: "Ailenin İstanbul'a taşınmasına önayak oldu. Sümerbank'ta memur olarak çalıştı, 1978'de emekli oldu. Akşamları radyo dinleyip çocuklarına Çanakkale'de ölen amcası Rıza'yı anlatırdı.",
  },
  { id: "k7-kemal-es", ad: "Muazzez", soyad: "Demirtaş", c: "female", d: "1924-05-16", o: "2009-08-03", yer: "İstanbul", es: ["k7-kemal"], f: true, bio: "İlkokul öğretmeni. Emekli olduktan sonra da mahalledeki çocuklara ücretsiz ders verdi." },

  { id: "k7-sabri", ad: "Sabri", soyad: "Demirtaş", c: "male", d: "1920-10-11", o: "1997-04-19", yer: "Kayseri", eb: ["k6-mehmet", "k6-naz"], f: true },
  { id: "k7-sabri-es", ad: "Ayten", soyad: "Demirtaş", c: "female", d: "1927-02-14", o: "2011-01-25", es: ["k7-sabri"], f: true },

  { id: "k7-nesrin", ad: "Nesrin", soyad: "Demirtaş", c: "female", d: "1922-07-19", o: "2016-03-30", yer: "Kayseri", eb: ["k6-mehmet", "k6-naz"], f: true, bio: "Hiç evlenmedi. Ailenin ilk üniversite mezunu kadını; eczacılık okudu, Kadıköy'de kırk yıl eczane işletti." },

  { id: "k7-bebek", ad: "Ömer", soyad: "Demirtaş", c: "male", d: "1925-01-30", o: "1925-06-12", yer: "Kayseri", eb: ["k6-mehmet", "k6-naz"], bio: "Dört buçuk aylıkken boğmacadan vefat etti. Dedesi Ömer'in adı verilmişti." },
  { id: "k7-bebek2", ad: "Naz", soyad: "Demirtaş", c: "female", d: "1928-11-04", o: "1929-02-08", yer: "Kayseri", eb: ["k6-mehmet", "k6-naz"], bio: "Üç aylıkken zatürreden vefat etti. Annesiyle aynı adı taşıyordu." },

  {
    id: "k7-yusuf", ad: "Yusuf", soyad: "Demirtaş", c: "male", d: "1926-09-23", o: "2004-06-15", yer: "Kayseri", f: true,
    eb: ["k6-mehmet", "k6-naz"],
    bio: "1962'de işçi olarak Almanya'ya gitti; Köln'de Ford fabrikasında çalıştı. \"İki yıllığına\" gitti, kırk iki yıl kaldı. Ailenin Almanya kolu ondan gelir.",
  },
  { id: "k7-yusuf-es", ad: "Gülizar", soyad: "Demirtaş", c: "female", d: "1931-04-02", o: "2018-10-09", yer: "Develi", es: ["k7-yusuf"], f: true, bio: "1965'te eşinin yanına, Köln'e gitti. Ömrünün yarısını Almanya'da geçirdi ama Almanca öğrenmedi." },

  // Ali (Yıldırım) kolu — İzmir
  { id: "k7-erol", ad: "Erol", soyad: "Yıldırım", c: "male", d: "1921-12-06", o: "1999-05-21", yer: "İzmir", eb: ["k6-ali", "k6-ali-es"], f: true },
  { id: "k7-erol-es", ad: "Suzan", soyad: "Yıldırım", c: "female", d: "1929-08-17", o: "2013-07-04", yer: "İzmir", es: ["k7-erol"], f: true },
  { id: "k7-guler", ad: "Güler", soyad: "Yıldırım", c: "female", d: "1925-03-29", o: "2010-09-12", yer: "İzmir", eb: ["k6-ali", "k6-ali-es"], f: true },

  // Hatice (Akgün) kolu — Ankara
  { id: "k7-behice", ad: "Behice", soyad: "Akgün", c: "female", d: "1919-06-24", o: "2002-11-28", yer: "Ankara", eb: ["k6-hatice", "k6-hatice-es"], f: true },
  { id: "k7-behice-es", ad: "Tevfik", soyad: "Soydan", c: "male", d: "1914-01-09", o: "1989-03-17", yer: "Ankara", es: ["k7-behice"], f: true },

  // Turgut kolu — İstanbul
  { id: "k7-orhan-t", ad: "Orhan", soyad: "Demirtaş", c: "male", d: "1928-04-15", o: "2005-02-26", yer: "İstanbul", eb: ["k6-turgut", "k6-turgut-es"], f: true },
  { id: "k7-orhan-t-es", ad: "Semra", soyad: "Demirtaş", c: "female", d: "1934-10-30", o: "2020-04-07", yer: "İstanbul", es: ["k7-orhan-t"], f: true },

  // Zekiye kolu
  { id: "k7-necati", ad: "Necati", soyad: "Ergin", c: "male", d: "1926-02-11", o: "2001-12-05", yer: "Develi", eb: ["k6-zekiye", "k6-zekiye-es"], f: true },
  {
    id: "k7-necati-es", ad: "Fitnat", soyad: "Ergin", c: "female", d: "1933-05-08", o: "2015-06-20", yer: "Develi", f: true,
    eb: ["k6-sadik", "k6-sadik-es"], es: ["k7-necati"],
    bio: "Evlenmeden önceki soyadı Yıldırım'dı. Eşi Necati ile üçüncü dereceden kuzenler — ortak ataları Mustafa Değirmencioğlu (1793).\n\nDevelii'de iki kolun birbirini bulması olağandı; \"zaten hepimiz akrabayız\" derdi.",
  },

  // Sadık (Yıldırım) kolu
  { id: "k7-hulusi", ad: "Hulusi", soyad: "Yıldırım", c: "male", d: "1923-08-03", o: "1996-10-14", yer: "Develi", eb: ["k6-sadik", "k6-sadik-es"], f: true },
  { id: "k7-hulusi-es", ad: "Sıdıka", soyad: "Yıldırım", c: "female", d: "1930-01-27", o: "2008-03-11", es: ["k7-hulusi"] },

  // Adana kolu
  { id: "k7-vedat", ad: "Vedat", soyad: "Toroslu", c: "male", d: "1930-07-12", o: "2012-09-30", yer: "Adana", eb: ["k6-nihat", "k6-nihat-es"], f: true },
  { id: "k7-vedat-es", ad: "Nurten", soyad: "Toroslu", c: "female", d: "1936-11-19", yer: "Adana", es: ["k7-vedat"], f: true, bio: "Ailenin yaşayan en yaşlı ferdi." },
];

/* ================================================================
   8. KUŞAK — ~1945-1960 · Seri evlilikler, Almanya doğumlular, interseks
   ================================================================ */
const K8: Seed[] = [
  {
    id: "k8-orhan", ad: "Orhan", soyad: "Demirtaş", c: "male", d: "1947-02-19", yer: "İstanbul", f: true,
    eb: ["k7-kemal", "k7-kemal-es"],
    es: ["k8-orhan-es3"], eski: ["k8-orhan-es1", "k8-orhan-es2"],
    bio: "Üç kez evlendi, ikisinden boşandı. İnşaat mühendisi; 70'lerde Libya ve Suudi Arabistan'da şantiyelerde çalıştı, uzun süre ailesinden ayrı kaldı — ilk iki evliliğinin bitmesini buna bağlar.\n\nHer üç evliliğinden de çocukları var.",
  },
  { id: "k8-orhan-es1", ad: "Filiz", soyad: "Aksoy", c: "female", d: "1950-06-08", yer: "İstanbul", f: true, bio: "Orhan'ın ilk eşi. 1968'de evlendiler, 1976'da boşandılar." },
  { id: "k8-orhan-es2", ad: "Sevda", soyad: "Kurtoğlu", c: "female", d: "1955-03-22", yer: "Ankara", f: true, bio: "Orhan'ın ikinci eşi. 1978-1989 arası evli kaldılar." },
  { id: "k8-orhan-es3", ad: "Nalan", soyad: "Demirtaş", c: "female", d: "1961-09-30", yer: "İzmir", f: true, bio: "Orhan'ın üçüncü eşi. 1992'den beri evliler." },

  { id: "k8-sevim", ad: "Sevim", soyad: "Öztürk", c: "female", d: "1949-11-25", yer: "İstanbul", eb: ["k7-kemal", "k7-kemal-es"], es: ["k8-sevim-es"], f: true },
  { id: "k8-sevim-es", ad: "Metin", soyad: "Öztürk", c: "male", d: "1944-08-14", o: "2019-01-08", yer: "Bursa", f: true },

  {
    id: "k8-gulten", ad: "Gülten", soyad: "Demirtaş", c: "female", d: "1953-04-06", yer: "İstanbul", f: true,
    eb: ["k7-kemal", "k7-kemal-es"],
    bio: "Evlenmedi, çocuğu olmadı. Ailenin ilk kadın avukatı. Yeğenlerinin hepsinin hukuk danışmanı.",
  },

  {
    id: "k8-tuncay", ad: "Tuncay", soyad: "Demirtaş", c: "male", d: "1956-01-17", o: "1956-01-17", yer: "İstanbul",
    eb: ["k7-kemal", "k7-kemal-es"],
    bio: "Doğumda kaybedildi. Nüfusa kaydı yapıldı ama aynı gün düşüldü.",
  },

  // Sabri kolu — interseks birey
  {
    id: "k8-deniz-s", ad: "Deniz", soyad: "Demirtaş", c: "other", d: "1958-07-04", yer: "Kayseri", f: true,
    eb: ["k7-sabri", "k7-sabri-es"],
    bag: { "k7-sabri": { estranged: "by-parent", note: "1994'teki kayıt değişikliğinden sonra babası görüşmeyi kesti; 1997'de vefat edene dek barışmadılar." } },
    bio: "İnterseks doğdu. 1958'de nüfusa \"erkek\" olarak kaydedildi; 1994'te açtığı davayla kaydını değiştirdi. Babası bunu kabul etmedi ve ölene dek görüşmediler; annesi ise hep aradı.\n\nSeramik sanatçısı. Bodrum'da atölyesi var. 1999'da Umut'u evlat edindi.",
  },
  { id: "k8-nurhan", ad: "Nurhan", soyad: "Demirtaş", c: "female", d: "1961-12-09", yer: "Kayseri", eb: ["k7-sabri", "k7-sabri-es"], es: ["k8-nurhan-es"], f: true },
  { id: "k8-nurhan-es", ad: "Selçuk", soyad: "Demirtaş", c: "male", d: "1958-05-27", yer: "Kayseri", f: true },

  // Yusuf kolu — Almanya doğumlular
  {
    id: "k8-erdal", ad: "Erdal", soyad: "Demirtaş", c: "male", d: "1966-03-14", yer: "Köln, Almanya", f: true,
    eb: ["k7-yusuf", "k7-yusuf-es"],
    bio: "Almanya'da doğdu, Almanca'yı Türkçe'den önce öğrendi. Otomotiv teknisyeni. Türkiye'ye yalnızca yaz tatillerinde geldi; \"iki ülkenin de misafiriyim\" der.",
  },
  { id: "k8-erdal-es", ad: "Sabine", soyad: "Demirtaş", c: "female", d: "1969-08-21", yer: "Köln, Almanya", es: ["k8-erdal"], f: true, bio: "Alman asıllı. Evlendikten sonra Demirtaş soyadını aldı, Türkçe öğrendi." },
  { id: "k8-hulya-a", ad: "Hülya", soyad: "Demirtaş", c: "female", d: "1963-10-02", yer: "Köln, Almanya", eb: ["k7-yusuf", "k7-yusuf-es"], es: ["k8-hulya-es"], f: true },
  { id: "k8-hulya-es", ad: "Kadir", soyad: "Şensoy", c: "male", d: "1960-04-19", yer: "Duisburg, Almanya", f: true },

  // İzmir (Yıldırım) kolu
  { id: "k8-ercan", ad: "Ercan", soyad: "Yıldırım", c: "male", d: "1952-09-11", yer: "İzmir", eb: ["k7-erol", "k7-erol-es"], es: ["k8-ercan-es"], f: true },
  { id: "k8-ercan-es", ad: "Nilgün", soyad: "Yıldırım", c: "female", d: "1957-06-30", yer: "İzmir", f: true },
  { id: "k8-aylin-y", ad: "Aylin", soyad: "Yıldırım", c: "female", d: "1959-02-08", yer: "İzmir", eb: ["k7-erol", "k7-erol-es"], f: true, bio: "Kıbrıs'a yerleşti, Lefkoşa'da yaşıyor." },

  // Ankara (Akgün/Soydan) kolu
  { id: "k8-mualla", ad: "Mualla", soyad: "Soydan", c: "female", d: "1948-05-03", yer: "Ankara", eb: ["k7-behice", "k7-behice-es"], es: ["k8-mualla-es"], f: true },
  { id: "k8-mualla-es", ad: "Bülent", soyad: "Soydan", c: "male", d: "1945-11-28", yer: "Ankara", f: true },

  // Turgut kolu
  { id: "k8-hakan-t", ad: "Hakan", soyad: "Demirtaş", c: "male", d: "1959-07-16", yer: "İstanbul", eb: ["k7-orhan-t", "k7-orhan-t-es"], es: ["k8-hakan-es"], f: true },
  { id: "k8-hakan-es", ad: "Şule", soyad: "Demirtaş", c: "female", d: "1963-03-25", yer: "İstanbul", f: true },

  // Develi (Ergin) kolu
  { id: "k8-fatos", ad: "Fatoş", soyad: "Ergin", c: "female", d: "1955-10-20", yer: "Develi", eb: ["k7-necati", "k7-necati-es"], es: ["k8-fatos-es"], f: true },
  { id: "k8-fatos-es", ad: "Recep", soyad: "Ergin", c: "male", d: "1951-01-13", o: "2022-05-09", yer: "Develi", f: true },

  // Yıldırım (Develi) kolu
  { id: "k8-serpil", ad: "Serpil", soyad: "Yıldırım", c: "female", d: "1958-12-01", yer: "Develi", eb: ["k7-hulusi", "k7-hulusi-es"], es: ["k8-serpil-es"], f: true },
  { id: "k8-serpil-es", ad: "İlhan", soyad: "Yıldırım", c: "male", d: "1954-04-22", yer: "Develi", f: true },

  {
    id: "k8-aysel", ad: "Aysel", soyad: "Toroslu", c: "female", d: "1957-04-30", yer: "Adana", f: true,
    eb: ["k7-vedat", "k7-vedat-es"],
    es: ["k8-aysel-es5"], eski: ["k8-aysel-es2", "k8-aysel-es3", "k8-aysel-es4"],
    bio: "Beş kez evlendi: ilk eşi genç yaşta vefat etti, üçünden boşandı, beşincisiyle otuz yıldır birlikte. İki farklı evliliğinden çocukları var.\n\n\"Her seferinde doğru olduğunu düşündüm, üçünde yanıldım\" diyor.",
  },
  { id: "k8-aysel-es1", ad: "Kenan", soyad: "Toroslu", c: "male", d: "1953-09-14", o: "1981-06-03", yer: "Adana", es: ["k8-aysel"], f: true, bio: "Aysel'in ilk eşi. 1981'de trafik kazasında vefat etti; Aysel 24 yaşında dul kaldı." },
  { id: "k8-aysel-es2", ad: "Nedim", soyad: "Alkan", c: "male", d: "1950-11-21", yer: "Mersin", f: true, bio: "Aysel'in ikinci eşi. 1983-1987." },
  { id: "k8-aysel-es3", ad: "Yılmaz", soyad: "Duran", c: "male", d: "1955-03-07", yer: "Adana", f: true, bio: "Aysel'in üçüncü eşi. 1989-1992." },
  { id: "k8-aysel-es4", ad: "Sinan", soyad: "Kaptan", c: "male", d: "1961-07-19", yer: "İskenderun", f: true, bio: "Aysel'in dördüncü eşi. 1993-1995." },
  { id: "k8-aysel-es5", ad: "Cahit", soyad: "Toroslu", c: "male", d: "1954-01-08", yer: "Adana", f: true, bio: "Aysel'in beşinci eşi. 1996'dan beri evliler." },

  // Adana kolu
  { id: "k8-levent", ad: "Levent", soyad: "Toroslu", c: "male", d: "1962-08-08", yer: "Adana", eb: ["k7-vedat", "k7-vedat-es"], es: ["k8-levent-es"], f: true },
  { id: "k8-levent-es", ad: "Emel", soyad: "Toroslu", c: "female", d: "1966-02-17", yer: "Adana", f: true },
];

/* ================================================================
   9. KUŞAK — ~1975-1995 · EGO KUŞAĞI
   Trans birey, altı evlilik, kuzen evliliği, ikizler, evlat edinme
   ================================================================ */
const K9: Seed[] = [
  // Orhan'ın 1. evliliğinden (Filiz)
  {
    id: "k9-deniz", ad: "Deniz", soyad: "Demirtaş", c: "male", d: "1978-06-14", yer: "İstanbul", f: true,
    eb: ["k8-orhan", "k8-orhan-es1"], es: ["k9-deniz-es"],
    bio: "Trans erkek. 2009'da geçiş sürecini tamamladı, nüfus kaydını değiştirdi. Ailede önce zorlanıldı, dedesi Kemal'in \"benim torunum\" deyip sahiplenmesi dönüm noktası oldu.\n\nMimar. Bu ağacı derleyen kişi — 2019'da büyükannesi Muazzez'in sandığından çıkan defterle başladı.",
  },
  { id: "k9-deniz-es", ad: "Ece", soyad: "Demirtaş", c: "female", d: "1982-11-08", yer: "İstanbul", f: true, bio: "Belgesel yönetmeni. Deniz'le 2011'de evlendi." },
  { id: "k9-pinar", ad: "Pınar", soyad: "Demirtaş", c: "female", d: "1974-09-30", yer: "İstanbul", eb: ["k8-orhan", "k8-orhan-es1"], es: ["k9-pinar-es"], f: true },
  { id: "k9-pinar-es", ad: "Barış", soyad: "Uysal", c: "male", d: "1971-05-12", yer: "İstanbul", f: true },

  // Orhan'ın 2. evliliğinden (Sevda)
  {
    id: "k9-cem", ad: "Cem", soyad: "Demirtaş", c: "male", d: "1981-03-27", yer: "Ankara", f: true,
    eb: ["k8-orhan", "k8-orhan-es2"],
    es: ["k9-cem-es6"], eski: ["k9-cem-es1", "k9-cem-es2", "k9-cem-es3", "k9-cem-es4", "k9-cem-es5"],
    bio: "Altı kez evlendi, beşinden boşandı. Ailede hakkında en çok şaka yapılan kişi; kendisi de ilk gülen olur. Müzisyen, sürekli turnede.\n\nDört farklı evliliğinden çocukları var.",
  },
  { id: "k9-cem-es1", ad: "Esra", soyad: "Bilgin", c: "female", d: "1983-07-19", yer: "Ankara", f: true, bio: "Cem'in ilk eşi. 2003-2005." },
  { id: "k9-cem-es2", ad: "Melis", soyad: "Arkan", c: "female", d: "1985-01-24", yer: "İstanbul", f: true, bio: "Cem'in ikinci eşi. 2006-2009." },
  { id: "k9-cem-es3", ad: "Jülide", soyad: "Kaya", c: "female", d: "1980-10-05", yer: "İzmir", f: true, bio: "Cem'in üçüncü eşi. 2010-2012." },
  { id: "k9-cem-es4", ad: "Ayça", soyad: "Demir", c: "female", d: "1988-04-11", yer: "Antalya", f: true, bio: "Cem'in dördüncü eşi. 2013-2016." },
  { id: "k9-cem-es5", ad: "Ceren", soyad: "Aydın", c: "female", d: "1990-12-02", yer: "İstanbul", f: true, bio: "Cem'in beşinci eşi. 2017-2019." },
  { id: "k9-cem-es6", ad: "Zeynep", soyad: "Demirtaş", c: "female", d: "1992-08-16", yer: "İstanbul", f: true, bio: "Cem'in altıncı eşi. 2021'den beri evliler." },

  { id: "k9-selin", ad: "Selin", soyad: "Demirtaş", c: "female", d: "1984-02-14", yer: "Ankara", eb: ["k8-orhan", "k8-orhan-es2"], f: true, bio: "Hiç evlenmedi. Kutup araştırmacısı; yılın yarısını Antarktika'da geçiriyor." },

  // Orhan'ın 3. evliliğinden (Nalan)
  { id: "k9-ikiz1", ad: "Alp", soyad: "Demirtaş", c: "male", d: "1994-05-21", yer: "İstanbul", eb: ["k8-orhan", "k8-orhan-es3"], es: ["k9-ikiz1-es"], f: true, bio: "İkiz. Kardeşi Ada'dan dört dakika büyük." },
  { id: "k9-ikiz2", ad: "Ada", soyad: "Demirtaş", c: "female", d: "1994-05-21", yer: "İstanbul", eb: ["k8-orhan", "k8-orhan-es3"], f: true, bio: "İkiz. Ağabeyi Alp'ten dört dakika küçük." },
  { id: "k9-ikiz1-es", ad: "Naz", soyad: "Demirtaş", c: "female", d: "1996-09-03", yer: "İstanbul", f: true, bio: "Adını, Alp'in büyük büyükannesi Naz'dan aldığı için aile bunu uğur saydı." },

  // Sevim kolu — ikinci dereceden kuzen evliliği
  {
    id: "k9-ela", ad: "Ela", soyad: "Öztürk", c: "female", d: "1980-07-08", yer: "İstanbul", f: true,
    eb: ["k8-sevim", "k8-sevim-es"], es: ["k9-ela-es"],
    bio: "Eşi Kerem ile ikinci dereceden kuzenler — büyük büyükbabaları Mehmet ve Ali kardeşti. Bunu ancak nişanlandıktan sonra fark ettiler.",
  },
  {
    id: "k9-ela-es", ad: "Kerem", soyad: "Yıldırım", c: "male", d: "1977-11-16", yer: "İzmir", f: true,
    eb: ["k8-ercan", "k8-ercan-es"],
    bio: "Ela'nın ikinci dereceden kuzeni ve eşi. Yıldırım kolundan; 1934'te ayrılan iki soyadı bu evlilikle yeniden birleşti.",
  },

  // Deniz S. (interseks) — evlat edinme
  {
    id: "k9-umut", ad: "Umut", soyad: "Demirtaş", c: "other", d: "1996-04-23", yer: "Bodrum", f: true,
    eb: ["k8-deniz-s"],
    bag: { "k8-deniz-s": { kind: "adoptive", note: "1999'da tek başına evlat edinildi." } },
    bio: "Deniz tarafından tek başına evlat edinildi. Kendini ikili cinsiyet tanımlarının dışında görüyor; nüfus kaydında \"diğer\" olarak geçiyor.\n\nDeniz'in seramik atölyesini birlikte işletiyorlar.",
  },

  {
    id: "k9-kaya", ad: "Kaya", soyad: "Demirtaş", c: "male", d: "1994-03-19", yer: "Gölcük", f: true,
    eb: ["k8-nurhan", "k8-nurhan-es"],
    bag: {
      "k8-nurhan": { kind: "adoptive", note: "1999 Marmara depreminde öz ailesini kaybetti; teyzesi evlat edindi." },
      "k8-nurhan-es": { kind: "adoptive", note: "1999 Marmara depreminde öz ailesini kaybetti; 2000'de evlat edinildi." },
    },
    bio: "17 Ağustos 1999'da Gölcük'te anne ve babasını kaybetti; beş yaşındaydı. Annesinin kuzeni Nurhan ve eşi Selçuk tarafından evlat edinildi.\n\nJeoloji mühendisi oldu. \"Mesleğimi seçerken kimseye sormadım\" diyor.",
  },

  // Nurhan kolu
  { id: "k9-burcu", ad: "Burcu", soyad: "Demirtaş", c: "female", d: "1986-01-19", yer: "Kayseri", eb: ["k8-nurhan", "k8-nurhan-es"], es: ["k9-burcu-es"], f: true },
  { id: "k9-burcu-es", ad: "Emre", soyad: "Sarıkaya", c: "male", d: "1983-06-27", yer: "Kayseri", f: true },
  { id: "k9-onur", ad: "Onur", soyad: "Demirtaş", c: "male", d: "1989-10-30", yer: "Kayseri", eb: ["k8-nurhan", "k8-nurhan-es"], f: true },

  // Almanya kolu
  {
    id: "k9-burak", ad: "Burak", soyad: "Demirtaş", c: "male", d: "1992-02-11", yer: "Köln, Almanya", f: true,
    eb: ["k8-erdal", "k8-erdal-es"], es: ["k9-burak-es"],
    bio: "Üçüncü kuşak Almanyalı. Türkçesi aksanlı, Almancası ana dili. Berlin'de yazılım geliştiricisi.",
  },
  { id: "k9-burak-es", ad: "Lena", soyad: "Demirtaş", c: "female", d: "1993-07-05", yer: "Berlin, Almanya", f: true },
  { id: "k9-defne-a", ad: "Defne", soyad: "Demirtaş", c: "female", d: "1995-11-27", yer: "Köln, Almanya", eb: ["k8-erdal", "k8-erdal-es"], f: true },
  { id: "k9-sinan", ad: "Sinan", soyad: "Şensoy", c: "male", d: "1988-03-09", yer: "Duisburg, Almanya", eb: ["k8-hulya-a", "k8-hulya-es"], es: ["k9-sinan-es"], f: true },
  { id: "k9-sinan-es", ad: "Merve", soyad: "Şensoy", c: "female", d: "1991-05-14", yer: "Köln, Almanya", f: true },

  {
    id: "k9-murat", ad: "Murat", soyad: "Yıldırım", c: "male", d: "1979-05-08", yer: "İzmir", f: true,
    eb: ["k8-ercan", "k8-ercan-es"], es: ["k9-murat-es"],
    bag: { "k8-ercan": { estranged: "by-parent", note: "1999'daki evliliği sonrası babası tarafından reddedildi." } },
    bio: "1999'da ailesinin karşı çıktığı bir evlilik yaptı; babası \"benim oğlum yok\" deyip bağını kesti, bir daha görüşmediler. Annesi gizlice görüşmeyi sürdürdü.\n\nDeniz biyoloğu. Çocuklarına dedelerini hiç tanıtamadı.",
  },
  { id: "k9-murat-es", ad: "Rana", soyad: "Yıldırım", c: "female", d: "1981-02-26", yer: "Diyarbakır", f: true },

  // Ankara kolu
  { id: "k9-tolga", ad: "Tolga", soyad: "Soydan", c: "male", d: "1976-08-22", yer: "Ankara", eb: ["k8-mualla", "k8-mualla-es"], es: ["k9-tolga-es"], eski: ["k9-tolga-eski"], f: true, bio: "Bir kez boşandı, ikinci evliliğini yaptı." },
  { id: "k9-tolga-eski", ad: "Gamze", soyad: "Kılıç", c: "female", d: "1979-02-03", yer: "Ankara", f: true, bio: "Tolga'nın ilk eşi. 2002-2008." },
  { id: "k9-tolga-es", ad: "Sema", soyad: "Soydan", c: "female", d: "1983-09-18", yer: "Ankara", f: true },

  // İstanbul (Turgut) kolu
  { id: "k9-ozge", ad: "Özge", soyad: "Demirtaş", c: "female", d: "1987-04-05", yer: "İstanbul", eb: ["k8-hakan-t", "k8-hakan-es"], f: true },
  { id: "k9-mert", ad: "Mert", soyad: "Demirtaş", c: "male", d: "1990-12-13", yer: "İstanbul", eb: ["k8-hakan-t", "k8-hakan-es"], es: ["k9-mert-es"], f: true },
  { id: "k9-mert-es", ad: "İrem", soyad: "Demirtaş", c: "female", d: "1993-01-29", yer: "İstanbul", f: true },

  // Develi kolu
  { id: "k9-seda", ad: "Seda", soyad: "Ergin", c: "female", d: "1982-06-11", yer: "Develi", eb: ["k8-fatos", "k8-fatos-es"], es: ["k9-seda-es"], f: true },
  { id: "k9-seda-es", ad: "Volkan", soyad: "Ergin", c: "male", d: "1978-10-26", yer: "Kayseri", f: true },
  { id: "k9-gokhan", ad: "Gökhan", soyad: "Yıldırım", c: "male", d: "1985-03-16", yer: "Develi", eb: ["k8-serpil", "k8-serpil-es"], f: true },

  { id: "k9-tunc", ad: "Tunç", soyad: "Toroslu", c: "male", d: "1980-02-11", yer: "Adana", eb: ["k8-aysel", "k8-aysel-es1"], f: true, bio: "Aysel'in ilk evliliğinden. Babası o bir yaşındayken öldü, hiç hatırlamıyor." },
  { id: "k9-pelin", ad: "Pelin", soyad: "Alkan", c: "female", d: "1985-06-24", yer: "Mersin", eb: ["k8-aysel", "k8-aysel-es2"], f: true, bio: "Aysel'in ikinci evliliğinden." },
  { id: "k9-koray", ad: "Koray", soyad: "Toroslu", c: "male", d: "1998-10-05", yer: "Adana", eb: ["k8-aysel", "k8-aysel-es5"], f: true, bio: "Aysel'in beşinci evliliğinden. En büyük ağabeyi Tunç'tan 18 yaş küçük." },

  // Adana kolu
  { id: "k9-ebru", ad: "Ebru", soyad: "Toroslu", c: "female", d: "1991-07-24", yer: "Adana", eb: ["k8-levent", "k8-levent-es"], es: ["k9-ebru-es"], f: true },
  { id: "k9-ebru-es", ad: "Serkan", soyad: "Toroslu", c: "male", d: "1988-11-02", yer: "Mersin", f: true },
];

/* ================================================================
   10. KUŞAK — ~2005-2020 · Ego'dan bir sonraki kuşak
   ================================================================ */
const K10: Seed[] = [
  // Deniz + Ece
  { id: "k10-poyraz", ad: "Poyraz", soyad: "Demirtaş", c: "male", d: "2013-05-09", yer: "İstanbul", eb: ["k9-deniz", "k9-deniz-es"], f: true, bio: "Deniz'in oğlu. \"Babamın da bir zamanlar başka bir adı varmış\" diyerek anlatıyor babasının hikâyesini — hiç yadırgamadan." },
  { id: "k10-duru", ad: "Duru", soyad: "Demirtaş", c: "female", d: "2016-09-21", yer: "İstanbul", eb: ["k9-deniz", "k9-deniz-es"], f: true },

  // Pınar + Barış
  { id: "k10-kaan", ad: "Kaan", soyad: "Uysal", c: "male", d: "2001-04-17", yer: "İstanbul", eb: ["k9-pinar", "k9-pinar-es"], es: ["k10-kaan-es"], f: true },
  { id: "k10-kaan-es", ad: "Nehir", soyad: "Uysal", c: "female", d: "2002-08-30", yer: "İstanbul", f: true },
  { id: "k10-asli", ad: "Aslı", soyad: "Uysal", c: "female", d: "2004-12-06", yer: "İstanbul", eb: ["k9-pinar", "k9-pinar-es"], f: true },

  // Cem'in dört farklı evliliğinden çocukları
  {
    id: "k10-can", ad: "Can", soyad: "Demirtaş", c: "male", d: "2004-06-18", yer: "Ankara", f: true,
    eb: ["k9-cem", "k9-cem-es1"],
    bag: { "k9-cem": { estranged: "by-child", note: "2022'den beri babasıyla görüşmüyor." } },
    bio: "Cem'in ilk evliliğinden. 2022'de babasıyla bağını kendi kesti — \"altı evlilik saydım, hiçbirinde ben yoktum\" diyor. Annesi Esra ile yakın.",
  },
  { id: "k10-ipek", ad: "İpek", soyad: "Demirtaş", c: "female", d: "2008-02-27", yer: "İstanbul", eb: ["k9-cem", "k9-cem-es2"], f: true, bio: "Cem'in ikinci evliliğinden." },
  { id: "k10-tuna", ad: "Tuna", soyad: "Demirtaş", c: "male", d: "2015-10-14", yer: "Antalya", eb: ["k9-cem", "k9-cem-es4"], f: true, bio: "Cem'in dördüncü evliliğinden." },
  { id: "k10-mira", ad: "Mira", soyad: "Demirtaş", c: "female", d: "2022-03-08", yer: "İstanbul", eb: ["k9-cem", "k9-cem-es6"], f: true, bio: "Cem'in altıncı evliliğinden. En büyük ağabeyi Can'dan 18 yaş küçük." },

  // Alp + Naz
  { id: "k10-atlas", ad: "Atlas", soyad: "Demirtaş", c: "male", d: "2021-07-19", yer: "İstanbul", eb: ["k9-ikiz1", "k9-ikiz1-es"], f: true },
  // Ada — tek ebeveynli
  { id: "k10-ege", ad: "Ege", soyad: "Demirtaş", c: "male", d: "2023-01-26", yer: "İstanbul", eb: ["k9-ikiz2"], f: true, bio: "Ada'nın tek başına dünyaya getirdiği çocuk. Babası kayıtlarda yok." },

  // Ela + Kerem (kuzen evliliği)
  { id: "k10-arda", ad: "Arda", soyad: "Yıldırım", c: "male", d: "2007-09-12", yer: "İstanbul", eb: ["k9-ela", "k9-ela-es"], f: true, bio: "Hem Demirtaş hem Yıldırım kolundan geliyor — anne ve babası ikinci dereceden kuzen." },
  { id: "k10-lara", ad: "Lara", soyad: "Yıldırım", c: "female", d: "2010-03-04", yer: "İstanbul", eb: ["k9-ela", "k9-ela-es"], f: true },

  // Umut
  { id: "k10-rüzgar", ad: "Rüzgâr", soyad: "Demirtaş", c: "unknown", d: "2024-06-02", yer: "Bodrum", eb: ["k9-umut"], f: true, bio: "Henüz çok küçük; aile cinsiyet ataması yapmadan büyütmeyi tercih ediyor." },

  {
    id: "k10-nil", ad: "Nil", soyad: "Sarıkaya", c: "female", d: "2006-11-12", yer: "Kayseri", f: true,
    eb: ["k9-burcu", "k9-burcu-es"],
    bio: "Doğumda erkek olarak kaydedildi. 2024'te geçiş sürecini tamamladı, adını Nil olarak değiştirdi.\n\nAilenin tepkisi kuşaktan kuşağa farklı oldu: büyük halası Deniz'in 1994'te yaşadıklarını bilenler için bu sefer daha kolaydı.",
  },

  // Burcu + Emre
  { id: "k10-eylul", ad: "Eylül", soyad: "Sarıkaya", c: "female", d: "2011-09-08", yer: "Kayseri", eb: ["k9-burcu", "k9-burcu-es"], f: true },
  { id: "k10-cinar", ad: "Çınar", soyad: "Sarıkaya", c: "male", d: "2014-04-22", yer: "Kayseri", eb: ["k9-burcu", "k9-burcu-es"], f: true },

  // Almanya
  { id: "k10-emil", ad: "Emil", soyad: "Demirtaş", c: "male", d: "2019-11-15", yer: "Berlin, Almanya", eb: ["k9-burak", "k9-burak-es"], f: true, bio: "Dördüncü kuşak Almanyalı. Adı hem Almanca hem Türkçe okunabilsin diye seçildi." },
  { id: "k10-mila", ad: "Mila", soyad: "Demirtaş", c: "female", d: "2022-08-27", yer: "Berlin, Almanya", eb: ["k9-burak", "k9-burak-es"], f: true },
  { id: "k10-yaren", ad: "Yaren", soyad: "Şensoy", c: "female", d: "2016-02-19", yer: "Köln, Almanya", eb: ["k9-sinan", "k9-sinan-es"], f: true },
  { id: "k10-baran", ad: "Baran", soyad: "Şensoy", c: "male", d: "2018-12-30", yer: "Köln, Almanya", eb: ["k9-sinan", "k9-sinan-es"], f: true },

  // Tolga — iki evlilikten
  { id: "k10-berk", ad: "Berk", soyad: "Soydan", c: "male", d: "2005-05-11", yer: "Ankara", eb: ["k9-tolga", "k9-tolga-eski"], f: true, bio: "Tolga'nın ilk evliliğinden." },
  { id: "k10-zehra-y", ad: "Zehra", soyad: "Soydan", c: "female", d: "2012-10-03", yer: "Ankara", eb: ["k9-tolga", "k9-tolga-es"], f: true, bio: "Tolga'nın ikinci evliliğinden. Adını büyük büyük halasından aldı." },

  // Mert + İrem
  { id: "k10-alya", ad: "Alya", soyad: "Demirtaş", c: "female", d: "2020-04-09", yer: "İstanbul", eb: ["k9-mert", "k9-mert-es"], f: true },

  // Seda + Volkan
  { id: "k10-elif-e", ad: "Elif", soyad: "Ergin", c: "female", d: "2009-07-14", yer: "Develi", eb: ["k9-seda", "k9-seda-es"], f: true },
  { id: "k10-yigit", ad: "Yiğit", soyad: "Ergin", c: "male", d: "2012-01-23", yer: "Kayseri", eb: ["k9-seda", "k9-seda-es"], f: true },

  // Ebru + Serkan
  { id: "k10-derin", ad: "Derin", soyad: "Toroslu", c: "female", d: "2017-06-06", yer: "Adana", eb: ["k9-ebru", "k9-ebru-es"], f: true },
  { id: "k10-kuzey", ad: "Kuzey", soyad: "Toroslu", c: "male", d: "2020-09-28", yer: "Adana", eb: ["k9-ebru", "k9-ebru-es"], f: true },
];

/* ================================================================
   11. KUŞAK — ~2024-2026 · En genç kuşak
   ================================================================ */
const K11: Seed[] = [
  { id: "k11-lina", ad: "Lina", soyad: "Uysal", c: "female", d: "2024-02-14", yer: "İstanbul", eb: ["k10-kaan", "k10-kaan-es"], f: true, bio: "Ağaçtaki en genç kuşağın ilk üyesi. Büyük büyük büyük dedesi Kemal'i hiç görmedi ama adı onun defterinde yazılı." },
  { id: "k11-toprak", ad: "Toprak", soyad: "Uysal", c: "male", d: "2026-01-19", yer: "İstanbul", eb: ["k10-kaan", "k10-kaan-es"], f: true, bio: "Ailenin en yeni ferdi." },
  { id: "k11-bebek", ad: "Adı konmamış", soyad: "Uysal", c: "unknown", d: "2025-04-30", o: "2025-04-30", yer: "İstanbul", eb: ["k10-kaan", "k10-kaan-es"], bio: "Erken doğum; birkaç saat yaşadı. Adı konulamadı." },
];

export const DEMO_PEOPLE: Person[] = build([
  ...K1, ...K2, ...K3, ...K4, ...K5, ...K6, ...K7, ...K8, ...K9, ...K10, ...K11,
]);

export const DEMO_FAMILY_NAME = "Demirtaş";
