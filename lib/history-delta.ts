import type { Person } from "../types/family.ts";

/**
 * Geçmiş günlüğünün fark (delta) mantığı — saf, test edilebilir.
 *
 * ESKİ BİÇİM: her anlık görüntü TÜM kişi listesinin bir kopyasıydı. 400
 * kişilik bir ağaçta 15 görüntü, aynı verinin 15 kopyası demekti; blob
 * şişiyordu ve `MAX` tam da bu yüzden 15 gibi düşük bir sayıda tutulmuştu —
 * yani kullanıcı, depolama yüzünden geri alma derinliğinden oluyordu.
 *
 * YENİ BİÇİM: bir tam durum (`head`, EN YENİ görüntü) + geriye doğru
 * farklar. `deltas[0]` head'i bir öncekine, `deltas[1]` onu bir öncekine
 * çevirir.
 *
 * Yön neden geriye? Yazma sıcak yol: her kaydetmede bir görüntü ekleniyor.
 * İleri farkla saklasaydık, yeni görüntüyü eklemek için önce tüm zinciri
 * uygulayıp en yeniyi kurmak gerekirdi. Geriye doğru saklayınca yeni gelen
 * durum doğrudan yeni `head` olur ve tek bir fark hesaplanır — zincir hiç
 * açılmaz. En eskiyi budamak da bedava: listenin sonundan bir eleman atmak.
 * Ödediğimiz bedel, eski bir görüntüyü GERİ YÜKLERKEN zinciri açmak; o ise
 * seyrek ve kullanıcı zaten bir düğmeye basmış durumda.
 */

/** İki durum arasındaki fark. Uygulanınca bir öncekini verir. */
export interface PeopleDelta {
  /** Bu farkı uygulayınca eklenecek/değişecek kişiler. */
  put: Person[];
  /** Bu farkı uygulayınca silinecek kişi kimlikleri. */
  del: string[];
  /**
   * Hedefin kimlik SIRASI — yalnız `put`/`del` uygulaması doğru sırayı
   * kendiliğinden vermiyorsa yazılır.
   *
   * Dizideki sıra çoğu yerde anlamsız (kardeş sırası `siblingOrder`
   * alanında, listeler ada göre sıralanıyor), ama "geri yükledim ve dosya
   * birebir eskisi olmadı" demek istemiyoruz. Neredeyse hiç yazılmadığı
   * için maliyeti de yok.
   */
  order?: string[];
}

/** Kimlik sırası aynı mı? */
function sameOrder(a: readonly Person[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i].id !== b[i]) return false;
  return true;
}

/**
 * `from` durumunu `to` durumuna çeviren farkı üretir.
 *
 * İçerik karşılaştırması `JSON.stringify` ile. Yanlış-pozitif (aynı içerik,
 * farklı anahtar sırası) yalnız farkı gereksiz büyütür, veriyi bozmaz.
 */
export function diffDelta(from: readonly Person[], to: readonly Person[]): PeopleDelta {
  const fromJson = new Map(from.map((p) => [p.id, JSON.stringify(p)]));
  const toIds = new Set(to.map((p) => p.id));

  const put: Person[] = [];
  for (const p of to) if (fromJson.get(p.id) !== JSON.stringify(p)) put.push(p);

  const del: string[] = [];
  for (const p of from) if (!toIds.has(p.id)) del.push(p.id);

  const delta: PeopleDelta = { put, del };
  // Sırayı yalnız gerekirse taşı: uygulamanın sonucunu şimdi hesaplayıp bak.
  if (!sameOrder(applyDelta(from, delta), to.map((p) => p.id))) {
    delta.order = to.map((p) => p.id);
  }
  return delta;
}

/**
 * Farkı uygular. Var olan kişi YERİNDE değişir (sıra korunur), yeni kişi
 * sona eklenir; `order` verilmişse son söz onundur.
 */
export function applyDelta(base: readonly Person[], delta: PeopleDelta): Person[] {
  const del = new Set(delta.del);
  const put = new Map(delta.put.map((p) => [p.id, p]));

  const out: Person[] = [];
  for (const p of base) {
    if (del.has(p.id)) continue;
    const yeni = put.get(p.id);
    if (yeni) {
      out.push(yeni);
      put.delete(p.id);
    } else {
      out.push(p);
    }
  }
  // Kalanlar = tabanda olmayan yeni kişiler.
  for (const p of delta.put) if (put.has(p.id)) out.push(p);

  if (!delta.order) return out;
  const byId = new Map(out.map((p) => [p.id, p]));
  const sirali: Person[] = [];
  for (const id of delta.order) {
    const p = byId.get(id);
    if (p) {
      sirali.push(p);
      byId.delete(id);
    }
  }
  // `order` eksik/bozuksa listede kalanları kaybetmeyelim: veri kaybı,
  // yanlış sıradan çok daha kötü.
  for (const p of out) if (byId.has(p.id)) sirali.push(p);
  return sirali;
}

/** Farkın kaba büyüklüğü — budama kararları ve tanı için. */
export function deltaSize(delta: PeopleDelta): number {
  return JSON.stringify(delta).length;
}

/* ------------------------------------------------------------------ */
/* Günlük dosyası                                                      */
/* ------------------------------------------------------------------ */

export interface HistoryStamp {
  id: string;
  at: string;
  /**
   * Bu görüntünün ÜZERİNE yazan değişikliği kimin yaptığı.
   *
   * Kafa karıştırıcı ama tutarlı: bir görüntü, bir kaydetmeden ÖNCEKİ
   * durumu tutar. Dolayısıyla `by`, o görüntüyü bir sonrakine (ya da en
   * yenisi için canlı veriye) dönüştüren kişidir.
   */
  by?: string;
  count: number;
}

/**
 * Günlük dosyasının yeni biçimi.
 *
 * `stamps[0]` = en yeni görüntü ve onun kişileri `head`tir. `stamps[i]`in
 * kişileri, `head`e `deltas[0..i-1]` uygulanarak elde edilir — yani
 * `deltas.length === stamps.length - 1` her zaman.
 */
export interface HistoryFileV2 {
  v: 2;
  head: Person[];
  stamps: HistoryStamp[];
  deltas: PeopleDelta[];
}

/** Eski biçim — okumak için hâlâ gerekli (yerinde geçiş). */
interface HistoryFileV1 {
  snapshots?: Array<{ id: string; at: string; people?: Person[]; by?: string }>;
}

export const emptyHistory = (): HistoryFileV2 => ({ v: 2, head: [], stamps: [], deltas: [] });

/**
 * Ham blob içeriğini yeni biçime çevirir — eski biçimi de kabul eder.
 *
 * Geçiş YERİNDE: eski dosya okununca sıkıştırılmış hâliyle bellekte durur ve
 * bir sonraki yazmada yeni biçimde diske iner. Ayrı bir taşıma betiği yok;
 * ağaç sayısı kadar elle iş çıkarmaya değmez ve kimse "taşımayı unuttum"
 * durumuna düşmez.
 */
export function parseHistory(raw: unknown): HistoryFileV2 {
  if (!raw || typeof raw !== "object") return emptyHistory();

  const v2 = raw as Partial<HistoryFileV2>;
  if (v2.v === 2 && Array.isArray(v2.stamps) && Array.isArray(v2.deltas)) {
    const head = Array.isArray(v2.head) ? v2.head : [];
    const stamps = v2.stamps.filter(
      (s): s is HistoryStamp => !!s && typeof s.id === "string" && typeof s.at === "string"
    );
    // Zincir tutarlılığı: fark sayısı damga sayısından bir eksik olmalı.
    // Bozuksa fazlasını atarız — yanlış bir duruma geri yüklemektense az
    // sayıda görüntü sunmak yeğdir.
    const deltas = v2.deltas.slice(0, Math.max(0, stamps.length - 1));
    return { v: 2, head, stamps: stamps.slice(0, deltas.length + 1), deltas };
  }

  const v1 = raw as HistoryFileV1;
  if (!Array.isArray(v1.snapshots)) return emptyHistory();
  const gecerli = v1.snapshots.filter(
    (s) => !!s && typeof s.id === "string" && typeof s.at === "string" && Array.isArray(s.people)
  );
  if (gecerli.length === 0) return emptyHistory();

  const head = gecerli[0].people ?? [];
  const stamps: HistoryStamp[] = [];
  const deltas: PeopleDelta[] = [];
  let onceki = head;
  for (let i = 0; i < gecerli.length; i++) {
    const s = gecerli[i];
    const people = s.people ?? [];
    stamps.push({ id: s.id, at: s.at, by: s.by, count: people.length });
    if (i > 0) deltas.push(diffDelta(onceki, people));
    onceki = people;
  }
  return { v: 2, head, stamps, deltas };
}

/**
 * Yeni bir görüntüyü BAŞA ekler ve `max` ile budar.
 *
 * Sıcak yol: zincir açılmıyor. Gelen durum yeni `head` olur, eski `head`e
 * dönüş farkı hesaplanıp başa konur.
 */
export function pushSnapshot(
  file: HistoryFileV2,
  stamp: Omit<HistoryStamp, "count">,
  people: Person[],
  max: number
): HistoryFileV2 {
  const yeni: HistoryFileV2 = {
    v: 2,
    head: people,
    stamps: [{ ...stamp, count: people.length }, ...file.stamps],
    deltas: file.stamps.length ? [diffDelta(people, file.head), ...file.deltas] : [],
  };
  return trimHistory(yeni, max);
}

/** En eskiden başlayarak `max` sayısına indirir. */
export function trimHistory(file: HistoryFileV2, max: number): HistoryFileV2 {
  const n = Math.max(1, max);
  if (file.stamps.length <= n) return file;
  return {
    v: 2,
    head: file.head,
    stamps: file.stamps.slice(0, n),
    deltas: file.deltas.slice(0, n - 1),
  };
}

/**
 * Bir görüntünün kişi listesini kurar (yoksa `null`).
 *
 * Zincir `head`ten başlayıp geriye doğru açılır; `index` kadar fark uygulanır.
 */
export function snapshotAt(file: HistoryFileV2, index: number): Person[] | null {
  if (index < 0 || index >= file.stamps.length) return null;
  let people: Person[] = file.head;
  for (let i = 0; i < index; i++) {
    const d = file.deltas[i];
    if (!d) return null;
    people = applyDelta(people, d);
  }
  return people;
}

export function snapshotById(file: HistoryFileV2, id: string): Person[] | null {
  return snapshotAt(file, file.stamps.findIndex((s) => s.id === id));
}

/**
 * En yeni `limit` görüntüyü kişi listeleriyle birlikte verir (katkı akışı
 * iki komşu görüntüyü karşılaştırmak zorunda).
 *
 * Zinciri BİR KEZ açar: her görüntü için baştan başlasaydık aynı farkları
 * defalarca uygulardık (n² iş).
 */
export function snapshotsWithPeople(
  file: HistoryFileV2,
  limit: number
): Array<HistoryStamp & { people: Person[] }> {
  const n = Math.min(Math.max(0, limit), file.stamps.length);
  const out: Array<HistoryStamp & { people: Person[] }> = [];
  let people: Person[] = file.head;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const d = file.deltas[i - 1];
      if (!d) break;
      people = applyDelta(people, d);
    }
    out.push({ ...file.stamps[i], people });
  }
  return out;
}
