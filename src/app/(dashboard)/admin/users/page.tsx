"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  CheckCircle2,
  XCircle,
  UserPlus,
  KeyRound,
  Copy,
  FolderKey,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface UserRecord {
  id: string;
  email: string;
  full_name: string | null;
  is_activated: boolean;
  is_superadmin: boolean;
  created_at: string;
}

interface FolderMembership {
  folderId: string;
  role: string;
  folderName: string;
}

interface FolderOption {
  id: string;
  name: string;
  parent_id: string | null;
}

const ROLES = [
  { value: "viewer", label: "Viewer" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Edit user dialog
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [saving, setSaving] = useState(false);

  // Add user dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addFullName, setAddFullName] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Generated password dialog (shown after add or reset)
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [generatedPasswordEmail, setGeneratedPasswordEmail] = useState("");
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState("");
  const [deleteUserEmail, setDeleteUserEmail] = useState("");

  // Reset password confirmation
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState("");
  const [resetUserEmail, setResetUserEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // Folder access dialog
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [accessUserId, setAccessUserId] = useState("");
  const [accessUserEmail, setAccessUserEmail] = useState("");
  const [accessMemberships, setAccessMemberships] = useState<FolderMembership[]>([]);
  const [allFolders, setAllFolders] = useState<FolderOption[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [newFolderId, setNewFolderId] = useState("");
  const [newFolderRole, setNewFolderRole] = useState("viewer");
  const [addingAccess, setAddingAccess] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/users${params}`);
      if (res.ok) {
        setUsers(await res.json());
      } else if (res.status === 403) {
        toast.error("Access denied. Admin or Owner role required.");
      }
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(loadUsers, 300);
    return () => clearTimeout(timer);
  }, [loadUsers]);

  const updateUser = async (id: string, updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => {
            if (u.id !== id) return u;
            const updated = { ...u };
            if (updates.isActivated !== undefined) updated.is_activated = updates.isActivated as boolean;
            if (updates.isSuperadmin !== undefined) updated.is_superadmin = updates.isSuperadmin as boolean;
            if (updates.fullName !== undefined) updated.full_name = updates.fullName as string;
            return updated;
          }),
        );
        toast.success("User updated");
        setEditUser(null);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update user");
      }
    } catch {
      toast.error("Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  // --- Add User ---
  const handleAddUser = async () => {
    const trimmedEmail = addEmail.trim().toLowerCase();
    const trimmedName = addFullName.trim();
    if (!trimmedEmail || !trimmedName) return;

    setAddLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, fullName: trimmedName }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("User created");
        setAddDialogOpen(false);
        setAddEmail("");
        setAddFullName("");
        setGeneratedPassword(data.generatedPassword);
        setGeneratedPasswordEmail(trimmedEmail);
        setPasswordDialogOpen(true);
        loadUsers();
      } else {
        toast.error(data.error || "Failed to create user");
      }
    } catch {
      toast.error("Failed to create user");
    } finally {
      setAddLoading(false);
    }
  };

  // --- Delete User ---
  const handleDeleteClick = (user: UserRecord) => {
    setDeleteUserId(user.id);
    setDeleteUserEmail(user.email);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    try {
      const res = await fetch(`/api/users/${deleteUserId}`, { method: "DELETE" });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== deleteUserId));
        toast.success("User deleted");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete user");
      }
    } catch {
      toast.error("Failed to delete user");
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  // --- Reset Password ---
  const handleResetClick = (user: UserRecord) => {
    setResetUserId(user.id);
    setResetUserEmail(user.email);
    setResetDialogOpen(true);
  };

  const confirmResetPassword = async () => {
    setResetLoading(true);
    try {
      const res = await fetch(`/api/users/${resetUserId}/reset-password`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Password reset");
        setResetDialogOpen(false);
        setGeneratedPassword(data.generatedPassword);
        setGeneratedPasswordEmail(resetUserEmail);
        setPasswordDialogOpen(true);
      } else {
        toast.error(data.error || "Failed to reset password");
      }
    } catch {
      toast.error("Failed to reset password");
    } finally {
      setResetLoading(false);
    }
  };

  // --- Copy Password ---
  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(generatedPassword);
      toast.success("Password copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  // --- Folder Access ---
  const handleManageAccess = async (user: UserRecord) => {
    setAccessUserId(user.id);
    setAccessUserEmail(user.email);
    setAccessDialogOpen(true);
    setAccessLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}/folders`);
      if (res.ok) {
        const data = await res.json();
        setAccessMemberships(data.memberships ?? []);
        setAllFolders(data.allFolders ?? []);
      }
    } catch {
      toast.error("Failed to load folder access");
    } finally {
      setAccessLoading(false);
    }
  };

  const addFolderAccess = async () => {
    if (!newFolderId) return;
    setAddingAccess(true);
    try {
      const res = await fetch(`/api/users/${accessUserId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: newFolderId, role: newFolderRole }),
      });
      if (res.ok) {
        toast.success("Access granted");
        setNewFolderId("");
        setNewFolderRole("viewer");
        const refreshRes = await fetch(`/api/users/${accessUserId}/folders`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setAccessMemberships(data.memberships ?? []);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to grant access");
      }
    } catch {
      toast.error("Failed to grant access");
    } finally {
      setAddingAccess(false);
    }
  };

  const updateFolderRole = async (folderId: string, role: string) => {
    try {
      const res = await fetch(`/api/users/${accessUserId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, role }),
      });
      if (res.ok) {
        toast.success("Role updated");
        setAccessMemberships((prev) =>
          prev.map((m) => (m.folderId === folderId ? { ...m, role } : m)),
        );
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to update role");
      }
    } catch {
      toast.error("Failed to update role");
    }
  };

  const removeFolderAccess = async (folderId: string) => {
    try {
      const res = await fetch(`/api/users/${accessUserId}/folders`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      if (res.ok) {
        toast.success("Access removed");
        setAccessMemberships((prev) => prev.filter((m) => m.folderId !== folderId));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to remove access");
      }
    } catch {
      toast.error("Failed to remove access");
    }
  };

  const getFolderDisplayName = (folder: FolderOption): string => {
    if (!folder.parent_id) return folder.name;
    const parent = allFolders.find((f) => f.id === folder.parent_id);
    if (parent) return `${parent.name} / ${folder.name}`;
    return folder.name;
  };

  const assignedFolderIds = new Set(accessMemberships.map((m) => m.folderId));
  const availableFolders = allFolders.filter((f) => !assignedFolderIds.has(f.id));

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Users className="h-6 w-6" />
              User Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage users, roles, passwords, and folder access
            </p>
          </div>
          <Button onClick={() => setAddDialogOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or name..."
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No users found</h3>
            </CardContent>
          </Card>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">User</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Role</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Joined</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{user.full_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full",
                          user.is_activated
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                        )}
                      >
                        {user.is_activated ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {user.is_activated ? "Active" : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.is_superadmin ? (
                        <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                          <ShieldCheck className="h-3 w-3" />
                          Superadmin
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">User</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleManageAccess(user)}
                          title="Manage folder access"
                        >
                          <FolderKey className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleResetClick(user)}
                          title="Reset password"
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditUser(user)}
                          title="Edit user"
                        >
                          <UserCog className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteClick(user)}
                          title="Delete user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input value={editUser.email} disabled className="bg-muted/50" />
              </div>
              <div>
                <Label>Full Name</Label>
                <Input
                  value={editUser.full_name || ""}
                  onChange={(e) =>
                    setEditUser((u) => (u ? { ...u, full_name: e.target.value } : u))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  <Label>Activated</Label>
                </div>
                <Switch
                  checked={editUser.is_activated}
                  onCheckedChange={(checked: boolean) =>
                    setEditUser((u) => (u ? { ...u, is_activated: checked } : u))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <Label>Superadmin</Label>
                </div>
                <Switch
                  checked={editUser.is_superadmin}
                  onCheckedChange={(checked: boolean) =>
                    setEditUser((u) => (u ? { ...u, is_superadmin: checked } : u))
                  }
                />
              </div>
              <Button
                onClick={() =>
                  updateUser(editUser.id, {
                    fullName: editUser.full_name,
                    isActivated: editUser.is_activated,
                    isSuperadmin: editUser.is_superadmin,
                  })
                }
                disabled={saving}
                className="w-full"
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Add New User
            </DialogTitle>
            <DialogDescription>
              A random password will be generated. Share it with the user securely.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddUser()}
              />
            </div>
            <div>
              <Label>Full Name</Label>
              <Input
                placeholder="John Doe"
                value={addFullName}
                onChange={(e) => setAddFullName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddUser()}
              />
            </div>
            <Button
              onClick={handleAddUser}
              disabled={addLoading || !addEmail.trim() || !addFullName.trim()}
              className="w-full"
            >
              {addLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create User
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Generated Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Generated Password
            </DialogTitle>
            <DialogDescription>
              Password for <strong>{generatedPasswordEmail}</strong>. Copy and share it securely — it will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                value={generatedPassword}
                readOnly
                className="font-mono text-sm bg-muted/50"
              />
              <Button variant="outline" size="icon" onClick={copyPassword} title="Copy password">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This password is only shown once. Make sure to copy it before closing this dialog.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteUserEmail}</strong> and remove all their folder memberships. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Confirmation */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset password?</AlertDialogTitle>
            <AlertDialogDescription>
              This will generate a new random password for <strong>{resetUserEmail}</strong>. Their current password will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResetPassword} disabled={resetLoading}>
              {resetLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reset Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Folder Access Dialog */}
      <Dialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderKey className="h-5 w-5" />
              Folder Access
            </DialogTitle>
            <DialogDescription>
              Manage folder access for <strong>{accessUserEmail}</strong>
            </DialogDescription>
          </DialogHeader>

          {accessLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {availableFolders.length > 0 && (
                <div className="flex gap-2">
                  <Select value={newFolderId} onValueChange={setNewFolderId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select folder..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFolders.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {getFolderDisplayName(f)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={newFolderRole} onValueChange={setNewFolderRole}>
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
                  <Button
                    onClick={addFolderAccess}
                    disabled={addingAccess || !newFolderId}
                    size="sm"
                  >
                    {addingAccess ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}

              {accessMemberships.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No folder access assigned yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {accessMemberships.map((m) => (
                    <div
                      key={m.folderId}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50"
                    >
                      <p className="text-sm font-medium truncate flex-1 min-w-0">
                        {m.folderName}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={m.role}
                          onValueChange={(role) => updateFolderRole(m.folderId, role)}
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
                          onClick={() => removeFolderAccess(m.folderId)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
