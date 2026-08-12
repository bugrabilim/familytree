import { roleAtLeast, canEdit, canManage } from "../lib/roles.ts";

let ok = 0, fail = 0;
const check = (ad: string, kosul: boolean, detay = "") =>
  kosul ? ok++ : (fail++, console.log(`✗ ${ad} ${detay}`));

// Hiyerarşi: viewer < editor < admin
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

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
