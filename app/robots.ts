import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Özel/oturum yolları ve token'lı paylaşımlar dizine eklenmesin.
      disallow: ["/tree", "/person/", "/admin/", "/api/", "/g/", "/join/", "/pair/", "/p/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
