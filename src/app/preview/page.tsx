"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useSchemaStore } from "@/lib/schema-store";
import { ArrowRight } from "lucide-react";

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const p of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  return current;
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = (current[key] as Record<string, unknown>) ?? {};
    current[key] = next;
    current = next;
  }
  current[parts[parts.length - 1]!] = value;
}

export default function PreviewPage() {
  const router = useRouter();
  const { workflow, getSchema } = useSchemaStore();
  const { rawRows, columnMappings, currentSchemaId } = workflow;
  const schema = currentSchemaId ? getSchema(currentSchemaId) : null;

  const previewRows = useMemo(() => {
    const map: Record<string, string> = {};
    columnMappings.forEach((m) => {
      map[m.targetPath] = m.rawColumn;
    });
    return rawRows.map((raw) => {
      const out: Record<string, unknown> = {};
      columnMappings.forEach((m) => {
        const rawVal = raw[m.rawColumn];
        setByPath(out, m.targetPath, rawVal);
      });
      return out;
    });
  }, [rawRows, columnMappings]);

  const previewColumns = useMemo(() => {
    const cols = new Set<string>();
    columnMappings.forEach((m) => cols.add(m.targetPath));
    return Array.from(cols).sort();
  }, [columnMappings]);

  if (!schema || rawRows.length === 0) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>No data to preview</CardTitle>
            <CardDescription>
              Upload raw data and define mappings first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/upload")}>
              Upload data
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Preview</h1>
            <p className="text-muted-foreground">
              Mapped output ({previewRows.length} rows). Proceed to export.
            </p>
          </div>
          <Button onClick={() => router.push("/export")}>
            Export
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Mapped data</CardTitle>
            <CardDescription>
              Schema: {schema.name}. Columns: {previewColumns.join(", ")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    {previewColumns.map((col) => (
                      <TableHead key={col}>{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.slice(0, 50).map((row, i) => (
                    <TableRow key={i}>
                      {previewColumns.map((col) => (
                        <TableCell key={col}>
                          {String(getByPath(row as Record<string, unknown>, col) ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            {previewRows.length > 50 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Showing first 50 of {previewRows.length} rows.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
