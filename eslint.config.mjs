import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Native mobil uygulama kendi araç zincirine sahip (Expo/RN); web lint'i dışında.
    "apps/**",
    /*
     * Geçici git worktree'leri. İçlerinde deponun bir KOPYASI duruyor ve o
     * kopyadaki `apps/mobile` yukarıdaki desene uymuyor (kök göreli değil),
     * yani mobil dosyalar web lint'ine sızıp `npm run lint`i kırıyordu.
     * Kopyayı lint etmenin bir anlamı da yok: asıl dosyalar zaten taranıyor.
     */
    ".claude/**",
  ]),
]);

export default eslintConfig;
