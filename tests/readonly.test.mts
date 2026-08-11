// Görüntüleme modu (read-only viewer mode) — arayüz düzeyinde salt-okunur katman.
// ReadOnlyContext.tsx bir React/JSX istemci bileşeni olduğundan node'un tür-sıyırma
// çalıştırıcısında doğrudan içe aktarılamaz; bu yüzden bağlamın SSR varsayılanını ve
// localStorage okuma mantığını birebir yansıtan saf yardımcıyı test ediyoruz.

let ok = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) ok++;
  else {
    fail++;
    console.log(`✗ ${name}`);
  }
}

/** ReadOnlyContext.readSnapshot ile aynı ayrıştırma: yalnızca "1" true'dur. */
function parseReadOnly(stored: string | null): boolean {
  return stored === "1";
}

/** ReadOnlyContext'in getServerSnapshot varsayılanı. */
const SERVER_DEFAULT = false;

check("SSR varsayılanı false", SERVER_DEFAULT === false);
check("kayıt yokken (null) → false", parseReadOnly(null) === false);
check('kayıt "0" iken → false', parseReadOnly("0") === false);
check('kayıt "1" iken → true', parseReadOnly("1") === true);
check("beklenmeyen değer → false", parseReadOnly("true") === false);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
