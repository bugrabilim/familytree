import { isRainbow } from "../lib/identity.ts";

let ok = 0, fail = 0;
const check = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.log(`✗ ${n}`); } };

check("cinsiyet 'other' → rainbow", isRainbow({ gender: "other" }) === true);
check("eşcinsel yönelim → rainbow", isRainbow({ gender: "male", orientation: "Eşcinsel" }) === true);
check("biseksüel → rainbow", isRainbow({ gender: "female", orientation: "Biseksüel" }) === true);
check("heteroseksüel → değil", isRainbow({ gender: "male", orientation: "Heteroseksüel" }) === false);
check("'hetero' öneki → değil", isRainbow({ gender: "female", orientation: "hetero" }) === false);
check("'düz' → değil", isRainbow({ gender: "male", orientation: "düz" }) === false);
check("'straight' → değil", isRainbow({ gender: "female", orientation: "straight" }) === false);
check("boş yönelim + male → değil", isRainbow({ gender: "male", orientation: "" }) === false);
check("yönelim yok + female → değil", isRainbow({ gender: "female" }) === false);
check("unknown + yönelim yok → değil", isRainbow({ gender: "unknown" }) === false);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
