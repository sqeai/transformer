"use client";

import { useCallback, useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSchemaStore } from "@/lib/schema-store";
import type { SchemaField } from "@/lib/types";
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  ArrowLeft,
  GripVertical,
  Save,
  ChevronRight,
} from "lucide-react";

function flattenWithPath(fields: SchemaField[], prefix = ""): { field: SchemaField; path: string }[] {
  const out: { field: SchemaField; path: string }[] = [];
  fields
    .sort((a, b) => a.order - b.order)
    .forEach((f) => {
      const path = prefix ? `${prefix}.${f.name}` : f.name;
      out.push({ field: f, path });
      if (f.children?.length) {
        out.push(...flattenWithPath(f.children, path));
      }
    });
  return out;
}

function buildFieldsFromFlat(
  flat: { field: SchemaField; path: string }[],
): SchemaField[] {
  const root: SchemaField[] = [];
  const pathToNode = new Map<string, SchemaField>();

  function ensureParent(pathParts: string[], orderOffset: number): SchemaField | null {
    if (pathParts.length === 0) return null;
    const path = pathParts.join(".");
    let node = pathToNode.get(path);
    if (node) return node;
    const name = pathParts[pathParts.length - 1]!;
    node = {
      id: crypto.randomUUID(),
      name,
      path,
      level: pathParts.length - 1,
      order: orderOffset,
      children: [],
    };
    pathToNode.set(path, node);
    if (pathParts.length === 1) {
      root.push(node);
    } else {
      const parent = ensureParent(pathParts.slice(0, -1), orderOffset);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      } else {
        root.push(node);
      }
    }
    return node;
  }

  flat.forEach(({ field, path }, order) => {
    const parts = path.split(".");
    const name = parts[parts.length - 1]!;
    const level = parts.length - 1;
    const node: SchemaField = {
      ...field,
      name,
      path,
      level,
      order,
      children: [],
    };

    if (parts.length === 1) {
      const existing = pathToNode.get(path);
      if (existing) {
        Object.assign(existing, node);
        existing.children = [];
      } else {
        pathToNode.set(path, node);
        root.push(node);
      }
    } else {
      ensureParent(parts.slice(0, -1), order);
      const parentPath = parts.slice(0, -1).join(".");
      const parent = pathToNode.get(parentPath);
      pathToNode.set(path, node);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      } else {
        root.push(node);
      }
    }
  });

  const sortByOrder = (arr: SchemaField[]) => arr.sort((a, b) => a.order - b.order);
  sortByOrder(root);
  root.forEach((f) => f.children?.length && sortByOrder(f.children));
  return root;
}

export default function EditSchemaPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { getSchema, updateSchema } = useSchemaStore();
  const schema = getSchema(id);
  const [name, setName] = useState(schema?.name ?? "");
  const [flat, setFlat] = useState<{ field: SchemaField; path: string }[]>(() =>
    schema ? flattenWithPath(schema.fields) : [],
  );

  const move = useCallback((index: number, delta: number) => {
    setFlat((prev) => {
      const next = [...prev];
      const ni = index + delta;
      if (ni < 0 || ni >= next.length) return prev;
      [next[index], next[ni]] = [next[ni], next[index]];
      return next;
    });
  }, []);

  const rename = useCallback((index: number, newName: string) => {
    setFlat((prev) => {
      const next = [...prev];
      const item = next[index];
      const basePath = item.path.split(".").slice(0, -1).join(".");
      item.field = { ...item.field, name: newName };
      item.path = basePath ? `${basePath}.${newName}` : newName;
      return next;
    });
  }, []);

  const indent = useCallback((index: number) => {
    setFlat((prev) => {
      if (index <= 0) return prev;
      const next = [...prev];
      const curr = next[index];
      const prevPath = next[index - 1].path;
      curr.path = `${prevPath}.${curr.field.name}`;
      curr.field = { ...curr.field, level: next[index - 1].field.level + 1 };
      return next;
    });
  }, []);

  const outdent = useCallback((index: number) => {
    setFlat((prev) => {
      const next = [...prev];
      const curr = next[index];
      const parts = curr.path.split(".");
      if (parts.length <= 1) return prev;
      curr.path = parts.slice(0, -1).join(".");
      curr.field = { ...curr.field, level: Math.max(0, curr.field.level - 1) };
      return next;
    });
  }, []);

  const save = useCallback(() => {
    const fields = buildFieldsFromFlat(flat);
    updateSchema(id, { name: name || schema?.name || "Schema", fields });
    router.push("/schemas");
  }, [id, name, schema?.name, flat, updateSchema, router]);

  if (!schema) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Schema not found.</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push("/schemas")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Edit schema</h1>
              <p className="text-muted-foreground">
                Reorder, rename, and nest fields. Then save.
              </p>
            </div>
          </div>
          <Button onClick={save}>
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Schema name</CardTitle>
            <CardDescription>Name of this final schema.</CardDescription>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer Export"
              className="max-w-sm"
            />
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fields</CardTitle>
            <CardDescription>
              Drag order with up/down. Use indent/outdent to nest.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] rounded-md border p-2">
              <div className="space-y-1">
                {flat.map(({ field, path }, index) => (
                  <div
                    key={field.id}
                    className="flex items-center gap-2 rounded-md border bg-card px-3 py-2"
                    style={{ paddingLeft: 12 + field.level * 20 }}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Input
                      value={field.name}
                      onChange={(e) => rename(index, e.target.value)}
                      className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
                    />
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {path}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => move(index, 1)}
                        disabled={index === flat.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => indent(index)}
                        disabled={index === 0}
                        title="Indent (nest under above)"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => outdent(index)}
                        disabled={field.level === 0}
                        title="Outdent"
                      >
                        <ChevronRight className="h-4 w-4 rotate-180" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
