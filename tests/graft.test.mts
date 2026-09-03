import { graftFromPeer, ancestorClosure, mergeTree } from "../lib/graft.ts";
import type { Person } from "../types/family.ts";

let ok = 0,
  fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) ok++;
  else {
    fail++;
    console.log(`✗ ${name}`);
  }
};

const P = (o: Partial<Person> & { id: string }): Person => ({
  firstName: "X",
  lastName: "Y",
  gender: "unknown",
  parentIds: [],
  spouseIds: [],
  ...o,
});

// Peer: torun(gc) → baba(f) → dede(gf)
const peer = [
  P({ id: "gc", firstName: "Torun", birthDate: "2000", parentIds: ["f"] }),
  P({ id: "f", firstName: "Baba", birthDate: "1970", parentIds: ["gf"] }),
  P({ id: "gf", firstName: "Dede", birthDate: "1940" }),
];

// Kapanış
check("ata kapanışı", [...ancestorClosure(peer, "gc")].sort().join() === "f,gc,gf");

// Benim ağacımda "Torun" (aynı ad+yıl) var, ataları yok → aşıla
const mine = [P({ id: "mine1", firstName: "Torun", birthDate: "2000" })];
const g = graftFromPeer(mine, peer, "gc");
check("2 ata eklendi", g.added === 2); // Baba + Dede
check("eşleşen torun yeniden kullanıldı", g.linked === 1);
const torun = g.people.find((p) => p.id === "mine1")!;
check("toruna baba bağlandı", torun.parentIds.length === 1);
const babaId = torun.parentIds[0];
const baba = g.people.find((p) => p.id === babaId)!;
check("baba eklendi (yeni id)", baba && baba.firstName === "Baba" && baba.id !== "f");
check("babanın dedesi eklendi", baba.parentIds.length === 1 && g.people.find((p) => p.id === baba.parentIds[0])?.firstName === "Dede");

// Kaynak değişmedi
check("mine orijinali değişmedi", mine.length === 1);

// Hiç eşleşme yoksa: kök + atalar tümü klonlanır
const empty: Person[] = [];
const g2 = graftFromPeer(empty, peer, "gc");
check("boş ağaca 3 kişi", g2.added === 3 && g2.people.length === 3);

// mergeTree: tüm peer ağacı; kesişimde dedup
const mineFull = [P({ id: "m1", firstName: "Dede", birthDate: "1940" })]; // Dede zaten bende
const mt = mergeTree(mineFull, peer);
check("mergeTree: Dede yeniden kullanıldı", mt.linked >= 1);
check("mergeTree: Torun + Baba eklendi (Dede hariç)", mt.added === 2);
check("mergeTree: toplam 3 kişi", mt.people.length === 3);
const babaM = mt.people.find((p) => p.firstName === "Baba")!;
check("mergeTree: babanın dedesi mevcut m1'e bağlandı", babaM.parentIds.includes("m1"));

/* --- Aşılamada komşu ağacın kimlikleri KALMAZ ---------------------------- */
/*
 * `{ ...peer }` geri kalan her şeyi olduğu gibi kopyalıyordu; üç alan komşu
 * ağacın kimliğini taşıyor ve üçü de ayrıca ele alınmalı:
 *
 * · `parentLinks` anahtarları — çevrilmezse `parentLinkOf` bağı güncel
 *   kimlikle arayıp bulamıyor ve evlatlık/üvey bağ sessizce KAN BAĞINA
 *   dönüyor. Sarkan kimlikten kötü: görünmeyen veri bozulması.
 * · `associations[].personId` — kendi ağacımızda olmayan kişilere işaret
 *   eden `error` düzeyinde kayıtlar.
 * · `code` — her ağaç 289001'den başlıyor, komşunun kodu kendi ağacımızda
 *   çakışıyor ve `ensureCodes` yalnız BOŞ kodları doldurduğu için kalıcı.
 */
{
  const k = (o: Partial<Person> & { id: string }): Person =>
    ({ firstName: "A", lastName: "B", gender: "unknown", parentIds: [], spouseIds: [], ...o }) as Person;

  /*
   * VEFAT tarihleri bilerek var: bu blok kimlik ÇEVİRMEYİ sınıyor ve
   * yaşayan bir komşu kişi maskeleneceği için (aşağıdaki blok) çevrilecek
   * bir `associations` kalmazdı. İki kural ayrı ayrı sınanıyor.
   */
  const komsu = [
    k({ id: "p-baba", firstName: "PeerBaba", deathDate: "1980" }),
    k({ id: "p-dost", firstName: "Dost", kind: "cevre", deathDate: "1990" }),
    k({ id: "p-cocuk", firstName: "PeerCocuk", parentIds: ["p-baba"], deathDate: "2000",
        parentLinks: { "p-baba": { kind: "adoptive" } },
        associations: [
          { id: "a1", personId: "p-dost", type: "arkadas" },   // kapanış DIŞINDA
          { id: "a2", personId: "p-baba", type: "komsu" },     // kapanış İÇİNDE
        ],
        code: "289001" }),
  ];
  const benim = [k({ id: "m1", firstName: "Benim", code: "289001" })];
  const { people } = graftFromPeer(benim, komsu, "p-cocuk");
  const cocuk = people.find((x) => x.firstName === "PeerCocuk")!;
  const babaId = cocuk.parentIds[0];

  check("komşu kimliği parentLinks'te kalmadı", !cocuk.parentLinks || !("p-baba" in cocuk.parentLinks));
  check("evlatlık bağı YENİ kimlikle korundu", cocuk.parentLinks?.[babaId]?.kind === "adoptive");
  check("kapanış içindeki çevre bağı çevrildi",
    !!cocuk.associations?.some((a) => a.personId === babaId));
  check("kapanış dışına sarkan çevre bağı atıldı",
    !cocuk.associations?.some((a) => a.personId === "p-dost"));
  check("komşunun kodu taşınmadı (çakışma yok)", cocuk.code === undefined);
  const kodlar = people.map((x) => x.code).filter(Boolean);
  check("ağaçta yinelenen kod yok", new Set(kodlar).size === kodlar.length);
}

/* --- KOMŞU AĞAÇTAN KOPYALANAN VERİ MASKELİ --------------------------- */
/*
 * Karşılaştırma ekranı karşı ağacın yaşayan ve `confidential` kişilerini
 * maskeleyerek gösteriyor; aşılama ise ham kaydı kopyalıyordu. Kullanıcının
 * EKRANDA göremediği doğum tarihi, hikâye, sağlık notu, yönelim, fotoğraf
 * kendi ağacına kalıcı olarak geçiyordu — bakılan veri kaybolur, kopyalanan
 * veri kalır ve oradan dışa aktarılır.
 */
{
  const k = (o: Partial<Person> & { id: string }): Person =>
    ({ firstName: "A", lastName: "B", gender: "unknown", parentIds: [], spouseIds: [], ...o }) as Person;

  const hassas = {
    birthDate: "1975-05-05",
    birthPlace: "Sivas",
    bio: "özel hikâye",
    healthNote: "sağlık notu",
    orientation: "gay",
    photo: "https://x/y.jpg",
    religion: "din",
  };
  const komsu = [
    k({ id: "p1", firstName: "Yasayan", ...hassas }),                       // yaşayan
    k({ id: "p2", firstName: "Gizli", confidential: true, deathDate: "1990", ...hassas }),
    k({ id: "p3", firstName: "Cocuk", parentIds: ["p1", "p2"], deathDate: "2000" }),
  ];
  const { people } = graftFromPeer([], komsu, "p3");
  const alan = (ad: string, f: keyof Person) =>
    (people.find((x) => x.firstName === ad) as Record<string, unknown> | undefined)?.[f];

  for (const [ad, aciklama] of [["Yasayan", "yaşayan"], ["Gizli", "gizli kayıt"]] as const) {
    check(`${aciklama}: doğum tarihi kopyalanmadı`, alan(ad, "birthDate") === undefined);
    check(`${aciklama}: doğum yeri kopyalanmadı`, alan(ad, "birthPlace") === undefined);
    check(`${aciklama}: hikâye kopyalanmadı`, alan(ad, "bio") === undefined);
    check(`${aciklama}: sağlık notu kopyalanmadı`, alan(ad, "healthNote") === undefined);
    check(`${aciklama}: yönelim kopyalanmadı`, alan(ad, "orientation") === undefined);
    check(`${aciklama}: fotoğraf kopyalanmadı`, alan(ad, "photo") === undefined);
    check(`${aciklama}: din kopyalanmadı`, alan(ad, "religion") === undefined);
    check(`${aciklama}: ad taşındı (ağaç bozulmasın)`, people.some((x) => x.firstName === ad));
  }
  // Vefat etmiş, gizli olmayan kişi tam kopyalanır — kural gizlilik, sansür değil.
  check("vefat etmiş kişide ölüm tarihi korunuyor", alan("Cocuk", "deathDate") === "2000");
  // Ağaç yapısı bozulmadı: çocuğun iki ebeveyni de yerinde.
  check("maskeli ebeveynlerin bağı duruyor",
    (people.find((x) => x.firstName === "Cocuk")?.parentIds ?? []).length === 2);
}
{
  // EŞLEŞTİRME hâlâ HAM veriyle: yaşayan bir kişi yerelde bulunabilmeli,
  // yoksa kesişim bulma özelliğinin bütün anlamı kaybolurdu.
  const k = (o: Partial<Person> & { id: string }): Person =>
    ({ firstName: "A", lastName: "B", gender: "unknown", parentIds: [], spouseIds: [], ...o }) as Person;
  const benim = [k({ id: "m1", firstName: "Ali", lastName: "Yilmaz", birthDate: "1950" })];
  const komsu = [
    k({ id: "p1", firstName: "Ali", lastName: "Yilmaz", birthDate: "1950" }),
    k({ id: "p2", firstName: "Dede", lastName: "Yilmaz", birthDate: "1920" }),
  ];
  komsu[0].parentIds = ["p2"];
  const r = graftFromPeer(benim, komsu, "p1");
  check("yaşayan kişi hâlâ eşleşiyor (linked)", r.linked === 1);
  check("yalnız eksik ata eklendi", r.added === 1);
  check("kendi kaydımın doğum tarihi duruyor",
    r.people.find((x) => x.id === "m1")?.birthDate === "1950");
}

/* --- ESKİ EŞLER eşleşen kişide de birleşiyor -------------------------- */
/*
 * `formers` hesaplanıyor ama "yeniden kullanılan" dalda hiç yazılmıyordu:
 * aynı kişi için boşanma bağı, yerelde eşleşip eşleşmemesine göre kâh
 * taşınıyor kâh sessizce düşüyordu.
 */
{
  const k = (o: Partial<Person> & { id: string }): Person =>
    ({ firstName: "A", lastName: "B", gender: "unknown", parentIds: [], spouseIds: [], ...o }) as Person;
  const benim = [
    k({ id: "m1", firstName: "Ali", birthDate: "1950", deathDate: "2010" }),
    k({ id: "m2", firstName: "Ayse", birthDate: "1955", deathDate: "2015" }),
  ];
  const komsu = [
    k({ id: "p1", firstName: "Ali", birthDate: "1950", deathDate: "2010", formerSpouseIds: ["p2"] }),
    k({ id: "p2", firstName: "Ayse", birthDate: "1955", deathDate: "2015", parentIds: [] }),
  ];
  const { people } = mergeTree(benim, komsu);
  const ali = people.find((x) => x.id === "m1")!;
  check("eşleşen kişide eski eş bağı korundu", (ali.formerSpouseIds ?? []).includes("m2"));
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
