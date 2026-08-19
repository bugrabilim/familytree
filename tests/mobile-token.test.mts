import { signMobileToken, verifyMobileToken } from "../lib/mobile-token.ts";

let ok = 0, fail = 0;
const check = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.log(`✗ ${n}`); } };

const token = await signMobileToken({ sub: "acc-123", name: "Yılmaz", role: "admin", isFounder: true, treeName: "Yılmaz" });
check("jeton üretildi (jwt biçimi)", typeof token === "string" && token.split(".").length === 3);

const claims = await verifyMobileToken(token);
check("doğrulama başarılı", claims !== null);
check("sub korunur", claims?.sub === "acc-123");
check("role korunur", claims?.role === "admin");
check("isFounder korunur", claims?.isFounder === true);
check("treeName korunur", claims?.treeName === "Yılmaz");

check("bozuk jeton → null", (await verifyMobileToken("not.a.jwt")) === null);
check("boş jeton → null", (await verifyMobileToken("")) === null);
check("kurcalanmış jeton → null", (await verifyMobileToken(token.slice(0, -3) + "xyz")) === null);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
