import { projectEquirectangular, unprojectEquirectangular, googleMapsUrl, resolvePlace } from "../lib/places.ts";

let ok = 0, fail = 0;
const check = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.log(`✗ ${n}`); } };
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

const W = 1000, H = 403;

// Uç noktalar (DEFAULT_BOUNDS: lat -60..85, lng -180..180)
check("lng -180 → x=0", near(projectEquirectangular(0, -180, W, H).x, 0));
check("lng 180 → x=W", near(projectEquirectangular(0, 180, W, H).x, W));
check("lat 85 → y=0", near(projectEquirectangular(85, 0, W, H).y, 0));
check("lat -60 → y=H", near(projectEquirectangular(-60, 0, W, H).y, H));

// project → unproject roundtrip
for (const [lat, lng] of [[41.0, 29.0], [-33.4, 151.2], [38.7, 35.5], [0, 0]] as const) {
  const { x, y } = projectEquirectangular(lat, lng, W, H);
  const back = unprojectEquirectangular(x, y, W, H);
  check(`roundtrip ${lat},${lng}`, near(back.lat, lat, 1e-9) && near(back.lng, lng, 1e-9));
}

// googleMapsUrl
check("gmaps koordinat kodlar", googleMapsUrl("41.0,29.0").includes("query=41.0%2C29.0"));
check("gmaps yer adı kodlar", googleMapsUrl("İstanbul, Türkiye").startsWith("https://www.google.com/maps/search/?api=1&query="));

// resolvePlace — 81 il + ilçe + e-Devlet biçimi
check("il: Ordu çözülür", resolvePlace("Ordu") !== null);
check("il: Bingöl çözülür", resolvePlace("Bingöl") !== null);
check("İstanbul ilçesi: Şişli çözülür", resolvePlace("Şişli") !== null);
check("bilinmeyen köy → null", resolvePlace("Evlek") === null);
// e-Devlet biçimi "İl / İlçe / Köy" → köy bilinmese bile il'e düşer
check("Ordu / Gürgentepe / Evlek → Ordu", (() => {
  const r = resolvePlace("Ordu / Gürgentepe / Evlek");
  return r !== null && near(r.lat, 40.98, 0.05) && near(r.lng, 37.88, 0.05);
})());
// hiyerarşide en özel (sondaki) parça yeğlenir: İstanbul / Şişli → Şişli
check("İstanbul / Şişli → Şişli (özel)", (() => {
  const r = resolvePlace("İstanbul / Şişli");
  return r !== null && near(r.lat, 41.06, 0.05) && near(r.lng, 28.99, 0.05);
})());
// virgüllü "Şehir, Ülke" → şehir yeğlenir
check("Köln, Almanya → Köln (şehir)", (() => {
  const r = resolvePlace("Köln, Almanya");
  return r !== null && near(r.lat, 50.94, 0.05) && near(r.lng, 6.96, 0.05);
})());
check("eski ad: Antep → Gaziantep", resolvePlace("Antep") !== null);
check("büyük/küçük harf: ORDU", resolvePlace("ORDU") !== null);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
