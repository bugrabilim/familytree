import { buildGeocodeQuery, parseNominatimResult } from "../lib/geocode.ts";

let ok = 0, fail = 0;
const check = (n: string, c: boolean, d = "") => { if (c) ok++; else { fail++; console.log(`✗ ${n} ${d}`); } };

// buildGeocodeQuery
check("tek parça olduğu gibi", buildGeocodeQuery("Kırmacı") === "Kırmacı");
check("boşluk kırpılır", buildGeocodeQuery("  Ordu  ") === "Ordu");
// e-Devlet "İl / İlçe / Köy" → özelden genele (Köy, İlçe, İl)
check("eğik çizgi tersine çevrilir", buildGeocodeQuery("Ordu / Gürgentepe / Evlek") === "Evlek, Gürgentepe, Ordu",
  buildGeocodeQuery("Ordu / Gürgentepe / Evlek"));
// virgüllü "Şehir, Ülke" sırası korunur
check("virgül sırası korunur", buildGeocodeQuery("Köln, Almanya") === "Köln, Almanya");
check("boş → boş", buildGeocodeQuery("   ") === "");

// parseNominatimResult
check("ilk sonucu çözer", (() => {
  const r = parseNominatimResult([{ lat: "40.98", lon: "37.88" }, { lat: "1", lon: "2" }]);
  return r !== null && r.lat === 40.98 && r.lng === 37.88;
})());
check("boş dizi → null", parseNominatimResult([]) === null);
check("dizi değil → null", parseNominatimResult({ lat: "1", lon: "2" }) === null);
check("geçersiz sayı → null", parseNominatimResult([{ lat: "x", lon: "y" }]) === null);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
