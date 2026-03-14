"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, X, Plus, Users } from "lucide-react";
import type { SchemaMandatoryApprover } from "@/lib/types";

interface MandatoryApproversTabProps {
  schemaId: string;
  isOwner: boolean;
}

interface FolderMember {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export function MandatoryApproversTab({ schemaId, isOwner }: MandatoryApproversTabProps) {
  const [approvers, setApprovers] = useState<SchemaMandatoryApprover[]>([]);
  const [folderMembers, setFolderMembers] = useState<FolderMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/schemas/${schemaId}/mandatory-approvers`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { approvers: [], folderMembers: [] }))
      .then((data) => {
        const approverList = data.approvers ?? [];
        setApprovers(approverList);
        setFolderMembers(data.folderMembers ?? []);
        setSelectedIds(new Set(approverList.map((a: SchemaMandatoryApprover) => a.userId)));
        setHasChanges(false);
      })
      .finally(() => setLoading(false));
  }, [schemaId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleMember = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/schemas/${schemaId}/mandatory-approvers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [...selectedIds] }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setHasChanges(false);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Mandatory Approvers</h3>
          <p className="text-sm text-muted-foreground">
            Select folder members who must approve new datasets created with this schema.
          </p>
        </div>
        {isOwner && hasChanges && (
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Save Changes
          </Button>
        )}
      </div>

      {folderMembers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No folder members found. Add members to the folder first.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Folder Members</CardTitle>
            <CardDescription>
              {selectedIds.size} of {folderMembers.length} members selected as mandatory approvers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {folderMembers.map((member) => {
                const isSelected = selectedIds.has(member.userId);
                return (
                  <li
                    key={member.userId}
                    className={`flex items-center justify-between gap-2 text-sm py-2 px-3 rounded-md cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-primary/10 border border-primary/20"
                        : "bg-muted/50 hover:bg-muted"
                    }`}
                    onClick={() => isOwner && toggleMember(member.userId)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                        {(member.name || member.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{member.name || member.email}</p>
                        {member.name && (
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {member.role}
                      </Badge>
                      {isSelected && (
                        <ShieldCheck className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {approvers.length > 0 && !hasChanges && (
        <div className="text-xs text-muted-foreground">
          Current mandatory approvers: {approvers.map((a) => a.userName || a.userEmail).join(", ")}
        </div>
      )}
    </div>
  );
}
