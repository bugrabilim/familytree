import type { ParentLink, Person } from "@/types/family";
import { nanoid } from "nanoid";

/**
 * Dal aşılama (P3) — bağlı bir ağaçtan seçilen kişinin ATA soyunu kendi ağacına
 * kopyalar. Kesişimlerde AKILLI: kopyalanacak her kişi yerelde (ad + doğum yılı
 * ±1) eşleşiyorsa yeniden kullanılır (yinelenmez), yalnız eksik atalar eklenir
 * ve eşleşen kişinin ebeveyn/eş bağları birleşir. Saf mantık, test edilebilir
 * (yalnız `nanoid` + tip alır → Node ile çalışır).
 */

function normName(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const fullKey = (p: Person) => `${normName(p.firstName)}|${normName(p.lastName)}`;
function year(d?: string): number | null {
  const y = d ? parseInt(d.slice(0, 4), 10) : NaN;
  return Number.isFinite(y) ? y : null;
}

/** Kök + tüm ataları (parentIds ile yukarı kapanış). */
export function ancestorClosure(peerPeople: Person[], rootId: string): Set<string> {
  const idx = new Map(peerPeople.map((p) => [p.id, p]));
  const set = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (set.has(id) || !idx.has(id)) continue;
    set.add(id);
    for (const pid of idx.get(id)!.parentIds ?? []) stack.push(pid);
  }
  return set;
}

/** Peer kişisi için yerel eşleşme (ad + yıl ±1). Yıl yoksa eşleşme sayılmaz. */
function localMatch(peer: Person, mine: Person[]): string | undefined {
  const key = fullKey(peer);
  if (key === "|") return undefined;
  const py = year(peer.birthDate);
  if (py === null) return undefined;
  for (const L of mine) {
    if (fullKey(L) !== key) continue;
    const ly = year(L.birthDate);
    if (ly !== null && Math.abs(py - ly) <= 1) return L.id;
  }
  return undefined;
}

export interface GraftResult {
  people: Person[];
  /** Yeni eklenen kişi sayısı. */
  added: number;
  /** Eşleşen (yeniden kullanılan) kişi sayısı. */
  linked: number;
}

/**
 * `rootPeerId` ve atalarını `minePeople`'a aşılar. `peerPeople` kaynak ağaç.
 * Kaynağı değiştirmez; yeni `minePeople` dizisi döner.
 */
export function graftFromPeer(
  minePeople: Person[],
  peerPeople: Person[],
  rootPeerId: string
): GraftResult {
  const peerIdx = new Map(peerPeople.map((p) => [p.id, p]));
  if (!peerIdx.has(rootPeerId)) return { people: minePeople, added: 0, linked: 0 };
  return graftClosure(minePeople, peerPeople, ancestorClosure(peerPeople, rootPeerId));
}

/**
 * Tam birleştirme (P4) — TÜM peer ağacını `minePeople`'a katar; kesişimlerde
 * (ad + yıl ±1) yeniden kullanır, gerisini ekler. Kaynağı değiştirmez.
 */
export function mergeTree(minePeople: Person[], peerPeople: Person[]): GraftResult {
  return graftClosure(minePeople, peerPeople, new Set(peerPeople.map((p) => p.id)));
}

/**
 * Verilen peer kişileri kümesini `minePeople`'a aşılayan çekirdek. Kümede olan
 * her kişi yerelde eşleşiyorsa yeniden kullanılır; değilse klonlanır. Kümedeki
 * kişiler arası bağlar korunur, dışarı sarkanlar atılır.
 */
function graftClosure(minePeople: Person[], peerPeople: Person[], closure: Set<string>): GraftResult {
  const peerIdx = new Map(peerPeople.map((p) => [p.id, p]));

  // peer id → yerel id (eşleşen) ya da yeni id (klon)
  const idMap = new Map<string, string>();
  const reused = new Set<string>(); // eşleşme ile yeniden kullanılan peer id'ler
  for (const pid of closure) {
    const peer = peerIdx.get(pid)!;
    const match = localMatch(peer, minePeople);
    if (match) {
      idMap.set(pid, match);
      reused.add(pid);
    } else {
      idMap.set(pid, nanoid());
    }
  }

  // yalnız kapanış-içi hedeflere çevir (dışarı sarkan bağları at)
  const mapIn = (peerId: string, selfLocal: string): string | null => {
    if (!closure.has(peerId)) return null;
    const t = idMap.get(peerId)!;
    return t === selfLocal ? null : t;
  };

  const result = minePeople.map((p) => ({ ...p }));
  const resIdx = new Map(result.map((p) => [p.id, p]));

  let added = 0;
  let linked = 0;
  for (const pid of closure) {
    const peer = peerIdx.get(pid)!;
    const localId = idMap.get(pid)!;
    const parents = (peer.parentIds ?? [])
      .map((x) => mapIn(x, localId))
      .filter((x): x is string => !!x);
    const spouses = (peer.spouseIds ?? [])
      .map((x) => mapIn(x, localId))
      .filter((x): x is string => !!x);
    const formers = (peer.formerSpouseIds ?? [])
      .map((x) => mapIn(x, localId))
      .filter((x): x is string => !!x);

    if (reused.has(pid)) {
      // Eşleşen yerel kişi → eksik ata/eş bağlarını birleştir (üste aşıla)
      const L = resIdx.get(localId);
      if (L) {
        L.parentIds = [...new Set([...(L.parentIds ?? []), ...parents])];
        L.spouseIds = [...new Set([...(L.spouseIds ?? []), ...spouses])];
        linked++;
      }
    } else {
      const clone: Person = { ...peer, id: localId, parentIds: parents, spouseIds: spouses };
      if (formers.length) clone.formerSpouseIds = formers;
      else delete clone.formerSpouseIds;

      /*
       * `...peer` geri kalan HER ŞEYİ olduğu gibi kopyalıyor — komşu ağacın
       * kimliklerini taşıyan üç alan dâhil. Üçü de ayrıca ele alınmalı.
       *
       * 1) `parentLinks` ANAHTARLARI ebeveyn kimliğidir. Çevrilmezse bağ
       *    komşunun kimliğinde kalıyor ve `parentLinkOf` bağı GÜNCEL kimlikle
       *    aradığı için bulamıyor: evlatlık/üvey/koruyucu bir bağ sessizce
       *    KAN BAĞINA dönüyor. Sarkan bir kimlikten kötü — görünmeyen bir
       *    veri bozulması.
       */
      if (peer.parentLinks) {
        const links: Record<string, ParentLink> = {};
        for (const [ppid, link] of Object.entries(peer.parentLinks)) {
          const hedef = mapIn(ppid, localId);
          if (hedef) links[hedef] = link;
        }
        if (Object.keys(links).length) clone.parentLinks = links;
        else delete clone.parentLinks;
      }

      /*
       * 2) `associations[].personId` de komşunun kimliği. Kapanış dışına
       *    bakan bağlar atılır; yoksa kendi ağacımızda var olmayan kişilere
       *    işaret eden `error` düzeyinde kayıtlar oluşuyor (`findRefIssues`).
       */
      if (peer.associations?.length) {
        const bags = peer.associations
          .map((a) => {
            const hedef = mapIn(a.personId, localId);
            return hedef ? { ...a, personId: hedef } : null;
          })
          .filter((a): a is NonNullable<typeof a> => !!a);
        if (bags.length) clone.associations = bags;
        else delete clone.associations;
      }

      /*
       * 3) `code` insan-okur kimlik ve HER ağaç 289001'den başlıyor. Komşunun
       *    kodunu taşımak, kendi ağacımızda aynı kodu iki kişide oluşturur;
       *    `ensureCodes` yalnız BOŞ kodları doldurduğu için de kendiliğinden
       *    düzelmiyor. Kod düşürülür, çağıran rota yenisini verir.
       */
      delete clone.code;
      result.push(clone);
      resIdx.set(localId, clone);
      added++;
    }
  }

  return { people: result, added, linked };
}
