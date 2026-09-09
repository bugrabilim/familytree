/*
 * KAPI-DISI: BLOB-ASLI — bu dosya BİLEREK Blob'un kendisini okuyor.
 *
 * Kimlik okumalarının kapısı `listUsers()` (ayna öncelikli). Kayma taraması
 * ise tam olarak "Blob ne diyor, ayna ne diyor" sorusunu soruyor; kapıdan
 * geçseydi aynayı aynayla karşılaştırır ve HER ZAMAN "kayma yok" derdi —
 * yani ölçmeyi bıraktığını hiç söylemeden bırakırdı.
 */
import { getUsersData } from "@/lib/users";
import { listTrees } from "@/lib/trees";
import { readFamilyFromBlob } from "@/lib/blob";
import { dbCountPeople, dbGetTreeRow } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isSoftDeleted } from "@/lib/retention";
import { checkMirror, mirrorSummary, type MirrorSummary, type MirrorVerdict } from "@/lib/mirror-check";
import type { Budget } from "@/lib/cron-budget";
import { rotateForDay } from "@/lib/cron-budget";

/**
 * GÜNLÜK AYNA TARAMASI — kararı `lib/mirror-check.ts` veriyor, burası G/Ç.
 *
 * `/api/admin/drift` tam denetimi yapıyor ama yalnız ELLE, yalnız giriş
 * yapmış founder'ın kendi ağaçları için, ve o düğmeyi kimse görmüyor. Sonuç:
 * ayrışma varsa da kimse bilmiyor. Bu tarama günlük yedeğin bir adımı olarak
 * BÜTÜN hesapların bütün ağaçlarına bakıyor ve bulduğunu günlüğe yazıyor.
 *
 * ONARMIYOR. Onarım Blob'u kaynak alıp Postgres'te kayıt SİLİYOR; kimsenin
 * bakmadığı bir zamanlanmış işin böyle bir yetkisi olmamalı. Buranın işi
 * insanı düğmeye çağırmak.
 */

export type { MirrorSummary } from "@/lib/mirror-check";

/** Supabase yapılandırılmamışsa ayna diye bir şey yok; tarama da yok. */
export function mirrorScanPossible(): boolean {
  return isSupabaseConfigured();
}

export async function scanMirror(butce: Budget, now: Date): Promise<MirrorSummary & { skipped: number }> {
  const verdicts: MirrorVerdict[] = [];
  let skipped = 0;

  const { users } = await getUsersData();
  /* Yedek işiyle aynı iki kural: bütçe ve günlük döndürme (`lib/cron-budget.ts`). */
  for (const u of rotateForDay(users, now)) {
    /* Silinmekte olan hesabın ayrışması bir arıza değil, silmenin kendisi. */
    if (isSoftDeleted(u)) continue;
    if (butce.spent()) { skipped++; continue; }

    let agaclar: Awaited<ReturnType<typeof listTrees>>;
    try {
      agaclar = await listTrees(u.id, u.familyName);
    } catch {
      /* Kayıt okunamadıysa bu hesabın ağaçları bilinmiyor; sessizce atlanmıyor. */
      verdicts.push({
        treeId: u.id, name: u.familyName, status: "yok",
        blobPeople: 0, dbPeople: 0,
        detail: "ağaç kaydı okunamadı",
      });
      continue;
    }

    for (const t of agaclar) {
      if (butce.spent()) { skipped++; continue; }
      try {
        /*
         * SALT BLOB. `getFamilyData` kullanılamaz: Postgres'i öne alıyor ve
         * ağaç orada varsa Blob'a hiç inmiyor — yani ayna kendisiyle
         * karşılaştırılır ve tarama her ağaç için "eşit" derdi.
         * `/api/admin/drift` de aynı sebeple `readFamilyFromBlob` kullanıyor.
         */
        const blob = await readFamilyFromBlob(t.treeId);
        const row = await dbGetTreeRow(t.treeId);
        const dbPeople = row ? await dbCountPeople(t.treeId) : 0;
        verdicts.push(
          checkMirror({
            treeId: t.treeId,
            name: t.name,
            inDb: !!row,
            blobRead: !!blob,
            blobPeople: blob?.people.length ?? 0,
            dbPeople,
            blobStamp: blob?.updatedAt,
            dbStamp: (row as { updated_at?: unknown } | null)?.updated_at,
          })
        );
      } catch (e) {
        verdicts.push({
          treeId: t.treeId, name: t.name, status: "yok",
          blobPeople: 0, dbPeople: 0,
          detail: `denetlenemedi: ${(e as Error).message}`,
        });
      }
    }
  }

  return { ...mirrorSummary(verdicts), skipped };
}
