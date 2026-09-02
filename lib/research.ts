import type { Person } from "@/types/family";
import type { Issue } from "@/lib/consistency";

/**
 * Araştırma görev üreticisi — "bu ağaçta sırada ne var?".
 *
 * Ağaçtaki eksikler ve tutarsızlıklar zaten çeşitli yerlerde görünüyordu ama
 * hiçbiri "önce neyi araştırayım" sorusuna cevap vermiyordu. Burası onları tek
 * listede toplayıp SIRALAR.
 *
 * Saf ve bağımlılıksız: `findIssues` dışarıdan GEÇİRİLİR. `@/lib/consistency`i
 * çalışma zamanında içe aktarmak bu dosyayı birim testi koşulamaz hâle
 * getirirdi (bkz. `CLAUDE.md`); tür-düzeyi içe aktarım derlemede silinir.
 */

export type TaskKind =
  | "tutarsizlik"
  | "eksikEbeveyn"
  | "eksikTarih"
  | "eksikYer"
  | "kaynaksiz";

export interface ResearchTask {
  /** Kararlı kimlik — "tamamlandı/yoksay" işareti kaydı hayatta kalsın diye. */
  id: string;
  kind: TaskKind;
  personId: string;
  /** Sıralama ağırlığı; büyük olan önce. */
  weight: number;
  /** Bu görev çözülünce kaç kişi kazanır (soyundan gelenler). */
  reach: number;
  /** `reach` sayımı sınıra takıldıysa: gerçek sayı en az bu kadar. */
  reachCapped?: boolean;
  /** `tutarsizlik` için sorunun türü; diğerlerinde boş. */
  detail?: string;
  severity?: "error" | "warning";
}

/**
 * Ağırlık BANTLARI. Sıra tesadüfi değil:
 *
 * Hata ÖNCE gelir — yanlış bir tarih yalnız kendini bozmaz, araştırmanın
 * kendisini yanlış kişiye yönlendirir. Eksik ata ikinci sıradadır çünkü
 * çözülünce bütün bir dal açılır. Kaynak en sonda: kaydı yanlış yapmaz,
 * yalnız dayanağını göstermez — ama ağacın uzun ömrü için gereken şey de
 * budur, o yüzden listeden düşmez.
 *
 * Bantlar 100 aralıklı ve bonuslar `MAX_BONUS` ile sınırlı: bonus bandı
 * DELEMEZ. İlk yazışımda `reach * 10` sınırsızdı ve demo ağacında kurucunun
 * 218 kişilik soyu ona +2180 veriyordu — yani "hata önce gelir" kuralı
 * yazıda kalıyor, listede tutmuyordu. Bonus artık yalnız BANT İÇİNDE sıralar.
 */
const BASE: Record<TaskKind, number> = {
  tutarsizlik: 5000,
  eksikEbeveyn: 400,
  eksikTarih: 300,
  eksikYer: 200,
  kaynaksiz: 100,
};

/** Bir bonus bandın genişliğini (100) aşamaz. */
const MAX_BONUS = 90;

/**
 * Soy sayımında yürünecek en fazla düğüm.
 *
 * Sayım kişi başına ayrı yürüdüğü için en kötü hâl kare. Gerçek ağaçlar geniş
 * ve sığdır, ama 3000 kişilik bir ZİNCİR (yapay ama mümkün) 527 ms sürüyordu.
 * Sayının kullanıldığı yer zaten `MAX_BONUS` ile doyuyor, o yüzden erken
 * kesmek sıralamayı değiştirmez; yalnız gösterilen sayı bu değerde durur ve
 * `reachCapped` ile bunu söyler.
 */
const REACH_LIMIT = 500;

/** Kişi → çocukları. */
function childrenIndex(people: Person[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  const known = new Set(people.map((p) => p.id));
  for (const p of people) {
    for (const pid of p.parentIds) {
      if (!known.has(pid)) continue;
      const list = m.get(pid);
      if (list) list.push(p.id);
      else m.set(pid, [p.id]);
    }
  }
  return m;
}

/**
 * Kişinin soyundan gelen sayısı (kendisi hariç).
 *
 * Genişlik-önce ve ZİYARET EDİLENLER kümesiyle: kuzen evliliğinde aynı torun
 * iki yoldan sayılabilirdi ve derin ağaçlarda özyineleme üstel davranırdı.
 */
function descendantCounts(people: Person[], kids: Map<string, string[]>): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of people) {
    const seen = new Set<string>();
    const queue = [...(kids.get(p.id) ?? [])];
    for (let head = 0; head < queue.length && seen.size < REACH_LIMIT; head++) {
      const id = queue[head];
      if (seen.has(id) || id === p.id) continue;
      seen.add(id);
      for (const c of kids.get(id) ?? []) if (!seen.has(c)) queue.push(c);
    }
    out.set(p.id, seen.size);
  }
  return out;
}

/** Kişide "iddia" var mı — kaynak istemenin anlamlı olduğu durum. */
function hasClaims(p: Person): boolean {
  return !!(p.birthDate || p.deathDate || p.birthPlace || p.burialPlace);
}

export interface ResearchOptions {
  /** `lib/consistency.ts` → `findIssues(people)` sonucu. Verilmezse atlanır. */
  issues?: Issue[];
  /** Kaç görev döndürülsün. Verilmezse tümü. */
  limit?: number;
  /** Bu kimlikler listeden çıkarılır (kullanıcı "tamamlandı/yoksay" demiş). */
  done?: ReadonlySet<string>;
}

/**
 * Araştırılacakları önem sırasına göre döndürür.
 *
 * Aynı ağırlıkta olanlar kimliğe göre sıralanır: sıra kararlı olsun, liste her
 * açılışta karışmasın.
 */
export function researchTasks(people: Person[], opts: ResearchOptions = {}): ResearchTask[] {
  const kids = childrenIndex(people);
  const reachOf = descendantCounts(people, kids);
  const known = new Set(people.map((p) => p.id));
  const tasks: ResearchTask[] = [];

  const push = (t: Omit<ResearchTask, "weight" | "reach"> & { bonus?: number }) => {
    const reach = reachOf.get(t.personId) ?? 0;
    tasks.push({
      id: t.id,
      kind: t.kind,
      personId: t.personId,
      detail: t.detail,
      severity: t.severity,
      reach,
      ...(reach >= REACH_LIMIT ? { reachCapped: true } : {}),
      weight: BASE[t.kind] + Math.min(t.bonus ?? 0, MAX_BONUS),
    });
  };

  // (1) Tutarsızlıklar — hata uyarıdan önce.
  for (const issue of opts.issues ?? []) {
    if (!known.has(issue.personId)) continue;
    push({
      id: `tutarsizlik:${issue.personId}:${issue.kind}`,
      kind: "tutarsizlik",
      personId: issue.personId,
      detail: issue.kind,
      severity: issue.severity,
      bonus: issue.severity === "error" ? 500 : 0,
    });
  }

  for (const p of people) {
    const reach = reachOf.get(p.id) ?? 0;
    const childCount = (kids.get(p.id) ?? []).length;

    /*
     * (2) Eksik ata. YALNIZ çocuğu olanlar için üretilir: çocuğu olmayan ve
     * ebeveyni bilinmeyen bir kayıt araştırılacak bir uç değil, ağacın doğal
     * sınırıdır — aileye gelin/damat gelen herkes öyledir ve liste onlarla
     * dolarsa kullanılamaz hâle gelir.
     */
    const bilinen = p.parentIds.filter((id) => known.has(id)).length;
    if (childCount > 0 && bilinen < 2) {
      push({
        id: `eksikEbeveyn:${p.id}`,
        kind: "eksikEbeveyn",
        personId: p.id,
        detail: bilinen === 0 ? "ikisi" : "biri",
        // Kaç kişi bu dalın açılmasını bekliyor + tek ebeveyn yerine ikisi de
        // eksikse daha büyük boşluk. `MAX_BONUS`ta doyar.
        bonus: reach + (bilinen === 0 ? 20 : 0),
      });
    }

    // (3) Doğum tarihi yok. Çocuğu olan biri zaman ekseninde çapa; onunki
    // daha çok işe yarar.
    if (!p.birthDate) {
      push({ id: `eksikTarih:${p.id}`, kind: "eksikTarih", personId: p.id, bonus: childCount * 5 });
    }

    // (4) Doğum yeri yok.
    if (!p.birthPlace?.trim()) {
      push({ id: `eksikYer:${p.id}`, kind: "eksikYer", personId: p.id });
    }

    // (5) İddia var ama kaynak yok.
    if (hasClaims(p) && (p.sources?.length ?? 0) === 0) {
      push({ id: `kaynaksiz:${p.id}`, kind: "kaynaksiz", personId: p.id });
    }
  }

  const done = opts.done;
  const list = (done ? tasks.filter((t) => !done.has(t.id)) : tasks).sort(
    (a, b) => b.weight - a.weight || a.id.localeCompare(b.id)
  );
  return opts.limit === undefined ? list : list.slice(0, opts.limit);
}

/** Türe göre sayım — özet başlığı için. */
export function countByKind(tasks: ResearchTask[]): Array<{ kind: TaskKind; count: number }> {
  const m = new Map<TaskKind, number>();
  for (const t of tasks) m.set(t.kind, (m.get(t.kind) ?? 0) + 1);
  return (Object.keys(BASE) as TaskKind[])
    .map((kind) => ({ kind, count: m.get(kind) ?? 0 }))
    .filter((r) => r.count > 0);
}

/** i18n anahtarı — `useT()` ile çözülür. */
export function taskKey(kind: TaskKind): string {
  return `research.kind.${kind}`;
}
