import type { Person } from "@/types/family";
import { PERSON_FIELDS } from "./person-fields.ts";

/**
 * BLOB ↔ POSTGRES KAYMA DENETİMİ (Madde 43).
 *
 * ## Neden bu var
 *
 * Bugüne dek "iki kaynak aynı mı?" sorusunun tek yanıtı `dbCountPeople` ile
 * Blob'daki dizi uzunluğunu karşılaştırmaktı (`/api/admin/migrate` GET,
 * `inSync`). Sayı eşitliği EŞİTLİK DEĞİLDİR: bir kişi eklenip başka biri
 * silindiğinde sayı aynı kalır, içerik ayrışır. Aynı şekilde bir kişinin
 * `bio`su, ebeveyn bağı ya da ölüm tarihi Postgres'te eski kalabilir —
 * sayıya hiç yansımaz.
 *
 * Faz 4'te okuma yolu Postgres'e döndüğünde bu sessiz ayrışma DOĞRUDAN
 * kullanıcıya yanlış veri göstermek demek. Bu dosya, o dönüşten önce
 * "ayrışma yok" diyebilmek için var.
 *
 * ## İki ayrı kayma türü
 *
 * 1. **Kaynak kayması** — Blob'daki `Person` ile Postgres'teki `data`
 *    (JSONB) arasındaki fark. Yön önemlidir:
 *    · `eksik`  → Blob'da var, Postgres'te yok (DB geride).
 *    · `fazla`  → Postgres'te var, Blob'da yok. **Tehlikeli olan bu**:
 *      silinmiş bir kişi DB'de yaşıyor; okuma yolu döndüğünde geri gelir.
 *    · `farkli` → İkisinde de var, alanları ayrışmış.
 *
 * 2. **Sütun kayması** — Postgres satırının denormalize sütunları
 *    (`first_name`, `birth_date`, …) kendi `data`sıyla çelişiyor. `data`
 *    doğruyken bile sorgular o sütunlardan süzüp sıraladığı için okuma
 *    yanlış sonuç verir. Kaynak karşılaştırması bunu göremez — ayrı bakılır.
 *
 * Dosya bilerek bağımlılıksız (`@/` yalnız TÜR düzeyinde) — birim testi
 * koşulabilsin.
 */

/* ── Normalleştirme ───────────────────────────────────────────────────────── */

/**
 * "Değer yok"un bütün yazılışları tek bir şeye iner.
 *
 * Blob'daki nesne JSON'a yazılıp geri okunurken `undefined` alanlar DÜŞER;
 * Postgres'e giden aynı nesnede de düşer. Bu yüzden `undefined`, eksik
 * anahtar, `null`, `""`, `[]` ve `false` aynı anlama gelir: doldurulmamış.
 * Bunları ayrı saysaydık her kayıt "kaymış" görünürdü ve rapor kullanılamaz
 * hale gelirdi.
 *
 * DİKKAT: bu yalnız BOŞ yazılışlarını birleştirir. Dolu bir değerle boş bir
 * değer arasındaki fark (ör. `bio: "..."` ↔ `bio: ""`) gerçek kaymadır ve
 * olduğu gibi bildirilir.
 */
export function normalizeValue(v: unknown): unknown {
  if (v === undefined || v === null || v === "" || v === false) return undefined;
  if (Array.isArray(v)) {
    const arr = v.map(normalizeValue);
    return arr.length === 0 ? undefined : arr;
  }
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const nv = normalizeValue((v as Record<string, unknown>)[k]);
      if (nv !== undefined) out[k] = nv;
    }
    return Object.keys(out).length === 0 ? undefined : out;
  }
  return v;
}

/** Karşılaştırılabilir, anahtar sırasından bağımsız metin. */
export function stableJson(v: unknown): string {
  const n = normalizeValue(v);
  return n === undefined ? "" : JSON.stringify(n);
}

/* ── Gizlilik: rapor içerik SIZDIRMAZ ─────────────────────────────────────── */

/**
 * Gizlilik grubu taşıyan alanlar (sağlık, inanç, köken, hikâye…) ve
 * `confidential` kayıtlar için raporda DEĞER gösterilmez.
 *
 * Kayma raporunun işi "hangi alan ayrışmış" demektir; içeriği tekrar etmesi
 * gerekmez. Rapor bir yönetim ucundan dönüyor, günlüğe düşebiliyor ve
 * ekranda duruyor — gizli bir alanı oraya kopyalamak, gizliliği tam da
 * `lib/privacy.ts`in kapattığı yerden yeniden açmak olurdu.
 */
const PRIVATE_KEYS: ReadonlySet<string> = new Set(
  PERSON_FIELDS.filter((f) => f.privateGroup).map((f) => String(f.key))
);

export function isPrivateField(key: string): boolean {
  return PRIVATE_KEYS.has(key);
}

const PREVIEW_MAX = 48;

/**
 * Bir değerin rapordaki kısa gösterimi.
 *
 * · Gizli alan / gizli kayıt → yalnız "var mı ve ne uzunlukta" (`•••(12)`).
 *   Fark görülür, içerik görülmez.
 * · Uzun değer → kırpılır; rapor kilobaytlarca `bio` taşımasın.
 */
export function preview(value: unknown, opts: { redact?: boolean } = {}): string {
  const s = stableJson(value);
  if (s === "") return "—";
  if (opts.redact) return `•••(${s.length})`;
  return s.length > PREVIEW_MAX ? `${s.slice(0, PREVIEW_MAX)}…` : s;
}

/* ── Kişi karşılaştırması ─────────────────────────────────────────────────── */

export interface FieldDiff {
  field: string;
  /** Blob'daki değerin kısa gösterimi (gizliyse maskeli). */
  blob: string;
  /** Postgres'teki değerin kısa gösterimi (gizliyse maskeli). */
  db: string;
}

/**
 * İki kaydın ayrışan alanları.
 *
 * İki taraftaki anahtarların BİRLEŞİMİ gezilir: yalnız Blob'daki anahtarlara
 * bakmak, Postgres'te fazladan duran bir alanı (ör. artık kaldırılmış bir
 * alanın eski satırda kalması) görünmez kılardı.
 */
export function personDiff(blob: Person | undefined, db: Person | undefined): FieldDiff[] {
  const a = (blob ?? {}) as unknown as Record<string, unknown>;
  const b = (db ?? {}) as unknown as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  // Taraflardan BİRİ gizliyse maskele — gizlilik iki kaydın birleşimidir.
  const gizli = !!(a.confidential || b.confidential);
  const out: FieldDiff[] = [];
  for (const k of keys) {
    const av = stableJson(a[k]);
    const bv = stableJson(b[k]);
    if (av === bv) continue;
    const redact = gizli || isPrivateField(k);
    out.push({ field: k, blob: preview(a[k], { redact }), db: preview(b[k], { redact }) });
  }
  return out;
}

export type DriftKind = "eksik" | "fazla" | "farkli";

export interface PersonDrift {
  id: string;
  kind: DriftKind;
  /** Yalnız gizli olmayan kayıtlar için ad — raporu okunur kılmak içindir. */
  label?: string;
  /** `farkli` için ayrışan alanlar. */
  fields?: FieldDiff[];
}

export interface PeopleDrift {
  /** Blob'da var, Postgres'te yok. */
  missing: number;
  /** Postgres'te var, Blob'da yok — silme yayılmamış. */
  extra: number;
  /** İkisinde de var, içerik ayrışmış. */
  changed: number;
  /** Birebir aynı olan kayıt sayısı. */
  same: number;
  /** Ayrıntı listesi (kırpılmış olabilir). */
  items: PersonDrift[];
  /** Listeye sığmayıp atlanan kayma sayısı. */
  truncated: number;
}

function label(p: Person): string | undefined {
  if (p.confidential) return undefined;
  const ad = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
  return ad || undefined;
}

const MAX_ITEMS = 100;

/**
 * İki kişi listesini karşılaştırır. **Blob kaynak doğruluğudur.**
 *
 * Aynı id'nin iki kez geçmesi (Postgres'te `(tree_id, person_id)` tekil ama
 * Blob dizisi bunu garanti etmez) sessizce yutulmaz: son kayıt kazanır ve
 * `duplicateIds` ile bildirilir — çünkü çift id, göçün kendisini bozar.
 */
export function diffPeople(
  blob: Person[],
  db: Person[],
  opts: { max?: number } = {}
): PeopleDrift & { duplicateIds: string[] } {
  const max = opts.max ?? MAX_ITEMS;
  const dup: string[] = [];
  const index = (list: Person[]) => {
    const m = new Map<string, Person>();
    for (const p of list) {
      if (!p || typeof p.id !== "string" || !p.id) continue;
      if (m.has(p.id)) dup.push(p.id);
      m.set(p.id, p);
    }
    return m;
  };
  const A = index(blob);
  const B = index(db);

  const items: PersonDrift[] = [];
  let missing = 0, extra = 0, changed = 0, same = 0, truncated = 0;
  const ekle = (d: PersonDrift) => {
    if (items.length < max) items.push(d);
    else truncated++;
  };

  for (const [id, p] of A) {
    const q = B.get(id);
    if (!q) {
      missing++;
      ekle({ id, kind: "eksik", label: label(p) });
      continue;
    }
    const fields = personDiff(p, q);
    if (fields.length === 0) same++;
    else {
      changed++;
      ekle({ id, kind: "farkli", label: label(p), fields });
    }
  }
  for (const [id, q] of B) {
    if (A.has(id)) continue;
    extra++;
    ekle({ id, kind: "fazla", label: label(q) });
  }

  return { missing, extra, changed, same, items, truncated, duplicateIds: [...new Set(dup)] };
}

/* ── Sütun kayması: satır kendi `data`sıyla çelişiyor mu? ─────────────────── */

/** `lib/db.ts`teki `personToRow` ile AYNI eşleme — tersten okunuşu. */
export const DENORM_COLUMNS: ReadonlyArray<{ column: string; field: keyof Person; fallback?: string }> = [
  { column: "first_name", field: "firstName", fallback: "" },
  { column: "last_name", field: "lastName", fallback: "" },
  { column: "gender", field: "gender", fallback: "unknown" },
  { column: "birth_date", field: "birthDate" },
  { column: "death_date", field: "deathDate" },
  { column: "sibling_order", field: "siblingOrder" },
];

export interface ColumnDrift {
  id: string;
  column: string;
  /** Sütunda duran değer. */
  row: string;
  /** `data` (JSONB) içindeki değer. */
  data: string;
}

/**
 * Postgres satırının denormalize sütunlarını kendi `data`sıyla karşılaştırır.
 *
 * Bu, Blob'a hiç bakmadan yapılan bir denetimdir ve ayrı bir hata sınıfını
 * yakalar: `data` doğruyken sütun yanlış olabilir (ör. `data` elle
 * güncellenmiş, ya da eşleme değişmiş ama satırlar yeniden yazılmamış).
 * Faz 4 sorguları bu sütunlardan süzüp sıralayacağı için sütun yalanı,
 * `data` doğru olsa bile yanlış okuma demektir.
 */
export function columnDrift(
  rows: Array<{ person_id?: string; data?: Person } & Record<string, unknown>>
): ColumnDrift[] {
  const out: ColumnDrift[] = [];
  for (const r of rows) {
    const p = r.data;
    if (!p) continue;
    const id = r.person_id ?? p.id ?? "?";
    for (const { column, field, fallback } of DENORM_COLUMNS) {
      const beklenen = stableJson((p as unknown as Record<string, unknown>)[field] ?? fallback);
      const duran = stableJson(r[column]);
      if (beklenen !== duran) {
        const redact = isPrivateField(String(field)) || !!p.confidential;
        out.push({
          id,
          column,
          row: preview(r[column], { redact }),
          data: preview((p as unknown as Record<string, unknown>)[field] ?? fallback, { redact }),
        });
      }
    }
  }
  return out;
}

/* ── Ağaç düzeyi rapor ────────────────────────────────────────────────────── */

export interface TreeDriftInput {
  treeId: string;
  name: string;
  /** Ağaç Postgres'te hiç yok mu? (göç edilmemiş) */
  inDb: boolean;
  blobPeople: Person[];
  dbPeople: Person[];
  /** Postgres'teki ham satırlar — sütun denetimi için (isteğe bağlı). */
  rows?: Array<{ person_id?: string; data?: Person } & Record<string, unknown>>;
  /** Ağaç satırının adı — Blob'daki adla karşılaştırılır. */
  dbName?: string;
  meta?: FieldDiff[];
}

export interface TreeDrift {
  treeId: string;
  name: string;
  inDb: boolean;
  blobPeople: number;
  dbPeople: number;
  /**
   * Eski `inSync` ölçüsü — YALNIZ karşılaştırma için tutuluyor. `true` olması
   * ayrışma olmadığı anlamına GELMEZ; testi bu tuzağı kilitliyor.
   */
  countsEqual: boolean;
  people: PeopleDrift;
  duplicateIds: string[];
  columns: ColumnDrift[];
  meta: FieldDiff[];
  /** Tek ölçü: hiçbir kayma yok mu? */
  clean: boolean;
}

export function treeDrift(input: TreeDriftInput, opts: { max?: number } = {}): TreeDrift {
  const { duplicateIds, ...people } = diffPeople(input.blobPeople, input.dbPeople, opts);
  const meta = [...(input.meta ?? [])];
  if (input.dbName !== undefined && stableJson(input.dbName) !== stableJson(input.name)) {
    meta.push({ field: "name", blob: preview(input.name), db: preview(input.dbName) });
  }
  const columns = input.rows ? columnDrift(input.rows) : [];
  return {
    treeId: input.treeId,
    name: input.name,
    inDb: input.inDb,
    blobPeople: input.blobPeople.length,
    dbPeople: input.dbPeople.length,
    countsEqual: input.blobPeople.length === input.dbPeople.length,
    people,
    duplicateIds,
    columns,
    meta,
    /*
     * Göç edilmemiş bir ağaç TEMİZ DEĞİLDİR. Faz 4'te okuma Postgres'e
     * dönerse orada olmayan ağaç boş görünür; "henüz göç etmedi" bir mazeret
     * değil, raporun tam da göstermesi gereken durum.
     */
    clean:
      input.inDb &&
      people.missing === 0 &&
      people.extra === 0 &&
      people.changed === 0 &&
      duplicateIds.length === 0 &&
      columns.length === 0 &&
      meta.length === 0,
  };
}

export interface DriftReport {
  checkedAt: string;
  trees: TreeDrift[];
  clean: boolean;
  /** Onarım için: hangi id'ler yazılmalı / silinmeli. */
  totals: { missing: number; extra: number; changed: number; same: number; columns: number };
}

export function driftReport(trees: TreeDrift[], checkedAt: string): DriftReport {
  const totals = { missing: 0, extra: 0, changed: 0, same: 0, columns: 0 };
  for (const t of trees) {
    totals.missing += t.people.missing;
    totals.extra += t.people.extra;
    totals.changed += t.people.changed;
    totals.same += t.people.same;
    totals.columns += t.columns.length;
  }
  return { checkedAt, trees, clean: trees.every((t) => t.clean), totals };
}

/**
 * Onarım planı — Blob'u kaynak alarak Postgres'i hizaya getirir.
 *
 * `upsert`: Blob'da olup DB'de olmayan ya da ayrışan kayıtlar.
 * `delete`: DB'de olup Blob'da olmayan kayıtlar.
 *
 * Sütun kayması ayrı bir iş gerektirmiyor: satır yeniden yazıldığında
 * denormalize sütunlar `personToRow` ile birlikte tazelenir. Bu yüzden
 * sütunu kaymış kayıtlar da `upsert` listesine girer.
 *
 * `partial`: plan, KIRPILMIŞ bir listeden çıkarıldı. Rapor okunabilir kalsın
 * diye ayrıntı listesi sınırlanıyor; onarım o sınırdan hesaplanırsa sessizce
 * eksik iş yapar. Çağıran ya sınırsız bir raporla çalışmalı ya da bu bayrağı
 * görüp "tek seferde bitmedi" demeli.
 */
export function repairPlan(t: TreeDrift): { upsert: string[]; delete: string[]; partial: boolean } {
  const up = new Set<string>();
  const del = new Set<string>();
  for (const it of t.people.items) {
    if (it.kind === "fazla") del.add(it.id);
    else up.add(it.id);
  }
  for (const c of t.columns) up.add(c.id);
  return { upsert: [...up], delete: [...del], partial: t.people.truncated > 0 };
}
