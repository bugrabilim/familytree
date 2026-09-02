import type { Person } from "@/types/family";

/**
 * Referans bütünlüğü süpürücüsü — SAF, bağımlılıksız.
 *
 * `lib/consistency.ts` TARİH ve MANTIK hatalarına bakar (ölüm doğumdan önce,
 * çok genç ebeveyn…). Bu dosya bambaşka bir şeye bakar: **kimlik referansları
 * hâlâ var olan birine işaret ediyor mu?**
 *
 * Kişi silme, ağaç birleştirme ve dal aşılama sonrasında geride sarkan kimlik
 * kalabiliyor: silinmiş bir kişi hâlâ birinin `spouseIds`'inde, ya da
 * `parentLinks` içinde artık `parentIds`'te olmayan bir anahtar duruyor. Bunlar
 * sessizdir — arayüz o kişiyi bulamayınca çizmez, kimse fark etmez, ama sayımlar
 * ve dışa aktarım bozulur.
 *
 * ## Onarım tasarımı
 *
 * `repairRefs` **saf**: girdiyi değiştirmez, yeni dizi döndürür. Bu şart, çünkü
 * çağıran taraf `oku → değiştir → yaz` akışında iyimser kilitle (`x-base-version`)
 * çalışıyor; yerinde değiştirme önbellekteki anlık görüntüyü de bozardı.
 *
 * İki sorun **bilerek** onarılmıyor:
 * - `duplicateId` — hangi kaydın kazanacağı veriye bakmadan bilinemez.
 * - `spouseAlsoFormer` — kişi hem eş hem eski eş; hangisinin doğru olduğu
 *   niyete bağlı. Yanlış tahmin evlilik tarihçesini sessizce siler.
 *
 * Bunlar bildirilir, dokunulmaz.
 */

export type RefIssueKind =
  /** Aynı kimlik birden çok kayıtta — Map aramalarını sessizce bozar. */
  | "duplicateId"
  | "danglingParent"
  | "danglingSpouse"
  | "danglingFormerSpouse"
  | "danglingAssociation"
  /** `parentLinks` içinde `parentIds`'te olmayan anahtar (ebeveyn kaldırılmış). */
  | "orphanParentLink"
  | "duplicateParent"
  | "duplicateSpouse"
  /** A'nın eşi B, ama B'nin eşi A değil. Uygulama bağları simetrik tutar. */
  | "asymmetricSpouse"
  /** Kişi hem `spouseIds` hem `formerSpouseIds` içinde. */
  | "spouseAlsoFormer"
  /** Kişi kendi ebeveyni / eşi / yakını olarak kayıtlı. */
  | "selfReference";

export type RefField =
  | "id"
  | "parentIds"
  | "spouseIds"
  | "formerSpouseIds"
  | "associations"
  | "parentLinks";

export interface RefIssue {
  kind: RefIssueKind;
  /** Sorunun bulunduğu kişi. */
  personId: string;
  /** İşaret edilen kimlik: sarkan id ya da karşı taraf. */
  targetId?: string;
  field: RefField;
  severity: "error" | "warning";
  /** `repairRefs` bunu düzeltebilir mi? */
  repairable: boolean;
}

const UNREPAIRABLE: ReadonlySet<RefIssueKind> = new Set([
  "duplicateId",
  "spouseAlsoFormer",
]);

/* ------------------------------------------------------------------ Denetim */

/** Ağaçtaki sarkan/çelişkili kimlik referanslarını bulur. */
export function findRefIssues(people: Person[]): RefIssue[] {
  const issues: RefIssue[] = [];
  const seen = new Set<string>();
  const byId = new Map<string, Person>();

  for (const p of people) {
    if (seen.has(p.id)) {
      issues.push({
        kind: "duplicateId", personId: p.id, field: "id",
        severity: "error", repairable: false,
      });
    } else {
      seen.add(p.id);
      byId.set(p.id, p);
    }
  }

  const add = (
    kind: RefIssueKind,
    personId: string,
    field: RefField,
    targetId?: string,
    severity: "error" | "warning" = "error",
    /** Tür genelde onarılabilir olsa da bu KAYIT için değilse. */
    repairable = !UNREPAIRABLE.has(kind)
  ) => {
    issues.push({ kind, personId, field, targetId, severity, repairable });
  };

  for (const p of people) {
    const lists: Array<[RefField, string[] | undefined, RefIssueKind, RefIssueKind]> = [
      ["parentIds", p.parentIds, "danglingParent", "duplicateParent"],
      ["spouseIds", p.spouseIds, "danglingSpouse", "duplicateSpouse"],
      ["formerSpouseIds", p.formerSpouseIds, "danglingFormerSpouse", "duplicateSpouse"],
    ];

    for (const [field, list, dangling, duplicate] of lists) {
      const counts = new Map<string, number>();
      for (const id of list ?? []) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
        if (id === p.id) add("selfReference", p.id, field, id);
        else if (!byId.has(id)) add(dangling, p.id, field, id);
      }
      for (const [id, n] of counts) {
        if (n > 1) add(duplicate, p.id, field, id, "warning");
      }
    }

    // Eş ↔ eski eş çelişkisi
    for (const id of p.spouseIds ?? []) {
      if ((p.formerSpouseIds ?? []).includes(id)) {
        add("spouseAlsoFormer", p.id, "spouseIds", id);
      }
    }

    // Eş bağı simetrisi — uygulama bunu zaten simetrik tutuyor
    // (`app/api/family/person/route.ts`), tek yönlü kalması bir hatadır.
    //
    // TEK İSTİSNA: karşı taraf bu kişiyi ESKİ eş olarak kaydetmişse ortada
    // eksik bir geri referans değil, gerçek bir ANLAŞMAZLIK vardır — biri
    // "hâlâ evliyiz", diğeri "boşandık" diyor. Geri referansı eklemek
    // `spouseAlsoFormer` doğurur ve o da onarılamaz; yani onarım, onaramayacağı
    // bir sorun üretmiş olur. Bu kayıt onarılamaz işaretlenir, bildirilir.
    for (const id of p.spouseIds ?? []) {
      const other = byId.get(id);
      if (!other || id === p.id) continue;
      if ((other.spouseIds ?? []).includes(p.id)) continue;
      const contradicted = (other.formerSpouseIds ?? []).includes(p.id);
      add("asymmetricSpouse", p.id, "spouseIds", id, "warning", !contradicted);
    }

    // parentLinks anahtarı parentIds'te olmalı
    for (const key of Object.keys(p.parentLinks ?? {})) {
      if (!(p.parentIds ?? []).includes(key)) {
        add("orphanParentLink", p.id, "parentLinks", key, "warning");
      }
    }

    // Çevre bağları
    for (const a of p.associations ?? []) {
      if (a.personId === p.id) add("selfReference", p.id, "associations", a.personId);
      else if (!byId.has(a.personId)) add("danglingAssociation", p.id, "associations", a.personId);
    }
  }

  return issues;
}

/* ------------------------------------------------------------------ Onarım */

export interface RepairResult {
  /** Onarılmış YENİ dizi — girdi değiştirilmez. */
  people: Person[];
  /** Uygulanan onarımlar. */
  applied: RefIssue[];
  /** Bilerek dokunulmayanlar (`duplicateId`, `spouseAlsoFormer`). */
  skipped: RefIssue[];
}

/**
 * Sarkan ve yinelenen referansları temizler, tek yönlü eş bağlarını
 * simetrikleştirir.
 *
 * **Onarım SORUN GÜDÜMLÜDÜR:** yalnız `wanted` listesindeki kayıtlara karşılık
 * gelen değişiklikler uygulanır. Önceki sürüm temizliği körlemesine yapıyordu,
 * bu yüzden `only` verildiğinde bile istenmeyen alanlarda silme oluyor ve o
 * silme `skipped` diye raporlanıyordu — yani rapor yalan söylüyordu.
 *
 * Simetrikleştirme **eksik geri referansı ekler**, tek yönlü bağı silmez:
 * silmek bilgi kaybettirir, eklemek uygulamanın zaten yaptığı şeydir. Karşı
 * taraf kişiyi "eski eş" saydığında ise bağ eklenmez (bkz. `findRefIssues`).
 *
 * `only` verilirse yalnız o türler onarılır (kademeli temizlik için).
 */
export function repairRefs(people: Person[], only?: RefIssueKind[]): RepairResult {
  const issues = findRefIssues(people);
  const allow = only ? new Set(only) : null;
  const wanted = issues.filter((i) => i.repairable && (!allow || allow.has(i.kind)));
  const wantedSet = new Set(wanted);
  const skipped = issues.filter((i) => !wantedSet.has(i));

  if (wanted.length === 0) {
    return { people: people.map((p) => ({ ...p })), applied: [], skipped };
  }

  /** `${personId}|${field}` → kaldırılacak kimlikler */
  const drops = new Map<string, Set<string>>();
  /** `${personId}|${field}` → tekilleştirilecek */
  const dedupes = new Set<string>();
  /** simetrikleştirilecek çiftler */
  const symmetrize: Array<[string, string]> = [];

  const key = (personId: string, field: RefField) => `${personId}|${field}`;
  const markDrop = (i: RefIssue) => {
    if (!i.targetId) return;
    const k = key(i.personId, i.field);
    const set = drops.get(k) ?? new Set<string>();
    set.add(i.targetId);
    drops.set(k, set);
  };

  for (const i of wanted) {
    switch (i.kind) {
      case "danglingParent":
      case "danglingSpouse":
      case "danglingFormerSpouse":
      case "danglingAssociation":
      case "orphanParentLink":
      case "selfReference":
        markDrop(i);
        break;
      case "duplicateParent":
      case "duplicateSpouse":
        dedupes.add(key(i.personId, i.field));
        break;
      case "asymmetricSpouse":
        if (i.targetId) symmetrize.push([i.personId, i.targetId]);
        break;
      default:
        break;
    }
  }

  function applyList(list: string[], drop: Set<string>, dedupe: boolean): string[] {
    const out: string[] = [];
    for (const id of list) {
      if (drop.has(id)) continue;
      if (dedupe && out.includes(id)) continue;
      out.push(id);
    }
    return out;
  }

  const EMPTY: Set<string> = new Set();

  // 1) İstenen kaldırma ve tekilleştirmeler.
  const cleaned: Person[] = people.map((p) => {
    const next: Person = { ...p };
    const dropFor = (f: RefField) => drops.get(key(p.id, f)) ?? EMPTY;
    const dedupeFor = (f: RefField) => dedupes.has(key(p.id, f));

    next.parentIds = applyList(p.parentIds ?? [], dropFor("parentIds"), dedupeFor("parentIds"));
    next.spouseIds = applyList(p.spouseIds ?? [], dropFor("spouseIds"), dedupeFor("spouseIds"));
    if (p.formerSpouseIds) {
      next.formerSpouseIds = applyList(
        p.formerSpouseIds,
        dropFor("formerSpouseIds"),
        dedupeFor("formerSpouseIds")
      );
    }

    if (p.parentLinks) {
      const dropLinks = dropFor("parentLinks");
      const links: NonNullable<Person["parentLinks"]> = {};
      for (const [k, v] of Object.entries(p.parentLinks)) {
        if (dropLinks.has(k)) continue;
        // Kaskad: `parentIds`'ten çıkardığımız bir ebeveynin bağı da gider.
        // Bırakmak, onarımın kendi ürettiği yeni bir `orphanParentLink`
        // olurdu — onarım yeni sorun doğurmamalı.
        if (!next.parentIds.includes(k)) continue;
        links[k] = v;
      }
      next.parentLinks = links;
    }

    if (p.associations) {
      const dropAssoc = dropFor("associations");
      next.associations = p.associations.filter((a) => !dropAssoc.has(a.personId));
    }
    return next;
  });

  // 2) Eş bağlarını simetrikleştir — temizlikten SONRA, yoksa sarkan bir
  //    kimlik için geri referans eklemeye çalışırdık.
  if (symmetrize.length) {
    const idx = new Map(cleaned.map((p) => [p.id, p]));
    for (const [personId, otherId] of symmetrize) {
      const self = idx.get(personId);
      const other = idx.get(otherId);
      if (!self || !other) continue;
      if (!self.spouseIds.includes(otherId)) continue; // temizlikte gitmişse boş ver
      if (!other.spouseIds.includes(personId)) other.spouseIds = [...other.spouseIds, personId];
    }
  }

  // Gerçekten neyin düzeldiğini kalan sorunlara bakarak bildir.
  const remaining = new Set(
    findRefIssues(cleaned).map((i) => `${i.kind}|${i.personId}|${i.targetId ?? ""}`)
  );
  const applied = wanted.filter(
    (i) => !remaining.has(`${i.kind}|${i.personId}|${i.targetId ?? ""}`)
  );

  return { people: cleaned, applied, skipped };
}
