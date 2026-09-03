import type { Person } from "../types/family.ts";
import { calcAge } from "./date.ts";
import { isMember } from "./associates.ts";

/**
 * Gerçek aciliyet uyarıları.
 *
 * ## Neden "gerçek"
 *
 * Çoğu uygulama uydurma aciliyet üretir: "3 gündür girmedin", "serin
 * bozulmak üzere". Bu üründe uydurmaya gerek yok, çünkü ELDE GERÇEK BİR
 * ACİLİYET VAR: 90 yaşındaki bir insanın anlattıkları kaydedilmezse
 * kaybolur. Bu bir pazarlama numarası değil, olgu.
 *
 * ## Ton
 *
 * Bu yüzden ton çok önemli. Uyarılar OLGU cümleleridir, tehdit değil:
 * "Nine 91 yaşında ve henüz bir anısı kaydedilmemiş." Geri sayım yok, ölüm
 * tahmini yok, "geç kalmadan" yok. Kullanıcı kendi çıkarımını yapar; onun
 * yerine korku üretmek hem saygısız hem gereksiz.
 *
 * Vefat edenler için de bir tür var (`gecti-anisiz`) — ama o bir aciliyet
 * değil, bir kayıt: o kişiye artık sorulamaz, onu TANIYANLARA sorulabilir.
 */

export type UrgencyKind =
  /** Yaşayan, ileri yaşta, hiç anısı yok. */
  | "yasli-anisiz"
  /** Yaşayan, ileri yaşta, yazısı var ama SESİ kaydedilmemiş. */
  | "yasli-sessiz"
  /** Vefat etmiş ve hiç anısı yok — artık kendisine sorulamaz. */
  | "gecti-anisiz";

export interface UrgencyItem {
  personId: string;
  kind: UrgencyKind;
  /** Yaş (yaşayanda bugünkü, vefat edende ölüm yaşı); bilinmiyorsa null. */
  age: number | null;
  /** i18n anahtarı: `urgency.<kind>`. */
  key: string;
}

/** Uyarı eşiği — bu yaştan itibaren "ileri yaş" sayılır. */
export const AGE_THRESHOLD = 70;

function storedToday(today: Date): string {
  const y = String(today.getFullYear()).padStart(4, "0");
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function hasText(p: Person): boolean {
  return (p.memories ?? []).some((m) => !!m.text?.trim());
}
function hasAudio(p: Person): boolean {
  return (p.memories ?? []).some((m) => !!m.audio);
}
/** Hiçbir anlatı yok: ne anı, ne biyografi. */
function hasNothing(p: Person): boolean {
  return !hasText(p) && !hasAudio(p) && !p.bio?.trim();
}

/**
 * Aciliyet listesi — en yaşlıdan başlayarak.
 *
 * `today` enjekte ediliyor: yaş hesabı bugüne bağlı olduğu için test
 * edilebilmesi başka türlü mümkün değildi.
 *
 * Yaşı BİLİNMEYEN kişi listeye girmez. "Belki 90 yaşındadır" diye uyarmak,
 * kullanıcıyı doğrulanmamış bir varsayımla telaşlandırmak olurdu — ve bu
 * listenin tüm değeri doğru olmasında.
 */
export function urgentPeople(
  people: readonly Person[],
  today: Date = new Date(),
  limit = 5
): UrgencyItem[] {
  const bugun = storedToday(today);
  const out: UrgencyItem[] = [];

  for (const p of people as Person[]) {
    if (!isMember(p)) continue;
    // Gizli tutulan kişiyi bir listeye taşımak, gizliliği delerdi.
    if (p.confidential) continue;

    const yasiyor = !p.deathDate;
    const age = calcAge(p.birthDate, p.deathDate ?? bugun);

    if (yasiyor) {
      if (age === null || age < AGE_THRESHOLD) continue;
      if (hasNothing(p)) out.push({ personId: p.id, kind: "yasli-anisiz", age, key: "urgency.yasli-anisiz" });
      else if (!hasAudio(p)) out.push({ personId: p.id, kind: "yasli-sessiz", age, key: "urgency.yasli-sessiz" });
      continue;
    }

    // Vefat etmiş: yaş eşiği YOK. Genç yaşta kaybedilen birinin hiç
    // anlatısının olmaması, yaşlı birininkinden daha az önemli değil.
    if (hasNothing(p)) {
      out.push({ personId: p.id, kind: "gecti-anisiz", age, key: "urgency.gecti-anisiz" });
    }
  }

  /*
   * Sıra: önce YAŞAYANLAR (onlara hâlâ sorulabilir), sonra vefat edenler.
   * Her grupta en yaşlı önce. "Hiç anlatısı yok" durumu, "sesi yok"tan
   * önce gelir — birincisinde kaybedilecek daha çok şey var.
   */
  const oncelik: Record<UrgencyKind, number> = {
    "yasli-anisiz": 0,
    "yasli-sessiz": 1,
    "gecti-anisiz": 2,
  };
  return out
    .sort((a, b) => oncelik[a.kind] - oncelik[b.kind] || (b.age ?? 0) - (a.age ?? 0))
    .slice(0, Math.max(0, limit));
}
