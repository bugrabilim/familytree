import { hasTreeAccess, normalizeAccess, normalizeShares } from "../lib/tree-access.ts";
import type { ShareLink, TreeAccess } from "../types/user.ts";

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

/* ── Paylaşım bağlantıları: normalleştirme alan DÜŞÜRMEMELİ ─────────────────
 * Regresyon: `normalizeAccess` eskiden `shares` alanını kopyalamıyordu (tipte
 * opsiyonel olduğu için TS de uyarmıyordu). Sonuç: her okumada tüm paylaşım
 * bağlantıları kayboluyor, `/g/<jeton>` "Bağlantı geçersiz" diyordu.        */
const share: ShareLink = {
  id: "sh-1",
  token: "604a6f47-b9c2-4924-a66f-ce0681925baa.7sygGuQdzTKI8wgEA96oj7zO",
  treeName: "Demirtaş",
  hideLiving: true,
  createdAt: new Date().toISOString(),
  views: 0,
  visits: [],
};
const stored: TreeAccess = { members: [], invites: [], shares: [share] };

const round = normalizeAccess(stored);
check("normalizeAccess `shares` alanını korur", (round.shares ?? []).length === 1);
check(
  "normalizeAccess jetonu bozmaz",
  (round.shares ?? [])[0]?.token === share.token
);
check(
  "okuma sonrası jeton bulunabilir (/g/<jeton>)",
  !!normalizeShares(round).find((s) => s.token === share.token)
);

// Eski tekil `share` alanı hâlâ desteklenmeli (geri uyumluluk).
const legacy = normalizeAccess({ members: [], invites: [], share } as TreeAccess);
check("eski tekil `share` jetonu bulunur", !!normalizeShares(legacy).find((s) => s.token === share.token));

// Çoklu + eski birlikteyken jeton iki kez listelenmemeli.
const both = normalizeAccess({ members: [], invites: [], share, shares: [share] } as TreeAccess);
check("aynı jeton iki kez listelenmez", normalizeShares(both).length === 1);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
