import { readdirSync, readFileSync, statSync } from "node:fs";
import { normalizeAccess } from "../lib/tree-access.ts";
import { isSoftDeleted } from "../lib/retention.ts";
import type { TreeAccess } from "../types/user.ts";

let ok = 0, fail = 0;
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: YUMUŞAK SİLİNMİŞ AĞAÇ HER YERDEN DÜŞER.
 *
 * ## Neden bir kapsama testi
 *
 * Yarı gizlenmiş bir ağaç, hiç gizlenmemiş bir ağaçtan KÖTÜDÜR: kullanıcı
 * sildiğini sanır, oysa WhatsApp'ta paylaştığı bağlantı hâlâ açılır, davet
 * hâlâ kabul edilir, RSVP hâlâ yazar. "Sildim" diyen birine yanlış bir güven
 * vermek, hiç silmemekten daha zararlı.
 *
 * Ağaç birçok ayrı yüzeyden çözülüyor ve her biri farklı bir anahtar
 * kullanıyor: oturum (aktif ağaç), paylaşım jetonu, davet jetonu, üye
 * şifresi, eşleştirme, RSVP jetonu, hikâye jetonu, iletişim jetonu, ve
 * zamanlanmış posta işi. Bir tanesinin unutulması tek bir tip hatası bile
 * üretmez.
 *
 * Bu yüzden kilit iki parçalı: (1) bilinen yüzeylerin her birinde denetimin
 * varlığı, (2) YENİ bir `[treeId]` yüzeyi eklendiğinde kapsamın kendiliğinden
 * kırılması.
 */

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const kodu = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ══ 0. Damga okumadan sağ çıkıyor mu (saf, davranışsal) ═══════════════ */
{
  const stored = { members: [], invites: [], deletedAt: "2026-01-01T00:00:00.000Z" } as TreeAccess;
  const round = normalizeAccess(stored);
  /*
   * `shares` alanı bir zamanlar tam da böyle düşmüştü (tipte opsiyonel
   * olduğu için TS de susmuştu). Damga düşseydi sonuç daha kötü olurdu:
   * silinmiş ağacın bağlantıları ilk yazmada yeniden açılırdı.
   */
  check(round.deletedAt === stored.deletedAt, "normalizeAccess damgayı KORUYOR");
  check(isSoftDeleted(round), "okunan kayıt silinmiş olarak tanınıyor");
  check(!isSoftDeleted(normalizeAccess({ members: [], invites: [] })), "damgasız kayıt canlı kalıyor");
}

/* ══ 1. Sahibin kendi yüzeyleri: liste, geçiş, oturum ══════════════════ */
{
  const src = kodu(read("../lib/trees.ts"));

  const govde = (ad: string) => {
    const i = src.indexOf(`export async function ${ad}(`);
    if (i < 0) return "";
    const j = src.indexOf("\nexport ", i + 10);
    return src.slice(i, j < 0 ? undefined : j);
  };

  check(/!isSoftDeleted\(t\)/.test(govde("listTrees")), "ağaç listesi silinmişleri gizliyor");
  /*
   * `accessibleTreeIds` gizlemenin ANA kapısı: `resolveActiveTree` ve
   * `/api/trees/switch` yetkiyi buradan soruyor. Buradaki filtre, silinmiş
   * ağacın hiçbir oturumda aktif ağaç olamaması demek — yani bütün API
   * rotaları tek noktadan kapanıyor.
   */
  check(/!isSoftDeleted\(t\)/.test(govde("accessibleTreeIds")), "yetki çözümü silinmişleri dışlıyor");
  check(/isSoftDeleted\(t\)\) return false/.test(govde("renameTree")), "silinmiş ağaç yeniden adlandırılamıyor");
  check(/isSoftDeleted\(t\)/.test(govde("listDeletedTrees")), "silinmişler ayrı listede");

  const ctx = kodu(read("../lib/tree-context.ts"));
  check(/isAccountDeleted\(accountId\)/.test(ctx), "silinmekte olan hesabın oturumu çözülmüyor");
  check(/return \{ ok: false, status: 401 \}/.test(ctx), "çözülmeyen oturum 401");
}

/* ══ 2. Giriş: kurucu da üye de giremez ════════════════════════════════ */
{
  const dosya = kodu(read("../lib/credentials.ts"));
  /*
   * İddialar `verifyLogin` GÖVDESİNE bakıyor, dosyanın tamamına değil.
   *
   * Dosyada artık gövdenin DIŞINDA da bir `compare(password…)` var (zaman
   * sızıntısına karşı sahte özet karşılaştırması) ve o, işlevden önce
   * geliyor. Dosya çapında arayan iddia onu buluyor ve "denetim şifre
   * karşılaştırmasından sonra" diye sahte kırmızıya düşüyordu — kural
   * doğruydu, iddia yanlış yere bakıyordu.
   */
  const src = dosya.slice(dosya.indexOf("export async function verifyLogin"));
  const i = src.indexOf("isSoftDeleted(user)");
  check(i > 0, "giriş silinmekte olan hesabı reddediyor");
  /*
   * Denetim ÜYE yolundan da önce olmalı. Sonra gelseydi kurucu giremezken
   * davetlisi girebilirdi — ağaç "silinmiş" görünürken yaşamaya devam ederdi.
   */
  check(i > 0 && i < src.indexOf("findMemberByPassword("), "denetim ÜYE girişinden de önce");
  /* Kullanıcı adıyla giren üye de aynı kapının arkasında. */
  check(i > 0 && i < src.indexOf("findMemberByUsername("), "denetim ADLA girişten de önce");
  check(i > 0 && i < src.indexOf("compare(password"), "denetim şifre karşılaştırmasından önce");
}

/* ══ 3. Jetonla açılan yüzeyler (`lib/members.ts`) ═════════════════════ */
{
  const src = kodu(read("../lib/members.ts"));
  const govde = (ad: string) => {
    const i = src.indexOf(`export async function ${ad}(`);
    if (i < 0) return "";
    const j = src.indexOf("\nexport ", i + 10);
    return src.slice(i, j < 0 ? undefined : j);
  };

  for (const [ad, ne] of [
    ["findValidShare", "paylaşım bağlantısı"],
    ["findValidInvite", "davet bağlantısı"],
    ["acceptInvite", "davetle katılma"],
    ["findMemberByPassword", "üye girişi"],
    ["listPairings", "eşleştirilmiş ağaçlar"],
    ["arePaired", "aşılama/birleştirme yetkisi"],
  ] as const) {
    const g = govde(ad);
    check(g.length > 0, `${ad} bulundu`);
    check(/isSoftDeleted\(|isTreeDeleted\(/.test(g), `${ne} silinmiş ağaçta kapalı (${ad})`);
  }

  /* Damga yazımı ve okuması. */
  check(/export async function markTreeDeleted\(/.test(src), "damga yazan tek işlev var");
  check(/getTreeAccess\(treeId, \{ strict: true \}\)/.test(govde("markTreeDeleted")),
    "damga yazılırken okuma hatası yutulmuyor (yoksa üyeler/davetler boş kayıtla ezilir)");
  check(/strict: true/.test(govde("isTreeDeleted")),
    "silinmişlik sorgusu okuma hatasında HATA yükseltiyor (kapı kapalı düşsün)");
}

/* ══ 4. Ağacı KİMLİĞİNDEN açan girişsiz uçlar ══════════════════════════ */
{
  /*
   * KAPSAM ÖLÜ KALMASIN. `[treeId]` taşıyan her API rotası, sahibi bilinmeden
   * ağaca ulaşan bir yüzeydir; hepsi damgayı sormak zorunda. Yeni bir tane
   * eklenirse bu döngü onu kendiliğinden yakalar.
   */
  const KOK = new URL("../app/api", import.meta.url).pathname;
  const rotalar = (dir: string, base = ""): string[] => {
    const out: string[] = [];
    for (const ad of readdirSync(dir)) {
      const tam = `${dir}/${ad}`;
      if (statSync(tam).isDirectory()) out.push(...rotalar(tam, base ? `${base}/${ad}` : ad));
      else if (ad === "route.ts") out.push(base);
    }
    return out;
  };

  const treeIdRotalari = rotalar(KOK).filter((r) => r.includes("[treeId]"));
  check(treeIdRotalari.length >= 2, `[treeId] rotaları tarandı (${treeIdRotalari.length})`);
  for (const r of treeIdRotalari) {
    const src = kodu(readFileSync(`${KOK}/${r}/route.ts`, "utf8"));
    check(/isTreeDeleted\(/.test(src), `${r}: silinmiş ağaç denetimi YOK`);
    /*
     * KAPALI DÜŞMELİ: okuma hatasında "silinmemiş" demek, geçici bir Blob
     * hatasında silinmiş ağacın bağlantısını açmak olurdu.
     */
    check(/catch \{\s*return true;/.test(src), `${r}: okuma hatasında kapı KAPALI düşüyor`);
    /* Her HTTP yöntemi ayrı ayrı sormalı — yarısı açık bir kapı, açık kapıdır. */
    for (const m of ["GET", "POST"] as const) {
      const i = src.indexOf(`export async function ${m}(`);
      if (i < 0) continue;
      const sonraki = ["GET", "POST", "PUT", "PATCH", "DELETE"]
        .map((x) => src.indexOf(`export async function ${x}(`, i + 10))
        .filter((x) => x > -1);
      const govde = src.slice(i, sonraki.length ? Math.min(...sonraki) : undefined);
      check(/silinmis\(treeId\)/.test(govde), `${r} → ${m}: denetim bu yöntemin gövdesinde`);
    }
  }

  /* Jetonu postadan gelen iletişim yolu (treeId jetonun içinde). */
  const contact = kodu(read("../lib/contact-lookup.ts"));
  check(/isTreeDeleted\(loc\.treeId\)/.test(contact), "iletişim jetonu silinmiş ağaçta ölü");
  check(/catch \{\s*return null;/.test(contact), "iletişim yolunda okuma hatası da kapatıyor");
}

/* ══ 5. Eşleşmiş (komşu) ağaç sayfaları ════════════════════════════════ */
{
  /*
   * `/p/<treeId>` ve `/pair/compare/<treeId>` yetkiyi `listPairings`ten
   * alıyor; filtre orada (bkz. 3. bölüm). Bu iddia o bağı kilitliyor: sayfalar
   * bir gün eşleşme listesini atlayıp ağacı doğrudan çözerse, komşu hesabın
   * sildiği ağaç bizim ekranımızda okunmaya devam ederdi.
   */
  for (const sayfa of ["../app/p/[treeId]/page.tsx", "../app/pair/compare/[treeId]/page.tsx"]) {
    const src = kodu(read(sayfa));
    check(/listPairings\(/.test(src), `${sayfa}: erişim eşleşme listesinden geçiyor`);
  }
}

/* ══ 6. Zamanlanmış posta ══════════════════════════════════════════════ */
{
  const src = kodu(read("../app/api/cron/reminders/route.ts"));
  check(/isSoftDeleted\(u\)\) continue/.test(src), "silinmekte olan hesaba hatırlatma postası gitmiyor");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
