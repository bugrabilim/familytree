import { hasTreeAccess } from "../lib/tree-access.ts";

let ok = 0, fail = 0;
const check = (ad: string, kosul: boolean, detay = "") =>
  kosul ? ok++ : (fail++, console.log(`✗ ${ad} ${detay}`));

const ACCOUNT = "acc-1";
const owned = ["t-a", "t-b"];

// Ana ağaç (treeId === accountId) daima erişilebilir — kayıtta olmasa bile.
check("ana ağaç erişimi", hasTreeAccess(ACCOUNT, ACCOUNT, owned));
check("ana ağaç boş kayıtla bile", hasTreeAccess(ACCOUNT, ACCOUNT, []));

// Sahip olunan ağaçlara erişim.
check("sahip olunan ağaç a", hasTreeAccess(ACCOUNT, "t-a", owned));
check("sahip olunan ağaç b", hasTreeAccess(ACCOUNT, "t-b", owned));

// Yabancı/başka hesabın ağacına erişim yok.
check("yabancı ağaç reddedilir", !hasTreeAccess(ACCOUNT, "t-x", owned));
check("başka hesabın kimliği reddedilir", !hasTreeAccess(ACCOUNT, "acc-2", owned));
check("boş kayıtta yabancı reddedilir", !hasTreeAccess(ACCOUNT, "t-a", []));

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
