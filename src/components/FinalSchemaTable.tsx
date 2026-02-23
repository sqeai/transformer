"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  GripVertical,
  TableProperties,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
} from "lucide-react";
import type { SchemaField, FinalSchema } from "@/lib/types";

interface FinalSchemaTableProps {
  schema: FinalSchema;
  onUpdateSchema: (id: string, updates: Partial<FinalSchema>) => void;
  rawRows?: Record<string, unknown>[];
  columnMappings?: { rawColumn: string; targetPath: string }[];
}

interface FlatField {
  field: SchemaField;
  path: string;
}

function flattenWithPath(fields: SchemaField[], prefix = ""): FlatField[] {
  const out: FlatField[] = [];
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  for (const f of sorted) {
    const path = prefix ? `${prefix}.${f.name}` : f.name;
    out.push({ field: f, path });
    if (f.children?.length) {
      out.push(...flattenWithPath(f.children, path));
    }
  }
  return out;
}

function rebuildFields(flat: FlatField[]): SchemaField[] {
  const root: SchemaField[] = [];
  const pathToNode = new Map<string, SchemaField>();

  for (let order = 0; order < flat.length; order++) {
    const { field, path } = flat[order];
    const parts = path.split(".");
    const name = parts[parts.length - 1];
    const level = parts.length - 1;

    const node: SchemaField = {
      ...field,
      name,
      path,
      level,
      order,
      children: [],
    };

    pathToNode.set(path, node);

    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join(".");
      const parent = pathToNode.get(parentPath);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      } else {
        root.push(node);
      }
    }
  }

  return root;
}

function SortableRow({
  item,
  index,
  onRename,
  onDescriptionChange,
  onDefaultValueChange,
  onRemove,
}: {
  item: FlatField;
  index: number;
  onRename: (index: number, name: string) => void;
  onDescriptionChange: (index: number, desc: string) => void;
  onDefaultValueChange: (index: number, val: string) => void;
  onRemove: (index: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className="group">
      <TableCell className="w-8 px-1">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none p-1 rounded hover:bg-muted"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground font-mono w-8 text-center">
        {index + 1}
      </TableCell>
      <TableCell className="p-1">
        <Input
          value={item.field.name}
          onChange={(e) => onRename(index, e.target.value)}
          className="h-7 text-xs border-transparent bg-transparent hover:border-border focus:border-border shadow-none"
        />
      </TableCell>
      <TableCell className="p-1">
        <Input
          value={item.field.description ?? ""}
          onChange={(e) => onDescriptionChange(index, e.target.value)}
          placeholder="No description"
          className="h-7 text-xs border-transparent bg-transparent hover:border-border focus:border-border shadow-none"
        />
      </TableCell>
      <TableCell className="p-1">
        <Input
          value={item.field.defaultValue ?? ""}
          onChange={(e) => onDefaultValueChange(index, e.target.value)}
          placeholder="—"
          className="h-7 text-xs border-transparent bg-transparent hover:border-border focus:border-border shadow-none"
        />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]" title={item.path}>
        {item.path}
      </TableCell>
      <TableCell className="w-8 px-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(index)}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function DataPreviewSection({
  flat,
  rawRows,
  columnMappings,
}: {
  flat: FlatField[];
  rawRows: Record<string, unknown>[];
  columnMappings: { rawColumn: string; targetPath: string }[];
}) {
  const PREVIEW_ROWS = 10;

  const pathToRawColumn = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of columnMappings) {
      map.set(m.targetPath, m.rawColumn);
    }
    return map;
  }, [columnMappings]);

  const leafFields = useMemo(
    () => flat.filter((f) => !f.field.children?.length),
    [flat],
  );

  const previewData = useMemo(() => {
    const rows = rawRows.slice(0, PREVIEW_ROWS);
    return rows.map((rawRow) => {
      const mapped: Record<string, string> = {};
      for (const leaf of leafFields) {
        const rawCol = pathToRawColumn.get(leaf.path);
        if (rawCol && rawCol in rawRow) {
          mapped[leaf.path] = String(rawRow[rawCol] ?? "");
        } else if (leaf.field.defaultValue) {
          mapped[leaf.path] = leaf.field.defaultValue;
        } else {
          mapped[leaf.path] = "";
        }
      }
      return mapped;
    });
  }, [rawRows, leafFields, pathToRawColumn]);

  if (rawRows.length === 0 || leafFields.length === 0) return null;

  return (
    <div className="mt-3 rounded-md border overflow-auto max-h-[280px]">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-10 text-center text-[10px] text-muted-foreground/60 font-mono">
              #
            </TableHead>
            {leafFields.map((f) => (
              <TableHead
                key={f.field.id}
                className="text-xs whitespace-nowrap max-w-[160px] truncate"
                title={f.path}
              >
                {f.field.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {previewData.map((row, ri) => (
            <TableRow key={ri}>
              <TableCell className="text-center text-[10px] text-muted-foreground/60 font-mono py-1.5">
                {ri + 1}
              </TableCell>
              {leafFields.map((f) => (
                <TableCell
                  key={f.field.id}
                  className="py-1.5 text-xs whitespace-nowrap max-w-[160px] truncate"
                  title={row[f.path] || undefined}
                >
                  {row[f.path] || (
                    <span className="text-muted-foreground/30 italic">empty</span>
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {rawRows.length > PREVIEW_ROWS && (
            <TableRow>
              <TableCell
                colSpan={leafFields.length + 1}
                className="text-center text-xs text-muted-foreground py-2"
              >
                …and {rawRows.length - PREVIEW_ROWS} more row{rawRows.length - PREVIEW_ROWS !== 1 ? "s" : ""}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default function FinalSchemaTable({
  schema,
  onUpdateSchema,
  rawRows = [],
  columnMappings = [],
}: FinalSchemaTableProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const schemaFlat = useMemo(() => flattenWithPath(schema.fields), [schema.fields]);
  const [draftFlat, setDraftFlat] = useState<FlatField[] | null>(null);
  const flat = draftFlat ?? schemaFlat;

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingCommitRef = useRef<FlatField[] | null>(null);
  const DEBOUNCE_MS = 500;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const commitFields = useCallback(
    (newFlat: FlatField[]) => {
      const fields = rebuildFields(newFlat);
      onUpdateSchema(schema.id, { fields });
    },
    [schema.id, onUpdateSchema],
  );

  const flushCommit = useCallback(() => {
    if (pendingCommitRef.current) {
      const toCommit = pendingCommitRef.current;
      pendingCommitRef.current = null;
      commitFields(toCommit);
    }
  }, [commitFields]);

  const debouncedCommit = useCallback(
    (next: FlatField[]) => {
      pendingCommitRef.current = next;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = undefined;
        flushCommit();
      }, DEBOUNCE_MS);
    },
    [flushCommit],
  );

  const cancelDebounceAndCommit = useCallback(
    (next: FlatField[]) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = undefined;
      pendingCommitRef.current = null;
      setDraftFlat(next);
      commitFields(next);
    },
    [commitFields],
  );

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  useEffect(() => {
    setDraftFlat(null);
    pendingCommitRef.current = null;
    clearTimeout(debounceRef.current);
    debounceRef.current = undefined;
  }, [schema.id]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = flat.findIndex((f) => f.field.id === active.id);
      const newIdx = flat.findIndex((f) => f.field.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      const reordered = arrayMove([...flat], oldIdx, newIdx);
      cancelDebounceAndCommit(reordered);
    },
    [flat, cancelDebounceAndCommit],
  );

  const handleRename = useCallback(
    (index: number, newName: string) => {
      const next = flat.map((item, i) => {
        if (i !== index) return item;
        const basePath = item.path.split(".").slice(0, -1).join(".");
        return {
          field: { ...item.field, name: newName },
          path: basePath ? `${basePath}.${newName}` : newName,
        };
      });
      setDraftFlat(next);
      debouncedCommit(next);
    },
    [flat, debouncedCommit],
  );

  const handleDescriptionChange = useCallback(
    (index: number, desc: string) => {
      const next = flat.map((item, i) =>
        i === index ? { ...item, field: { ...item.field, description: desc } } : item,
      );
      setDraftFlat(next);
      debouncedCommit(next);
    },
    [flat, debouncedCommit],
  );

  const handleDefaultValueChange = useCallback(
    (index: number, val: string) => {
      const next = flat.map((item, i) =>
        i === index ? { ...item, field: { ...item.field, defaultValue: val } } : item,
      );
      setDraftFlat(next);
      debouncedCommit(next);
    },
    [flat, debouncedCommit],
  );

  const handleRemove = useCallback(
    (index: number) => {
      const next = flat.filter((_, i) => i !== index);
      cancelDebounceAndCommit(next);
    },
    [flat, cancelDebounceAndCommit],
  );

  const handleAddField = useCallback(() => {
    const newField: SchemaField = {
      id: crypto.randomUUID(),
      name: `field_${flat.length + 1}`,
      path: `field_${flat.length + 1}`,
      level: 0,
      order: flat.length,
    };
    cancelDebounceAndCommit([...flat, { field: newField, path: newField.name }]);
  }, [flat, cancelDebounceAndCommit]);

  const itemIds = useMemo(() => flat.map((f) => f.field.id), [flat]);

  const hasPreviewData = rawRows.length > 0 && columnMappings.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <TableProperties className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-base truncate">
                {schema.name}
              </CardTitle>
              <CardDescription className="text-xs">
                {flat.length} field{flat.length !== 1 ? "s" : ""} — drag to reorder, click to edit
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {hasPreviewData && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setShowPreview((p) => !p)}
                title={showPreview ? "Hide data preview" : "Show data preview"}
              >
                {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-0">
          <div className="rounded-md border overflow-auto">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="w-8 px-1" />
                      <TableHead className="w-8 text-center text-[10px]">#</TableHead>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs">Default</TableHead>
                      <TableHead className="text-xs">Path</TableHead>
                      <TableHead className="w-8 px-1" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flat.map((item, index) => (
                      <SortableRow
                        key={item.field.id}
                        item={item}
                        index={index}
                        onRename={handleRename}
                        onDescriptionChange={handleDescriptionChange}
                        onDefaultValueChange={handleDefaultValueChange}
                        onRemove={handleRemove}
                      />
                    ))}
                  </TableBody>
                </Table>
              </SortableContext>
            </DndContext>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            onClick={handleAddField}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Field
          </Button>

          {hasPreviewData && showPreview && (
            <DataPreviewSection
              flat={flat}
              rawRows={rawRows}
              columnMappings={columnMappings}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}
