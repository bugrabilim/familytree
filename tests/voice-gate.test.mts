import { readFileSync } from "node:fs";
import { audioMimeOf } from "../lib/voice.ts";

let ok = 0, fail = 0;
function eq<T>(got: T, want: T, msg: string) {
  if (got === want) ok++;
  else { fail++; console.log(`✗ ${msg}: bekl ${JSON.stringify(want)}, geldi ${JSON.stringify(got)}`); }
}
function check(cond: boolean, msg: string) { if (cond) ok++; else { fail++; console.log(`✗ ${msg}`); } }

/**
 * KAPI: Sesli Şecere ucu ağaca YAZMIYOR.
 *
 * Bir dil modelinin çıkarımı doğrudan aile kaydına yazsaydı, yanlış bir
 * tahmin sessizce ailenin tarihine karışırdı — ve iki kuşak sonra kimse
 * hangi bilginin nineden, hangisinin modelden geldiğini bilemezdi.
 *
 * Bu ayrım tek bir `import` satırıyla bozulabilir; test o satırı bekliyor.
 */

const src = readFileSync(new URL("../app/api/ai/voice/route.ts", import.meta.url), "utf8");

for (const yazma of ["saveFamilyData", "put(", "updatePerson", "pushHistorySnapshot"]) {
  check(!src.includes(yazma), `rota \`${yazma}\` kullanmıyor`);
}
check(src.includes("getFamilyData"), "rota yalnız OKUYOR");

/* --- Yetki ve sınır ----------------------------------------------------- */
check(src.includes("resolveActiveTree"), "oturum çözümleniyor");
check(src.includes("canEdit"), "düzenleyici yetkisi isteniyor");
check(src.includes("rateLimit"), "oran sınırı var");
check(src.includes("isGeminiConfigured"), "AI kapalıysa kibarca reddediliyor");

/* --- Doğrulama katmanı atlanmamış ---------------------------------------- */
check(src.includes("parseVoiceJson"), "model çıktısı doğrulamadan geçiyor");
check(!/JSON\.parse\s*\(\s*out\s*\)/.test(src), "ham model çıktısı doğrudan ayrıştırılmıyor");
check(src.includes("pendingFacts"), "zaten doğru olan bilgi onaya sunulmuyor");

/* --- Boyut sınırı -------------------------------------------------------- */
check(/MAX_BYTES/.test(src) && src.includes("413"), "aşırı büyük kayıt reddediliyor");

/* --- audioMimeOf: uygulamanın KENDİ kaydı kabul edilmeli ----------------- */
{
  /*
   * `MediaRecorder` çıktısı çoğu tarayıcıda `video/webm` etiketli geliyor —
   * kapsayıcı aynı, içinde yalnız ses var. Reddetseydik `AudioRecorder`ın
   * ürettiği dosya kabul edilmezdi; yani özellik kendi kaydıyla çalışmazdı.
   */
  eq(audioMimeOf("kayit.webm", "video/webm"), "audio/webm", "MediaRecorder'ın video/webm'i kabul");
  eq(audioMimeOf("kayit.mp4", "video/mp4"), "audio/mp4", "video/mp4 kapsayıcısı kabul");
  eq(audioMimeOf("x.webm", "audio/webm;codecs=opus"), "audio/webm", "codecs eki kırpılıyor");
  eq(audioMimeOf("x", "audio/mpeg"), "audio/mpeg", "düz ses türü geçer");
  // iOS Safari bazen tür hiç göndermiyor → uzantıya düşülür.
  eq(audioMimeOf("ninem.m4a", ""), "audio/mp4", "türsüz m4a uzantıdan çözülür");
  eq(audioMimeOf("ninem.OGG", ""), "audio/ogg", "büyük harfli uzantı");
  eq(audioMimeOf("belge.pdf", "application/pdf"), null, "PDF ses değil");
  eq(audioMimeOf("klip.mov", "video/quicktime"), null, "gerçek video reddedilir");
  eq(audioMimeOf("", ""), null, "adsız ve türsüz dosya reddedilir");
}

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail > 0) process.exit(1);
