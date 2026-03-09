"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";

interface Member {
  userId: string;
  email: string;
  name: string;
  role: string;
}

interface InheritedMember extends Member {
  fromFolderName: string;
}

interface ManageAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string;
  folderName: string;
}

const ROLES = [
  { value: "data_engineer", label: "Data Engineer" },
  { value: "viewer", label: "Viewer" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
];

export function ManageAccessDialog({
  open,
  onOpenChange,
  folderId,
  folderName,
}: ManageAccessDialogProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [inheritedMembers, setInheritedMembers] = useState<InheritedMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [adding, setAdding] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!folderId) return;
    setLoading(true);
    setPermissionDenied(false);
    try {
      const res = await fetch(`/api/folders/${folderId}/members`);
      if (res.status === 403) {
        setPermissionDenied(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members ?? []);
        setInheritedMembers(data.inherited ?? []);
      }
    } catch {
      toast.error("Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    if (open) fetchMembers();
  }, [open, fetchMembers]);

  const addMember = async () => {
    const trimmedEmail = newEmail.trim().toLowerCase();
    if (!trimmedEmail) return;

    setAdding(true);
    try {
      const res = await fetch(`/api/folders/${folderId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, role: newRole }),
      });
      if (res.ok) {
        toast.success("Member added");
        setNewEmail("");
        setNewRole("viewer");
        fetchMembers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to add member");
      }
    } catch {
      toast.error("Failed to add member");
    } finally {
      setAdding(false);
    }
  };

  const removeMember = async (userId: string) => {
    try {
      const res = await fetch(`/api/folders/${folderId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        toast.success("Member removed");
        fetchMembers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to remove member");
      }
    } catch {
      toast.error("Failed to remove member");
    }
  };

  const updateRole = async (userId: string, role: string) => {
    try {
      const res = await fetch(`/api/folders/${folderId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (res.ok) {
        toast.success("Role updated");
        fetchMembers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to update role");
      }
    } catch {
      toast.error("Failed to update role");
    }
  };

  const roleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default" as const;
      case "admin":
        return "secondary" as const;
      case "editor":
        return "outline" as const;
      default:
        return "outline" as const;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Manage Access
          </DialogTitle>
          <DialogDescription>
            Manage who has access to <strong>{folderName}</strong>
          </DialogDescription>
        </DialogHeader>

        {permissionDenied ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Shield className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Access Denied</p>
            <p className="text-xs text-muted-foreground">
              You do not have permission to manage access for this folder.
              Contact a folder admin or owner to get access.
            </p>
          </div>
        ) : (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Email address"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMember()}
              className="flex-1"
            />
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={addMember} disabled={adding || !newEmail.trim()} size="sm">
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {members.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Direct Members
                  </h4>
                  {members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{member.name || member.email}</p>
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={member.role}
                          onValueChange={(role) => updateRole(member.userId, role)}
                        >
                          <SelectTrigger className="w-24 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeMember(member.userId)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {inheritedMembers.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Inherited Members
                  </h4>
                  {inheritedMembers.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md opacity-60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{member.name || member.email}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {member.email} &middot; from {member.fromFolderName}
                        </p>
                      </div>
                      <Badge variant={roleBadgeVariant(member.role)} className="text-xs">
                        {member.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {members.length === 0 && inheritedMembers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No members yet. Add someone to get started.
                </p>
              )}
            </div>
          )}
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
