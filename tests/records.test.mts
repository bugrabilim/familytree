import { buildWikidataSearchUrl, parseWikidataSearch } from "../lib/records.ts";

let ok = 0,
  fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) ok++;
  else {
    fail++;
    console.log(`✗ ${name}`);
  }
};

const url = buildWikidataSearchUrl("Mustafa Kemal", "tr");
check("url wbsearchentities", url.includes("action=wbsearchentities"));
check("url ad kodlanmış", url.includes("search=Mustafa+Kemal") || url.includes("search=Mustafa%20Kemal"));
check("url dil tr", url.includes("language=tr"));

const sample = {
  search: [
    { id: "Q517", label: "Atatürk", description: "Türk devlet adamı (1881–1938)", concepturi: "http://www.wikidata.org/entity/Q517" },
    { id: "Q999", label: "Adsız", description: "" },
    { notAnItem: true },
  ],
};
const hints = parseWikidataSearch(sample);
check("iki sonuç", hints.length === 2);
check("wiki bağlantısı https + /wiki/", hints[0].url === "https://www.wikidata.org/wiki/Q517");
check("concepturi yoksa id'den url", hints[1].url === "https://www.wikidata.org/wiki/Q999");
check("bozuk yanıt → boş", parseWikidataSearch({}).length === 0 && parseWikidataSearch(null).length === 0);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
