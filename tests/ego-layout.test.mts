import { layoutEgo, type EgoAlter } from "../lib/ego-layout.ts";

let ok = 0, fail = 0;
const check = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.log(`✗ ${n}`); } };
const near = (a: number, b: number, eps = 0.5) => Math.abs(a - b) <= eps;

// Boş çevre: yalnız merkez sığar, kutu simetrik.
const empty = layoutEgo([]);
check("boş: nokta yok", empty.points.length === 0);
check("boş: merkez kutunun ortasında", empty.cx === empty.width / 2 && empty.cy === empty.height / 2);
check("boş: pozitif boyut", empty.width > 0 && empty.height > 0);

// Kategori başına tek düğüm çapa açısında durur (y aşağı büyür).
const one: EgoAlter[] = [
  { id: "p", category: "parent" },
  { id: "c", category: "child" },
  { id: "s", category: "partner" },
  { id: "sib", category: "sibling" },
];
const L = layoutEgo(one);
const byId = new Map(L.points.map((pt) => [pt.id, pt]));
check("parent üstte (y < cy)", byId.get("p")!.y < L.cy);
check("child altta (y > cy)", byId.get("c")!.y > L.cy);
check("partner sağda (x > cx)", byId.get("s")!.x > L.cx);
check("sibling solda (x < cx)", byId.get("sib")!.x < L.cx);
check("hepsi aynı yarıçapta", one.every((a) => {
  const pt = byId.get(a.id)!;
  const r = Math.hypot(pt.x - L.cx, pt.y - L.cy);
  return near(r, L.radius);
}));

// Tek düğüm tam çapada: parent → açı -90° (üst), y = cy - radius.
check("tek parent tam yukarıda", near(byId.get("p")!.x, L.cx) && near(byId.get("p")!.y, L.cy - L.radius));

// Kalabalık kategori yarıçapı büyütür (çakışmayı önlemek için).
const many: EgoAlter[] = Array.from({ length: 12 }, (_, i) => ({ id: `k${i}`, category: "associate" as const }));
const big = layoutEgo(many);
check("kalabalıkta yarıçap büyür", big.radius > L.radius);
check("kalabalık: tüm düğümler yerleşti", big.points.length === 12);

// Bir kategorideki düğümler çapayı ortalayan simetrik yelpaze oluşturur:
// ortalama açı ≈ çapa açısı.
const kids: EgoAlter[] = [
  { id: "c1", category: "child" },
  { id: "c2", category: "child" },
  { id: "c3", category: "child" },
];
const K = layoutEgo(kids);
const kidsAngles = K.points.map((p) => p.angle);
const avg = kidsAngles.reduce((s, a) => s + a, 0) / kidsAngles.length;
check("çocuk yelpazesi 90° çapada ortalanır", near(avg, Math.PI / 2, 1e-6));

// Yerleşim saf/deterministik: aynı girdi aynı çıktı.
const a1 = JSON.stringify(layoutEgo(one).points);
const a2 = JSON.stringify(layoutEgo(one).points);
check("deterministik", a1 === a2);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
