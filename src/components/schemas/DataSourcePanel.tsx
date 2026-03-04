"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, ChevronRight, Database, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SqlCompatibleType } from "@/lib/types";

function mapDbTypeToSchemaType(dbType: string): SqlCompatibleType {
  const t = dbType.toUpperCase();
  if (t.includes("INT")) return "INTEGER";
  if (t.includes("FLOAT") || t.includes("DOUBLE") || t.includes("REAL")) return "FLOAT";
  if (t.includes("NUMERIC") || t.includes("DECIMAL") || t.includes("MONEY")) return "NUMERIC";
  if (t.includes("BOOL")) return "BOOLEAN";
  if (t.includes("TIMESTAMP")) return "TIMESTAMP";
  if (t.includes("DATETIME")) return "DATETIME";
  if (t.includes("DATE")) return "DATE";
  return "STRING";
}

export interface DataSourceEntry {
  id: string;
  name: string;
  type: string;
}

export interface TableEntry {
  schema: string;
  name: string;
}

export interface ColumnEntry {
  name: string;
  type: string;
}

interface DataSourcePanelProps {
  dataSources: DataSourceEntry[];
  dataSourcesLoading: boolean;
  selectedDataSourceId: string;
  onSelectDataSource: (id: string) => void;
  tables: TableEntry[];
  tablesLoading: boolean;
  selectedTable: TableEntry | null;
  onSelectTable: (table: TableEntry) => void;
  columns: ColumnEntry[];
  columnsLoading: boolean;
  onCreateFromDataSource: () => void;
  creating: boolean;
}

export { mapDbTypeToSchemaType };

export function DataSourcePanel({
  dataSources,
  dataSourcesLoading,
  selectedDataSourceId,
  onSelectDataSource,
  tables,
  tablesLoading,
  selectedTable,
  onSelectTable,
  columns,
  columnsLoading,
  onCreateFromDataSource,
  creating,
}: DataSourcePanelProps) {
  return (
    <>
      <DialogHeader className="shrink-0 pb-4">
        <DialogTitle>Connect to Data Source</DialogTitle>
        <DialogDescription>
          Select a data source and table to import its columns as a schema.
        </DialogDescription>
      </DialogHeader>

      {dataSourcesLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading data sources...
        </div>
      ) : dataSources.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Database className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No data sources configured.</p>
            <p className="text-xs mt-1">
              Add a data source in the Data Sources page first.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 gap-4">
          <div className="w-[280px] shrink-0 flex flex-col gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Data Source</label>
              <Select
                value={selectedDataSourceId}
                onValueChange={onSelectDataSource}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a data source..." />
                </SelectTrigger>
                <SelectContent>
                  {dataSources.map((ds) => (
                    <SelectItem key={ds.id} value={ds.id}>
                      <span className="flex items-center gap-2">
                        <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {ds.name}
                        <span className="text-xs text-muted-foreground">
                          ({ds.type})
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedDataSourceId && (
              <div className="flex-1 min-h-0 flex flex-col">
                <label className="text-sm font-medium mb-2 block">
                  Tables
                </label>
                {tablesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading tables...
                  </div>
                ) : tables.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No tables found.
                  </p>
                ) : (
                  <ScrollArea className="flex-1 min-h-0 rounded-md border">
                    <div className="p-1">
                      {tables.map((table) => {
                        const isSelected =
                          selectedTable?.schema === table.schema &&
                          selectedTable?.name === table.name;
                        return (
                          <button
                            key={`${table.schema}.${table.name}`}
                            type="button"
                            className={cn(
                              "flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm text-left transition-colors",
                              isSelected
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-foreground hover:bg-muted",
                            )}
                            onClick={() => onSelectTable(table)}
                          >
                            <ChevronRight
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 transition-transform",
                                isSelected && "rotate-90",
                              )}
                            />
                            <span className="truncate">
                              {table.schema !== "public" && (
                                <span className="text-muted-foreground">
                                  {table.schema}.
                                </span>
                              )}
                              {table.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {columnsLoading ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading columns...
              </div>
            ) : selectedTable && columns.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-base font-semibold">
                      {selectedTable.schema !== "public" && (
                        <span className="text-muted-foreground">
                          {selectedTable.schema}.
                        </span>
                      )}
                      {selectedTable.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {columns.length} columns
                    </p>
                  </div>
                  <Button
                    onClick={onCreateFromDataSource}
                    disabled={creating}
                  >
                    {creating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Use This Table
                  </Button>
                </div>
                <div className="flex-1 min-h-0 rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Column Name</TableHead>
                        <TableHead className="w-[180px]">
                          Database Type
                        </TableHead>
                        <TableHead className="w-[140px]">
                          Schema Type
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {columns.map((col, i) => (
                        <TableRow key={col.name}>
                          <TableCell className="text-muted-foreground">
                            {i + 1}
                          </TableCell>
                          <TableCell className="font-medium">
                            {col.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs font-mono">
                            {col.type}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                              {mapDbTypeToSchemaType(col.type)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Database className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">
                    {selectedDataSourceId
                      ? "Select a table to preview its columns"
                      : "Select a data source to get started"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
