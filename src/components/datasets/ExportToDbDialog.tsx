"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Database, Loader2, Plus, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

const CREATE_NEW_SCHEMA_OPTION = "__create_new_schema__";

interface DataSourceItem {
  id: string;
  name: string;
  type: string;
}

interface ExportTableCandidate {
  schema: string;
  name: string;
  matchedColumns: number;
  requiredColumns: number;
  matchPercent: number;
  compatible: boolean;
}

interface ExportToDbDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowCount: number;
  dataSources: DataSourceItem[];
  loadingDataSources: boolean;
  selectedDataSourceId: string;
  onSelectDataSource: (id: string) => void;
  onFetchDataSources: () => void;
  exportTables: ExportTableCandidate[];
  loadingExportTables: boolean;
  exportTablesError: string | null;
  onLoadExportTables: () => void;
  exportTargetSchema: string;
  onExportTargetSchemaChange: (value: string) => void;
  exportTargetTable: string;
  onExportTargetTableChange: (value: string) => void;
  showCreateTableForm: boolean;
  onToggleCreateTableForm: () => void;
  useNewExportSchema: boolean;
  onUseNewExportSchemaChange: (value: boolean) => void;
  newExportSchemaName: string;
  onNewExportSchemaNameChange: (value: string) => void;
  exportingToDb: boolean;
  onExport: () => void;
}

export function ExportToDbDialog({
  open,
  onOpenChange,
  rowCount,
  dataSources,
  loadingDataSources,
  selectedDataSourceId,
  onSelectDataSource,
  onFetchDataSources,
  exportTables,
  loadingExportTables,
  exportTablesError,
  onLoadExportTables,
  exportTargetSchema,
  onExportTargetSchemaChange,
  exportTargetTable,
  onExportTargetTableChange,
  showCreateTableForm,
  onToggleCreateTableForm,
  useNewExportSchema,
  onUseNewExportSchemaChange,
  newExportSchemaName,
  onNewExportSchemaNameChange,
  exportingToDb,
  onExport,
}: ExportToDbDialogProps) {
  const availableExportSchemas = useMemo(() => {
    const unique = new Set(
      exportTables
        .map((table) => table.schema?.trim())
        .filter((schema): schema is string => Boolean(schema)),
    );
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [exportTables]);

  const resolvedExportTargetSchema = useMemo(() => {
    if (showCreateTableForm && useNewExportSchema) {
      return newExportSchemaName.trim();
    }
    return exportTargetSchema.trim() || "public";
  }, [showCreateTableForm, useNewExportSchema, newExportSchemaName, exportTargetSchema]);

  const createTargetAlreadyExists = useMemo(() => {
    if (!showCreateTableForm) return false;
    const schema = resolvedExportTargetSchema.toLowerCase();
    const table = exportTargetTable.trim().toLowerCase();
    if (!table) return false;
    return exportTables.some(
      (candidate) =>
        candidate.schema.toLowerCase() === schema &&
        candidate.name.toLowerCase() === table,
    );
  }, [showCreateTableForm, resolvedExportTargetSchema, exportTargetTable, exportTables]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Export to Database
          </DialogTitle>
          <DialogDescription>
            Export {rowCount} rows to an external database data source.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Data Source</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingDataSources}
                onClick={onFetchDataSources}
              >
                {loadingDataSources ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Database className="mr-2 h-4 w-4" />
                )}
                {loadingDataSources ? "Loading..." : "Load Connections"}
              </Button>
            </div>
            <Select value={selectedDataSourceId} onValueChange={onSelectDataSource}>
              <SelectTrigger>
                <SelectValue placeholder="Select a data source..." />
              </SelectTrigger>
              <SelectContent>
                {loadingDataSources ? (
                  <SelectItem value="_loading" disabled>
                    Loading connections...
                  </SelectItem>
                ) : dataSources.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    Load connections to choose a data source
                  </SelectItem>
                ) : (
                  dataSources.map((ds) => (
                    <SelectItem key={ds.id} value={ds.id}>
                      <div className="flex w-full items-center gap-2">
                        <Database className="h-3 w-3" />
                        {ds.name}
                        <span className="text-xs text-muted-foreground">
                          ({ds.type})
                        </span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Available Tables</label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!selectedDataSourceId || loadingExportTables}
                  onClick={onLoadExportTables}
                >
                  {loadingExportTables ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="mr-2 h-4 w-4" />
                  )}
                  {loadingExportTables ? "Loading Tables..." : "Load Tables"}
                </Button>
                <Button
                  type="button"
                  variant={showCreateTableForm ? "destructive" : "outline"}
                  size="icon"
                  disabled={!selectedDataSourceId}
                  onClick={onToggleCreateTableForm}
                  title={
                    showCreateTableForm
                      ? "Cancel table creation"
                      : "Create a new table"
                  }
                  aria-label={
                    showCreateTableForm
                      ? "Cancel table creation"
                      : "Create a new table"
                  }
                >
                  {showCreateTableForm ? (
                    <X className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            {showCreateTableForm ? (
              <div className="space-y-3 rounded-md border p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Schema / Dataset
                    </label>
                    <Select
                      value={
                        useNewExportSchema
                          ? CREATE_NEW_SCHEMA_OPTION
                          : exportTargetSchema
                      }
                      onValueChange={(value) => {
                        if (value === CREATE_NEW_SCHEMA_OPTION) {
                          onUseNewExportSchemaChange(true);
                          return;
                        }
                        onUseNewExportSchemaChange(false);
                        onExportTargetSchemaChange(value);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select schema / dataset..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableExportSchemas.length === 0 ? (
                          <SelectItem value={CREATE_NEW_SCHEMA_OPTION}>
                            Create new schema / dataset
                          </SelectItem>
                        ) : (
                          <>
                            {availableExportSchemas.map((schema) => (
                              <SelectItem key={schema} value={schema}>
                                {schema}
                              </SelectItem>
                            ))}
                            <SelectItem value={CREATE_NEW_SCHEMA_OPTION}>
                              + Create new schema / dataset
                            </SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    {useNewExportSchema ? (
                      <Input
                        value={newExportSchemaName}
                        onChange={(e) =>
                          onNewExportSchemaNameChange(e.target.value)
                        }
                        placeholder="new_schema"
                      />
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Table Name</label>
                    <Input
                      value={exportTargetTable}
                      onChange={(e) =>
                        onExportTargetTableChange(e.target.value)
                      }
                      placeholder="my_table"
                    />
                  </div>
                </div>
                {createTargetAlreadyExists ? (
                  <p className="text-sm text-destructive">
                    Table already exists in this schema. Choose a different
                    table name.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="max-h-44 overflow-auto rounded-md border">
                {!selectedDataSourceId ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    Select a data source first.
                  </div>
                ) : loadingExportTables && exportTables.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    Checking table schemas...
                  </div>
                ) : exportTablesError ? (
                  <div className="p-3 text-sm text-destructive">
                    {exportTablesError}
                  </div>
                ) : exportTables.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    No tables found in this data source.
                  </div>
                ) : (
                  <div className="divide-y">
                    {exportTables.map((table) => (
                      <button
                        key={`${table.schema}.${table.name}`}
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors",
                          table.compatible
                            ? "hover:bg-muted/50"
                            : "cursor-not-allowed text-muted-foreground opacity-80",
                          exportTargetSchema === table.schema &&
                            exportTargetTable === table.name
                            ? "bg-primary/10 ring-2 ring-primary/40"
                            : "",
                        )}
                        disabled={!table.compatible}
                        onClick={() => {
                          onExportTargetSchemaChange(table.schema);
                          onExportTargetTableChange(table.name);
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {table.schema}.{table.name}
                        </span>
                        <span className="shrink-0 text-xs">
                          {table.compatible ? (
                            <Badge
                              variant="outline"
                              className="border-green-300 text-green-700 dark:border-green-800 dark:text-green-300"
                            >
                              {table.matchPercent === 100
                                ? "100% Match"
                                : `Compatible (${table.matchPercent}% Match)`}
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              Schema Incompatible
                            </Badge>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onExport}
            disabled={
              exportingToDb ||
              !selectedDataSourceId ||
              !exportTargetTable.trim() ||
              (showCreateTableForm && !resolvedExportTargetSchema.trim()) ||
              createTargetAlreadyExists
            }
          >
            {exportingToDb ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {exportingToDb ? "Exporting..." : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
