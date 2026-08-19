import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // Yalnız herkese açık, dizinlenebilir sayfalar.
  const routes = ["", "/tanitim", "/login", "/register", "/privacy", "/terms"];
  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "" || path === "/tanitim" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/tanitim" ? 0.9 : 0.5,
  }));
}
