import { canEdit, canEditPerson, canManage, canPropose, isYonetici } from "../lib/roles.ts";
import { normalizeRole } from "../types/user.ts";

let ok = 0, fail = 0;
const check = (ad: string, kosul: boolean, detay = "") =>
  kosul ? ok++ : (fail++, console.log(`✗ ${ad} ${detay}`));

/**
 * ROL KADEMELERİ — iki tane (madde 35, ikinci tur).
 *
 * Burada dört kademeli sıralı bir hiyerarşi (`ORDER` + `roleAtLeast`) vardı.
 * İkiye inince taşıdığı tek bilgi "yonetici > uye" oldu; dizi kaldırıldı ve
 * araya kademe sokmanın sessizce kapı kaydırma riski de onunla gitti.
 */

/* ── İki kademe ──────────────────────────────────────────────────────────── */
check("yönetici yönetici", isYonetici("yonetici"));
check("üye yönetici DEĞİL", !isYonetici("uye"));
check("tanımsız yönetici değil", !isYonetici(undefined));
check("null yönetici değil", !isYonetici(null));

/*
 * BU DOSYANIN EN ÖNEMLİ İDDİASI. Üye doğrudan yazabilseydi rol, adı değişmiş
 * bir editor olurdu ve öneri kuyruğunun tamamı gereksizleşirdi.
 */
check("canEdit yönetici", canEdit("yonetici"));
check("canEdit üye DEĞİL", !canEdit("uye"));
check("canEdit tanımsız değil", !canEdit(undefined));

check("canManage yönetici", canManage("yonetici"));
check("canManage üye değil", !canManage("uye"));

/* Öneri açmak ağacın HER üyesine açık — rolün varlık sebebi. */
check("canPropose üye", canPropose("uye"));
check("canPropose yönetici", canPropose("yonetici"));
check("canPropose tanımsız DEĞİL", !canPropose(undefined));
check("canPropose null değil", !canPropose(null));

/*
 * Sahiplik istisnası KALKTI: üyenin eklemesi de onaydan geçtiği için
 * "kendi eklediği" diye doğrudan yazılmış bir kayıt zaten oluşmuyor.
 */
check("canEditPerson yönetici", canEditPerson("yonetici"));
check("canEditPerson üye değil", !canEditPerson("uye"));

/* ── Eski rol adlarının çevrimi ──────────────────────────────────────────── */
/*
 * Depoda, Postgres'te ve TELEFONDAKİ JETONLARDA eski adlar duruyor. Çeviri
 * kayıpsız ve tek yönlü olduğu için göç betiği yok; kayıtlar bir sonraki
 * yazmada kendiliğinden güncelleniyor.
 *
 * YÖN ÖNEMLİ: `admin` yetkisini KORUYOR (bir yöneticiyi haber vermeden üyeye
 * indirmek yanlış olurdu), geri kalan hiçbiri yetki KAZANMIYOR.
 */
check("admin → yonetici", normalizeRole("admin") === "yonetici");
check("editor → uye", normalizeRole("editor") === "uye");
check("contributor → uye", normalizeRole("contributor") === "uye");
check("viewer → uye", normalizeRole("viewer") === "uye");
check("yonetici → yonetici", normalizeRole("yonetici") === "yonetici");
check("uye → uye", normalizeRole("uye") === "uye");

/*
 * TANINMAYAN değer en az yetkili kademeye düşüyor. Yönetici sayılsaydı, tek
 * bir yazım hatası ya da bozuk bir kayıt ağacın kontrolünü devredebilirdi.
 */
check("bilinmeyen → uye", normalizeRole("uydurma") === "uye");
check("boş dize → uye", normalizeRole("") === "uye");
check("undefined → uye", normalizeRole(undefined) === "uye");
check("null → uye", normalizeRole(null) === "uye");
check("sayı → uye", normalizeRole(42) === "uye");
check("nesne → uye", normalizeRole({ role: "admin" }) === "uye");

/* Çevrim sonucu her zaman geçerli bir kademe olmalı. */
for (const girdi of ["admin", "editor", "viewer", "uydurma", "", null, undefined, 0, [], {}]) {
  const r = normalizeRole(girdi);
  check(`çevrim geçerli kademe döndürüyor (${JSON.stringify(girdi)})`, r === "uye" || r === "yonetici");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
