"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Navbar from "@/components/Navbar";
import PersonForm from "@/components/PersonForm";
import type { Person } from "@/types/family";
import { use } from "react";

export default function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const [people, setPeople] = useState<Person[]>([]);
  const [person, setPerson] = useState<Person | null>(null);

  useEffect(() => {
    fetch("/api/family")
      .then((r) => r.json())
      .then((d) => {
        const all: Person[] = d.people ?? [];
        setPeople(all);
        setPerson(all.find((p) => p.id === id) ?? null);
      });
  }, [id]);

  if (!person && people.length === 0) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar familyName={session?.user?.name ?? undefined} />
        <main className="flex-1 flex items-center justify-center text-gray-400">
          Yükleniyor…
        </main>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar familyName={session?.user?.name ?? undefined} />
        <main className="flex-1 flex items-center justify-center text-gray-400">
          Kişi bulunamadı.
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar familyName={session?.user?.name ?? undefined} />
      <main className="max-w-lg mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {person.firstName} {person.lastName} — Düzenle
        </h1>
        <PersonForm
          people={people}
          initial={person}
          personId={id}
          onClose={() => router.back()}
          onSaved={() => router.push(`/person/${id}`)}
        />
      </main>
    </div>
  );
}
