"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import PersonForm from "@/components/PersonForm";
import type { Person } from "@/types/family";
import { useSession } from "next-auth/react";

export default function NewPersonPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [people, setPeople] = useState<Person[]>([]);

  useEffect(() => {
    fetch("/api/family").then((r) => r.json()).then((d) => setPeople(d.people ?? []));
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar familyName={session?.user?.name ?? undefined} />
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Yeni Kişi Ekle</h1>
        <PersonForm
          people={people}
          onClose={() => router.back()}
          onSaved={(person) => router.push(`/person/${person.id}`)}
        />
      </main>
    </div>
  );
}
