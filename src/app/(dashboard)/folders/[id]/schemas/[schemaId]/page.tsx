"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSchemaStore, type UploadedFileEntry } from "@/lib/schema-store";
import {
  ArrowLeft,
  FileStack,
  ArrowRight,
  Loader2,
  Trash2,
  Pencil,
  Check,
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
import { UploadDatasetDialog } from "@/components/UploadDatasetDialog";
import type { FinalSchema } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { OverviewTab } from "@/components/schemas/OverviewTab";
import { ContextTab } from "@/components/schemas/ContextTab";
import { MandatoryApproversTab } from "@/components/schemas/MandatoryApproversTab";
import { DataSourceTab } from "@/components/schemas/DataSourceTab";
import { DatasetsTab } from "@/components/schemas/DatasetsTab";
import { TransformationsTab } from "@/components/schemas/TransformationsTab";
import { cn } from "@/lib/utils";

type TabId = "overview" | "context" | "approvers" | "data-source" | "transformations" | "datasets";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "context", label: "Context" },
  { id: "approvers", label: "Mandatory Approvers" },
  { id: "data-source", label: "Data Source" },
  { id: "transformations", label: "Transformations" },
  { id: "datasets", label: "Datasets" },
];

export default function SchemaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const schemaId = params.schemaId as string;
  const { user } = useAuth();
  const { getSchema, updateSchema, deleteSchema, schemasLoading, setDatasetWorkflow, resetDatasetWorkflow } = useSchemaStore();
  const schema = getSchema(schemaId);
  const [name, setName] = useState(schema?.name ?? "");
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tableHasUnsavedChanges, setTableHasUnsavedChanges] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const pendingLeaveActionRef = useRef<null | (() => void)>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [hasDataSource, setHasDataSource] = useState(false);

  const { can } = usePermissions(folderId);
  const isOwner = !!user && !!schema?.creator && schema.creator.id === user.id;
  const canEditSchemas = can("edit_schemas");
  const hasUnsavedChanges = useMemo(
    () => tableHasUnsavedChanges || name.trim() !== (schema?.name ?? ""),
    [tableHasUnsavedChanges, name, schema?.name],
  );

  const schemasListUrl = `/folders/${folderId}/schemas`;

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

  useEffect(() => {
    if (!schemaId) return;
    fetch(`/api/schemas/${schemaId}/data-source`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { dataSource: null }))
      .then((data) => setHasDataSource(!!data.dataSource));
  }, [schemaId]);

  const handleUploadFromDialog = useCallback(
    (uploadSchemaId: string, files: UploadedFileEntry[]) => {
      resetDatasetWorkflow();
      setDatasetWorkflow({
        schemaId: uploadSchemaId,
        step: "upload",
        files,
        selectedFiles: [],
      });
      router.push(`/folders/${folderId}/schemas/${uploadSchemaId}/datasets/new?schemaId=${uploadSchemaId}`);
    },
    [resetDatasetWorkflow, setDatasetWorkflow, router, folderId],
  );

  if (schemasLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 className="h-10 w-10 text-muted-foreground animate-spin mb-4" />
        <p className="text-muted-foreground text-lg">Loading schema...</p>
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileStack className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground text-lg">Schema not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push(schemasListUrl)}>
          Go Back
        </Button>
      </div>
    );
  }

  const handleUpdateSchema = (sid: string, updates: Partial<FinalSchema>) => {
    updateSchema(sid, updates);
  };

  const handleSaveName = () => {
    if (name.trim() && name !== schema.name) {
      updateSchema(schemaId, { name: name.trim() });
    }
    setIsEditingName(false);
  };

  const handleCancelRename = () => {
    setName(schema?.name ?? "");
    setIsEditingName(false);
  };

  const startEditing = () => {
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const handleUseSchema = () => {
    setShowUploadDialog(true);
  };

  return (
    <>
      <div className="space-y-6 animate-fade-in pb-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => requestLeave(() => router.push(schemasListUrl))}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      ref={nameInputRef}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveName();
                        if (e.key === "Escape") handleCancelRename();
                      }}
                      onBlur={handleSaveName}
                      className="text-3xl font-bold tracking-tight h-auto py-0.5 px-1.5 max-w-md"
                      placeholder="Schema name"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onMouseDown={(e) => { e.preventDefault(); handleSaveName(); }}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <h1 className="text-3xl font-bold tracking-tight">{schema.name}</h1>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={startEditing}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
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
            <Button
              onClick={handleUseSchema}
              disabled={!hasDataSource}
            >
              {hasDataSource ? "Create new dataset using this schema" : "Configure data source before proceeding"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 border-b pb-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "px-4 py-2 text-sm rounded-md transition-colors",
                activeTab === tab.id
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <OverviewTab
            schema={schema}
            isOwner={isOwner}
            schemaId={schemaId}
            onUpdateSchema={handleUpdateSchema}
            onDirtyChange={setTableHasUnsavedChanges}
            hasDataSource={hasDataSource}
          />
        )}
        {activeTab === "context" && (
          <ContextTab
            schemaId={schemaId}
            isOwner={isOwner}
            folderId={folderId}
          />
        )}
        {activeTab === "approvers" && (
          <MandatoryApproversTab
            schemaId={schemaId}
            isOwner={isOwner}
          />
        )}
        {activeTab === "data-source" && (
          <DataSourceTab
            schemaId={schemaId}
            isOwner={isOwner}
            onDataSourceChange={setHasDataSource}
          />
        )}
        {activeTab === "transformations" && (
          <TransformationsTab
            schemaId={schemaId}
            isOwner={isOwner}
            canEdit={canEditSchemas}
          />
        )}
        {activeTab === "datasets" && (
          <DatasetsTab schemaId={schemaId} folderId={folderId} />
        )}
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
                  await deleteSchema(schemaId);
                  setShowDeleteConfirm(false);
                  router.push(schemasListUrl);
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

      <UploadDatasetDialog
        open={showUploadDialog}
        onOpenChange={setShowUploadDialog}
        defaultSchemaId={schemaId}
        onUpload={handleUploadFromDialog}
      />
    </>
  );
}
