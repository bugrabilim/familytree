import type { ParentLink, Person } from "@/types/family";

/* ---------------------------------------------------------------- */
/* Temel sorgular                                                    */
/* ---------------------------------------------------------------- */

export type PersonIndex = Map<string, Person>;

export function indexPeople(people: Person[]): PersonIndex {
  return new Map(people.map((p) => [p.id, p]));
}

export function getParents(person: Person, idx: PersonIndex): Person[] {
  return person.parentIds.map((id) => idx.get(id)).filter((p): p is Person => !!p);
}

export function getChildren(person: Person, people: Person[]): Person[] {
  return people.filter((p) => p.parentIds.includes(person.id));
}

export function getSpouses(person: Person, idx: PersonIndex): Person[] {
  return person.spouseIds.map((id) => idx.get(id)).filter((p): p is Person => !!p);
}

/** Çocuğun belirli bir ebeveynle olan bağının niteliği. */
export function parentLinkOf(child: Person, parentId: string): ParentLink | undefined {
  return child.parentLinks?.[parentId];
}

/** Bağ kan bağı dışında bir şey mi (evlat edinme / üvey / koruyucu)? */
export function isNonBiological(child: Person, parentId: string): boolean {
  const k = parentLinkOf(child, parentId)?.kind;
  return !!k && k !== "biological";
}

export function getFormerSpouses(person: Person, idx: PersonIndex): Person[] {
  return (person.formerSpouseIds ?? [])
    .map((id) => idx.get(id))
    .filter((p): p is Person => !!p);
}

export function getSiblings(person: Person, people: Person[]): Person[] {
  if (person.parentIds.length === 0) return [];
  return people.filter(
    (p) => p.id !== person.id && p.parentIds.some((pid) => person.parentIds.includes(pid))
  );
}

/** Kişinin tüm birinci derece bağlantıları — graf gezintisi için. */
export function neighbors(person: Person, people: Person[], idx: PersonIndex): Person[] {
  const seen = new Set<string>();
  const out: Person[] = [];
  for (const p of [
    ...getParents(person, idx),
    ...getSpouses(person, idx),
    ...getFormerSpouses(person, idx),
    ...getChildren(person, people),
    ...getSiblings(person, people),
  ]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

/* ---------------------------------------------------------------- */
/* Ata / torun kümeleri                                              */
/* ---------------------------------------------------------------- */

/** Kişinin tüm ataları — Map<id, kaç kuşak yukarıda> */
export function ancestorDepths(startId: string, idx: PersonIndex): Map<string, number> {
  const depths = new Map<string, number>();
  const queue: Array<[string, number]> = [[startId, 0]];
  const seen = new Set<string>([startId]);

  while (queue.length) {
    const [id, depth] = queue.shift()!;
    if (depth > 0) depths.set(id, depth);
    const person = idx.get(id);
    if (!person) continue;
    for (const pid of person.parentIds) {
      if (!seen.has(pid)) {
        seen.add(pid);
        queue.push([pid, depth + 1]);
      }
    }
  }
  return depths;
}

/** Kişinin tüm soyu — Map<id, kaç kuşak aşağıda> */
export function descendantDepths(startId: string, people: Person[]): Map<string, number> {
  const childrenOf = new Map<string, string[]>();
  for (const p of people) {
    for (const pid of p.parentIds) {
      const arr = childrenOf.get(pid);
      if (arr) arr.push(p.id);
      else childrenOf.set(pid, [p.id]);
    }
  }

  const depths = new Map<string, number>();
  const queue: Array<[string, number]> = [[startId, 0]];
  const seen = new Set<string>([startId]);

  while (queue.length) {
    const [id, depth] = queue.shift()!;
    if (depth > 0) depths.set(id, depth);
    for (const cid of childrenOf.get(id) ?? []) {
      if (!seen.has(cid)) {
        seen.add(cid);
        queue.push([cid, depth + 1]);
      }
    }
  }
  return depths;
}

/**
 * Kişiyi merkez alıp herkesi KUŞAK UZAKLIĞINA göre gruplar.
 * Anahtar = kuşak uzaklığı (0 = kişinin kendisi), değer = o uzaklıktaki kişiler.
 * Pozitif uzaklık hem yukarı ataları hem aşağı torunları BİRLİKTE kapsar
 * (ancestorDepths + descendantDepths). Saf: girdiyi değiştirmez.
 */
export function relativesByGeneration(
  startId: string,
  people: Person[],
  idx: PersonIndex
): Map<number, Person[]> {
  const out = new Map<number, Person[]>();
  const self = idx.get(startId);
  if (!self) return out;
  out.set(0, [self]);

  const add = (depth: number, id: string) => {
    const p = idx.get(id);
    if (!p) return;
    const arr = out.get(depth);
    if (arr) arr.push(p);
    else out.set(depth, [p]);
  };

  for (const [id, d] of ancestorDepths(startId, idx)) add(d, id);
  for (const [id, d] of descendantDepths(startId, people)) add(d, id);
  return out;
}

/**
 * Kan hısımlığı derecesi (medeni hukuk): iki kişi arasındaki en kısa
 * doğum (ebeveyn-çocuk) zincirinin halka sayısı. Kendisi = 0, anne/çocuk = 1,
 * kardeş / dede / torun = 2, amca-yeğen = 3, birinci kuzen = 4…
 * Yalnızca kan bağı kenarları (parentIds ve çocuklar) üzerinden BFS.
 * Evlilik kenarları sayılmaz.
 */
export function bloodDegrees(startId: string, people: Person[], idx: PersonIndex): Map<string, number> {
  const childrenOf = new Map<string, string[]>();
  for (const p of people) {
    for (const pid of p.parentIds) {
      const arr = childrenOf.get(pid);
      if (arr) arr.push(p.id);
      else childrenOf.set(pid, [p.id]);
    }
  }

  const dist = new Map<string, number>([[startId, 0]]);
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    const d = dist.get(id)!;
    const person = idx.get(id);
    const nbrs = [...(person?.parentIds ?? []), ...(childrenOf.get(id) ?? [])];
    for (const n of nbrs) {
      if (!dist.has(n) && idx.has(n)) {
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}

/** Bir kişiye bağlı tüm graf bileşeni (izole kişileri bulmak için). */
export function connectedComponent(startId: string, people: Person[], idx: PersonIndex): Set<string> {
  const seen = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length) {
    const person = idx.get(queue.shift()!);
    if (!person) continue;
    for (const n of neighbors(person, people, idx)) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        queue.push(n.id);
      }
    }
  }
  return seen;
}

/* ---------------------------------------------------------------- */
/* Akrabalık hesaplayıcı — Türkçe akrabalık adları                   */
/* ---------------------------------------------------------------- */

type Move = "parent" | "child" | "spouse";
export interface RelationStep {
  personId: string;
  move: Move;
}

/**
 * İki kişi arasındaki en kısa akrabalık yolunu bulur (BFS).
 * Dönen dizi `fromId`'den sonraki adımları içerir; son eleman `toId`'dir.
 */
export function findRelationPath(
  fromId: string,
  toId: string,
  people: Person[],
  idx: PersonIndex
): RelationStep[] | null {
  if (fromId === toId) return [];

  const childrenOf = new Map<string, string[]>();
  // Eş bağı tek yönlü kalmış olabilir; her iki yönü de indeksle
  const spousesOf = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    const set = spousesOf.get(a);
    if (set) set.add(b);
    else spousesOf.set(a, new Set([b]));
  };

  for (const p of people) {
    for (const pid of p.parentIds) {
      const arr = childrenOf.get(pid);
      if (arr) arr.push(p.id);
      else childrenOf.set(pid, [p.id]);
    }
    for (const sid of [...p.spouseIds, ...(p.formerSpouseIds ?? [])]) {
      link(p.id, sid);
      link(sid, p.id);
    }
  }

  const prev = new Map<string, RelationStep>();
  const seen = new Set<string>([fromId]);
  const queue = [fromId];

  while (queue.length) {
    const id = queue.shift()!;
    const person = idx.get(id);
    if (!person) continue;

    const edges: Array<[string, Move]> = [
      ...person.parentIds.map((p) => [p, "parent"] as [string, Move]),
      ...(childrenOf.get(id) ?? []).map((c) => [c, "child"] as [string, Move]),
      ...[...(spousesOf.get(id) ?? [])].map((s) => [s, "spouse"] as [string, Move]),
    ];

    for (const [nextId, move] of edges) {
      if (seen.has(nextId) || !idx.has(nextId)) continue;
      seen.add(nextId);
      prev.set(nextId, { personId: id, move });
      if (nextId === toId) {
        // Yolu geri sar
        const path: RelationStep[] = [];
        let cur = toId;
        while (cur !== fromId) {
          const step = prev.get(cur)!;
          path.unshift({ personId: cur, move: step.move });
          cur = step.personId;
        }
        return path;
      }
      queue.push(nextId);
    }
  }
  return null;
}

const ATA_ADI = ["", "", "büyük", "büyük büyük", "büyük büyük büyük"];

function ordinalAta(up: number, gender: Person["gender"]): string {
  // up >= 2
  const taban = gender === "female" ? "nine" : gender === "male" ? "dede" : "ata";
  if (up === 2) return taban === "ata" ? "büyük ata" : taban;
  if (up <= 4) return `${ATA_ADI[up - 1]} ${taban}`.trim();
  return `${up - 1}. kuşak ${taban}`;
}

function ordinalTorun(down: number): string {
  if (down === 1) return "çocuk";
  if (down === 2) return "torun";
  if (down === 3) return "torun çocuğu";
  return `${down - 1}. kuşak torun`;
}

/**
 * Yol'u Türkçe akrabalık adına çevirir.
 * `from` kişisinin gözünden `to` kişisi kimdir?
 */
export function describeRelation(
  fromId: string,
  toId: string,
  people: Person[],
  idx: PersonIndex
): string | null {
  if (fromId === toId) return "Kendisi";

  const from = idx.get(fromId);
  if (from?.formerSpouseIds?.includes(toId)) return "Eski eş";

  const path = findRelationPath(fromId, toId, people, idx);
  if (!path || path.length === 0) return null;

  const target = idx.get(toId);
  if (!target) return null;
  const g = target.gender;

  const moves = path.map((s) => s.move);

  // Tek adım
  if (moves.length === 1) {
    if (moves[0] === "parent") return g === "female" ? "Anne" : g === "male" ? "Baba" : "Ebeveyn";
    if (moves[0] === "child") return g === "female" ? "Kız" : g === "male" ? "Oğul" : "Çocuk";
    return "Eş";
  }

  /** İki kişi arasındaki eş bağı boşanmayla mı bitmiş? */
  const eskiEsMi = (aId: string, bId: string) =>
    !!idx.get(aId)?.formerSpouseIds?.includes(bId);

  // Evlilik adımı içeriyor mu?
  const spouseAt = moves.indexOf("spouse");
  if (spouseAt !== -1) {
    // "X'in eşi" biçiminde tarif et
    // "X'in eşi" — son adım evlilikse
    if (spouseAt === moves.length - 1) {
      const araId = path[spouseAt - 1].personId;
      const araRel = describeRelation(fromId, araId, people, idx);
      const ara = idx.get(araId);
      if (araRel && ara) {
        const eski = eskiEsMi(araId, toId);
        const araLower = araRel.toLocaleLowerCase("tr");

        if (araLower === "kız" || araLower === "oğul") {
          const t = g === "female" ? "Gelin" : g === "male" ? "Damat" : `${possessive(araLower)} eşi`;
          return eski ? `Eski ${t.toLocaleLowerCase("tr")}` : t;
        }
        if (araLower.includes("kardeş")) {
          const t = g === "female" ? "Yenge" : g === "male" ? "Enişte" : `${possessive(araLower)} eşi`;
          return eski ? `Eski ${t.toLocaleLowerCase("tr")}` : t;
        }
        return `${capitalize(genitiveCommon(possessive(araLower)))} ${eski ? "eski eşi" : "eşi"}`;
      }
    }

    // "Eşinin X'i" — ilk adım evlilikse
    if (spouseAt === 0) {
      const esId = path[0].personId;
      const eski = eskiEsMi(fromId, esId);
      const kalan = describeRelation(esId, toId, people, idx);
      if (kalan) {
        const kalanLower = kalan.toLocaleLowerCase("tr");

        if (!eski) {
          if (kalanLower === "anne") return "Kayınvalide";
          if (kalanLower === "baba") return "Kayınpeder";
          if (kalanLower.includes("kardeş")) {
            return g === "female" ? "Baldız / Görümce" : "Kayınbirader";
          }
        }
        // Üvey çocuk: eşinin (ya da eski eşinin) çocuğu
        if (kalanLower === "kız" || kalanLower === "oğul") {
          const t = g === "female" ? "Üvey kız" : g === "male" ? "Üvey oğul" : "Üvey çocuk";
          return t;
        }
        return `${eski ? "Eski eşinin" : "Eşinin"} ${possessive(kalanLower)}`;
      }
    }
    return "Evlilik yoluyla akraba";
  }

  // Saf kan bağı: önce yukarı, sonra aşağı olmalı
  let up = 0;
  let i = 0;
  while (i < moves.length && moves[i] === "parent") { up++; i++; }
  let down = 0;
  while (i < moves.length && moves[i] === "child") { down++; i++; }
  if (i !== moves.length) return "Akraba";

  /**
   * Baba tarafı mı anne tarafı mı?
   * Çapa, hedefin kardeşi (ya da ebeveyni) olduğu ata: `path[up - 2]`.
   *  - up=2 → path[0] = kendi ebeveynimiz  (amca/dayı, babaanne/anneanne)
   *  - up=3 → path[1] = büyükanne/büyükbaba (büyük amca/büyük dayı)
   */
  const yanCapa = up >= 2 ? idx.get(path[up - 2].personId) : idx.get(path[0].personId);
  const babaTarafi = yanCapa?.gender === "male";
  const anneTarafi = yanCapa?.gender === "female";

  // Sadece yukarı → ata
  if (down === 0) {
    if (up === 1) return g === "female" ? "Anne" : g === "male" ? "Baba" : "Ebeveyn";
    // Türkçede babaanne / anneanne ayrımı var; dede her iki tarafta da dede.
    if (up === 2 && g === "female") {
      if (babaTarafi) return "Babaanne";
      if (anneTarafi) return "Anneanne";
      return "Nine";
    }
    return capitalize(ordinalAta(up, g));
  }

  // Sadece aşağı → soy
  if (up === 0) {
    if (down === 1) return g === "female" ? "Kız" : g === "male" ? "Oğul" : "Çocuk";
    return capitalize(ordinalTorun(down));
  }

  // Kardeş
  if (up === 1 && down === 1) {
    return g === "female" ? "Kız kardeş" : g === "male" ? "Erkek kardeş" : "Kardeş";
  }

  // Amca / Dayı / Hala / Teyze — bağlantının hangi taraftan geçtiğine göre
  if (up === 2 && down === 1) {
    if (g === "male") return babaTarafi ? "Amca" : anneTarafi ? "Dayı" : "Amca / Dayı";
    if (g === "female") return babaTarafi ? "Hala" : anneTarafi ? "Teyze" : "Hala / Teyze";
    return "Ebeveyn kardeşi";
  }

  // Yeğen
  if (up === 1 && down === 2) return "Yeğen";
  if (up === 1) return `${down - 1}. kuşak yeğen`;

  // Kuzen
  if (up === 2 && down === 2) return "Kuzen";
  if (up === down) return `${up - 1}. dereceden kuzen`;

  // Büyük amca / büyük hala / büyük dayı / büyük teyze (ve daha üst kuşakları)
  if (down === 1) {
    const taban =
      g === "male"
        ? babaTarafi ? "amca" : anneTarafi ? "dayı" : "amca"
        : g === "female"
        ? babaTarafi ? "hala" : anneTarafi ? "teyze" : "hala"
        : "ata kardeşi";
    if (taban === "ata kardeşi") return capitalize(`${ordinalAta(up - 1, "unknown")} kardeşi`);
    const buyuk = up === 3 ? "büyük" : `${up - 2} kez büyük`;
    return capitalize(`${buyuk} ${taban}`);
  }
  return "Uzak akraba";
}

/* ---------------------------------------------------------------- */
/* Türkçe iyelik eki — "dede" → "dedesi", "kardeş" → "kardeşi"        */
/* ---------------------------------------------------------------- */

const UNLU = "aeıioöuü";
/** Büyük ünlü uyumuna göre 3. tekil iyelik ünlüsü */
const UYUM: Record<string, string> = {
  a: "ı", ı: "ı",
  e: "i", i: "i",
  o: "u", u: "u",
  "ö": "ü", "ü": "ü",
};
/** Ünsüz yumuşaması: damat → damadı, çocuk → çocuğu */
const YUMUSAMA: Record<string, string> = { p: "b", "ç": "c", t: "d", k: "ğ" };

/** Kural dışı biçimler */
const ISTISNA: Record<string, string> = {
  "oğul": "oğlu",
  "torun çocuğu": "torun çocuğu",
  "kendisi": "kendisi",
};

function tekKelimeIyelik(kelime: string): string {
  const alt = kelime.toLocaleLowerCase("tr");
  let sonUnlu = "";
  for (const ch of alt) if (UNLU.includes(ch)) sonUnlu = ch;
  const ek = UYUM[sonUnlu] ?? "i";

  const son = alt[alt.length - 1];
  if (UNLU.includes(son)) return `${kelime}s${ek}`;

  const yumusak = YUMUSAMA[son];
  const govde = yumusak && alt.length > 2 ? kelime.slice(0, -1) + yumusak : kelime;
  return `${govde}${ek}`;
}

/**
 * Akrabalık adını iyelik ekli hâle getirir:
 * "büyük dede" → "büyük dedesi", "kız kardeş" → "kız kardeşi".
 * Eğik çizgiyle ayrılmış seçenekler ayrı ayrı çekimlenir.
 */
export function possessive(term: string): string {
  return term
    .split("/")
    .map((parca) => {
      const kirp = parca.trim();
      if (!kirp) return kirp;
      const alt = kirp.toLocaleLowerCase("tr");
      if (ISTISNA[alt]) return ISTISNA[alt];

      const kelimeler = kirp.split(" ");
      const sonKelime = kelimeler[kelimeler.length - 1];
      if (ISTISNA[sonKelime.toLocaleLowerCase("tr")]) {
        kelimeler[kelimeler.length - 1] = ISTISNA[sonKelime.toLocaleLowerCase("tr")];
      } else {
        kelimeler[kelimeler.length - 1] = tekKelimeIyelik(sonKelime);
      }
      return kelimeler.join(" ");
    })
    .join(" / ");
}

/**
 * Ortak ada ilgi hâli eki (kesme işaretsiz): "babası" → "babasının".
 * Tamlama kurarken kullanılır: "babasının eski eşi".
 */
export function genitiveCommon(word: string): string {
  const w = word.trim();
  if (!w) return w;
  const alt = w.toLocaleLowerCase("tr");
  let sonUnlu = "";
  for (const ch of alt) if (UNLU.includes(ch)) sonUnlu = ch;
  const ek = UYUM[sonUnlu] ?? "i";
  const son = alt[alt.length - 1];
  return UNLU.includes(son) ? `${w}n${ek}n` : `${w}${ek}n`;
}

/**
 * Özel ada ilgi hâli eki: "Deniz" → "Deniz'in", "Ayşe" → "Ayşe'nin".
 * Özel adlarda ünsüz yumuşaması olmaz (Burak'ın, Burağın değil).
 */
export function genitive(name: string): string {
  const ad = name.trim();
  if (!ad) return ad;
  const alt = ad.toLocaleLowerCase("tr");

  let sonUnlu = "";
  for (const ch of alt) if (UNLU.includes(ch)) sonUnlu = ch;
  const ek = UYUM[sonUnlu] ?? "i";

  const son = alt[alt.length - 1];
  return UNLU.includes(son) ? `${ad}'n${ek}n` : `${ad}'${ek}n`;
}

function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase("tr") + s.slice(1);
}

/* ---------------------------------------------------------------- */
/* İstatistikler                                                     */
/* ---------------------------------------------------------------- */

export interface FamilyStats {
  total: number;
  male: number;
  female: number;
  living: number;
  deceased: number;
  generations: number;
  oldestBirthYear?: number;
  surnames: Array<{ name: string; count: number }>;
  unlinked: number;
  /** Süregelen evlilik sayısı (benzersiz çift) */
  marriages: number;
  /** Boşanmayla biten evlilik sayısı (benzersiz çift) */
  divorces: number;
  /** Vefat edenlerin ortalama ömrü (yıl) */
  avgLifespan?: number;
  /** Yaşayanların en yaşlısının yaşı */
  oldestLivingAge?: number;
  /** En çok görülen doğum yeri */
  topBirthPlace?: { name: string; count: number };
  /** En kalabalık kardeş grubu */
  largestSibship: number;
}

export function computeStats(people: Person[]): FamilyStats {
  const idx = indexPeople(people);

  const surnameMap = new Map<string, number>();
  let male = 0;
  let female = 0;
  let deceased = 0;
  let oldestBirthYear: number | undefined;

  for (const p of people) {
    if (p.gender === "male") male++;
    else if (p.gender === "female") female++;
    if (p.deathDate) deceased++;

    const y = p.birthDate ? Number(p.birthDate.slice(0, 4)) : NaN;
    if (!Number.isNaN(y) && (oldestBirthYear === undefined || y < oldestBirthYear)) {
      oldestBirthYear = y;
    }

    const ln = p.lastName?.trim();
    if (ln) surnameMap.set(ln, (surnameMap.get(ln) ?? 0) + 1);
  }

  // Kuşak sayısı: en uzun ata zinciri + 1
  let generations = people.length > 0 ? 1 : 0;
  for (const p of people) {
    const depths = ancestorDepths(p.id, idx);
    let max = 0;
    for (const d of depths.values()) if (d > max) max = d;
    if (max + 1 > generations) generations = max + 1;
  }

  // Hiçbir bağlantısı olmayanlar
  let unlinked = 0;
  for (const p of people) {
    const hasLink =
      p.parentIds.length > 0 ||
      p.spouseIds.length > 0 ||
      people.some((o) => o.parentIds.includes(p.id));
    if (!hasLink) unlinked++;
  }

  const surnames = [...surnameMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Evlilik / boşanma çiftleri (benzersiz)
  const evli = new Set<string>();
  const bosanmis = new Set<string>();
  for (const p of people) {
    for (const sid of p.spouseIds) if (idx.has(sid)) evli.add([p.id, sid].sort().join("|"));
    for (const sid of p.formerSpouseIds ?? []) if (idx.has(sid)) bosanmis.add([p.id, sid].sort().join("|"));
  }

  // Ömür ortalaması (vefat edenler) ve en yaşlı yaşayan
  const yil = (d?: string) => (d ? Number(d.slice(0, 4)) : NaN);
  let omurTop = 0;
  let omurN = 0;
  let oldestLivingAge: number | undefined;
  const buYil = new Date().getFullYear();
  for (const p of people) {
    const b = yil(p.birthDate);
    const d = yil(p.deathDate);
    if (!Number.isNaN(b) && !Number.isNaN(d) && d >= b) {
      omurTop += d - b;
      omurN++;
    }
    if (!p.deathDate && !Number.isNaN(b)) {
      const yas = buYil - b;
      if (yas >= 0 && yas < 125 && (oldestLivingAge === undefined || yas > oldestLivingAge)) {
        oldestLivingAge = yas;
      }
    }
  }

  // En sık doğum yeri
  const yerMap = new Map<string, number>();
  for (const p of people) {
    const y = p.birthPlace?.trim();
    if (y) yerMap.set(y, (yerMap.get(y) ?? 0) + 1);
  }
  let topBirthPlace: { name: string; count: number } | undefined;
  for (const [name, count] of yerMap) {
    if (!topBirthPlace || count > topBirthPlace.count) topBirthPlace = { name, count };
  }

  // En kalabalık kardeş grubu (aynı ebeveyn kümesi)
  const kardesMap = new Map<string, number>();
  for (const p of people) {
    if (p.parentIds.length === 0) continue;
    const key = [...p.parentIds].sort().join("|");
    kardesMap.set(key, (kardesMap.get(key) ?? 0) + 1);
  }
  let largestSibship = 0;
  for (const n of kardesMap.values()) if (n > largestSibship) largestSibship = n;

  return {
    total: people.length,
    male,
    female,
    living: people.length - deceased,
    deceased,
    generations,
    oldestBirthYear,
    surnames,
    unlinked,
    marriages: evli.size,
    divorces: bosanmis.size,
    avgLifespan: omurN ? Math.round(omurTop / omurN) : undefined,
    oldestLivingAge,
    topBirthPlace,
    largestSibship,
  };
}
