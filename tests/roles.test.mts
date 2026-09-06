import { roleAtLeast, canContribute, canEdit, canManage } from "../lib/roles.ts";

let ok = 0, fail = 0;
const check = (ad: string, kosul: boolean, detay = "") =>
  kosul ? ok++ : (fail++, console.log(`✗ ${ad} ${detay}`));

// Hiyerarşi: viewer < contributor < editor < admin
check("admin ≥ admin", roleAtLeast("admin", "admin"));
check("admin ≥ editor", roleAtLeast("admin", "editor"));
check("admin ≥ viewer", roleAtLeast("admin", "viewer"));
check("editor ≥ editor", roleAtLeast("editor", "editor"));
check("editor ≥ viewer", roleAtLeast("editor", "viewer"));
check("editor < admin", !roleAtLeast("editor", "admin"));
check("viewer ≥ viewer", roleAtLeast("viewer", "viewer"));
check("viewer < editor", !roleAtLeast("viewer", "editor"));
check("viewer < admin", !roleAtLeast("viewer", "admin"));

// Tanımsız/null → hiçbir yetki
check("undefined yetkisiz", !roleAtLeast(undefined, "viewer"));
check("null yetkisiz", !roleAtLeast(null, "viewer"));

// canEdit: editor ve üstü
check("canEdit admin", canEdit("admin"));
check("canEdit editor", canEdit("editor"));
check("canEdit viewer değil", !canEdit("viewer"));
check("canEdit undefined değil", !canEdit(undefined));

// canManage: yalnız admin
check("canManage admin", canManage("admin"));
check("canManage editor değil", !canManage("editor"));
check("canManage viewer değil", !canManage("viewer"));

/* ── contributor kademesi (madde 35) ─────────────────────────────────────── */
/*
 * Sıralı bir hiyerarşiye araya kademe sokmak, YUKARIDAKİ herkesin yetkisini
 * sessizce değiştirebilir: `roleAtLeast` sıra numarasıyla karşılaştırıyor ve
 * yanlış yere konan bir kademe, editor'ü viewer'ın altına düşürmeden de
 * kapıları kaydırabilirdi. Bu yüzden yeni kademenin İKİ TARAFI da yokleniyor.
 */
check("contributor > viewer", roleAtLeast("contributor", "viewer"));
check("contributor < editor", !roleAtLeast("contributor", "editor"));
check("contributor < admin", !roleAtLeast("contributor", "admin"));
check("editor > contributor", roleAtLeast("editor", "contributor"));
check("admin > contributor", roleAtLeast("admin", "contributor"));
check("viewer < contributor", !roleAtLeast("viewer", "contributor"));

// canContribute: contributor ve üstü — EKLEME yetkisi.
check("canContribute contributor", canContribute("contributor"));
check("canContribute editor", canContribute("editor"));
check("canContribute admin", canContribute("admin"));
check("canContribute viewer değil", !canContribute("viewer"));
check("canContribute undefined değil", !canContribute(undefined));
check("canContribute null değil", !canContribute(null));

/*
 * EN ÖNEMLİ İDDİA. Katkı vericinin var olan kaydı DEĞİŞTİREMEMESİ rolün
 * bütün varlık sebebi; `canEdit`ten geçebilseydi rol, adı değişmiş bir
 * editor olurdu.
 */
check("canEdit contributor DEĞİL", !canEdit("contributor"));
check("canManage contributor değil", !canManage("contributor"));

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
