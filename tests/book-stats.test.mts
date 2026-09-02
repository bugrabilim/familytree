import { computeAlmanac, computeGenerations } from "../lib/book-stats.ts";
import type { Person } from "../types/family.ts";

let ok = 0, fail = 0;
const check = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.log(`✗ ${name}`); } };

const P = (id: string, extra: Partial<Person> = {}): Person => ({
  id,
  firstName: id,
  lastName: "Test",
  gender: "male",
  parentIds: [],
  spouseIds: [],
  ...extra,
});

// Dede(1) → Baba(2) → Çocuk(3); Anne çocuğun diğer ebeveyni. Anne'nin kendi
// anne-babası kayıtlı DEĞİL ama eşi 2. kuşak ve çocuğu 3. kuşak: 2. kuşaktır.
// (Eskiden 1'di — yani dedeyle aynı kuşakta sayılıyordu.)
const people: Person[] = [
  P("dede", { birthDate: "1900-01-01", deathDate: "1980-01-01" }),
  P("baba", { birthDate: "1930-06-01", deathDate: "2010-06-01", parentIds: ["dede"], spouseIds: ["anne"] }),
  P("anne", { birthDate: "1935-01-01", spouseIds: ["baba"] }),
  P("cocuk", { birthDate: "1960-01-01", parentIds: ["baba", "anne"] }),
];

const gen = computeGenerations(people);
check("dede 1. kuşak", gen.get("dede") === 1);
check("baba 2. kuşak", gen.get("baba") === 2);
check("anne eşiyle aynı kuşakta → 2", gen.get("anne") === 2);
check("cocuk 3. kuşak", gen.get("cocuk") === 3);

const alm = computeAlmanac(people);
check("kuşak dağılımı 3 kuşak", alm.perGeneration.length === 3);
check("1. kuşakta yalnız dede", alm.perGeneration.find((g) => g.gen === 1)?.count === 1);
check("2. kuşakta 2 kişi (baba+anne)", alm.perGeneration.find((g) => g.gen === 2)?.count === 2);
check("3. kuşakta 1 kişi", alm.perGeneration.find((g) => g.gen === 3)?.count === 1);

/* --- Köksüz kişinin aile bağlamından yerleşmesi ---------------------------- */

// Eş kaydı YOK ama çocuğu var: çocuğundan bir önceki kuşak.
{
  const g = computeGenerations([
    P("k1"), P("k2", { parentIds: ["k1"] }), P("k3", { parentIds: ["k2"] }),
    P("gelin", {}), // eşi kayıtlı değil
    P("torun", { parentIds: ["k3", "gelin"] }),
  ]);
  check("çocuğundan türeyen kuşak: gelin 3", g.get("gelin") === 3);
  check("torun 4", g.get("torun") === 4);
}

// Eş zinciri: A köksüz, B köksüz, A—B evli, B'nin çocuğu 5. kuşakta.
{
  const g = computeGenerations([
    P("a1"), P("a2", { parentIds: ["a1"] }), P("a3", { parentIds: ["a2"] }), P("a4", { parentIds: ["a3"] }),
    P("es1", { spouseIds: ["a4", "es2"] }),
    P("es2", { spouseIds: ["es1"] }),
  ]);
  check("es1 eşinden 4. kuşak", g.get("es1") === 4);
  check("es2 eş zinciriyle 4. kuşak", g.get("es2") === 4);
}

// Ebeveyni BİLİNEN kişi eşine çekilmez: kendi soyu onu bağlar.
{
  const g = computeGenerations([
    P("x1"), P("x2", { parentIds: ["x1"] }),
    P("y1"), P("y2", { parentIds: ["y1"] }), P("y3", { parentIds: ["y2"] }),
    P("y4", { parentIds: ["y3"], spouseIds: ["x2"] }),
  ]);
  check("x2 kendi soyuyla 2. kuşakta kalır", g.get("x2") === 2);
  check("y4 4. kuşak", g.get("y4") === 4);
}

// Sarkan ebeveyn kimliği (silinmiş kişi) bağlam sayılmaz: kişi yine köksüzdür
// ve eşinden yerleşebilir.
{
  const g = computeGenerations([
    P("z1"), P("z2", { parentIds: ["z1"] }), P("z3", { parentIds: ["z2"], spouseIds: ["sarkan"] }),
    P("sarkan", { parentIds: ["yok-boyle-biri"], spouseIds: ["z3"] }),
  ]);
  check("sarkan ebeveynli kişi eşinden yerleşir", g.get("sarkan") === 3);
}

// Ata grafiğinde çevrim (bozuk veri) → sonlanmalı, patlamamalı.
{
  const g = computeGenerations([
    P("c1", { parentIds: ["c2"] }),
    P("c2", { parentIds: ["c1"] }),
  ]);
  check("çevrim sonlanır", typeof g.get("c1") === "number" && typeof g.get("c2") === "number");
}

// Başarım: geniş ağaçta makul sürede bitmeli (gevşetme tur sayısı derinlikle
// sınırlı, kişi sayısıyla değil).
{
  const big: Person[] = [];
  for (let i = 0; i < 5000; i++) {
    big.push(P(`b${i}`, i === 0 ? {} : { parentIds: [`b${Math.floor((i - 1) / 2)}`] }));
  }
  const t0 = Date.now();
  const g = computeGenerations(big);
  const ms = Date.now() - t0;
  check(`5000 kişi < 2sn (${ms}ms)`, ms < 2000);
  check("kök 1. kuşak", g.get("b0") === 1);
}

check("en eski doğumlu ilk sırada dede", alm.eldest[0] === "dede");
check("en eski liste doğum tarihli 4 kişi", alm.eldest.length === 4);

// En uzun yaşamış (yaşayan + vefat): anne yaşıyor ve en yaşlı → ilk sırada;
// dede/baba (80'er) da listede.
check("en uzun ömürlü ilk sırada anne (yaşayan)", alm.longestLived[0].id === "anne");
check("en uzun ömürlü listede dede var", alm.longestLived.some((r) => r.id === "dede"));
check("dede yaşı 80", alm.longestLived.find((r) => r.id === "dede")?.age === 80);

// Yaşayan en yaşlı: anne (1935 doğumlu, yaşıyor) — cocuk'tan yaşlı.
check("yaşayan en yaşlı anne", alm.livingOldest[0]?.id === "anne");
check("yaşayan listede vefat eden yok", alm.livingOldest.every((r) => r.living));

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
