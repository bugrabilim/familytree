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
    severity: "error" | "warning" = "error"
  ) => {
    issues.push({ kind, personId, field, targetId, severity, repairable: !UNREPAIRABLE.has(kind) });
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
    for (const id of p.spouseIds ?? []) {
      const other = byId.get(id);
      if (other && id !== p.id && !(other.spouseIds ?? []).includes(p.id)) {
        add("asymmetricSpouse", p.id, "spouseIds", id, "warning");
      }
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

function dedupe(list: string[], drop: (id: string) => boolean): string[] {
  const out: string[] = [];
  for (const id of list) {
    if (drop(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/**
 * Sarkan ve yinelenen referansları temizler, tek yönlü eş bağlarını
 * simetrikleştirir.
 *
 * Simetrikleştirme **eksik geri referansı ekler**, tek yönlü bağı silmez:
 * silmek bilgi kaybettirir, eklemek uygulamanın zaten yaptığı şeydir.
 *
 * `only` verilirse yalnız o türler onarılır (kademeli temizlik için).
 */
export function repairRefs(people: Person[], only?: RefIssueKind[]): RepairResult {
  const issues = findRefIssues(people);
  const allow = only ? new Set(only) : null;
  const wanted = issues.filter((i) => i.repairable && (!allow || allow.has(i.kind)));
  const skipped = issues.filter((i) => !i.repairable || (allow && !allow.has(i.kind)));

  if (wanted.length === 0) {
    return { people: people.map((p) => ({ ...p })), applied: [], skipped };
  }

  const valid = new Set<string>();
  const firstOf = new Map<string, Person>();
  for (const p of people) if (!firstOf.has(p.id)) { firstOf.set(p.id, p); valid.add(p.id); }

  const kinds = new Set(wanted.map((i) => i.kind));
  const bad = (self: string) => (id: string) => id === self || !valid.has(id);

  // 1) Sarkan/yinelenen/kendine referansları temizle.
  const cleaned: Person[] = people.map((p) => {
    const next: Person = { ...p };
    next.parentIds = dedupe(p.parentIds ?? [], bad(p.id));
    next.spouseIds = dedupe(p.spouseIds ?? [], bad(p.id));
    if (p.formerSpouseIds) next.formerSpouseIds = dedupe(p.formerSpouseIds, bad(p.id));

    if (p.parentLinks) {
      const links: NonNullable<Person["parentLinks"]> = {};
      for (const [k, v] of Object.entries(p.parentLinks)) {
        if (next.parentIds.includes(k)) links[k] = v;
      }
      next.parentLinks = links;
    }
    if (p.associations) {
      next.associations = p.associations.filter(
        (a) => a.personId !== p.id && valid.has(a.personId)
      );
    }
    return next;
  });

  // 2) Eş bağlarını simetrikleştir — temizlikten SONRA, yoksa sarkan bir
  //    kimlik için geri referans eklemeye çalışırdık.
  if (kinds.has("asymmetricSpouse")) {
    const idx = new Map(cleaned.map((p) => [p.id, p]));
    for (const p of cleaned) {
      for (const id of p.spouseIds) {
        const other = idx.get(id);
        if (other && !other.spouseIds.includes(p.id)) other.spouseIds = [...other.spouseIds, p.id];
      }
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
