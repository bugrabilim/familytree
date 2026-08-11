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
 * Avatarlar arayüzde otomatik üretilir (bkz. lib/avatar.ts) — burada
 * fotoğraf alanı taşınmaz.
 */


/* ----------------------------------------------------------------
   Hikâye tamamlayıcı

   Ağaçtaki her kart bir insanı temsil ediyor; hiçbiri boş kalmasın diye
   elle yazılmamış kişilere de dönemine, yerine ve ömrüne uygun kısa bir
   hikâye üretiliyor. Kimlikten deterministik seçilir, aynı kişi hep aynı
   hikâyeyi alır.
   ---------------------------------------------------------------- */

/** Deterministik karma — hikâye seçimini kimliğe sabitler (FNV-1a) */
function karma(t: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const MESLEK: Array<{ yil: number; e: string[]; k: string[] }> = [
  {
    yil: 1750,
    e: ["değirmenciydi", "çift sürerdi", "koyun güderdi", "nalbanttı", "semer yapardı",
        "köyün imamıydı", "kervanlarda katırcılık ederdi", "tımar sahibiydi", "keçe dövücüsüydü"],
    k: ["ipek böceği beslerdi", "kilim dokurdu", "köyün ebesiydi", "harman savurur, un öğütürdü",
        "yün eğirirdi", "bahçe işlerine bakardı"],
  },
  {
    yil: 1880,
    e: ["halı ticareti yapardı", "demirci ocağı vardı", "marangozdu", "bakırcıydı",
        "tuz kervanlarına katılırdı", "kasaba kâtibiydi", "değirmeni işletirdi", "dokuma tezgâhı kurmuştu"],
    k: ["halı dokurdu", "evde dikiş dikerdi", "sütçülük yapardı", "konağın hesaplarını tutardı",
        "köyün okuma yazma bilen tek kadınıydı", "yufka açıp satardı"],
  },
  {
    yil: 1935,
    e: ["telgrafhanede çalıştı", "jandarmaydı", "fırıncıydı", "kunduracıydı", "muhtarlık yaptı",
        "demiryolunda çalıştı", "berberdi", "tütün eksperiydi", "askerlikten sonra memur oldu"],
    k: ["ilkokul öğretmeniydi", "terzilik yapardı", "ebe olarak çalıştı", "tütün kırdı",
        "halk eğitimde kurs verdi", "evde çeyiz işlerdi"],
  },
  {
    yil: 1975,
    e: ["fabrikada tornacıydı", "kamyon şoförlüğü yaptı", "muhasebeciydi", "elektrikçiydi",
        "bakkal işletti", "öğretmendi", "matbaada çalıştı", "belediyede memurdu", "terzihane açtı"],
    k: ["hemşireydi", "öğretmendi", "bankada çalıştı", "kuaförlük yaptı", "kooperatifte muhasebe tuttu",
        "ev tekstili atölyesi kurdu", "eczanede çalıştı"],
  },
  {
    yil: 2005,
    e: ["makine mühendisi", "avukat", "grafik tasarımcı", "yazılım geliştiricisi", "aşçı",
        "sahne teknisyeni", "veteriner", "lojistik uzmanı", "fizyoterapist"],
    k: ["mimar", "diş hekimi", "yazılım geliştiricisi", "sosyolog", "peyzaj mimarı",
        "veri analisti", "psikolog", "seramik sanatçısı", "gazeteci"],
  },
];

/** Bugün hayatta ve genç olanlar için yaşa uygun tek cümle */
function gencCumlesi(dogumYili: number, h: number): string {
  const yas = 2026 - dogumYili;
  if (yas < 3) return "Ailenin en küçüğü.";
  if (yas < 7) return "Anaokuluna gidiyor.";
  if (yas < 15) return "İlkokul çağında.";
  if (yas < 19) return ["Lisede okuyor.", "Lise son sınıfta.", "Okulda basketbol oynuyor."][h % 3];
  return ["Üniversitede okuyor.", "Yeni mezun, iş arıyor.", "Okurken yarı zamanlı çalışıyor."][h % 3];
}

const AYRINTI = [
  "Ömrünü doğduğu yerde geçirdi.",
  "Uzun yıllar aynı evde oturdu.",
  "Torunları onu sofra kurmadan yemeğe oturtmamasıyla hatırlar.",
  "Sözü dinlenen bir insandı.",
  "Hiç şehir değiştirmedi.",
  "Gençliğinde bir kez İstanbul'a gitti, ömrü boyunca anlattı.",
  "Aile toplantılarının değişmez ismiydi.",
  "Kavga etmeyi hiç sevmezdi.",
  "Elinden her iş gelirdi.",
  "Mektup yazmayı severdi.",
  "Kışları soba başında masal anlatırdı.",
  "Hesabını kimseye bırakmazdı.",
  "Bahçesiyle övünürdü.",
  "Sesi güzeldi, düğünlerde türkü söylerdi.",
  "Az konuşur, çok dinlerdi.",
  "Hayvanlara düşkündü.",
  "Ezberinde yüzlerce beyit vardı.",
  "Tuttuğunu koparan bir yapısı vardı.",
];

function hikayeUret(seed: Seed): string {
  const h = karma(`hik:${seed.id}`);
  const dy = seed.d ? Number(seed.d.slice(0, 4)) : 1900;
  const oy = seed.o ? Number(seed.o.slice(0, 4)) : undefined;
  const yas = oy !== undefined ? oy - dy : undefined;

  // Çok küçükken ölenler için meslek anlatmak yersiz
  if (yas !== undefined && yas <= 15) {
    const yer = seed.yer ? `${seed.yer}'de` : "ailesinin yanında";
    return yas <= 1
      ? `Çok kısa yaşadı. ${seed.yer ? seed.yer + " " : ""}aile mezarlığında, adı taşta.`
      : `${yas} yaşında ${yer} vefat etti. Adı kardeşlerinin çocuklarında yaşatıldı.`;
  }

  const yerCumle = seed.yer ? `${seed.yer} doğumlu. ` : "";

  // Hayattaki gençler için meslek yerine okul/çağ bilgisi
  if (!seed.o && 2026 - dy < 24) {
    return `${yerCumle}${gencCumlesi(dy, h)}`;
  }

  const grup = MESLEK.find((m) => dy < m.yil) ?? MESLEK[MESLEK.length - 1];
  const havuz = seed.c === "female" ? grup.k : grup.e;
  const meslek = havuz[h % havuz.length];
  const ayrinti = AYRINTI[(h >>> 7) % AYRINTI.length];

  return `${yerCumle}${capitalizeIlk(meslek)}. ${ayrinti}`;
}

function capitalizeIlk(t: string): string {
  return t.charAt(0).toLocaleUpperCase("tr") + t.slice(1);
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
  /** din */ din?: string;
  /** mezhep / cemaat */ mez?: string;
  /** ana dil */ dil?: string;
  /** etnik köken */ etnik?: string;
  /** uyruk */ uyruk?: string;
  /** doğuştan sağlık durumu / engellilik */ dogustan?: string;
  /** yaşarken edinilen sağlık sorunu */ saglik?: string;
  /** ölüm nedeni */ olum?: string;
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
    bio: s.bio ?? hikayeUret(s),
    religion: s.din,
    denomination: s.mez,
    language: s.dil,
    ethnicity: s.etnik,
    nationality: s.uyruk,
    congenitalCondition: s.dogustan,
    healthCondition: s.saglik,
    deathCause: s.olum,
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
   OSMANLI KLASİK ÇAĞI — 1520'lerden 1730'lara dört kuşak
   Kayıtlar tahrir defterlerinden ve vakfiyelerden; tarihler tahminî.
   Bu kuşaklarda soyad yoktur: kişiler "filanın oğlu" ya da lakapla anılır.
   ================================================================ */
const K0A: Seed[] = [
  {
    id: "k0a-bali", ad: "Bali", soyad: "Karamanoğlu", c: "male", d: "1521", o: "1589", yer: "Larende",
    din: "İslam", mez: "Hanefi", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Ailenin yazılı kayda geçen ilk atası. Adı 1584 tahrir defterinde \"Bali bin Turgud, sipahi\" olarak geçiyor. Karaman'dan Develi'ye tımar sahibi olarak gönderilmiş.\n\nDoğum ve ölüm yılları defterdeki yaş kayıtlarından hesaplandı; kesin değil.",
  },
  {
    id: "k0a-huma", ad: "Hüma", soyad: "Karamanoğlu", c: "female", d: "1530", o: "1601", yer: "Larende",
    din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı", es: ["k0a-bali"],
    bio: "Bali'nin eşi. Adı yalnızca oğlunun vakfiyesinde \"validesi Hüma Hatun\" olarak geçiyor.",
  },
];

const K0B: Seed[] = [
  {
    id: "k0b-turgud", ad: "Turgud", soyad: "Karamanoğlu", c: "male", d: "1556", o: "1618", yer: "Develi",
    eb: ["k0a-bali", "k0a-huma"], din: "İslam", mez: "Hanefi", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Dedesinin adını taşıyordu — ailedeki en eski ad tekrarı. Develi'de bir çeşme yaptırdı; kitabesi 1604 tarihli ve bugün hâlâ ayakta.",
  },
  { id: "k0b-servi", ad: "Servi", soyad: "Karamanoğlu", c: "female", d: "1562", o: "1620", yer: "Develi", es: ["k0b-turgud"], din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı", bio: "Turgud'un eşi. Altı çocuk doğurdu, üçü büyüdü." },
  {
    id: "k0b-kasim", ad: "Kasım", soyad: "Karamanoğlu", c: "male", d: "1559", o: "1560", yer: "Develi",
    eb: ["k0a-bali", "k0a-huma"], din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Bir yaşına varmadan öldü. Adı yalnızca mezar taşında.",
  },
  {
    id: "k0b-rabia", ad: "Rabia", soyad: "Karamanoğlu", c: "female", d: "1564", yer: "Develi",
    eb: ["k0a-bali", "k0a-huma"], din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Ölüm tarihi bilinmiyor. Kayseri'ye gelin gittiği, sonrasının kaybolduğu söylenir.",
  },
];

const K0C: Seed[] = [
  {
    id: "k0c-mehmed", ad: "Mehmed", soyad: "Karamanoğlu", c: "male", d: "1590", o: "1657", yer: "Develi",
    eb: ["k0b-turgud", "k0b-servi"], din: "İslam", mez: "Hanefi", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Celâlî isyanları döneminde yaşadı; ailenin bir kısmı dağa çekildi, bir kısmı Kayseri surlarına sığındı. Ekinleri iki kez yakıldı, iki kez baştan ekti.",
  },
  { id: "k0c-dilsad", ad: "Dilşad", soyad: "Karamanoğlu", c: "female", d: "1596", o: "1663", yer: "Talas", es: ["k0c-mehmed"], din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı", bio: "Talaslı bir kilim ustasının kızı. Dokuduğu bir seccade aileye kuşaklarca miras kaldı." },
  {
    id: "k0c-balkiz", ad: "Balkız", soyad: "Karamanoğlu", c: "female", d: "1593", o: "1594", yer: "Develi",
    eb: ["k0b-turgud", "k0b-servi"], din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Bir yaşını göremedi. Kıtlık yılıydı.",
  },
  {
    id: "k0c-doganpasa", ad: "Doğan", soyad: "Karamanoğlu", c: "male", d: "1598", o: "1651", yer: "Develi",
    eb: ["k0b-turgud", "k0b-servi"], din: "İslam", mez: "Hanefi", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Yeniçeri ocağına yazıldı, İstanbul'a gitti. Bir daha köye dönmedi; öldüğü haberi on yıl sonra ulaştı.",
  },
];

const K0D: Seed[] = [
  {
    id: "k0d-osman", ad: "Osman", soyad: "Karaosmanoğlu", c: "male", d: "1625", o: "1698", yer: "Develi",
    eb: ["k0c-mehmed", "k0c-dilsad"], din: "İslam", mez: "Hanefi", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Ailenin \"Karaosmanoğlu\" diye anılması ondan gelir: esmerliği yüzünden \"Kara Osman\" derlerdi, çocukları da \"Kara Osman'ın oğulları\" olarak bilindi.\n\nDeğirmen taşını ilk o kurdurdu; iki kuşak sonra aile \"Değirmencioğlu\" olacaktı.",
  },
  { id: "k0d-mihriban", ad: "Mihriban", soyad: "Karaosmanoğlu", c: "female", d: "1633", o: "1702", yer: "Develi", es: ["k0d-osman"], din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı", bio: "Osman'ın eşi. Köyün ebesiydi; kırk yıl boyunca doğumlara girdi." },
  {
    id: "k0d-ismail", ad: "İsmail", soyad: "Karaosmanoğlu", c: "male", d: "1629", o: "1691", yer: "Develi",
    eb: ["k0c-mehmed", "k0c-dilsad"], din: "İslam", mez: "Hanefi", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Kardeşiyle birlikte değirmeni işletti. Hiç evlenmedi; yeğenlerini kendi çocuğu gibi büyüttü.",
  },
  {
    id: "k0d-hatice", ad: "Hatice", soyad: "Karaosmanoğlu", c: "female", d: "1636", o: "1710", yer: "Develi",
    eb: ["k0c-mehmed", "k0c-dilsad"], es: ["k0d-hatice-es"], din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Kayseri'ye gelin gitti. Kardeşleriyle mektuplaşırdı; mektupları torunlarına kaldı.",
  },
  { id: "k0d-hatice-es", ad: "Yusuf", soyad: "Bezirgânoğlu", c: "male", d: "1630", o: "1699", yer: "Kayseri", din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı", bio: "Kayserili bir bez tüccarı. Halep'e kadar kervan yürüttü." },
];

/* ================================================================
   1. KUŞAK — ~1730'lar · Develi, Kayseri
   Kayıt yok; isimler mezar taşı ve sözlü aktarımdan.
   ================================================================ */
const K1: Seed[] = [
  {
    id: "k1-veli", ad: "Veli", soyad: "Karaosmanoğlu", c: "male", d: "1668", o: "1741", yer: "Develi",
    eb: ["k0d-osman", "k0d-mihriban"],
    din: "İslam", mez: "Hanefi", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Kara Osman'ın oğlu. Değirmeni babasından devraldı, üstüne bir de bezirhane kurdu.\n\nDevelii'deki aile mezarlığında adı okunabilen en eski taşlardan biri ona ait; tarihler taştaki ebced hesabından çıkarıldı.",
  },
  {
    id: "k1-ayse", ad: "Ayşe", soyad: "Karaosmanoğlu", c: "female", d: "1676", o: "1749", yer: "Develi",
    es: ["k1-veli"], din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Veli'nin eşi. Mezar taşı yok; adı oğlu İbrahim'in nikâh kaydından biliniyor.",
  },
  {
    id: "k1-bilinmeyen", ad: "Adı bilinmeyen", soyad: "Karaosmanoğlu", c: "unknown",
    eb: ["k1-veli", "k1-ayse"], din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Aile defterinde \"bir evlat daha\" diye geçiyor; adı, cinsiyeti ve akıbeti bilinmiyor. Muhtemelen küçük yaşta vefat etti.",
  },
];


/* ================================================================
   1B. KUŞAK — ~1710 · Veli ile İbrahim arasındaki halka
   ================================================================ */
const K1B: Seed[] = [
  {
    id: "k1b-suleyman", ad: "Süleyman", soyad: "Değirmencioğlu", c: "male", d: "1712", o: "1779", yer: "Develi",
    eb: ["k1-veli", "k1-ayse"], din: "İslam", mez: "Hanefi", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Aile bu kuşakta \"Karaosmanoğlu\"ndan \"Değirmencioğlu\"na döndü: artık esmerlikle değil, çevirdikleri değirmenle anılıyorlardı.\n\nDevelii'ye ikinci bir taş daha kurdurdu.",
  },
  {
    id: "k1b-serife", ad: "Şerife", soyad: "Değirmencioğlu", c: "female", d: "1721", o: "1788", yer: "Talas",
    es: ["k1b-suleyman"], din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Süleyman'ın eşi. Talaslı bir imamın kızıydı, okuma yazma bilirdi — o kuşakta kadınlar arasında ender.",
  },
  {
    id: "k1b-omer", ad: "Ömer", soyad: "Değirmencioğlu", c: "male", d: "1716", o: "1717", yer: "Develi",
    eb: ["k1-veli", "k1-ayse"], din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Bir yaşına varmadan öldü.",
  },
  {
    id: "k1b-emine", ad: "Emine", soyad: "Değirmencioğlu", c: "female", yer: "Develi",
    eb: ["k1-veli", "k1-ayse"], din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Doğum ve ölüm tarihi bilinmiyor. Adı yalnızca kardeşinin mirasla ilgili bir belgesinde geçiyor.",
  },
  {
    id: "k1b-mehmed", ad: "Mehmed", soyad: "Değirmencioğlu", c: "male", yer: "Develi",
    eb: ["k1-veli", "k1-ayse"], din: "İslam", dil: "Türkçe", etnik: "Türkmen", uyruk: "Osmanlı",
    bio: "Tarihleri bilinmiyor. Hacca gittiği, dönüş yolunda Şam'da vefat ettiği anlatılır.",
  },
];

/* ================================================================
   2. KUŞAK — ~1765 · Çok eşlilik
   ================================================================ */
const K2: Seed[] = [
  {
    id: "k2-ibrahim", ad: "İbrahim", soyad: "Değirmencioğlu", c: "male", d: "1764", o: "1831", yer: "Develi",
    eb: ["k1b-suleyman", "k1b-serife"],
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
    id: "k6-mehmet", ad: "Mehmet", soyad: "Demirtaş", c: "male", d: "1886-04-12", o: "1961-11-03", yer: "Kayseri",
    eb: ["k5-omer", "k5-omer-es"],
    bio: "1934 Soyadı Kanunu çıkınca \"Demirtaş\" soyadını aldı; demirci çıraklığından gelen bir tercihti. Kardeşi Ali ise \"Yıldırım\"ı seçti, iki kardeşin torunları bugün farklı soyadları taşıyor.\n\nAmcasının kızı Naz ile evlendi — o dönem yaygın olan bir akraba evliliği.",
  },
  {
    id: "k6-naz", ad: "Naz", soyad: "Demirtaş", c: "female", d: "1892-07-30", o: "1975-02-18", yer: "Kayseri",
    eb: ["k5-zehra", "k5-zehra-es"], es: ["k6-mehmet"],
    bio: "Mehmet'in birinci dereceden kuzeni (halasının kızı). Evlilikleri aile içinde \"amca kızı\" evliliği olarak anılır. Yedi çocuk doğurdu, beşi yetişkinliğe ulaştı.",
  },
  {
    id: "k6-ali", ad: "Ali", soyad: "Yıldırım", c: "male", d: "1889-01-22", o: "1957-06-09", yer: "Kayseri",
    eb: ["k5-omer", "k5-omer-es"],
    bio: "Mehmet'in kardeşi. 1934'te ağabeyinden farklı olarak \"Yıldırım\" soyadını aldı — nüfus memuruyla yaşadığı bir tartışma sonucu olduğu anlatılır. İzmir'e yerleşti.",
  },
  { id: "k6-ali-es", ad: "Şükran", soyad: "Yıldırım", c: "female", d: "1896-03-05", o: "1980-12-01", yer: "İzmir", es: ["k6-ali"] },

  {
    id: "k6-riza", ad: "Rıza", soyad: "Demirtaş", c: "male", d: "1893-09-14", o: "1915-08-10", yer: "Kayseri",
    eb: ["k5-omer", "k5-omer-es"],
    bio: "Çanakkale'de, Conkbayırı'nda şehit düştü. Yirmi bir yaşındaydı, hiç evlenmedi. Soyadı kanunu çıkmadan öldüğü için resmî soyadı hiç olmadı; kayıtlara sonradan ailesinin soyadıyla geçildi.",
  },
  {
    id: "k6-hatice", ad: "Hatice", soyad: "Akgün", c: "female", d: "1891-05-20", o: "1972-04-11", yer: "Kayseri",
    eb: ["k5-omer", "k5-omer-es"], es: ["k6-hatice-es"],
    bio: "Evlenince kocasının soyadını aldı; kardeşleriyle farklı soyadları taşıdılar.",
  },
  { id: "k6-hatice-es", ad: "Şevket", soyad: "Akgün", c: "male", d: "1888-02-28", o: "1965-07-19", yer: "Ankara" },

  {
    id: "k6-fikret", ad: "Fikret", soyad: "Demirtaş", c: "male", d: "1898-11-02", o: "1921-09-13", yer: "Kayseri",
    eb: ["k5-omer", "k5-omer-es"],
    bio: "Sakarya Meydan Muharebesi'nde kayboldu; naaşı bulunamadı. Ölüm tarihi tahminî.",
  },

  // Halil kolu
  { id: "k6-turgut", ad: "Turgut", soyad: "Demirtaş", c: "male", d: "1895-06-17", o: "1968-03-22", yer: "Kayseri", eb: ["k5-halil", "k5-halil-es"] },
  { id: "k6-turgut-es", ad: "Nermin", soyad: "Demirtaş", c: "female", d: "1902-10-08", o: "1988-01-30", yer: "İstanbul", es: ["k6-turgut"] },
  {
    id: "k6-sitki", ad: "Sıtkı", soyad: "Demirtaş", c: "male", d: "1908-05-02", o: "1979-04-17", yer: "Manastır",
    eb: ["k5-halil", "k5-halil-es"],
    bag: {
      "k5-halil": { kind: "adoptive", note: "Balkan Savaşı yetimi; 1913'te evlat edinildi." },
      "k5-halil-es": { kind: "adoptive", note: "Balkan Savaşı yetimi; 1913'te evlat edinildi." },
    },
    bio: "Balkan Savaşı'nda ailesini kaybetti, Manastır'dan gelen muhacir kafilesiyle Kayseri'ye ulaştı. 1913'te Halil ve Melek tarafından evlat edinildi.\n\nÖz soyadını hiç öğrenemedi; 1934'te ailesinin soyadını aldı. \"Beni bulan aile benim ailemdir\" derdi.",
  },
  { id: "k6-sitki-es", ad: "Refika", soyad: "Demirtaş", c: "female", d: "1915-08-11", o: "1988-02-20", yer: "Kayseri", es: ["k6-sitki"] },

  // Süleyman kolu
  { id: "k6-zekiye", ad: "Zekiye", soyad: "Demirtaş", c: "female", d: "1900-08-25", o: "2003-05-14", yer: "Develi", eb: ["k5-suleyman", "k5-suleyman-es"], bio: "102 yaşında vefat etti. Ailenin en uzun yaşayan ferdi; dört kuşağı bir arada gördü." },
  { id: "k6-zekiye-es", ad: "Kâzım", soyad: "Ergin", c: "male", d: "1894-12-19", o: "1970-08-08", es: ["k6-zekiye"] },
  // Nuri kolu (Yıldırım'a geçmeyen dal)
  { id: "k6-sadik", ad: "Sadık", soyad: "Yıldırım", c: "male", d: "1890-03-11", o: "1959-10-25", yer: "Develi", eb: ["k5-nuri", "k5-nuri-es"] },
  { id: "k6-sadik-es", ad: "Münevver", soyad: "Yıldırım", c: "female", d: "1897-07-07", o: "1979-06-16", es: ["k6-sadik"] },
  // Adana kolu
  { id: "k6-nihat", ad: "Nihat", soyad: "Toroslu", c: "male", d: "1899-04-30", o: "1974-02-02", yer: "Adana", eb: ["k5-cemal", "k5-cemal-es"] },
  { id: "k6-nihat-es", ad: "Melahat", soyad: "Toroslu", c: "female", d: "1905-09-21", o: "1991-11-11", yer: "Adana", es: ["k6-nihat"] },
];

/* ================================================================
   7. KUŞAK — ~1915-1930 · Cumhuriyet, göç, bebek ölümleri
   ================================================================ */
const K7: Seed[] = [
  {
    id: "k7-kemal", ad: "Kemal", soyad: "Demirtaş", c: "male", d: "1918-03-08", o: "1994-12-27", yer: "Kayseri",
    eb: ["k6-mehmet", "k6-naz"],
    bio: "Ailenin İstanbul'a taşınmasına önayak oldu. Sümerbank'ta memur olarak çalıştı, 1978'de emekli oldu. Akşamları radyo dinleyip çocuklarına Çanakkale'de ölen amcası Rıza'yı anlatırdı.",
  },
  { id: "k7-kemal-es", ad: "Muazzez", soyad: "Demirtaş", c: "female", d: "1924-05-16", o: "2009-08-03", yer: "İstanbul", es: ["k7-kemal"], bio: "İlkokul öğretmeni. Emekli olduktan sonra da mahalledeki çocuklara ücretsiz ders verdi." },

  { id: "k7-sabri", ad: "Sabri", soyad: "Demirtaş", c: "male", d: "1920-10-11", o: "1997-04-19", yer: "Kayseri", eb: ["k6-mehmet", "k6-naz"] },
  { id: "k7-sabri-es", ad: "Ayten", soyad: "Demirtaş", c: "female", d: "1927-02-14", o: "2011-01-25", es: ["k7-sabri"] },

  { id: "k7-nesrin", ad: "Nesrin", soyad: "Demirtaş", c: "female", d: "1922-07-19", o: "2016-03-30", yer: "Kayseri", eb: ["k6-mehmet", "k6-naz"], bio: "Hiç evlenmedi. Ailenin ilk üniversite mezunu kadını; eczacılık okudu, Kadıköy'de kırk yıl eczane işletti." },

  { id: "k7-bebek", ad: "Ömer", soyad: "Demirtaş", c: "male", d: "1925-01-30", o: "1925-06-12", yer: "Kayseri", eb: ["k6-mehmet", "k6-naz"], bio: "Dört buçuk aylıkken boğmacadan vefat etti. Dedesi Ömer'in adı verilmişti." },
  { id: "k7-bebek2", ad: "Naz", soyad: "Demirtaş", c: "female", d: "1928-11-04", o: "1929-02-08", yer: "Kayseri", eb: ["k6-mehmet", "k6-naz"], bio: "Üç aylıkken zatürreden vefat etti. Annesiyle aynı adı taşıyordu." },

  {
    id: "k7-yusuf", ad: "Yusuf", soyad: "Demirtaş", c: "male", d: "1926-09-23", o: "2004-06-15", yer: "Kayseri",
    eb: ["k6-mehmet", "k6-naz"],
    bio: "1962'de işçi olarak Almanya'ya gitti; Köln'de Ford fabrikasında çalıştı. \"İki yıllığına\" gitti, kırk iki yıl kaldı. Ailenin Almanya kolu ondan gelir.",
  },
  { id: "k7-yusuf-es", ad: "Gülizar", soyad: "Demirtaş", c: "female", d: "1931-04-02", o: "2018-10-09", yer: "Develi", es: ["k7-yusuf"], bio: "1965'te eşinin yanına, Köln'e gitti. Ömrünün yarısını Almanya'da geçirdi ama Almanca öğrenmedi." },

  // Ali (Yıldırım) kolu — İzmir
  { id: "k7-erol", ad: "Erol", soyad: "Yıldırım", c: "male", d: "1921-12-06", o: "1999-05-21", yer: "İzmir", eb: ["k6-ali", "k6-ali-es"] },
  { id: "k7-erol-es", ad: "Suzan", soyad: "Yıldırım", c: "female", d: "1929-08-17", o: "2013-07-04", yer: "İzmir", es: ["k7-erol"] },
  { id: "k7-guler", ad: "Güler", soyad: "Yıldırım", c: "female", d: "1925-03-29", o: "2010-09-12", yer: "İzmir", eb: ["k6-ali", "k6-ali-es"] },

  // Hatice (Akgün) kolu — Ankara
  { id: "k7-behice", ad: "Behice", soyad: "Akgün", c: "female", d: "1919-06-24", o: "2002-11-28", yer: "Ankara", eb: ["k6-hatice", "k6-hatice-es"] },
  { id: "k7-behice-es", ad: "Tevfik", soyad: "Soydan", c: "male", d: "1914-01-09", o: "1989-03-17", yer: "Ankara", es: ["k7-behice"] },

  // Turgut kolu — İstanbul
  { id: "k7-orhan-t", ad: "Orhan", soyad: "Demirtaş", c: "male", d: "1928-04-15", o: "2005-02-26", yer: "İstanbul", eb: ["k6-turgut", "k6-turgut-es"] },
  { id: "k7-orhan-t-es", ad: "Semra", soyad: "Demirtaş", c: "female", d: "1934-10-30", o: "2020-04-07", yer: "İstanbul", es: ["k7-orhan-t"] },

  // Zekiye kolu
  { id: "k7-necati", ad: "Necati", soyad: "Ergin", c: "male", d: "1926-02-11", o: "2001-12-05", yer: "Develi", eb: ["k6-zekiye", "k6-zekiye-es"] },
  {
    id: "k7-necati-es", ad: "Fitnat", soyad: "Ergin", c: "female", d: "1933-05-08", o: "2015-06-20", yer: "Develi",
    eb: ["k6-sadik", "k6-sadik-es"], es: ["k7-necati"],
    bio: "Evlenmeden önceki soyadı Yıldırım'dı. Eşi Necati ile üçüncü dereceden kuzenler — ortak ataları Mustafa Değirmencioğlu (1793).\n\nDevelii'de iki kolun birbirini bulması olağandı; \"zaten hepimiz akrabayız\" derdi.",
  },

  // Sadık (Yıldırım) kolu
  { id: "k7-hulusi", ad: "Hulusi", soyad: "Yıldırım", c: "male", d: "1923-08-03", o: "1996-10-14", yer: "Develi", eb: ["k6-sadik", "k6-sadik-es"] },
  { id: "k7-hulusi-es", ad: "Sıdıka", soyad: "Yıldırım", c: "female", d: "1930-01-27", o: "2008-03-11", es: ["k7-hulusi"] },

  // Adana kolu
  { id: "k7-vedat", ad: "Vedat", soyad: "Toroslu", c: "male", d: "1930-07-12", o: "2012-09-30", yer: "Adana", eb: ["k6-nihat", "k6-nihat-es"] },
  { id: "k7-vedat-es", ad: "Nurten", soyad: "Toroslu", c: "female", d: "1936-11-19", yer: "Adana", es: ["k7-vedat"], bio: "Ailenin yaşayan en yaşlı ferdi." },
];

/* ================================================================
   8. KUŞAK — ~1945-1960 · Seri evlilikler, Almanya doğumlular, interseks
   ================================================================ */
const K8: Seed[] = [
  {
    id: "k8-orhan", ad: "Orhan", soyad: "Demirtaş", c: "male", d: "1947-02-19", yer: "İstanbul",
    eb: ["k7-kemal", "k7-kemal-es"],
    es: ["k8-orhan-es3"], eski: ["k8-orhan-es1", "k8-orhan-es2"],
    bio: "Üç kez evlendi, ikisinden boşandı. İnşaat mühendisi; 70'lerde Libya ve Suudi Arabistan'da şantiyelerde çalıştı, uzun süre ailesinden ayrı kaldı — ilk iki evliliğinin bitmesini buna bağlar.\n\nHer üç evliliğinden de çocukları var.",
  },
  { id: "k8-orhan-es1", ad: "Filiz", soyad: "Aksoy", c: "female", d: "1950-06-08", yer: "İstanbul", bio: "Orhan'ın ilk eşi. 1968'de evlendiler, 1976'da boşandılar." },
  { id: "k8-orhan-es2", ad: "Sevda", soyad: "Kurtoğlu", c: "female", d: "1955-03-22", yer: "Ankara", bio: "Orhan'ın ikinci eşi. 1978-1989 arası evli kaldılar." },
  { id: "k8-orhan-es3", ad: "Nalan", soyad: "Demirtaş", c: "female", d: "1961-09-30", yer: "İzmir", bio: "Orhan'ın üçüncü eşi. 1992'den beri evliler." },

  { id: "k8-sevim", ad: "Sevim", soyad: "Öztürk", c: "female", d: "1949-11-25", yer: "İstanbul", eb: ["k7-kemal", "k7-kemal-es"], es: ["k8-sevim-es"] },
  { id: "k8-sevim-es", ad: "Metin", soyad: "Öztürk", c: "male", d: "1944-08-14", o: "2019-01-08", yer: "Bursa" },

  {
    id: "k8-gulten", ad: "Gülten", soyad: "Demirtaş", c: "female", d: "1953-04-06", yer: "İstanbul",
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
    id: "k8-deniz-s", ad: "Deniz", soyad: "Demirtaş", c: "other", d: "1958-07-04", yer: "Kayseri",
    eb: ["k7-sabri", "k7-sabri-es"],
    bag: { "k7-sabri": { estranged: "by-parent", note: "1994'teki kayıt değişikliğinden sonra babası görüşmeyi kesti; 1997'de vefat edene dek barışmadılar." } },
    bio: "İnterseks doğdu. 1958'de nüfusa \"erkek\" olarak kaydedildi; 1994'te açtığı davayla kaydını değiştirdi. Babası bunu kabul etmedi ve ölene dek görüşmediler; annesi ise hep aradı.\n\nSeramik sanatçısı. Bodrum'da atölyesi var. 1999'da Umut'u evlat edindi.",
  },
  { id: "k8-nurhan", ad: "Nurhan", soyad: "Demirtaş", c: "female", d: "1961-12-09", yer: "Kayseri", eb: ["k7-sabri", "k7-sabri-es"], es: ["k8-nurhan-es"] },
  { id: "k8-nurhan-es", ad: "Selçuk", soyad: "Demirtaş", c: "male", d: "1958-05-27", yer: "Kayseri" },

  // Yusuf kolu — Almanya doğumlular
  {
    id: "k8-erdal", ad: "Erdal", soyad: "Demirtaş", c: "male", d: "1966-03-14", yer: "Köln, Almanya",
    eb: ["k7-yusuf", "k7-yusuf-es"],
    bio: "Almanya'da doğdu, Almanca'yı Türkçe'den önce öğrendi. Otomotiv teknisyeni. Türkiye'ye yalnızca yaz tatillerinde geldi; \"iki ülkenin de misafiriyim\" der.",
  },
  { id: "k8-erdal-es", ad: "Sabine", soyad: "Demirtaş", c: "female", d: "1969-08-21", yer: "Köln, Almanya", es: ["k8-erdal"], bio: "Alman asıllı. Evlendikten sonra Demirtaş soyadını aldı, Türkçe öğrendi." },
  { id: "k8-hulya-a", ad: "Hülya", soyad: "Demirtaş", c: "female", d: "1963-10-02", yer: "Köln, Almanya", eb: ["k7-yusuf", "k7-yusuf-es"], es: ["k8-hulya-es"] },
  { id: "k8-hulya-es", ad: "Kadir", soyad: "Şensoy", c: "male", d: "1960-04-19", yer: "Duisburg, Almanya" },

  // İzmir (Yıldırım) kolu
  { id: "k8-ercan", ad: "Ercan", soyad: "Yıldırım", c: "male", d: "1952-09-11", yer: "İzmir", eb: ["k7-erol", "k7-erol-es"], es: ["k8-ercan-es"] },
  { id: "k8-ercan-es", ad: "Nilgün", soyad: "Yıldırım", c: "female", d: "1957-06-30", yer: "İzmir" },
  { id: "k8-aylin-y", ad: "Aylin", soyad: "Yıldırım", c: "female", d: "1959-02-08", yer: "İzmir", eb: ["k7-erol", "k7-erol-es"], bio: "Kıbrıs'a yerleşti, Lefkoşa'da yaşıyor." },

  // Ankara (Akgün/Soydan) kolu
  { id: "k8-mualla", ad: "Mualla", soyad: "Soydan", c: "female", d: "1948-05-03", yer: "Ankara", eb: ["k7-behice", "k7-behice-es"], es: ["k8-mualla-es"] },
  { id: "k8-mualla-es", ad: "Bülent", soyad: "Soydan", c: "male", d: "1945-11-28", yer: "Ankara" },

  // Turgut kolu
  { id: "k8-hakan-t", ad: "Hakan", soyad: "Demirtaş", c: "male", d: "1959-07-16", yer: "İstanbul", eb: ["k7-orhan-t", "k7-orhan-t-es"], es: ["k8-hakan-es"] },
  { id: "k8-hakan-es", ad: "Şule", soyad: "Demirtaş", c: "female", d: "1963-03-25", yer: "İstanbul" },

  // Develi (Ergin) kolu
  { id: "k8-fatos", ad: "Fatoş", soyad: "Ergin", c: "female", d: "1955-10-20", yer: "Develi", eb: ["k7-necati", "k7-necati-es"], es: ["k8-fatos-es"] },
  { id: "k8-fatos-es", ad: "Recep", soyad: "Ergin", c: "male", d: "1951-01-13", o: "2022-05-09", yer: "Develi" },

  // Yıldırım (Develi) kolu
  { id: "k8-serpil", ad: "Serpil", soyad: "Yıldırım", c: "female", d: "1958-12-01", yer: "Develi", eb: ["k7-hulusi", "k7-hulusi-es"], es: ["k8-serpil-es"] },
  { id: "k8-serpil-es", ad: "İlhan", soyad: "Yıldırım", c: "male", d: "1954-04-22", yer: "Develi" },

  {
    id: "k8-aysel", ad: "Aysel", soyad: "Toroslu", c: "female", d: "1957-04-30", yer: "Adana",
    eb: ["k7-vedat", "k7-vedat-es"],
    es: ["k8-aysel-es5"], eski: ["k8-aysel-es2", "k8-aysel-es3", "k8-aysel-es4"],
    bio: "Beş kez evlendi: ilk eşi genç yaşta vefat etti, üçünden boşandı, beşincisiyle otuz yıldır birlikte. İki farklı evliliğinden çocukları var.\n\n\"Her seferinde doğru olduğunu düşündüm, üçünde yanıldım\" diyor.",
  },
  { id: "k8-aysel-es1", ad: "Kenan", soyad: "Toroslu", c: "male", d: "1953-09-14", o: "1981-06-03", yer: "Adana", es: ["k8-aysel"], bio: "Aysel'in ilk eşi. 1981'de trafik kazasında vefat etti; Aysel 24 yaşında dul kaldı." },
  { id: "k8-aysel-es2", ad: "Nedim", soyad: "Alkan", c: "male", d: "1950-11-21", yer: "Mersin", bio: "Aysel'in ikinci eşi. 1983-1987." },
  { id: "k8-aysel-es3", ad: "Yılmaz", soyad: "Duran", c: "male", d: "1955-03-07", yer: "Adana", bio: "Aysel'in üçüncü eşi. 1989-1992." },
  { id: "k8-aysel-es4", ad: "Sinan", soyad: "Kaptan", c: "male", d: "1961-07-19", yer: "İskenderun", bio: "Aysel'in dördüncü eşi. 1993-1995." },
  { id: "k8-aysel-es5", ad: "Cahit", soyad: "Toroslu", c: "male", d: "1954-01-08", yer: "Adana", bio: "Aysel'in beşinci eşi. 1996'dan beri evliler." },

  // Adana kolu
  { id: "k8-levent", ad: "Levent", soyad: "Toroslu", c: "male", d: "1962-08-08", yer: "Adana", eb: ["k7-vedat", "k7-vedat-es"], es: ["k8-levent-es"] },
  { id: "k8-levent-es", ad: "Emel", soyad: "Toroslu", c: "female", d: "1966-02-17", yer: "Adana" },
];

/* ================================================================
   9. KUŞAK — ~1975-1995 · EGO KUŞAĞI
   Trans birey, altı evlilik, kuzen evliliği, ikizler, evlat edinme
   ================================================================ */
const K9: Seed[] = [
  // Orhan'ın 1. evliliğinden (Filiz)
  {
    id: "k9-deniz", ad: "Deniz", soyad: "Demirtaş", c: "male", d: "1978-06-14", yer: "İstanbul",
    eb: ["k8-orhan", "k8-orhan-es1"], es: ["k9-deniz-es"],
    bio: "Trans erkek. 2009'da geçiş sürecini tamamladı, nüfus kaydını değiştirdi. Ailede önce zorlanıldı, dedesi Kemal'in \"benim torunum\" deyip sahiplenmesi dönüm noktası oldu.\n\nMimar. Bu ağacı derleyen kişi — 2019'da büyükannesi Muazzez'in sandığından çıkan defterle başladı.",
  },
  { id: "k9-deniz-es", ad: "Ece", soyad: "Demirtaş", c: "female", d: "1982-11-08", yer: "İstanbul", bio: "Belgesel yönetmeni. Deniz'le 2011'de evlendi." },
  { id: "k9-pinar", ad: "Pınar", soyad: "Demirtaş", c: "female", d: "1974-09-30", yer: "İstanbul", eb: ["k8-orhan", "k8-orhan-es1"], es: ["k9-pinar-es"] },
  { id: "k9-pinar-es", ad: "Barış", soyad: "Uysal", c: "male", d: "1971-05-12", yer: "İstanbul" },

  // Orhan'ın 2. evliliğinden (Sevda)
  {
    id: "k9-cem", ad: "Cem", soyad: "Demirtaş", c: "male", d: "1981-03-27", yer: "Ankara",
    eb: ["k8-orhan", "k8-orhan-es2"],
    es: ["k9-cem-es6"], eski: ["k9-cem-es1", "k9-cem-es2", "k9-cem-es3", "k9-cem-es4", "k9-cem-es5"],
    bio: "Altı kez evlendi, beşinden boşandı. Ailede hakkında en çok şaka yapılan kişi; kendisi de ilk gülen olur. Müzisyen, sürekli turnede.\n\nDört farklı evliliğinden çocukları var.",
  },
  { id: "k9-cem-es1", ad: "Esra", soyad: "Bilgin", c: "female", d: "1983-07-19", yer: "Ankara", bio: "Cem'in ilk eşi. 2003-2005." },
  { id: "k9-cem-es2", ad: "Melis", soyad: "Arkan", c: "female", d: "1985-01-24", yer: "İstanbul", bio: "Cem'in ikinci eşi. 2006-2009." },
  { id: "k9-cem-es3", ad: "Jülide", soyad: "Kaya", c: "female", d: "1980-10-05", yer: "İzmir", bio: "Cem'in üçüncü eşi. 2010-2012." },
  { id: "k9-cem-es4", ad: "Ayça", soyad: "Demir", c: "female", d: "1988-04-11", yer: "Antalya", bio: "Cem'in dördüncü eşi. 2013-2016." },
  { id: "k9-cem-es5", ad: "Ceren", soyad: "Aydın", c: "female", d: "1990-12-02", yer: "İstanbul", bio: "Cem'in beşinci eşi. 2017-2019." },
  { id: "k9-cem-es6", ad: "Zeynep", soyad: "Demirtaş", c: "female", d: "1992-08-16", yer: "İstanbul", bio: "Cem'in altıncı eşi. 2021'den beri evliler." },

  { id: "k9-selin", ad: "Selin", soyad: "Demirtaş", c: "female", d: "1984-02-14", yer: "Ankara", eb: ["k8-orhan", "k8-orhan-es2"], bio: "Hiç evlenmedi. Kutup araştırmacısı; yılın yarısını Antarktika'da geçiriyor." },

  // Orhan'ın 3. evliliğinden (Nalan)
  { id: "k9-ikiz1", ad: "Alp", soyad: "Demirtaş", c: "male", d: "1994-05-21", yer: "İstanbul", eb: ["k8-orhan", "k8-orhan-es3"], es: ["k9-ikiz1-es"], bio: "İkiz. Kardeşi Ada'dan dört dakika büyük." },
  { id: "k9-ikiz2", ad: "Ada", soyad: "Demirtaş", c: "female", d: "1994-05-21", yer: "İstanbul", eb: ["k8-orhan", "k8-orhan-es3"], bio: "İkiz. Ağabeyi Alp'ten dört dakika küçük." },
  { id: "k9-ikiz1-es", ad: "Naz", soyad: "Demirtaş", c: "female", d: "1996-09-03", yer: "İstanbul", bio: "Adını, Alp'in büyük büyükannesi Naz'dan aldığı için aile bunu uğur saydı." },

  // Sevim kolu — ikinci dereceden kuzen evliliği
  {
    id: "k9-ela", ad: "Ela", soyad: "Öztürk", c: "female", d: "1980-07-08", yer: "İstanbul",
    eb: ["k8-sevim", "k8-sevim-es"], es: ["k9-ela-es"],
    bio: "Eşi Kerem ile ikinci dereceden kuzenler — büyük büyükbabaları Mehmet ve Ali kardeşti. Bunu ancak nişanlandıktan sonra fark ettiler.",
  },
  {
    id: "k9-ela-es", ad: "Kerem", soyad: "Yıldırım", c: "male", d: "1977-11-16", yer: "İzmir",
    eb: ["k8-ercan", "k8-ercan-es"],
    bio: "Ela'nın ikinci dereceden kuzeni ve eşi. Yıldırım kolundan; 1934'te ayrılan iki soyadı bu evlilikle yeniden birleşti.",
  },

  // Deniz S. (interseks) — evlat edinme
  {
    id: "k9-umut", ad: "Umut", soyad: "Demirtaş", c: "other", d: "1996-04-23", yer: "Bodrum",
    eb: ["k8-deniz-s"],
    bag: { "k8-deniz-s": { kind: "adoptive", note: "1999'da tek başına evlat edinildi." } },
    bio: "Deniz tarafından tek başına evlat edinildi. Kendini ikili cinsiyet tanımlarının dışında görüyor; nüfus kaydında \"diğer\" olarak geçiyor.\n\nDeniz'in seramik atölyesini birlikte işletiyorlar.",
  },

  {
    id: "k9-kaya", ad: "Kaya", soyad: "Demirtaş", c: "male", d: "1994-03-19", yer: "Gölcük",
    eb: ["k8-nurhan", "k8-nurhan-es"],
    bag: {
      "k8-nurhan": { kind: "adoptive", note: "1999 Marmara depreminde öz ailesini kaybetti; teyzesi evlat edindi." },
      "k8-nurhan-es": { kind: "adoptive", note: "1999 Marmara depreminde öz ailesini kaybetti; 2000'de evlat edinildi." },
    },
    bio: "17 Ağustos 1999'da Gölcük'te anne ve babasını kaybetti; beş yaşındaydı. Annesinin kuzeni Nurhan ve eşi Selçuk tarafından evlat edinildi.\n\nJeoloji mühendisi oldu. \"Mesleğimi seçerken kimseye sormadım\" diyor.",
  },

  // Nurhan kolu
  { id: "k9-burcu", ad: "Burcu", soyad: "Demirtaş", c: "female", d: "1986-01-19", yer: "Kayseri", eb: ["k8-nurhan", "k8-nurhan-es"], es: ["k9-burcu-es"] },
  { id: "k9-burcu-es", ad: "Emre", soyad: "Sarıkaya", c: "male", d: "1983-06-27", yer: "Kayseri" },
  { id: "k9-onur", ad: "Onur", soyad: "Demirtaş", c: "male", d: "1989-10-30", yer: "Kayseri", eb: ["k8-nurhan", "k8-nurhan-es"] },

  // Almanya kolu
  {
    id: "k9-burak", ad: "Burak", soyad: "Demirtaş", c: "male", d: "1992-02-11", yer: "Köln, Almanya",
    eb: ["k8-erdal", "k8-erdal-es"], es: ["k9-burak-es"],
    bio: "Üçüncü kuşak Almanyalı. Türkçesi aksanlı, Almancası ana dili. Berlin'de yazılım geliştiricisi.",
  },
  { id: "k9-burak-es", ad: "Lena", soyad: "Demirtaş", c: "female", d: "1993-07-05", yer: "Berlin, Almanya" },
  { id: "k9-defne-a", ad: "Defne", soyad: "Demirtaş", c: "female", d: "1995-11-27", yer: "Köln, Almanya", eb: ["k8-erdal", "k8-erdal-es"] },
  { id: "k9-sinan", ad: "Sinan", soyad: "Şensoy", c: "male", d: "1988-03-09", yer: "Duisburg, Almanya", eb: ["k8-hulya-a", "k8-hulya-es"], es: ["k9-sinan-es"] },
  { id: "k9-sinan-es", ad: "Merve", soyad: "Şensoy", c: "female", d: "1991-05-14", yer: "Köln, Almanya" },

  {
    id: "k9-murat", ad: "Murat", soyad: "Yıldırım", c: "male", d: "1979-05-08", yer: "İzmir",
    eb: ["k8-ercan", "k8-ercan-es"], es: ["k9-murat-es"],
    bag: { "k8-ercan": { estranged: "by-parent", note: "1999'daki evliliği sonrası babası tarafından reddedildi." } },
    bio: "1999'da ailesinin karşı çıktığı bir evlilik yaptı; babası \"benim oğlum yok\" deyip bağını kesti, bir daha görüşmediler. Annesi gizlice görüşmeyi sürdürdü.\n\nDeniz biyoloğu. Çocuklarına dedelerini hiç tanıtamadı.",
  },
  { id: "k9-murat-es", ad: "Rana", soyad: "Yıldırım", c: "female", d: "1981-02-26", yer: "Diyarbakır" },

  // Ankara kolu
  { id: "k9-tolga", ad: "Tolga", soyad: "Soydan", c: "male", d: "1976-08-22", yer: "Ankara", eb: ["k8-mualla", "k8-mualla-es"], es: ["k9-tolga-es"], eski: ["k9-tolga-eski"], bio: "Bir kez boşandı, ikinci evliliğini yaptı." },
  { id: "k9-tolga-eski", ad: "Gamze", soyad: "Kılıç", c: "female", d: "1979-02-03", yer: "Ankara", bio: "Tolga'nın ilk eşi. 2002-2008." },
  { id: "k9-tolga-es", ad: "Sema", soyad: "Soydan", c: "female", d: "1983-09-18", yer: "Ankara" },

  // İstanbul (Turgut) kolu
  { id: "k9-ozge", ad: "Özge", soyad: "Demirtaş", c: "female", d: "1987-04-05", yer: "İstanbul", eb: ["k8-hakan-t", "k8-hakan-es"] },
  { id: "k9-mert", ad: "Mert", soyad: "Demirtaş", c: "male", d: "1990-12-13", yer: "İstanbul", eb: ["k8-hakan-t", "k8-hakan-es"], es: ["k9-mert-es"] },
  { id: "k9-mert-es", ad: "İrem", soyad: "Demirtaş", c: "female", d: "1993-01-29", yer: "İstanbul" },

  // Develi kolu
  { id: "k9-seda", ad: "Seda", soyad: "Ergin", c: "female", d: "1982-06-11", yer: "Develi", eb: ["k8-fatos", "k8-fatos-es"], es: ["k9-seda-es"] },
  { id: "k9-seda-es", ad: "Volkan", soyad: "Ergin", c: "male", d: "1978-10-26", yer: "Kayseri" },
  { id: "k9-gokhan", ad: "Gökhan", soyad: "Yıldırım", c: "male", d: "1985-03-16", yer: "Develi", eb: ["k8-serpil", "k8-serpil-es"] },

  { id: "k9-tunc", ad: "Tunç", soyad: "Toroslu", c: "male", d: "1980-02-11", yer: "Adana", eb: ["k8-aysel", "k8-aysel-es1"], bio: "Aysel'in ilk evliliğinden. Babası o bir yaşındayken öldü, hiç hatırlamıyor." },
  { id: "k9-pelin", ad: "Pelin", soyad: "Alkan", c: "female", d: "1985-06-24", yer: "Mersin", eb: ["k8-aysel", "k8-aysel-es2"], bio: "Aysel'in ikinci evliliğinden." },
  { id: "k9-koray", ad: "Koray", soyad: "Toroslu", c: "male", d: "1998-10-05", yer: "Adana", eb: ["k8-aysel", "k8-aysel-es5"], bio: "Aysel'in beşinci evliliğinden. En büyük ağabeyi Tunç'tan 18 yaş küçük." },

  // Adana kolu
  { id: "k9-ebru", ad: "Ebru", soyad: "Toroslu", c: "female", d: "1991-07-24", yer: "Adana", eb: ["k8-levent", "k8-levent-es"], es: ["k9-ebru-es"] },
  { id: "k9-ebru-es", ad: "Serkan", soyad: "Toroslu", c: "male", d: "1988-11-02", yer: "Mersin" },
];

/* ================================================================
   10. KUŞAK — ~2005-2020 · Ego'dan bir sonraki kuşak
   ================================================================ */
const K10: Seed[] = [
  // Deniz + Ece
  { id: "k10-poyraz", ad: "Poyraz", soyad: "Demirtaş", c: "male", d: "2013-05-09", yer: "İstanbul", eb: ["k9-deniz", "k9-deniz-es"], bio: "Deniz'in oğlu. \"Babamın da bir zamanlar başka bir adı varmış\" diyerek anlatıyor babasının hikâyesini — hiç yadırgamadan." },
  { id: "k10-duru", ad: "Duru", soyad: "Demirtaş", c: "female", d: "2016-09-21", yer: "İstanbul", eb: ["k9-deniz", "k9-deniz-es"] },

  // Pınar + Barış
  { id: "k10-kaan", ad: "Kaan", soyad: "Uysal", c: "male", d: "2001-04-17", yer: "İstanbul", eb: ["k9-pinar", "k9-pinar-es"], es: ["k10-kaan-es"] },
  { id: "k10-kaan-es", ad: "Nehir", soyad: "Uysal", c: "female", d: "2002-08-30", yer: "İstanbul" },
  { id: "k10-asli", ad: "Aslı", soyad: "Uysal", c: "female", d: "2004-12-06", yer: "İstanbul", eb: ["k9-pinar", "k9-pinar-es"] },

  // Cem'in dört farklı evliliğinden çocukları
  {
    id: "k10-can", ad: "Can", soyad: "Demirtaş", c: "male", d: "2004-06-18", yer: "Ankara",
    eb: ["k9-cem", "k9-cem-es1"],
    bag: { "k9-cem": { estranged: "by-child", note: "2022'den beri babasıyla görüşmüyor." } },
    bio: "Cem'in ilk evliliğinden. 2022'de babasıyla bağını kendi kesti — \"altı evlilik saydım, hiçbirinde ben yoktum\" diyor. Annesi Esra ile yakın.",
  },
  { id: "k10-ipek", ad: "İpek", soyad: "Demirtaş", c: "female", d: "2008-02-27", yer: "İstanbul", eb: ["k9-cem", "k9-cem-es2"], bio: "Cem'in ikinci evliliğinden." },
  { id: "k10-tuna", ad: "Tuna", soyad: "Demirtaş", c: "male", d: "2015-10-14", yer: "Antalya", eb: ["k9-cem", "k9-cem-es4"], bio: "Cem'in dördüncü evliliğinden." },
  { id: "k10-mira", ad: "Mira", soyad: "Demirtaş", c: "female", d: "2022-03-08", yer: "İstanbul", eb: ["k9-cem", "k9-cem-es6"], bio: "Cem'in altıncı evliliğinden. En büyük ağabeyi Can'dan 18 yaş küçük." },

  // Alp + Naz
  { id: "k10-atlas", ad: "Atlas", soyad: "Demirtaş", c: "male", d: "2021-07-19", yer: "İstanbul", eb: ["k9-ikiz1", "k9-ikiz1-es"] },
  // Ada — tek ebeveynli
  { id: "k10-ege", ad: "Ege", soyad: "Demirtaş", c: "male", d: "2023-01-26", yer: "İstanbul", eb: ["k9-ikiz2"], bio: "Ada'nın tek başına dünyaya getirdiği çocuk. Babası kayıtlarda yok." },

  // Ela + Kerem (kuzen evliliği)
  { id: "k10-arda", ad: "Arda", soyad: "Yıldırım", c: "male", d: "2007-09-12", yer: "İstanbul", eb: ["k9-ela", "k9-ela-es"], bio: "Hem Demirtaş hem Yıldırım kolundan geliyor — anne ve babası ikinci dereceden kuzen." },
  { id: "k10-lara", ad: "Lara", soyad: "Yıldırım", c: "female", d: "2010-03-04", yer: "İstanbul", eb: ["k9-ela", "k9-ela-es"] },

  // Umut
  { id: "k10-rüzgar", ad: "Rüzgâr", soyad: "Demirtaş", c: "unknown", d: "2024-06-02", yer: "Bodrum", eb: ["k9-umut"], bio: "Henüz çok küçük; aile cinsiyet ataması yapmadan büyütmeyi tercih ediyor." },

  {
    id: "k10-nil", ad: "Nil", soyad: "Sarıkaya", c: "female", d: "2006-11-12", yer: "Kayseri",
    eb: ["k9-burcu", "k9-burcu-es"],
    bio: "Doğumda erkek olarak kaydedildi. 2024'te geçiş sürecini tamamladı, adını Nil olarak değiştirdi.\n\nAilenin tepkisi kuşaktan kuşağa farklı oldu: büyük halası Deniz'in 1994'te yaşadıklarını bilenler için bu sefer daha kolaydı.",
  },

  // Burcu + Emre
  { id: "k10-eylul", ad: "Eylül", soyad: "Sarıkaya", c: "female", d: "2011-09-08", yer: "Kayseri", eb: ["k9-burcu", "k9-burcu-es"] },
  { id: "k10-cinar", ad: "Çınar", soyad: "Sarıkaya", c: "male", d: "2014-04-22", yer: "Kayseri", eb: ["k9-burcu", "k9-burcu-es"] },

  // Almanya
  { id: "k10-emil", ad: "Emil", soyad: "Demirtaş", c: "male", d: "2019-11-15", yer: "Berlin, Almanya", eb: ["k9-burak", "k9-burak-es"], bio: "Dördüncü kuşak Almanyalı. Adı hem Almanca hem Türkçe okunabilsin diye seçildi." },
  { id: "k10-mila", ad: "Mila", soyad: "Demirtaş", c: "female", d: "2022-08-27", yer: "Berlin, Almanya", eb: ["k9-burak", "k9-burak-es"] },
  { id: "k10-yaren", ad: "Yaren", soyad: "Şensoy", c: "female", d: "2016-02-19", yer: "Köln, Almanya", eb: ["k9-sinan", "k9-sinan-es"] },
  { id: "k10-baran", ad: "Baran", soyad: "Şensoy", c: "male", d: "2018-12-30", yer: "Köln, Almanya", eb: ["k9-sinan", "k9-sinan-es"] },

  // Tolga — iki evlilikten
  { id: "k10-berk", ad: "Berk", soyad: "Soydan", c: "male", d: "2005-05-11", yer: "Ankara", eb: ["k9-tolga", "k9-tolga-eski"], bio: "Tolga'nın ilk evliliğinden." },
  { id: "k10-zehra-y", ad: "Zehra", soyad: "Soydan", c: "female", d: "2012-10-03", yer: "Ankara", eb: ["k9-tolga", "k9-tolga-es"], bio: "Tolga'nın ikinci evliliğinden. Adını büyük büyük halasından aldı." },

  // Mert + İrem
  { id: "k10-alya", ad: "Alya", soyad: "Demirtaş", c: "female", d: "2020-04-09", yer: "İstanbul", eb: ["k9-mert", "k9-mert-es"] },

  // Seda + Volkan
  { id: "k10-elif-e", ad: "Elif", soyad: "Ergin", c: "female", d: "2009-07-14", yer: "Develi", eb: ["k9-seda", "k9-seda-es"] },
  { id: "k10-yigit", ad: "Yiğit", soyad: "Ergin", c: "male", d: "2012-01-23", yer: "Kayseri", eb: ["k9-seda", "k9-seda-es"] },

  // Ebru + Serkan
  { id: "k10-derin", ad: "Derin", soyad: "Toroslu", c: "female", d: "2017-06-06", yer: "Adana", eb: ["k9-ebru", "k9-ebru-es"] },
  { id: "k10-kuzey", ad: "Kuzey", soyad: "Toroslu", c: "male", d: "2020-09-28", yer: "Adana", eb: ["k9-ebru", "k9-ebru-es"] },
];

/* ================================================================
   11. KUŞAK — ~2024-2026 · En genç kuşak
   ================================================================ */
const K11: Seed[] = [
  { id: "k11-lina", ad: "Lina", soyad: "Uysal", c: "female", d: "2024-02-14", yer: "İstanbul", eb: ["k10-kaan", "k10-kaan-es"], bio: "Ağaçtaki en genç kuşağın ilk üyesi. Büyük büyük büyük dedesi Kemal'i hiç görmedi ama adı onun defterinde yazılı." },
  { id: "k11-toprak", ad: "Toprak", soyad: "Uysal", c: "male", d: "2026-01-19", yer: "İstanbul", eb: ["k10-kaan", "k10-kaan-es"], bio: "Ailenin en yeni ferdi." },
  { id: "k11-bebek", ad: "Adı konmamış", soyad: "Uysal", c: "unknown", d: "2025-04-30", o: "2025-04-30", yer: "İstanbul", eb: ["k10-kaan", "k10-kaan-es"], bio: "Erken doğum; birkaç saat yaşadı. Adı konulamadı." },
];


/* ================================================================
   DÜZENSİZ GÖÇLE GELENLER VE MEMLEKETTEKİ AİLELERİ
   Türkiye'de kurulan hayatların yanında, geride kalan aileler de
   ağaçta yer alır — iki kıtaya yayılmış tek bir aile.
   ================================================================ */
const GOC: Seed[] = [
  /* --- Somali kolu --- */
  {
    id: "g-abdi", ad: "Abdirahman", soyad: "Warsame", c: "male", d: "1983-02-17", yer: "Mogadişu, Somali",
    din: "İslam", mez: "Şafii", dil: "Somalice, Arapça, Türkçe", etnik: "Somali", uyruk: "Somali / Türkiye",
    es: ["g-hodan", "k9-pelin"],
    bio: "2014'te iç savaştan kaçtı: Mogadişu'dan Hartum'a, oradan Libya üzerinden botla Ege'ye. Midilli'ye varamadı, Ayvalık'a çıktı.\n\nMersin'de tersanede kaynakçı olarak çalıştı, 2019'da Pelin ile evlendi, 2021'de vatandaşlığa geçti. Somali'deki eşi Hodan ve iki çocuğuyla bağını hiç koparmadı; her ay para gönderiyor, yılda bir kez gidiyor.\n\nİki ailesi birbirini biliyor. \"Kolay değil ama yalan da değil\" diyor.",
  },
  {
    id: "g-hodan", ad: "Hodan", soyad: "Farah", c: "female", d: "1988-06-04", yer: "Mogadişu, Somali",
    din: "İslam", mez: "Şafii", dil: "Somalice, Arapça", etnik: "Somali", uyruk: "Somali",
    bio: "Abdirahman'ın Somali'deki eşi. 2007'de evlendiler. Kocası gittiğinde iki çocukla kaldı; Mogadişu'da bir kadın kooperatifinde dokuma yapıyor.\n\nTürkiye'yi hiç görmedi. \"Bir gün çocuklar gider\" diyor.",
  },
  { id: "g-ayaan", ad: "Ayaan", soyad: "Warsame", c: "female", d: "2009-11-22", yer: "Mogadişu, Somali", eb: ["g-abdi", "g-hodan"], din: "İslam", mez: "Şafii", dil: "Somalice, İngilizce", etnik: "Somali", uyruk: "Somali", bio: "Abdirahman'ın Somali'deki büyük kızı. Babasını yılda bir kez, birkaç haftalığına görüyor. Mogadişu'da lise son sınıfta; tıp okumak istiyor." },
  { id: "g-ibrahim-w", ad: "İbrahim", soyad: "Warsame", c: "male", d: "2012-03-30", yer: "Mogadişu, Somali", eb: ["g-abdi", "g-hodan"], din: "İslam", mez: "Şafii", dil: "Somalice", etnik: "Somali", uyruk: "Somali", bio: "Babasını en son üç yaşındayken uzun süre gördü. Görüntülü konuşmalarda Türkçe birkaç kelime öğrendi." },
  { id: "g-warsame", ad: "Warsame", soyad: "Jama", c: "male", d: "1954", o: "2011-08-09", yer: "Baidoa, Somali", din: "İslam", mez: "Şafii", dil: "Somalice", etnik: "Somali", uyruk: "Somali", bio: "Abdirahman'ın babası. Deve çobanıydı, sonra Mogadişu'da hamallık yaptı. 2011 kıtlığında hayatını kaybetti; oğlunun göç kararı bu ölümden sonra oldu." },
  { id: "g-fadumo", ad: "Fadumo", soyad: "Ali", c: "female", d: "1961", yer: "Baidoa, Somali", es: ["g-warsame"], din: "İslam", mez: "Şafii", dil: "Somalice", etnik: "Somali", uyruk: "Somali", bio: "Abdirahman'ın annesi. Hâlâ Mogadişu'da, gelini Hodan'ın yanında yaşıyor. Oğlunu 2014'ten beri dört kez gördü." },
  { id: "g-mohamed", ad: "Mohamed", soyad: "Warsame", c: "male", d: "1986-09-12", yer: "Baidoa, Somali", eb: ["g-warsame", "g-fadumo"], din: "İslam", mez: "Şafii", dil: "Somalice, İngilizce", etnik: "Somali", uyruk: "Somali / Kenya", bio: "Abdirahman'ın kardeşi. O da 2014'te yola çıktı ama Nairobi'de kaldı; Dadaab kampında tercümanlık yapıyor. İki kardeş sekiz yıldır yüz yüze görüşmedi." },
  { id: "g-sagal", ad: "Sagal", soyad: "Warsame", c: "female", d: "1991-01-08", o: "2014-04-19", yer: "Baidoa, Somali", eb: ["g-warsame", "g-fadumo"], din: "İslam", mez: "Şafii", dil: "Somalice", etnik: "Somali", uyruk: "Somali", bio: "Abdirahman'ın küçük kız kardeşi. Ağabeyiyle aynı yolculuğa çıktı; Akdeniz'de kayboldu, cenazesi bulunamadı. Abdirahman bunu yıllarca anlatamadı." },
  { id: "g-nasteho", ad: "Nasteho", soyad: "Warsame", c: "female", d: "2022-07-14", yer: "Mersin", eb: ["g-abdi", "k9-pelin"], din: "İslam", dil: "Türkçe, Somalice", etnik: "Somali, Türk", uyruk: "Türkiye", bio: "Abdirahman ile Pelin'in kızı. İki dilli büyüyor; adını Somali'deki babaannesi koydu. Ablası Ayaan'la görüntülü konuşuyor, hiç yüz yüze görüşmediler." },

  /* --- Venezuela kolu --- */
  {
    id: "g-yulianny", ad: "Yulianny", soyad: "Rojas", c: "female", d: "1993-05-27", yer: "Maracaibo, Venezuela",
    din: "Katoliklik", dil: "İspanyolca, Türkçe", etnik: "Venezuelalı", uyruk: "Venezuela / Türkiye",
    es: ["k9-onur"],
    bio: "2018'de Venezuela'daki ekonomik çöküşle yola çıktı: Kolombiya, Panama, sonra turist vizesiyle İstanbul. Vize bitti, üç yıl kayıtsız kaldı.\n\nKayseri'de bir tekstil atölyesinde çalışırken Onur'la tanıştı. 2022'de evlendiler, kaydı düzeldi. Annesine her hafta para gönderiyor.\n\n\"Burada kimse Maracaibo'yu bilmiyor. Ben de artık iki yerliyim.\"",
  },
  { id: "g-carlos", ad: "Carlos", soyad: "Rojas", c: "male", d: "1966-10-03", yer: "Maracaibo, Venezuela", din: "Katoliklik", dil: "İspanyolca", etnik: "Venezuelalı", uyruk: "Venezuela", es: ["g-marisol"], bio: "Yulianny'nin babası. Petrol rafinerisinde teknisyendi; rafineri kapanınca motosikletle kurye oldu. Kızını 2018'den beri görmedi." },
  { id: "g-marisol", ad: "Marisol", soyad: "Pérez", c: "female", d: "1970-02-14", yer: "Maracaibo, Venezuela", din: "Katoliklik", dil: "İspanyolca", etnik: "Venezuelalı", uyruk: "Venezuela", bio: "Yulianny'nin annesi. Öğretmendi, maaşı bir aylık yiyeceği karşılamayınca bıraktı. Kızının gönderdiği parayla geçiniyor." },
  { id: "g-andres", ad: "Andrés", soyad: "Rojas", c: "male", d: "1996-08-19", yer: "Maracaibo, Venezuela", eb: ["g-carlos", "g-marisol"], din: "Katoliklik", dil: "İspanyolca, Portekizce", etnik: "Venezuelalı", uyruk: "Venezuela / Brezilya", bio: "Yulianny'nin kardeşi. O da göç etti ama başka yöne: Brezilya'ya, Boa Vista'ya. İki kardeş üç kıtada üç saat diliminde." },
  { id: "g-daniela", ad: "Daniela", soyad: "Rojas", c: "female", d: "1999-12-08", yer: "Maracaibo, Venezuela", eb: ["g-carlos", "g-marisol"], din: "Katoliklik", dil: "İspanyolca", etnik: "Venezuelalı", uyruk: "Venezuela", bio: "Yulianny'nin küçük kız kardeşi. Ailede kalan tek çocuk; anne babasına o bakıyor." },
  { id: "g-mateo", ad: "Mateo", soyad: "Demirtaş", c: "male", d: "2024-03-11", yer: "Kayseri", eb: ["k9-onur", "g-yulianny"], din: "Katoliklik, İslam", dil: "Türkçe, İspanyolca", etnik: "Türk, Venezuelalı", uyruk: "Türkiye", bio: "Onur ile Yulianny'nin oğlu. Adını Venezuela'daki dedesi seçti. Evde iki dil, iki mutfak, iki bayram var." },

  /* --- Gana kolu --- */
  {
    id: "g-kwame", ad: "Kwame", soyad: "Mensah", c: "male", d: "1987-04-06", yer: "Kumasi, Gana",
    din: "Protestanlık", mez: "Pentekostal", dil: "Twi, İngilizce, Türkçe", etnik: "Aşanti", uyruk: "Gana / Türkiye",
    es: ["g-kwame-es"],
    bio: "2011'de öğrenci vizesiyle geldi, okuyamadı, vize doldu. Yedi yıl İstanbul Kumkapı'da kayıtsız yaşadı; tekstil atölyelerinde, sonra kendi küçük dükkânında.\n\n2018'de af düzenlemesiyle kaydı çıktı. Bugün Kurtuluş'ta bir Afrika market işletiyor; Gana'dan gelen herkesin uğrağı.\n\nAnnesine ve Kumasi'deki kardeşlerine düzenli para gönderir.",
  },
  { id: "g-kwame-es", ad: "Esra", soyad: "Mensah", c: "female", d: "1990-07-23", yer: "İstanbul", din: "İslam", dil: "Türkçe, İngilizce", etnik: "Türk", uyruk: "Türkiye", eb: ["k8-hakan-t", "k8-hakan-es"], bio: "Kwame ile 2016'da tanıştı, 2019'da evlendiler. Ailesi başta karşı çıktı; torun doğunca yumuşadılar." },
  { id: "g-akosua", ad: "Akosua", soyad: "Mensah", c: "female", d: "1962-01-15", yer: "Kumasi, Gana", din: "Protestanlık", mez: "Pentekostal", dil: "Twi", etnik: "Aşanti", uyruk: "Gana", bio: "Kwame'nin annesi. Kumasi pazarında kumaş satar. Oğlunu on dört yıldır görmedi; her pazar telefonda dua ederler." },
  { id: "g-kofi", ad: "Kofi", soyad: "Mensah", c: "male", d: "1958", o: "2016-05-02", yer: "Kumasi, Gana", es: ["g-akosua"], din: "Protestanlık", dil: "Twi", etnik: "Aşanti", uyruk: "Gana", bio: "Kwame'nin babası. Marangozdu. Oğlu cenazesine yetişemedi — kayıtsız olduğu için çıkarsa geri dönemeyecekti. Kwame bunu en ağır kaybı sayar." },
  { id: "g-ama", ad: "Ama", soyad: "Mensah", c: "female", d: "1991-09-30", yer: "Kumasi, Gana", eb: ["g-kofi", "g-akosua"], din: "Protestanlık", dil: "Twi, İngilizce", etnik: "Aşanti", uyruk: "Gana", bio: "Kwame'nin kız kardeşi. Ağabeyinin gönderdiği parayla hemşirelik okudu, Kumasi'de devlet hastanesinde çalışıyor." },
  { id: "g-kojo", ad: "Kojo", soyad: "Mensah", c: "male", d: "2020-10-18", yer: "İstanbul", eb: ["g-kwame", "g-kwame-es"], din: "Protestanlık, İslam", dil: "Türkçe, Twi", etnik: "Aşanti, Türk", uyruk: "Türkiye / Gana", bio: "Kwame ile Esra'nın oğlu. Gana'daki babaannesini yalnızca ekrandan tanıyor. İki adı var: evde Kojo, okulda Efe." },
];


/* ================================================================
   EŞCİNSEL VE BİSEKSÜEL HAYATLAR
   Kimi kayda geçmiş, kimi kuşaklarca "arkadaşı" diye anılmış.
   ================================================================ */
const LGBT: Seed[] = [
  /* --- Almanya'da evlenen eşcinsel çift, evlat edinmiş --- */
  {
    id: "l-tarik", ad: "Tarık", soyad: "Demirtaş", c: "male", d: "1989-04-12", yer: "Köln, Almanya",
    eb: ["k8-erdal", "k8-erdal-es"], es: ["l-jonas"],
    din: "İslam", dil: "Almanca, Türkçe", etnik: "Türk, Alman", uyruk: "Almanya / Türkiye",
    bio: "Burak ve Defne'nin ağabeyi. 2014'te Jonas ile birlikte oldu, Almanya'da eşcinsel evlilik yasallaşınca 2018'de evlendiler.\n\nBabası Erdal düğüne geldi, annesi Sabine nikâh şahidi oldu. Kayseri'deki akrabaların bir kısmı hâlâ \"ev arkadaşı\" diyor; Tarık düzeltmekten vazgeçti. \"Anlatmak benim işim değil, anlamak onların\" diyor.\n\nMimar; Köln'de bir ofisi var.",
  },
  {
    id: "l-jonas", ad: "Jonas", soyad: "Demirtaş-Vogel", c: "male", d: "1987-08-30", yer: "Bremen, Almanya",
    din: "Protestanlık", mez: "Luteryen", dil: "Almanca, İngilizce", etnik: "Alman", uyruk: "Almanya",
    bio: "Tarık'ın eşi. Evlenince iki soyadını birleştirdiler. Müzik öğretmeni.\n\nTürkçeyi Kayseri'de geçirdiği yazlarda öğrendi; Erdal'ın annesi Gülizar ile Almanca değil Türkçe konuşurdu.",
  },
  {
    id: "l-emil-t", ad: "Leyla", soyad: "Demirtaş-Vogel", c: "female", d: "2020-06-08", yer: "Köln, Almanya",
    eb: ["l-tarik", "l-jonas"],
    bag: {
      "l-tarik": { kind: "adoptive", note: "2021'de birlikte evlat edindiler." },
      "l-jonas": { kind: "adoptive", note: "2021'de birlikte evlat edindiler." },
    },
    din: "Protestanlık", dil: "Almanca, Türkçe", etnik: "Alman", uyruk: "Almanya",
    bio: "Tarık ve Jonas'ın 2021'de evlat edindiği kızları. Adını Tarık'ın babaannesinin annesinden aldı.",
  },

  /* --- Kadın çift; biri önceki evliliğinden çocuklu, diğeri üvey ebeveyn --- */
  {
    id: "l-nihal", ad: "Nihal", soyad: "Aydemir", c: "female", d: "1985-02-19", yer: "İzmir",
    es: ["k9-ozge"], eski: ["l-nihal-eski"],
    din: "İslam", mez: "Alevi", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    bio: "2008'de bir erkekle evlendi, 2015'te ayrıldı. Ayrılık sebebini uzun süre kimseye söylemedi.\n\n2017'de Özge ile tanıştı. Türkiye'de evlenemedikleri için 2021'de Hollanda'da nikâh kıydılar; burada resmî bir karşılığı yok. Oğlu Kaan onlarla yaşıyor.",
  },
  { id: "l-nihal-eski", ad: "Serhat", soyad: "Aydemir", c: "male", d: "1981-11-06", yer: "İzmir", din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye", bio: "Nihal'in eski eşi. Ayrıldıktan sonra da oğullarının velayetini paylaştılar; bugün iyi anlaşıyorlar." },
  {
    id: "l-kaan-a", ad: "Toprak", soyad: "Aydemir", c: "male", d: "2011-09-14", yer: "İzmir",
    eb: ["l-nihal", "k9-ozge"],
    bag: {
      "k9-ozge": { kind: "step", note: "Annesinin eşi; 2017'den beri birlikte büyüttüler." },
    },
    din: "İslam", dil: "Türkçe, İngilizce", etnik: "Türk", uyruk: "Türkiye",
    bio: "Nihal'in ilk evliliğinden oğlu. Özge'yi \"Özge anne\" diye çağırıyor. Üç ebeveyni olduğunu söylüyor ve bunu doğal buluyor.",
  },

  /* --- Biseksüel: eski karısı ve şimdiki kocası --- */
  {
    id: "l-gokhan-es-eski", ad: "Yasemin", soyad: "Yıldırım", c: "female", d: "1987-05-03", yer: "Kayseri",
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    bio: "Gökhan'ın eski eşi. 2010-2017 arası evliydiler. Ayrılıkları sert olmadı; hâlâ bayramlaşıyorlar.",
  },
  {
    id: "l-mert-g", ad: "Umut", soyad: "Erdoğdu", c: "male", d: "1990-01-27", yer: "Ankara",
    es: ["k9-gokhan"],
    din: "İslam", mez: "Alevi", dil: "Türkçe", etnik: "Kürt", uyruk: "Türkiye",
    bio: "Gökhan'ın hayat arkadaşı. 2019'dan beri birlikteler, Ankara'da yaşıyorlar. Resmî bir bağları yok; noterde karşılıklı vasiyet ve vekâlet düzenlettiler — yapabildiklerinin tamamı bu.",
  },

  /* --- Kayda geçmemiş bir ömür --- */
  {
    id: "l-nuri-t", ad: "Nuri", soyad: "Demirtaş", c: "male", d: "1931-03-08", o: "2007-11-19", yer: "Kayseri",
    eb: ["k6-turgut", "k6-turgut-es"],
    din: "İslam", mez: "Hanefi", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    bio: "Orhan'ın kardeşi. Hiç evlenmedi. Kırk üç yıl aynı evi Rauf Bey'le paylaştı; aile ona hep \"Nuri'nin arkadaşı\" dedi.\n\nİkisi de öğretmendi, birlikte emekli oldular, yan yana gömüldüler. Kimse yüksek sesle söylemedi ama herkes biliyordu.\n\nBu ağaçta ilk kez, olduğu gibi yazılıyor.",
  },
  {
    id: "l-rauf", ad: "Rauf", soyad: "Kandemir", c: "male", d: "1929-07-22", o: "2009-04-03", yer: "Sivas",
    es: ["l-nuri-t"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    bio: "Nuri'nin ömürlük arkadaşı. Edebiyat öğretmeniydi. Nuri'nin ölümünden sonra iki yıl daha yaşadı; vasiyeti üzerine yan yana gömüldüler.",
  },
];


/* ================================================================
   DALLARIN DOLDURULMASI
   Adlar döneme göre seçildi: eski kuşaklarda Osmanlı-Türk adları,
   Cumhuriyet kuşağında dönemin modaları, bugünde çağdaş adlar.
   ================================================================ */
const EK: Seed[] = [
  /* --- 5. kuşak (1850-1880) --- */
  { id: "e5-rifat", ad: "Rıfat", soyad: "Değirmencioğlu", c: "male", d: "1857", o: "1919", yer: "Kayseri", eb: ["k4-ahmet", "k4-rukiye"], din: "İslam", mez: "Hanefi", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı" },
  { id: "e5-hacer", ad: "Hacer", soyad: "Değirmencioğlu", c: "female", d: "1862", o: "1934", yer: "Kayseri", eb: ["k4-ahmet", "k4-serife"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı" },
  { id: "e5-sukru", ad: "Şükrü", soyad: "Değirmencioğlu", c: "male", d: "1866", o: "1921", yer: "Develi", eb: ["k4-ismail", "k4-nazli"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı" },
  { id: "e5-ummuhan", ad: "Ümmühan", soyad: "Değirmencioğlu", c: "female", d: "1871", o: "1948", yer: "Develi", eb: ["k4-ismail", "k4-nazli"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı" },
  { id: "e5-salih", ad: "Salih", soyad: "Değirmencioğlu", c: "male", d: "1873", o: "1940", yer: "Adana", eb: ["k4-osman", "k4-hatice"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı" },
  { id: "e5-rifat-es", ad: "Zehra", soyad: "Değirmencioğlu", c: "female", d: "1864", o: "1928", yer: "Kayseri", es: ["e5-rifat"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı" },
  { id: "e5-sukru-es", ad: "Sıdıka", soyad: "Değirmencioğlu", c: "female", d: "1872", o: "1939", yer: "Develi", es: ["e5-sukru"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı" },
  { id: "e5-salih-es", ad: "Meryem", soyad: "Toroslu", c: "female", d: "1879", o: "1951", yer: "Adana", es: ["e5-salih"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı" },

  /* --- 6. kuşak (1885-1910) --- */
  { id: "e6-vahit", ad: "Vahit", soyad: "Demirtaş", c: "male", d: "1891-02-14", o: "1963-08-21", yer: "Kayseri", eb: ["e5-rifat", "e5-rifat-es"], din: "İslam", mez: "Hanefi", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e6-vahit-es", ad: "Mediha", soyad: "Demirtaş", c: "female", d: "1899-05-30", o: "1977-03-04", yer: "Kayseri", es: ["e6-vahit"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e6-kadir", ad: "Kadir", soyad: "Yıldırım", c: "male", d: "1894-09-08", o: "1958-12-17", yer: "Develi", eb: ["e5-sukru", "e5-sukru-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e6-kadir-es", ad: "Sabahat", soyad: "Yıldırım", c: "female", d: "1903-01-19", o: "1985-06-11", yer: "Develi", es: ["e6-kadir"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e6-hikmet", ad: "Hikmet", soyad: "Toroslu", c: "male", d: "1902-07-25", o: "1971-02-09", yer: "Adana", eb: ["e5-salih", "e5-salih-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e6-hikmet-es", ad: "Müzeyyen", soyad: "Toroslu", c: "female", d: "1908-11-03", o: "1990-04-28", yer: "Adana", es: ["e6-hikmet"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },

  /* --- 7. kuşak (1920-1940) --- */
  { id: "e7-nejat", ad: "Nejat", soyad: "Demirtaş", c: "male", d: "1925-04-11", o: "2001-09-30", yer: "Kayseri", eb: ["e6-vahit", "e6-vahit-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e7-nejat-es", ad: "Naciye", soyad: "Demirtaş", c: "female", d: "1932-08-19", o: "2014-01-22", yer: "Kayseri", es: ["e7-nejat"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e7-muzaffer", ad: "Muzaffer", soyad: "Yıldırım", c: "male", d: "1929-12-02", o: "2008-05-15", yer: "Develi", eb: ["e6-kadir", "e6-kadir-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e7-muzaffer-es", ad: "Şaziye", soyad: "Yıldırım", c: "female", d: "1936-03-27", o: "2019-11-08", yer: "Kayseri", es: ["e7-muzaffer"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e7-cahit", ad: "Cahit", soyad: "Toroslu", c: "male", d: "1934-06-16", o: "2010-07-03", yer: "Adana", eb: ["e6-hikmet", "e6-hikmet-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e7-cahit-es", ad: "Perihan", soyad: "Toroslu", c: "female", d: "1941-10-09", yer: "Adana", es: ["e7-cahit"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e7-sevki", ad: "Şevki", soyad: "Demirtaş", c: "male", d: "1927-01-30", o: "1998-04-12", yer: "Kayseri", eb: ["e6-vahit", "e6-vahit-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },

  /* --- 8. kuşak (1950-1970) --- */
  { id: "e8-ayhan", ad: "Ayhan", soyad: "Demirtaş", c: "male", d: "1954-05-08", yer: "Kayseri", eb: ["e7-nejat", "e7-nejat-es"], es: ["e8-ayhan-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e8-ayhan-es", ad: "Gülsen", soyad: "Demirtaş", c: "female", d: "1959-09-14", yer: "Kayseri", din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e8-cengiz", ad: "Cengiz", soyad: "Yıldırım", c: "male", d: "1958-02-21", yer: "Develi", eb: ["e7-muzaffer", "e7-muzaffer-es"], es: ["e8-cengiz-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e8-cengiz-es", ad: "Nurhayat", soyad: "Yıldırım", c: "female", d: "1963-07-06", yer: "Kayseri", din: "İslam", mez: "Alevi", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e8-serdar", ad: "Serdar", soyad: "Toroslu", c: "male", d: "1961-11-25", yer: "Adana", eb: ["e7-cahit", "e7-cahit-es"], es: ["e8-serdar-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e8-serdar-es", ad: "Ayşegül", soyad: "Toroslu", c: "female", d: "1966-04-02", yer: "Mersin", din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e8-sevinc", ad: "Sevinç", soyad: "Demirtaş", c: "female", d: "1957-08-30", yer: "Kayseri", eb: ["e7-nejat", "e7-nejat-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e8-oktay", ad: "Oktay", soyad: "Yıldırım", c: "male", d: "1965-03-18", yer: "Develi", eb: ["e7-muzaffer", "e7-muzaffer-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },

  /* --- 9. kuşak (1980-1998) --- */
  { id: "e9-emrah", ad: "Emrah", soyad: "Demirtaş", c: "male", d: "1983-06-12", yer: "Kayseri", eb: ["e8-ayhan", "e8-ayhan-es"], es: ["e9-emrah-es"], din: "İslam", dil: "Türkçe, İngilizce", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e9-emrah-es", ad: "Gizem", soyad: "Demirtaş", c: "female", d: "1987-02-09", yer: "Ankara", din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e9-ceyda", ad: "Ceyda", soyad: "Demirtaş", c: "female", d: "1986-10-27", yer: "Kayseri", eb: ["e8-ayhan", "e8-ayhan-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e9-volkan", ad: "Volkan", soyad: "Yıldırım", c: "male", d: "1989-01-14", yer: "Develi", eb: ["e8-cengiz", "e8-cengiz-es"], es: ["e9-volkan-es"], din: "İslam", mez: "Alevi", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e9-volkan-es", ad: "Sinem", soyad: "Yıldırım", c: "female", d: "1992-05-03", yer: "İzmir", din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e9-aslihan", ad: "Aslıhan", soyad: "Yıldırım", c: "female", d: "1993-09-20", yer: "Develi", eb: ["e8-cengiz", "e8-cengiz-es"], din: "İslam", mez: "Alevi", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e9-baris-t", ad: "Barış", soyad: "Toroslu", c: "male", d: "1991-04-07", yer: "Adana", eb: ["e8-serdar", "e8-serdar-es"], es: ["e9-baris-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e9-baris-es", ad: "Merve", soyad: "Toroslu", c: "female", d: "1994-12-15", yer: "Adana", din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e9-tolgahan", ad: "Tolgahan", soyad: "Toroslu", c: "male", d: "1995-07-29", yer: "Adana", eb: ["e8-serdar", "e8-serdar-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },

  /* --- 10. kuşak (2010-2024) --- */
  { id: "e10-poyraz2", ad: "Kuzey", soyad: "Demirtaş", c: "male", d: "2013-03-05", yer: "Kayseri", eb: ["e9-emrah", "e9-emrah-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e10-defne2", ad: "Defne", soyad: "Demirtaş", c: "female", d: "2016-08-22", yer: "Kayseri", eb: ["e9-emrah", "e9-emrah-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e10-alp2", ad: "Alp", soyad: "Yıldırım", c: "male", d: "2018-11-11", yer: "Develi", eb: ["e9-volkan", "e9-volkan-es"], din: "İslam", mez: "Alevi", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e10-mira2", ad: "Mira", soyad: "Yıldırım", c: "female", d: "2021-02-28", yer: "İzmir", eb: ["e9-volkan", "e9-volkan-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e10-ada2", ad: "Ada", soyad: "Toroslu", c: "female", d: "2019-06-14", yer: "Adana", eb: ["e9-baris-t", "e9-baris-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e10-arda2", ad: "Arda", soyad: "Toroslu", c: "male", d: "2022-10-01", yer: "Adana", eb: ["e9-baris-t", "e9-baris-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e10-lila", ad: "Lila", soyad: "Demirtaş", c: "female", d: "2024-09-17", yer: "İstanbul", eb: ["k9-mert", "k9-mert-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e10-nehir2", ad: "Nehir", soyad: "Sarıkaya", c: "female", d: "2019-04-25", yer: "Kayseri", eb: ["k9-burcu", "k9-burcu-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e10-ege2", ad: "Ege", soyad: "Ergin", c: "male", d: "2016-12-09", yer: "Kayseri", eb: ["k9-seda", "k9-seda-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e10-zeynep2", ad: "Zeynep", soyad: "Uysal", c: "female", d: "2008-05-19", yer: "İstanbul", eb: ["k9-pinar", "k9-pinar-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },

  /* --- 11. kuşak --- */
  { id: "e9-selcuk2", ad: "Selçuk", soyad: "Demirtaş", c: "male", d: "1981-03-22", yer: "Kayseri", eb: ["e8-ayhan", "e8-ayhan-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e9-pelin2", ad: "Pelin", soyad: "Yıldırım", c: "female", d: "1986-07-11", yer: "Develi", eb: ["e8-cengiz", "e8-cengiz-es"], din: "İslam", mez: "Alevi", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e8-hulya2", ad: "Hülya", soyad: "Toroslu", c: "female", d: "1968-09-04", yer: "Adana", eb: ["e7-cahit", "e7-cahit-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e7-nedim", ad: "Nedim", soyad: "Yıldırım", c: "male", d: "1932-05-27", o: "2005-01-14", yer: "Develi", eb: ["e6-kadir", "e6-kadir-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e6-fitnat2", ad: "Fitnat", soyad: "Demirtaş", c: "female", d: "1897-12-08", o: "1974-06-30", yer: "Kayseri", eb: ["e5-rifat", "e5-rifat-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "e5-kamil", ad: "Kâmil", soyad: "Değirmencioğlu", c: "male", d: "1876", o: "1943", yer: "Develi", eb: ["k4-ismail", "k4-nazli"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı" },
  { id: "e4-zeliha2", ad: "Zeliha", soyad: "Değirmencioğlu", c: "female", d: "1832", o: "1901", yer: "Develi", eb: ["k3-mustafa", "k3-emine"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı" },
  { id: "e4-bekir2", ad: "Bekir", soyad: "Değirmencioğlu", c: "male", d: "1841", o: "1907", yer: "Develi", eb: ["k3-huseyin", "k3-huseyin-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı" },
  { id: "e11-derin2", ad: "Derin", soyad: "Uysal", c: "female", d: "2025-08-03", yer: "İstanbul", eb: ["k10-kaan", "k10-kaan-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye", bio: "Ailenin bilinen en genç üyesi. On altı kuşak öncesine, 1521 doğumlu Bali'ye kadar uzanan bir çizginin bugünkü ucu." },
];


/* ================================================================
   SOYADI TERCİHLERİ · ENGELLİLİK · ERKEN YAŞTA EBEVEYNLİK
   ================================================================ */
const EK2: Seed[] = [
  /* --- 1) Kocası kadının soyadını aldı --- */
  {
    id: "s-yasemin", ad: "Yasemin", soyad: "Değirmencioğlu", c: "female", d: "1988-03-14", yer: "Kayseri",
    eb: ["e8-ayhan", "e8-ayhan-es"], es: ["s-yasemin-es"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    bio: "Ailenin en eski soyadını — 1934'te terk edilen \"Değirmencioğlu\"nu — mahkeme kararıyla geri aldı. \"Dedelerimin adı bir kanunla silindi, ben de bir kanunla geri aldım\" diyor.\n\nEvlenirken soyadını değiştirmedi; eşi Kaan onun soyadına geçti. Nüfus müdürlüğünde iki kez geri çevrildiler, üçüncüde oldu.",
  },
  {
    id: "s-yasemin-es", ad: "Kaan", soyad: "Değirmencioğlu", c: "male", d: "1985-11-02", yer: "İzmir",
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    bio: "Evlenirken eşinin soyadını aldı; doğuştan gelen soyadı Aksu'ydu. \"Benimki bir soyad, onunki bir tarih\" diye anlatıyor.\n\nAilesinin bir kısmı bunu hâlâ tuhaf buluyor, babası nikâhta espri yaptı, sonra alıştılar.",
  },
  { id: "s-cinar", ad: "Çınar", soyad: "Değirmencioğlu", c: "male", d: "2019-05-08", yer: "Kayseri", eb: ["s-yasemin", "s-yasemin-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye", bio: "Annesinin soyadını taşıyan ilk kuşak. On altı kuşak önceki Bali'nin adını taşıyan bir çizginin ucunda." },

  /* --- 2) Kızlık soyadını korudu --- */
  {
    id: "s-nazli", ad: "Nazlı", soyad: "Erdemir", c: "female", d: "1991-07-19", yer: "Ankara",
    es: ["e9-selcuk2"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    bio: "2016'da evlendi, soyadını hiç değiştirmedi. Akademisyen; on yıllık yayın listesi kendi adına, değiştirmek istemedi.\n\nÇocukları babalarının soyadını taşıyor — kanun başka türlüsüne izin vermiyor. \"Yarısı bende kaldı\" diyor.",
  },
  { id: "s-deniz-e", ad: "Deniz", soyad: "Demirtaş", c: "female", d: "2020-02-29", yer: "Ankara", eb: ["e9-selcuk2", "s-nazli"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye", bio: "29 Şubat doğumlu; doğum gününü dört yılda bir kutluyor. Annesi Erdemir, babası Demirtaş — o babasının soyadını taşıyor." },

  /* --- 3) Çift soyad kullanan kuşak --- */
  {
    id: "s-melike", ad: "Melike", soyad: "Toroslu Ergin", c: "female", d: "1986-09-25", yer: "Adana",
    eb: ["e8-serdar", "e8-serdar-es"], es: ["s-melike-es"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    bio: "Evlenince kızlık soyadını da kullanmayı sürdürdü: resmî kayıtta \"Toroslu Ergin\". 2014 öncesinde kadınların önündeki tek seçenekti — ya kocanın soyadı, ya ikisi birden.\n\nAnnesi \"Benim zamanımda böyle bir şey yoktu\" der; büyükannesi ise soyadsız doğmuştu.",
  },
  { id: "s-melike-es", ad: "Tuncay", soyad: "Ergin", c: "male", d: "1976-04-11", yer: "Kayseri", din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },

  /* --- 4) Engellilik --- */
  {
    id: "s-ozan", ad: "Ozan", soyad: "Demirtaş", c: "male", d: "2009-06-17", yer: "İstanbul",
    eb: ["k9-mert", "k9-mert-es"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    dogustan: "Down sendromu (Trizomi 21)",
    bio: "Ailenin en sokulgan çocuğu. Kaynaştırma sınıfında okudu, şimdi bir belediye atölyesinde seramik yapıyor.\n\nDoğduğunda doktor aileye uzun bir liste okumuş; annesi \"listede gülmek yoktu, en çok onu yapıyor\" diyor. Bayramlarda herkesin elini ilk o öper.",
  },
  {
    id: "s-elif-k", ad: "Elif", soyad: "Yıldırım", c: "female", d: "1994-11-30", yer: "İzmir",
    eb: ["k8-ercan", "k8-ercan-es"], es: ["s-elif-es"],
    din: "İslam", dil: "Türkçe, İngilizce", etnik: "Türk", uyruk: "Türkiye",
    dogustan: "Doğuştan görme engelli",
    bio: "Hiç görmedi. Altı yaşında Braille öğrendi, on altısında piyanoyu kulaktan çaldı.\n\nBugün konservatuvarda öğretim görevlisi. Ailenin toplantılarında herkesin sesini kapıdan tanır; \"Ben sizi yüzünüzden değil, adımınızdan tanıyorum\" der.",
  },
  { id: "s-elif-es", ad: "Cenk", soyad: "Yıldırım", c: "male", d: "1991-08-05", yer: "İzmir", din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye", bio: "Elif'in eşi. Ses mühendisi; tanışmaları bir stüdyo kaydında oldu." },
  {
    id: "s-mehmet-k", ad: "Mehmet", soyad: "Toroslu", c: "male", d: "1952-03-08", o: "2018-12-14", yer: "Adana",
    eb: ["k7-vedat", "k7-vedat-es"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    dogustan: "Sol kolu doğuştan yok",
    olum: "Kalp krizi",
    bio: "Tek kolla traktör kullandı, tek kolla üç çocuk büyüttü. Köyde ona \"yarım Mehmet\" derlerdi, hiç alınmadı; \"yarısıyla sizin tamamınız kadar iş yaptım\" diye cevap verirdi.\n\nProtez takmayı hiç sevmedi, bir kez denedi, çekmecede kaldı.",
  },
  {
    id: "s-hediye", ad: "Hediye", soyad: "Değirmencioğlu", c: "female", d: "1888", o: "1961", yer: "Kayseri",
    eb: ["k5-halil", "k5-halil-es"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı / Türkiye",
    saglik: "Çocuk felci (1893 salgını) — sağ bacağında kalıcı sekel",
    olum: "Zatürre",
    bio: "Beş yaşında çocuk felci geçirdi, ömrü boyunca değnekle yürüdü. O dönem böyle çocuklar çoğu zaman evde saklanırdı; babası Halil onu okula gönderdi.\n\nKayseri'nin okuma yazma bilen ilk kadınlarından. Kırk yıl mahalle çocuklarına ders verdi.",
  },
  {
    id: "s-berk-i", ad: "Berk", soyad: "Sarıkaya", c: "male", d: "2021-01-22", yer: "Kayseri",
    eb: ["k9-burcu", "k9-burcu-es"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    dogustan: "Doğuştan işitme engelli — iki taraflı koklear implant",
    bio: "İki yaşında implant takıldı, ilk duyduğu ses annesinin adıydı. Ev halkı işaret dilini birlikte öğrendi; en hızlı öğrenen ablası Eylül oldu.",
  },
  {
    id: "s-ayten-o", ad: "Ayten", soyad: "Ergin", c: "female", d: "1963-04-19", yer: "Develi",
    eb: ["k7-necati", "k7-necati-es"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    dogustan: "Otizm spektrumu — tanı 2009'da, 46 yaşında konuldu",
    bio: "Çocukken \"içine kapanık\" denip geçilmişti. Tanı ancak yeğeni için araştırma yapılırken, kırk altı yaşında konuldu.\n\nDevelide bir kütüphanede çalıştı; kırk yıl boyunca katalog düzenini kimse ondan iyi bilmedi. \"Adı olsa da olmasa da ben hep böyleydim\" diyor.",
  },

  /* --- 5) Erken yaşta ebeveynlik --- */
  {
    id: "s-hatice-g", ad: "Hatice", soyad: "Değirmencioğlu", c: "female", d: "1852", o: "1919", yer: "Develi",
    eb: ["k4-ismail", "k4-nazli"], es: ["s-hatice-es"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı",
    bio: "On dört yaşında evlendirildi, on beşinde ilk çocuğunu doğurdu. O yüzyılda köyde olağan sayılırdı; bugün bakınca çocuk yaşta evlilik.\n\nDokuz doğum yaptı, beşi büyüdü. Kızlarını daha geç evlendirdi — \"benim gördüğümü görmesinler\" derdi.",
  },
  { id: "s-hatice-es", ad: "Ahmet", soyad: "Değirmencioğlu", c: "male", d: "1840", o: "1901", yer: "Develi", din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı" },
  { id: "s-zeynep-g", ad: "Zeynep", soyad: "Değirmencioğlu", c: "female", d: "1867", o: "1941", yer: "Develi", eb: ["s-hatice-g", "s-hatice-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Osmanlı", bio: "Annesi onu doğurduğunda on beş yaşındaydı. Kendisi yirmi üçünde evlendi; annesinin ısrarıydı." },

  {
    id: "s-sultan", ad: "Sultan", soyad: "Yıldırım", c: "female", d: "1938-02-11", o: "2016-09-03", yer: "Develi",
    eb: ["k6-sadik", "k6-sadik-es"], es: ["s-sultan-es"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    bio: "On altı yaşında anne oldu. 1954'te köyde nikâh yaşı kâğıt üzerinde vardı, uygulamada esnetilirdi.\n\nİlk çocuğunu doğururken ebe yoktu, komşu kadınlar aldı. Sonraki dört doğumunu hastanede yaptı; \"birincisini unutamam\" derdi.",
  },
  { id: "s-sultan-es", ad: "Rıfat", soyad: "Yıldırım", c: "male", d: "1932-06-24", o: "2004-11-17", yer: "Develi", din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye" },
  { id: "s-kemal-g", ad: "Kemal", soyad: "Yıldırım", c: "male", d: "1954-08-30", o: "2021-03-12", yer: "Develi", eb: ["s-sultan", "s-sultan-es"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye", bio: "Annesi onu on altı yaşında doğurdu; aralarında sadece on altı yaş vardı, kardeş gibi büyüdüler." },

  {
    id: "s-derya", ad: "Derya", soyad: "Öztürk", c: "female", d: "2006-05-14", yer: "İstanbul",
    eb: ["k9-ela", "k9-ela-es"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    bio: "On yedi yaşında anne oldu. Aile önce şok oldu, sonra sarıldı: annesi Ela okulunu bırakmamasında ısrar etti, bebeğe gündüzleri anneannesi baktı.\n\nBugün üniversitede; \"kolay olmadı ama yalnız da kalmadım\" diyor.",
  },
  { id: "s-derya-cocuk", ad: "Ada", soyad: "Öztürk", c: "female", d: "2023-10-07", yer: "İstanbul", eb: ["s-derya"], din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye", bio: "Annesi onu doğurduğunda on yedi yaşındaydı. Babası kayıtlarda yok. Evde üç kuşak birlikte büyütüyor." },
];


/* ================================================================
   ÇOK ERKEN YAŞTA ANNELİK — EVLİLİK DIŞI
   İnsanın karanlık gerçeklerinden biri: çocuk yaşta, çoğu zaman
   istismar sonucu annelik. Zorlama örnekler değil; onurla, sükûnetle
   ve gerçeğe sadık kalınarak yazıldı. Bu kayıtlar saklanan değil,
   açıkça yazılan hikâyelerdir.
   ================================================================ */
const EK3: Seed[] = [
  /* --- Tarihsel: 11 yaşında --- */
  {
    id: "s-fadime-e", ad: "Fadime", soyad: "Yıldırım", c: "female", d: "1913", o: "1994", yer: "Develi",
    eb: ["k6-sadik", "k6-sadik-es"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    olum: "Yaşlılık",
    bio: "On bir yaşında, evlilik olmadan anne oldu — o çağın köylerinde konuşulmayan, örtülen bir gerçeğin içinden geçti. Kızını nüfusa kendi kardeşi gibi yazdırdılar; yıllarca abla-kardeş bilindiler.\n\nBüyükannesi çocuğa annelik etti. Fadime bir daha evlenmedi, ömrünü kızının yanında geçirdi. Ailede uzun süre fısıltıyla anıldı; bugün adı açıkça yazılıyor.",
  },
  {
    id: "s-fadime-cocuk", ad: "Zeynep", soyad: "Yıldırım", c: "female", d: "1924", o: "2008", yer: "Develi",
    eb: ["s-fadime-e"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    olum: "İnme",
    bio: "Annesi onu on bir yaşında doğurdu. Uzun yıllar gerçek annesini ablası sandı; doğruyu yetişkinken öğrendi. \"Beni iki kadın büyüttü, ikisini de çok sevdim\" derdi.",
  },

  /* --- Çağdaş: 13 yaşında --- */
  {
    id: "s-yagmur", ad: "Yağmur", soyad: "Sarıkaya", c: "female", d: "2009-03-30", yer: "Kayseri",
    eb: ["k9-burcu", "k9-burcu-es"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    bio: "On üç yaşında, evlilik olmadan anne oldu. Bir istismarın sonucuydu; aile hukuki süreci işletti, onu korudu ve okuldan koparmadı.\n\nBebeğe gündüzleri anneannesi bakıyor. Yağmur okuluna devam ediyor. Ailesi bu satırların açıkça yazılmasında ısrar etti — \"saklanacak olan biz değiliz\" dediler.",
  },
  {
    id: "s-yagmur-cocuk", ad: "Poyraz", soyad: "Sarıkaya", c: "male", d: "2022-11-12", yer: "Kayseri",
    eb: ["s-yagmur"],
    din: "İslam", dil: "Türkçe", etnik: "Türk", uyruk: "Türkiye",
    bio: "Annesi onu on üç yaşında doğurdu. Üç kuşak bir arada büyütüyor; evin en çok korunan, en çok sevilen üyesi.",
  },
];

export const DEMO_PEOPLE: Person[] = build([
  ...K0A, ...K0B, ...K0C, ...K0D,
  ...K1, ...K1B, ...K2, ...K3, ...K4, ...K5, ...K6, ...K7, ...K8, ...K9, ...K10, ...K11,
  ...GOC, ...LGBT, ...EK, ...EK2, ...EK3,
]);

export const DEMO_FAMILY_NAME = "Demirtaş";
