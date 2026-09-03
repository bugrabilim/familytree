import type { Person } from "@/types/family";

/**
 * Ağaç tutarlılık denetimi (MyHeritage'ın "tree consistency checker"ına benzer)
 * — SAF, test edilebilir mantık (server-only değil). Ağaçtaki olası veri
 * hatalarını (imkânsız tarihler, çok genç ebeveyn, döngü…) işaretler. Yanlış
 * pozitifi azaltmak için yalnız NET durumlar bildirilir; eksik/kısmi tarihlerde
 * temkinli davranılır.
 */

export type IssueKind =
  | "deathBeforeBirth"
  | "bornInFuture"
  | "diedInFuture"
  | "implausibleAge"
  | "parentYoungerThanChild"
  | "tooYoungParent"
  | "bornAfterParentDeath"
  | "selfSpouse"
  | "selfParent"
  | "missingGender";

export interface Issue {
  personId: string;
  kind: IssueKind;
  severity: "error" | "warning";
}

/** "YYYY[-MM[-DD]]" → yıl (sayı) ya da null. */
function year(d?: string): number | null {
  if (!d) return null;
  const y = parseInt(d.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

/**
 * İki depolanmış tarihi karşılaştırır (-1/0/1). Kesin karşılaştırma yalnız her
 * ikisi de tam (YYYY-MM-DD) ise; aksi hâlde yıl bazında. Belirsizse null.
 */
function cmp(a?: string, b?: string): number | null {
  const ya = year(a);
  const yb = year(b);
  if (ya === null || yb === null) return null;
  if (ya !== yb) return ya < yb ? -1 : 1;
  // Aynı yıl: her ikisi de tam tarihse gün bazında karşılaştır.
  if (a && b && a.length === 10 && b.length === 10) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return 0;
}

const MAX_AGE = 120;
const MIN_PARENT_AGE = 13;

/** Ağaçtaki olası tutarsızlıkları döndürür. */
export function findIssues(people: Person[]): Issue[] {
  const issues: Issue[] = [];
  const idx = new Map(people.map((p) => [p.id, p]));
  const nowYear = new Date().getFullYear();

  for (const p of people) {
    // Cinsiyeti belirsiz kayıt. "other" (diğer/non-binary) BİLİNÇLİ bir seçimdir
    // ve uyarı üretmez; yalnız hiç seçilmemiş ("unknown") kayıtlar işaretlenir.
    if (!p.gender || p.gender === "unknown")
      issues.push({ personId: p.id, kind: "missingGender", severity: "warning" });

    // Kendine eş / kendine ebeveyn
    if (p.spouseIds?.includes(p.id) || p.formerSpouseIds?.includes(p.id))
      issues.push({ personId: p.id, kind: "selfSpouse", severity: "error" });
    if (p.parentIds?.includes(p.id))
      issues.push({ personId: p.id, kind: "selfParent", severity: "error" });

    // Ölüm doğumdan önce
    if (cmp(p.deathDate, p.birthDate) === -1)
      issues.push({ personId: p.id, kind: "deathBeforeBirth", severity: "error" });

    // Gelecekte doğum / ölüm
    const by = year(p.birthDate);
    const dy = year(p.deathDate);
    if (by !== null && by > nowYear)
      issues.push({ personId: p.id, kind: "bornInFuture", severity: "warning" });
    if (dy !== null && dy > nowYear)
      issues.push({ personId: p.id, kind: "diedInFuture", severity: "warning" });

    // İmkânsız yaşam süresi (>120)
    if (by !== null && dy !== null && dy - by > MAX_AGE)
      issues.push({ personId: p.id, kind: "implausibleAge", severity: "warning" });

    /*
     * Ebeveyn/çocuk tarih tutarlılığı — YALNIZ KAN BAĞINDA.
     *
     * Aşağıdaki üç kural biyolojiden geliyor: kimse kendinden büyük birini
     * doğuramaz, on beşinden küçükken doğuramaz, öldükten sonra doğuramaz.
     * Hiçbiri evlat edinen, üvey ya da koruyucu ebeveyn için geçerli değil —
     * üvey baba pekâlâ üvey çocuğundan küçük olabilir, evlat edinen anne
     * çocuğun doğumundan önce ölmüş olamaz ama evlat edinme bağı ölümden
     * sonra kurulmuş bir kayıt düzeltmesi olabilir. Kuralı oraya da
     * uygulamak, kullanıcıya DOĞRU veriyi hata diye göstermek olurdu; ve
     * susturulamayan yanlış uyarı, bütün listeyi görmezden gelmenin en hızlı
     * yolu.
     */
    for (const pid of p.parentIds ?? []) {
      const parent = idx.get(pid);
      if (!parent) continue;
      const tur = p.parentLinks?.[pid]?.kind;
      if (tur !== undefined && tur !== "biological") continue;

      const pby = year(parent.birthDate);
      if (by !== null && pby !== null) {
        if (pby > by)
          issues.push({ personId: p.id, kind: "parentYoungerThanChild", severity: "error" });
        else if (by - pby < MIN_PARENT_AGE)
          issues.push({ personId: p.id, kind: "tooYoungParent", severity: "warning" });
      }
      /*
       * Ebeveynin ölümünden sonra doğum.
       *
       * +1 yıllık tolerans BABAYA ait ve gerekçesi gebelik: baba çocuğun
       * doğumundan aylar önce ölmüş olabilir. Anneye aynı payı vermek o
       * gerekçeyi yok sayıp gerçek bir veri hatasını (çoğu zaman karışmış
       * iki kişi) sessizce geçirmek demekti — anne çocuğunun doğumundan
       * önce ölmüş olamaz.
       */
      const pdy = year(parent.deathDate);
      const pay = parent.gender === "female" ? 0 : 1;
      if (by !== null && pdy !== null && by > pdy + pay)
        issues.push({ personId: p.id, kind: "bornAfterParentDeath", severity: "warning" });
    }
  }

  return issues;
}
