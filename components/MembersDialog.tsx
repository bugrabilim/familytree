"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { useT } from "@/lib/i18n";
import type { TreeRole } from "@/types/user";

interface MemberRow {
  id: string;
  displayName: string;
  role: TreeRole;
  joinedAt: string;
}
interface InviteRow {
  tokenHash: string;
  role: TreeRole;
  expiresAt: string;
}

interface Props {
  treeName?: string;
  onClose: () => void;
}

/**
 * Yönetici (admin) için üye & davet yönetimi (Madde 13). Davet bağlantısı
 * oluşturur, üyeleri ve bekleyen davetleri listeler/kaldırır. Yetki sunucuda
 * zorlanır; bu yalnızca arayüz.
 */
export default function MembersDialog({ treeName, onClose }: Props) {
  const t = useT();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<TreeRole>("viewer");
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tree/access");
      const data = await res.json();
      if (res.ok) {
        setMembers(data.members ?? []);
        setInvites(data.invites ?? []);
      } else {
        setError(data?.error ?? t("members.loadFailed"));
      }
    } catch {
      setError(t("members.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // Açılışta üyeleri getir (setState ağ isteği sonrası; mount davranışı kasıtlı).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const createInvite = async () => {
    setCreating(true);
    setError("");
    setLink(undefined);
    try {
      const res = await fetch("/api/tree/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("members.createFailed"));
      setLink(`${window.location.origin}/join/${data.token}`);
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const removeMember = async (id: string) => {
    await fetch("/api/tree/access", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: id }),
    });
    void load();
  };

  const revokeInvite = async (tokenHash: string) => {
    await fetch("/api/tree/access", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenHash }),
    });
    void load();
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* pano erişilemezse yoksay */
    }
  };

  const roleBadge = (r: TreeRole) => (
    <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-2 text-text-muted">{t(`role.${r}`)}</span>
  );

  return (
    <Modal title={t("members.title")} subtitle={treeName} onClose={onClose} size="md">
      <div className="space-y-5">
        {/* Davet oluştur */}
        <section className="rounded-xl border border-border p-3.5 bg-surface-2/50">
          <h3 className="text-xs font-semibold text-text mb-2">{t("members.inviteTitle")}</h3>
          <div className="flex items-center gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as TreeRole)}
              className="h-9 px-2 rounded-lg bg-surface border border-border text-sm text-text focus:outline-none focus:border-primary"
            >
              <option value="viewer">{t("role.viewer")}</option>
              <option value="editor">{t("role.editor")}</option>
              <option value="admin">{t("role.admin")}</option>
            </select>
            <Button onClick={createInvite} disabled={creating}>
              {creating ? t("members.creating") : t("members.createInvite")}
            </Button>
          </div>
          {link && (
            <div className="mt-2.5">
              <p className="text-[11px] text-text-subtle mb-1">{t("members.linkHint")}</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-0 h-9 px-2.5 rounded-lg bg-surface border border-border text-xs text-text"
                />
                <button
                  onClick={copyLink}
                  className="h-9 px-3 rounded-lg border border-border text-xs text-text hover:bg-surface-2 transition-colors shrink-0"
                >
                  {copied ? t("members.copied") : t("members.copy")}
                </button>
              </div>
            </div>
          )}
        </section>

        {error && <p className="text-sm text-danger">{error}</p>}

        {/* Üyeler */}
        <section>
          <h3 className="text-xs font-semibold text-text mb-2">{t("members.membersTitle")}</h3>
          {loading ? (
            <p className="text-sm text-text-subtle">{t("members.loading")}</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-text-subtle">{t("members.noMembers")}</p>
          ) : (
            <ul className="space-y-1.5">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                  <span className="text-sm text-text truncate flex items-center gap-2">
                    {m.displayName} {roleBadge(m.role)}
                  </span>
                  <button
                    onClick={() => removeMember(m.id)}
                    className="text-[11px] text-text-subtle hover:text-danger shrink-0"
                  >
                    {t("members.remove")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Bekleyen davetler */}
        {invites.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-text mb-2">{t("members.pendingTitle")}</h3>
            <ul className="space-y-1.5">
              {invites.map((iv) => (
                <li key={iv.tokenHash} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
                  <span className="text-sm text-text flex items-center gap-2">
                    {roleBadge(iv.role)}
                    <span className="text-[11px] text-text-subtle">
                      {t("members.expires", { date: new Date(iv.expiresAt).toLocaleDateString("tr-TR") })}
                    </span>
                  </span>
                  <button
                    onClick={() => revokeInvite(iv.tokenHash)}
                    className="text-[11px] text-text-subtle hover:text-danger shrink-0"
                  >
                    {t("members.revoke")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
