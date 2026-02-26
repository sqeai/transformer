"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useSchemaStore, flattenFields } from "@/lib/schema-store";
import {
  ArrowLeft,
  Save,
  FileStack,
  Layers,
  CalendarDays,
  ArrowRight,
  User,
  UserPlus,
  Loader2,
  X,
  Trash2,
} from "lucide-react";
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
import FinalSchemaTable from "@/components/FinalSchemaTable";
import type { FinalSchema } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";

export default function SchemaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user } = useAuth();
  const { getSchema, updateSchema, setCurrentSchema, deleteSchema, workflow, schemasLoading } = useSchemaStore();
  const schema = getSchema(id);
  const [name, setName] = useState(schema?.name ?? "");
  const [saved, setSaved] = useState(false);
  const [grants, setGrants] = useState<{ id: string; grantedToUserId: string; grantedAt: string; user: { id: string; email: string; name: string } }[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantEmail, setGrantEmail] = useState("");
  const [granting, setGranting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tableHasUnsavedChanges, setTableHasUnsavedChanges] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const pendingLeaveActionRef = useRef<null | (() => void)>(null);

  const isOwner = !!user && !!schema?.creator && schema.creator.id === user.id;
  const hasUnsavedChanges = useMemo(
    () => tableHasUnsavedChanges || name.trim() !== (schema?.name ?? ""),
    [tableHasUnsavedChanges, name, schema?.name],
  );

  const requestLeave = useCallback((action: () => void) => {
    if (!hasUnsavedChanges) {
      action();
      return;
    }
    pendingLeaveActionRef.current = action;
    setShowLeaveConfirm(true);
  }, [hasUnsavedChanges]);

  const confirmLeave = useCallback(() => {
    const action = pendingLeaveActionRef.current;
    pendingLeaveActionRef.current = null;
    setShowLeaveConfirm(false);
    action?.();
  }, []);

  const cancelLeave = useCallback(() => {
    pendingLeaveActionRef.current = null;
    setShowLeaveConfirm(false);
  }, []);

  const fetchGrants = useCallback(() => {
    if (!id || !isOwner) return;
    setGrantsLoading(true);
    fetch(`/api/schemas/${id}/grants`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { grants: [] }))
      .then((data) => setGrants(Array.isArray(data?.grants) ? data.grants : []))
      .finally(() => setGrantsLoading(false));
  }, [id, isOwner]);

  useEffect(() => {
    if (isOwner) fetchGrants();
  }, [isOwner, fetchGrants]);

  useEffect(() => {
    setName(schema?.name ?? "");
  }, [schema?.id, schema?.name]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!hasUnsavedChanges) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as Element | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href) return;
      if (href.startsWith("#")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const next = `${url.pathname}${url.search}${url.hash}`;
      if (next === current) return;

      event.preventDefault();
      event.stopPropagation();
      requestLeave(() => router.push(next));
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [hasUnsavedChanges, requestLeave, router]);

  if (schemasLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Loader2 className="h-10 w-10 text-muted-foreground animate-spin mb-4" />
          <p className="text-muted-foreground text-lg">Loading schema...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!schema) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileStack className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-lg">Schema not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push("/schemas")}>
            Back to Schemas
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const leafFields = flattenFields(schema.fields).filter((f) => !f.children?.length);
  const createdDate = new Date(schema.createdAt).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const handleUpdateSchema = (schemaId: string, updates: Partial<FinalSchema>) => {
    updateSchema(schemaId, updates);
  };

  const handleSaveName = () => {
    if (name.trim() && name !== schema.name) {
      updateSchema(id, { name: name.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleUseSchema = () => {
    requestLeave(() => {
      setCurrentSchema(id);
      router.push("/upload");
    });
  };

  const handleGrant = async () => {
    const email = grantEmail.trim();
    if (!email || granting) return;
    setGranting(true);
    try {
      const res = await fetch(`/api/schemas/${id}/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to grant access");
      setGrantEmail("");
      fetchGrants();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to grant access");
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (grantedToUserId: string) => {
    const g = grants.find((x) => x.grantedToUserId === grantedToUserId);
    if (!g || revokingId) return;
    setRevokingId(g.id);
    try {
      const res = await fetch(`/api/schemas/${id}/grants/${grantedToUserId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to revoke");
      }
      fetchGrants();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => requestLeave(() => router.push("/schemas"))}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{schema.name}</h1>
              <p className="text-muted-foreground">
                Configure fields, descriptions, ordering, and default values.
              </p>
              {!isOwner && schema.creator && (
                <p className="text-sm text-muted-foreground mt-1">
                  You can edit this schema. Only the creator can delete it.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <Button
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive/50"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete this schema
              </Button>
            )}
            <Button onClick={handleUseSchema}>
              Use This Schema
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Info + Name section */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-xs">
                <Layers className="h-3.5 w-3.5" />
                Total Fields
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{leafFields.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                leaf field{leafFields.length !== 1 ? "s" : ""} in schema
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-xs">
                <CalendarDays className="h-3.5 w-3.5" />
                Created
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{createdDate}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-xs">
                <User className="h-3.5 w-3.5" />
                Creator
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">
                {schema.creator?.name || schema.creator?.email || "—"}
              </p>
              {schema.creator?.email && schema.creator?.name && (
                <p className="text-xs text-muted-foreground">{schema.creator.email}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Schema name editor — owner and grantees can edit */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schema Name</CardTitle>
            <CardDescription>The display name for this schema.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 max-w-md">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Customer Export"
                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
              />
              <Button size="sm" onClick={handleSaveName} disabled={!name.trim() || name === schema.name}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {saved ? "Saved!" : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isOwner && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shared access</CardTitle>
              <CardDescription>
                Grant access so others can see and edit this schema. Only you can delete it or manage access.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Grant access by email</label>
                  <Input
                    type="email"
                    placeholder="colleague@example.com"
                    value={grantEmail}
                    onChange={(e) => setGrantEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleGrant())}
                  />
                </div>
                <Button
                  onClick={handleGrant}
                  disabled={!grantEmail.trim() || granting}
                >
                  {granting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4 mr-1.5" />}
                  Grant access
                </Button>
              </div>
              {grantsLoading ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </p>
              ) : grants.length > 0 ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">People with access</p>
                  <ul className="space-y-1.5">
                    {grants.map((g) => (
                      <li
                        key={g.id}
                        className="flex items-center justify-between gap-2 text-sm py-1.5 px-2 rounded-md bg-muted/50"
                      >
                        <span>
                          {g.user.name || g.user.email || g.grantedToUserId}
                          {g.user.email && <span className="text-muted-foreground ml-1">({g.user.email})</span>}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive h-8 w-8 p-0"
                          onClick={() => handleRevoke(g.grantedToUserId)}
                          disabled={revokingId === g.id}
                        >
                          {revokingId === g.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Fields table — the main content */}
        <FinalSchemaTable
          schema={schema}
          onUpdateSchema={handleUpdateSchema}
          rawRows={workflow.currentSchemaId === id ? workflow.rawRows : []}
          columnMappings={workflow.currentSchemaId === id ? workflow.columnMappings : []}
          readOnly={false}
          onDirtyChange={setTableHasUnsavedChanges}
        />
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this schema?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The schema &quot;{schema.name}&quot; and all its fields will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  setDeleting(true);
                  await deleteSchema(id);
                  setShowDeleteConfirm(false);
                  router.push("/schemas");
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Delete failed");
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showLeaveConfirm} onOpenChange={(open) => (!open ? cancelLeave() : setShowLeaveConfirm(true))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved schema edits. If you leave this page now, your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelLeave}>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeave}>
              Leave without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
