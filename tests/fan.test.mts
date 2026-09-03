import {
  assignParentSlots,
  buildFanNodes,
  clampGenerations,
  fanExtent,
  polarToXy,
  wedgePath,
  DEFAULT_LAYOUT,
} from "../lib/fan.ts";
import type { Gender, Person } from "../types/family.ts";

let ok = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) ok++;
  else {
    fail++;
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const P = (
  id: string,
  gender: Gender,
  parentIds: string[] = []
): Person => ({ id, firstName: id, lastName: "T", gender, parentIds, spouseIds: [] });

/*  Ata ağacı (kök = "ben"):
      ben ← baba(M), anne(F)
      baba ← dede(M), nine(F)
      anne ← dede2(M)                 (annenin annesi bilinmiyor → boş yuva)
*/
const people: Person[] = [
  P("ben", "male", ["baba", "anne"]),
  P("baba", "male", ["dede", "nine"]),
  P("anne", "female", ["dede2"]),
  P("dede", "male"),
  P("nine", "female"),
  P("dede2", "male"),
];

const nodes = buildFanNodes(people, "ben", 3);
const bySosa = new Map(nodes.map((n) => [n.sosa, n]));

// --- Sosa/Ahnentafel numaralandırması ---
check("kök sosa 1", bySosa.get(1)?.person?.id === "ben");
check("baba sosa 2", bySosa.get(2)?.person?.id === "baba");
check("anne sosa 3", bySosa.get(3)?.person?.id === "anne");
check("baba tarafı dede sosa 4", bySosa.get(4)?.person?.id === "dede");
check("baba tarafı nine sosa 5", bySosa.get(5)?.person?.id === "nine");
check("anne tarafı dede sosa 6", bySosa.get(6)?.person?.id === "dede2");

// --- Kuşak ataması ---
check("kök kuşak 0", bySosa.get(1)?.gen === 0);
check("ebeveynler kuşak 1", bySosa.get(2)?.gen === 1 && bySosa.get(3)?.gen === 1);
check("büyükanne/baba kuşak 2", bySosa.get(4)?.gen === 2 && bySosa.get(6)?.gen === 2);

// --- Boş yuva: annenin annesi (sosa 7) bilinmiyor ama çizilmeli (soluk) ---
check("eksik ebeveyn boş dilim olarak var (sosa 7)", bySosa.has(7));
check("boş dilimde kişi yok", bySosa.get(7)?.person === undefined);
// dede (sosa 4) bilinen kişi; ebeveynleri (sosa 8,9) soluk boş dilim olarak çizilir
check("bilinen kişinin eksik ebeveyni soluk çizilir (sosa 8)", bySosa.has(8) && bySosa.get(8)?.person === undefined);
// sosa 7 zaten boş → onun ebeveyni (sosa 14) çizilmemeli (boş alt ağaç budanır)
check("boş yuvanın atası çizilmez (sosa 14)", !bySosa.has(14));

// --- Kuşak sayıları ---
const g0 = nodes.filter((n) => n.gen === 0).length;
const g1 = nodes.filter((n) => n.gen === 1).length;
const g2 = nodes.filter((n) => n.gen === 2).length;
check("kuşak 0 tek düğüm", g0 === 1, `${g0}`);
check("kuşak 1 iki düğüm", g1 === 2, `${g1}`);
check("kuşak 2 dört düğüm (2 dolu + 2 boş)", g2 === 4, `${g2}`);

// --- Açı bütünlüğü: kuşak dilimleri açıklığı doldurur ---
const span = DEFAULT_LAYOUT.spanDeg;
const g1Nodes = nodes.filter((n) => n.gen === 1).sort((a, b) => a.startAngle - b.startAngle);
check("kuşak 1 açıklığı kaplar", Math.abs((g1Nodes[1].endAngle - g1Nodes[0].startAngle) - span) < 1e-6);
check(
  "baba anneden önce (açı olarak solda)",
  (bySosa.get(2)?.midAngle ?? 0) < (bySosa.get(3)?.midAngle ?? 0)
);

// --- clampGenerations ---
check("clamp üst sınır 8", clampGenerations(20) === 8);
check("clamp alt sınır 0", clampGenerations(-5) === 0);
check("clamp tam sayıya iner", clampGenerations(5.9) === 5);

// --- Geometri yardımcıları ---
const up = polarToXy(0, 0, 10, 0);
check("polarToXy 0° yukarı gösterir", Math.abs(up.x) < 1e-6 && Math.abs(up.y + 10) < 1e-6);
const right = polarToXy(0, 0, 10, 90);
check("polarToXy 90° sağı gösterir", Math.abs(right.x - 10) < 1e-6 && Math.abs(right.y) < 1e-6);

const rootPath = wedgePath(100, 100, bySosa.get(1)!);
check("kök path merkezden başlar (M cx cy)", rootPath.startsWith("M 100.00 100.00"));
const ringPath = wedgePath(100, 100, bySosa.get(2)!);
check("halka dilimi iki yay içerir", (ringPath.match(/A /g) ?? []).length === 2);

// --- fanExtent & boş kök ---
check("fanExtent kuşakla büyür", fanExtent(6) > fanExtent(3));
check("kök yoksa boş dizi", buildFanNodes(people, "yok", 3).length === 0);
check("rootId undefined ise boş dizi", buildFanNodes(people, undefined, 3).length === 0);

/* --- İKİ ANNE: hiçbir ebeveyn sessizce DÜŞMEZ ------------------------- */
/*
 * Eski kural yuvaları cinsiyete göre dolduruyor, hiçbir yuvaya oturmayan
 * ebeveyni atıyordu. İki anneli bir kişide `baba` yuvası boş kalıyor ve
 * ikinci anne — onunla birlikte O HATTIN TAMAMI — yelpazeden kayboluyordu.
 * Uyarı da yoktu: kullanıcı eksiği ancak veriyi başka ekranda görürse fark
 * ederdi.
 */
{
  const iki: Person[] = [
    P("cocuk", "female", ["anne1", "anne2"]),
    P("anne1", "female", ["nine1"]),
    P("anne2", "female", ["nine2"]),
    P("nine1", "female"),
    P("nine2", "female"),
  ];
  const n = buildFanNodes(iki, "cocuk", 3);
  const kisiler = new Set(n.map((x) => x.person?.id).filter(Boolean));
  check("iki anne de yelpazede", kisiler.has("anne1") && kisiler.has("anne2"),
    [...kisiler].join(","));
  check("ikinci annenin HATTI da geliyor", kisiler.has("nine1") && kisiler.has("nine2"),
    [...kisiler].join(","));
}
{
  // İki baba için de aynı — kural cinsiyete simetrik.
  const iki: Person[] = [
    P("cocuk", "male", ["baba1", "baba2"]),
    P("baba1", "male"),
    P("baba2", "male"),
  ];
  const kisiler = new Set(buildFanNodes(iki, "cocuk", 2).map((x) => x.person?.id));
  check("iki baba da yelpazede", kisiler.has("baba1") && kisiler.has("baba2"));
}

/* --- Yuva ayrımının kendisi -------------------------------------------- */
{
  const m = P("m", "male"), f = P("f", "female"), u = P("u", "unknown"), o = P("o", "other");
  const slot = (a: Person[]) => assignParentSlots(a).map((x) => x?.id ?? "-").join("/");
  check("baba+anne sırası", slot([f, m]) === "m/f", slot([f, m]));
  check("iki kadın: ikincisi baba yuvasına", slot([f, P("f2", "female")]) === "f2/f", slot([f, P("f2", "female")]));
  check("iki erkek: ikincisi anne yuvasına", slot([m, P("m2", "male")]) === "m/m2");
  check("bilinmeyen tek başına ilk yuvada", slot([u]) === "u/-");
  check("erkek + bilinmeyen", slot([m, u]) === "m/u");
  check("kadın + bilinmeyen", slot([f, u]) === "u/f", slot([f, u]));
  check("iki bilinmeyen giriş sırasıyla", slot([u, o]) === "u/o");
  check("tek ebeveyn kaybolmuyor", slot([f]) === "-/f");
  check("boş liste", slot([]) === "-/-");
  /*
   * Üçüncü ebeveyn iki-yuva varsayımının dışında; buradaki iddia onun bir
   * yere sığdırılması değil, İKİ yuvanın da dolu kalması.
   */
  check("üç ebeveynde iki yuva da dolu", slot([m, f, u]) === "m/f");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
