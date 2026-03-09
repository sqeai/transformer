"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Plus, Trash2, Shield, Users } from "lucide-react";
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

const ROLES = [
  { value: "data_engineer", label: "Data Engineer" },
  { value: "viewer", label: "Viewer" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
];

export default function FolderMembersPage() {
  const params = useParams();
  const folderId = params.id as string;
  const [members, setMembers] = useState<Member[]>([]);
  const [inheritedMembers, setInheritedMembers] = useState<InheritedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [adding, setAdding] = useState(false);

  const fetchMembers = useCallback(async () => {
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
    fetchMembers();
  }, [fetchMembers]);

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

  if (permissionDenied) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Members
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage who has access to this folder and its contents
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Shield className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Access Denied</p>
            <p className="text-xs text-muted-foreground">
              You do not have permission to manage access for this folder.
              Contact a folder admin or owner to get access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Members
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage who has access to this folder and its contents
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add Member</CardTitle>
            <CardDescription>
              Invite someone by email address and assign a role
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Email address"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMember()}
                className="flex-1"
              />
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="w-32">
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
              <Button onClick={addMember} disabled={adding || !newEmail.trim()}>
                {adding ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Direct Members ({members.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {members.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No direct members. Add someone above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div
                        key={member.userId}
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {member.name || member.email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Select
                            value={member.role}
                            onValueChange={(role) =>
                              updateRole(member.userId, role)
                            }
                          >
                            <SelectTrigger className="w-28 h-8">
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
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeMember(member.userId)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {inheritedMembers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Sub-Folder Members ({inheritedMembers.length})
                  </CardTitle>
                  <CardDescription>
                    These members exist in sub-folders
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {inheritedMembers.map((member) => (
                      <div
                        key={member.userId}
                        className="flex items-center justify-between py-2 px-3 rounded-lg opacity-60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {member.name || member.email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {member.email} &middot; in{" "}
                            {member.fromFolderName}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {member.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
  );
}
