"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

export default function Navbar({ familyName }: { familyName?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const links = [
    { href: "/tree", label: "Ağaç" },
    { href: "/search", label: "Arama" },
    { href: "/person/new", label: "+ Kişi Ekle" },
  ];

  return (
    <header className="bg-green-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/tree" className="flex items-center gap-2 font-semibold text-lg">
          <span>🌳</span>
          <span>{familyName ? `${familyName} Ailesi` : "Soy Ağacı"}</span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname === href
                  ? "bg-green-600 text-white"
                  : "text-green-100 hover:bg-green-700"
              }`}
            >
              {label}
            </Link>
          ))}
          <button
            onClick={async () => {
              await signOut({ redirect: false });
              router.push("/login");
            }}
            className="ml-2 px-3 py-1.5 rounded-md text-sm font-medium text-green-100 hover:bg-green-700 transition-colors"
          >
            Çıkış
          </button>
        </nav>
      </div>
    </header>
  );
}
