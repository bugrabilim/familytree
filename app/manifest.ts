import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Ailenin hikâyesi`,
    short_name: SITE_NAME,
    description:
      "Ailenizin soy ağacını birlikte oluşturun; kuşakları görselleştirin, anıları ve fotoğrafları saklayın.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f2",
    theme_color: "#1f6b47",
    lang: "tr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
