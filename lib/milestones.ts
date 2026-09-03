import type { Person } from "../types/family.ts";
import { isMember } from "./associates.ts";

/**
 * Kilometre taşları — ağacın kendi başarımları.
 *
 * ## Neden puan/rozet/seri YOK
 *
 * Kullanıcıyı ödüllendiren bir sistem kurmak kolaydı: puan ver, seri say,
 * seviye atlat. Ama bu ürünün konusu bir oyun değil, bir ailenin kaydı. Üç
 * somut sakınca var:
 *
 * 1. **Seri (streak)** cezalandırır. Bir ay girmeyen kullanıcıya "serin
 *    bozuldu" demek, ninesini kaybettiği için giremeyen birine söylenecek
 *    en kötü şeydir.
 * 2. **Liderlik tablosu** aileleri yarıştırır. "Sizin ağacınız 340. sırada"
 *    cümlesinin bu üründe hiçbir karşılığı yok.
 * 3. **Puan** niceliği ödüllendirir; bu da uydurma kayıt eklemeyi teşvik
 *    eder. Soy ağacında yanlış kayıt, eksik kayıttan kötüdür.
 *
 * Bunun yerine: her kilometre taşı AĞAÇ hakkında doğru bir cümledir.
 * "Yedi göbek tamamlandı" bir ödül değil, bir olgu — ve zaten ailenin
 * kendi diliyle söylenen bir şey.
 *
 * Saf ve bağımlılık-hafif: yalnız `.ts` göreli içe aktarım, böylece birim
 * testi koşulabiliyor.
 */

export type MilestoneKind =
  | "gobek"      // kuşak derinliği
  | "yuzyil"     // kapsanan zaman aralığı
  | "kisi"       // kayıtlı kişi sayısı
  | "hikaye"     // yazılı anı
  | "ses"        // sesli anı
  | "fotograf"
  | "kaynak"     // atıf/belge
  | "yer";       // farklı doğum yeri

export interface Milestone {
  id: string;
  kind: MilestoneKind;
  /** Ulaşıldı mı. */
  reached: boolean;
  /** Şu anki değer ve hedef — "6/7" gibi göstermek için. */
  value: number;
  target: number;
  /**
   * i18n anahtarı: `milestone.<id>`. Metinler sözlükte; burada yalnız
   * anahtar ve sayılar var (aynı mantık iki dilde de çalışsın).
   */
  key: string;
}

/** Bir eşik listesi: ilk ulaşılmayan hedef "sıradaki" olur. */
const ESIKLER: Record<MilestoneKind, number[]> = {
  gobek: [3, 5, 7],
  yuzyil: [50, 100, 200],
  kisi: [10, 25, 50, 100, 250],
  hikaye: [1, 10, 50],
  ses: [1, 5, 20],
  fotograf: [1, 25, 100],
  kaynak: [1, 10, 50],
  yer: [1, 5, 15],
};

function yearOf(stored?: string): number | undefined {
  if (!stored) return undefined;
  const m = /^(\d{4})/.exec(stored);
  return m ? Number(m[1]) : undefined;
}

/**
 * En uzun kesintisiz ATA zinciri (göbek sayısı).
 *
 * "Yedi göbek" derken kastedilen, bir kişiden yukarı doğru kesintisiz
 * sayılabilen kuşak sayısıdır. Bu yüzden ağacın toplam kuşak yayılımına
 * (`computeStats().generations`) değil, en derin ATA zincirine bakıyoruz:
 * yan yana duran iki geniş dal, derin bir soy demek değildir.
 *
 * Kişinin kendisi 1. göbek sayılır.
 */
export function deepestAncestry(people: readonly Person[]): number {
  const uyeler = (people as Person[]).filter(isMember);
  const byId = new Map(uyeler.map((p) => [p.id, p]));
  const bellek = new Map<string, number>();

  const derinlik = (id: string, yol: Set<string>): number => {
    const onbellek = bellek.get(id);
    if (onbellek !== undefined) return onbellek;
    // Döngüye karşı: bozuk veri sonsuz özyinelemeye dönüşmesin.
    if (yol.has(id)) return 0;
    const p = byId.get(id);
    if (!p) return 0;

    yol.add(id);
    let enIyi = 0;
    for (const pid of p.parentIds) {
      if (!byId.has(pid)) continue;
      const d = derinlik(pid, yol);
      if (d > enIyi) enIyi = d;
    }
    yol.delete(id);

    const sonuc = enIyi + 1;
    bellek.set(id, sonuc);
    return sonuc;
  };

  let en = 0;
  for (const p of uyeler) {
    const d = derinlik(p.id, new Set());
    if (d > en) en = d;
  }
  return en;
}

/** Kapsanan zaman aralığı (yıl): en erken doğumdan en geç doğuma. */
export function yearsCovered(people: readonly Person[]): number {
  let min: number | undefined;
  let max: number | undefined;
  for (const p of people as Person[]) {
    if (!isMember(p)) continue;
    for (const tarih of [p.birthDate, p.deathDate]) {
      const y = yearOf(tarih);
      if (y === undefined) continue;
      if (min === undefined || y < min) min = y;
      if (max === undefined || y > max) max = y;
    }
  }
  if (min === undefined || max === undefined) return 0;
  return max - min;
}

/** Ham sayımlar — kilometre taşlarının girdisi. */
export interface TreeCounts {
  gobek: number;
  yuzyil: number;
  kisi: number;
  hikaye: number;
  ses: number;
  fotograf: number;
  kaynak: number;
  yer: number;
}

export function countTree(people: readonly Person[]): TreeCounts {
  const uyeler = (people as Person[]).filter(isMember);
  let hikaye = 0;
  let ses = 0;
  let fotograf = 0;
  let kaynak = 0;
  const yerler = new Set<string>();

  for (const p of uyeler) {
    for (const m of p.memories ?? []) {
      // Bir anı hem yazı hem ses taşıyabilir; ikisi ayrı ayrı sayılır.
      if (m.text?.trim()) hikaye++;
      if (m.audio) ses++;
    }
    fotograf += (p.photos ?? []).length;
    if (p.photo && !(p.photos ?? []).includes(p.photo)) fotograf++;
    kaynak += (p.sources ?? []).length;
    const yer = p.birthPlace?.trim();
    if (yer) yerler.add(yer.toLocaleLowerCase("tr"));
  }

  return {
    gobek: deepestAncestry(uyeler),
    yuzyil: yearsCovered(uyeler),
    kisi: uyeler.length,
    hikaye,
    ses,
    fotograf,
    kaynak,
    yer: yerler.size,
  };
}

/**
 * Kilometre taşları listesi.
 *
 * Her tür için TÜM eşikler döner (ulaşılan + ulaşılmayan), böylece arayüz
 * hem "başardıklarımız"ı hem "sıradaki"ni tek listeden çizebilir.
 */
export function milestones(people: readonly Person[]): Milestone[] {
  const sayim = countTree(people);
  const out: Milestone[] = [];
  for (const kind of Object.keys(ESIKLER) as MilestoneKind[]) {
    const deger = sayim[kind];
    for (const hedef of ESIKLER[kind]) {
      const id = `${kind}.${hedef}`;
      out.push({
        id,
        kind,
        reached: deger >= hedef,
        value: deger,
        target: hedef,
        key: `milestone.${id}`,
      });
    }
  }
  return out;
}

export function reachedMilestones(people: readonly Person[]): Milestone[] {
  return milestones(people).filter((m) => m.reached);
}

/**
 * Sıradaki hedefler — her türden yalnız EN YAKIN ulaşılmamış olan.
 *
 * `limit` ile sınırlı ve **en yakın olanlar önce**: "3 kişi daha" ile "230
 * kişi daha" aynı listede yan yana durursa ikincisi umut kırıcıdır. Yakınlık
 * oransal ölçülüyor (`value/target`), çünkü mutlak fark türler arasında
 * kıyaslanamaz: 2 fotoğraf eksik ile 2 göbek eksik aynı şey değil.
 */
export function nextMilestones(people: readonly Person[], limit = 3): Milestone[] {
  const hepsi = milestones(people).filter((m) => !m.reached);
  const enYakin = new Map<MilestoneKind, Milestone>();
  for (const m of hepsi) {
    const mevcut = enYakin.get(m.kind);
    if (!mevcut || m.target < mevcut.target) enYakin.set(m.kind, m);
  }
  return [...enYakin.values()]
    .sort((a, b) => b.value / b.target - a.value / a.target)
    .slice(0, Math.max(0, limit));
}
