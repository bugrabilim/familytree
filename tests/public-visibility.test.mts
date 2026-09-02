import { applyPublicVisibility, countRestricted } from "../lib/public-visibility.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); }
}
function eq<T>(got: T, want: T, msg: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}

const P = (id: string, extra: Partial<Person> = {}): Person => ({
  id, firstName: `Ad-${id}`, lastName: "Soy", gender: "male",
  parentIds: [], spouseIds: [], ...extra,
});

/* --- Dokunulmayan durum --------------------------------------------------- */
{
  const list = [P("a"), P("b", { parentIds: ["a"] })];
  const out = applyPublicVisibility(list);
  eq(out.length, 2, "kısıtlama yoksa herkes kalır");
  eq(out[0].firstName, "Ad-a", "kısıtlanmayan kişi olduğu gibi");
}

/* --- BULANIK: kart durur, kimlik gitmez ---------------------------------- */
{
  const gizliBilgi = P("x", {
    publicVisibility: "bulanik",
    firstName: "GIZLI-AD", lastName: "GIZLI-SOY", nickname: "GIZLI-LAKAP",
    birthDate: "1950-01-01", deathDate: "2020-01-01", birthPlace: "GIZLI-YER",
    bio: "GIZLI-HIKAYE", photo: "https://gizli/foto.jpg", occupation: "GIZLI-MESLEK",
    religion: "GIZLI-DIN", healthCondition: "GIZLI-SAGLIK", gender: "female",
    parentIds: ["p1"], spouseIds: ["s1"], formerSpouseIds: ["s0"],
    parentLinks: { p1: { kind: "adoptive", note: "GIZLI-NOT" } },
    memories: [{ id: "m", text: "GIZLI-ANI" }],
    events: [{ id: "e", type: "evlilik", title: "GIZLI-OLAY" }],
  });
  const [b] = applyPublicVisibility([gizliBilgi], { blurredName: "Gizlenmiş kişi" });

  // Hiçbir kişisel iz kalmamalı — serileştirmede aranır, alan alan değil.
  const json = JSON.stringify(b);
  for (const iz of ["GIZLI-AD", "GIZLI-SOY", "GIZLI-LAKAP", "1950-01-01", "2020-01-01",
    "GIZLI-YER", "GIZLI-HIKAYE", "gizli/foto", "GIZLI-MESLEK", "GIZLI-DIN",
    "GIZLI-SAGLIK", "GIZLI-NOT", "GIZLI-ANI", "GIZLI-OLAY"]) {
    check(!json.includes(iz), `bulanık kopyada iz yok: ${iz}`);
  }
  eq(b.gender, "unknown", "cinsiyet de gider");
  // Ad boş bırakılsaydı arayüz "İsimsiz" yazardı — "veri eksik" demek olurdu.
  eq(b.firstName, "Gizlenmiş kişi", "ad yerine 'saklı' etiketi konur");
  eq(applyPublicVisibility([gizliBilgi])[0].firstName, "", "etiket verilmezse boş kalır");
  eq(b.publicVisibility, "bulanik", "arayüz 'İsimsiz' değil 'gizlenmiş' yazabilsin diye bayrak kalır");

  // AĞACIN ŞEKLİ korunur.
  eq(b.parentIds, ["p1"], "ebeveyn bağı korunur");
  eq(b.spouseIds, ["s1"], "eş bağı korunur");
  eq(b.formerSpouseIds, ["s0"], "eski eş bağı korunur");
  eq(Object.keys(b.parentLinks ?? {}), ["p1"], "bağ anahtarı korunur");
  eq(b.parentLinks?.p1, {}, "bağın TÜRÜ (evlatlık/üvey) gider, varlığı kalır");

  // Diziler kopyalanır: bulanık kopyaya yazmak ham kaydı bozmasın.
  b.parentIds.push("sahte");
  eq(gizliBilgi.parentIds, ["p1"], "diziler kopyalanmış (ham kayıt bozulmaz)");
}

/* --- GİZLİ: kişi çıkar, başvuruları temizlenir --------------------------- */
{
  const list = [
    P("dede", { publicVisibility: "gizli" }),
    P("baba", { parentIds: ["dede", "nine"], parentLinks: { dede: { kind: "step" }, nine: {} } }),
    P("nine", { spouseIds: ["dede"], formerSpouseIds: ["dede"] }),
    P("dost", { associations: [{ id: "a", personId: "dede", type: "arkadas" }] }),
  ];
  const out = applyPublicVisibility(list);
  eq(out.length, 3, "gizlenen kişi listeden çıkar");
  check(!JSON.stringify(out).includes("Ad-dede"), "gizlenenin adı hiç geçmez");
  check(!JSON.stringify(out).includes('"dede"'), "gizlenenin KİMLİĞİ de hiç geçmez");

  const baba = out.find((p) => p.id === "baba")!;
  eq(baba.parentIds, ["nine"], "sarkan ebeveyn başvurusu temizlenir");
  eq(Object.keys(baba.parentLinks ?? {}), ["nine"], "sarkan bağ kaydı temizlenir");
  const nine = out.find((p) => p.id === "nine")!;
  eq(nine.spouseIds, [], "eş başvurusu temizlenir");
  eq(nine.formerSpouseIds, [], "eski eş başvurusu temizlenir");
  const dost = out.find((p) => p.id === "dost")!;
  eq(dost.associations, [], "çevre bağı temizlenir");
}

/* --- SIRA: önce gizle, sonra bulanıklaştır ------------------------------- */
{
  /*
   * Bulanık bir kişinin `parentIds`i, gizlenmiş birinin kimliğini taşımaya
   * devam etseydi kimlik sızardı — sarkan bir kimlik de "burada biri vardı"
   * der. Bu yüzden gizleme ÖNCE uygulanır.
   */
  const list = [
    P("gizlenen", { publicVisibility: "gizli" }),
    P("bulanik", { publicVisibility: "bulanik", parentIds: ["gizlenen"], spouseIds: ["gizlenen"] }),
  ];
  const out = applyPublicVisibility(list);
  eq(out.length, 1, "yalnız bulanık kişi kalır");
  eq(out[0].parentIds, [], "bulanık kişinin ebeveyn başvurusu da temizlenmiş");
  check(!JSON.stringify(out).includes("gizlenen"), "gizlenenin kimliği bulanık kayıtta da yok");
}

/* --- Gizlemenin BEDELİ belgelenir --------------------------------------- */
{
  // Yalnız gizlenen kişiden bağlanan çocuk, paylaşımda KÖK gibi görünür.
  // Bu kaçınılmaz; şekil korunacaksa "bulanik" seçilmeli.
  const list = [P("ata", { publicVisibility: "gizli" }), P("cocuk", { parentIds: ["ata"] })];
  const out = applyPublicVisibility(list);
  eq(out.find((p) => p.id === "cocuk")?.parentIds, [], "gizlenen tek ebeveynli çocuk köksüz kalır");
}

/* --- Ham liste DEĞİŞMEZ -------------------------------------------------- */
{
  const ham = [P("a", { publicVisibility: "gizli" }), P("b", { parentIds: ["a"] })];
  const kopya = JSON.parse(JSON.stringify(ham));
  applyPublicVisibility(ham);
  eq(ham, kopya, "girdi listesi değiştirilmez");
}

/* --- Sayım -------------------------------------------------------------- */
{
  const c = countRestricted([
    P("1", { publicVisibility: "gizli" }),
    P("2", { publicVisibility: "bulanik" }),
    P("3", { publicVisibility: "bulanik" }),
    P("4"),
  ]);
  eq(c, { gizli: 1, bulanik: 2 }, "kısıtlı kişiler sayılır");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
