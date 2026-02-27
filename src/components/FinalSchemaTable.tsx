"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GripVertical,
  TableProperties,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { SQL_COMPATIBLE_TYPES, type SchemaField, type FinalSchema, type SqlCompatibleType } from "@/lib/types";

interface FinalSchemaTableProps {
  schema: FinalSchema;
  onUpdateSchema: (id: string, updates: Partial<FinalSchema>) => void;
  rawRows?: Record<string, unknown>[];
  columnMappings?: { rawColumn: string; targetPath: string }[];
  /** When true, fields are read-only (e.g. for shared access). */
  readOnly?: boolean;
  /** Emits whether there are unsaved field edits in this table. */
  onDirtyChange?: (dirty: boolean) => void;
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
  onDataTypeChange,
  onRemove,
  readOnly = false,
}: {
  item: FlatField;
  index: number;
  onRename: (index: number, name: string) => void;
  onDescriptionChange: (index: number, desc: string) => void;
  onDefaultValueChange: (index: number, val: string) => void;
  onDataTypeChange: (index: number, dataType: SqlCompatibleType) => void;
  onRemove: (index: number) => void;
  readOnly?: boolean;
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
        {!readOnly && (
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing touch-none p-1 rounded hover:bg-muted"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground font-mono w-8 text-center">
        {index + 1}
      </TableCell>
      <TableCell className="p-1">
        <Input
          value={item.field.name}
          onChange={(e) => onRename(index, e.target.value)}
          readOnly={readOnly}
          className="h-7 text-xs border-transparent bg-transparent hover:border-border focus:border-border shadow-none"
        />
      </TableCell>
      <TableCell className="p-1">
        <Input
          value={item.field.description ?? ""}
          onChange={(e) => onDescriptionChange(index, e.target.value)}
          placeholder="No description"
          readOnly={readOnly}
          className="h-7 text-xs border-transparent bg-transparent hover:border-border focus:border-border shadow-none"
        />
      </TableCell>
      <TableCell className="p-1">
        <Select
          value={item.field.dataType ?? "STRING"}
          onValueChange={(value) => onDataTypeChange(index, value as SqlCompatibleType)}
          disabled={readOnly}
        >
          <SelectTrigger className="h-7 text-xs border-transparent bg-transparent hover:border-border focus:border-border shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SQL_COMPATIBLE_TYPES.map((sqlType) => (
              <SelectItem key={sqlType} value={sqlType} className="text-xs">
                {sqlType}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="p-1">
        <Input
          value={item.field.defaultValue ?? ""}
          onChange={(e) => onDefaultValueChange(index, e.target.value)}
          placeholder="—"
          readOnly={readOnly}
          className="h-7 text-xs border-transparent bg-transparent hover:border-border focus:border-border shadow-none"
        />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]" title={item.path}>
        {item.path}
      </TableCell>
      <TableCell className="w-8 px-1">
        {!readOnly && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(index)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
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
  readOnly = false,
  onDirtyChange,
}: FinalSchemaTableProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const schemaFlat = useMemo(() => flattenWithPath(schema.fields), [schema.fields]);
  const [draftFlat, setDraftFlat] = useState<FlatField[] | null>(null);
  const flat = isEditing && draftFlat ? draftFlat : schemaFlat;
  const tableReadOnly = readOnly || !isEditing;
  const hasDraftChanges = useMemo(() => {
    if (!isEditing || !draftFlat) return false;
    if (draftFlat.length !== schemaFlat.length) return true;
    for (let i = 0; i < draftFlat.length; i++) {
      const draft = draftFlat[i];
      const current = schemaFlat[i];
      if (!current) return true;
      if (draft.path !== current.path) return true;
      if (draft.field.name !== current.field.name) return true;
      if ((draft.field.description ?? "") !== (current.field.description ?? "")) return true;
      if ((draft.field.dataType ?? "STRING") !== (current.field.dataType ?? "STRING")) return true;
      if ((draft.field.defaultValue ?? "") !== (current.field.defaultValue ?? "")) return true;
    }
    return false;
  }, [isEditing, draftFlat, schemaFlat]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const commitFields = useCallback(
    (newFlat: FlatField[]) => {
      if (readOnly) return;
      const fields = rebuildFields(newFlat);
      onUpdateSchema(schema.id, { fields });
    },
    [schema.id, onUpdateSchema, readOnly],
  );

  useEffect(() => {
    setDraftFlat(null);
    setIsEditing(false);
  }, [schema.id]);

  useEffect(() => {
    onDirtyChange?.(hasDraftChanges);
  }, [hasDraftChanges, onDirtyChange]);

  const handleStartEdit = useCallback(() => {
    setDraftFlat(
      schemaFlat.map(({ field, path }) => ({
        field: { ...field },
        path,
      })),
    );
    setIsEditing(true);
  }, [schemaFlat]);

  const handleCancelEdit = useCallback(() => {
    setDraftFlat(null);
    setIsEditing(false);
  }, []);

  const handleSave = useCallback(() => {
    if (readOnly || !draftFlat) return;
    commitFields(draftFlat);
    setDraftFlat(null);
    setIsEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [readOnly, draftFlat, commitFields]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (tableReadOnly) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = flat.findIndex((f) => f.field.id === active.id);
      const newIdx = flat.findIndex((f) => f.field.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      setDraftFlat(arrayMove([...flat], oldIdx, newIdx));
    },
    [flat, tableReadOnly],
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
    },
    [flat],
  );

  const handleDescriptionChange = useCallback(
    (index: number, desc: string) => {
      const next = flat.map((item, i) =>
        i === index ? { ...item, field: { ...item.field, description: desc } } : item,
      );
      setDraftFlat(next);
    },
    [flat],
  );

  const handleDefaultValueChange = useCallback(
    (index: number, val: string) => {
      const next = flat.map((item, i) =>
        i === index ? { ...item, field: { ...item.field, defaultValue: val } } : item,
      );
      setDraftFlat(next);
    },
    [flat],
  );

  const handleDataTypeChange = useCallback(
    (index: number, dataType: SqlCompatibleType) => {
      const next = flat.map((item, i) =>
        i === index ? { ...item, field: { ...item.field, dataType } } : item,
      );
      setDraftFlat(next);
    },
    [flat],
  );

  const handleRemove = useCallback(
    (index: number) => {
      setDraftFlat(flat.filter((_, i) => i !== index));
    },
    [flat],
  );

  const handleAddField = useCallback(() => {
    const newField: SchemaField = {
      id: crypto.randomUUID(),
      name: `field_${flat.length + 1}`,
      path: `field_${flat.length + 1}`,
      level: 0,
      order: flat.length,
      dataType: "STRING",
    };
    setDraftFlat([...flat, { field: newField, path: newField.name }]);
  }, [flat]);

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
                {flat.length} field{flat.length !== 1 ? "s" : ""}
                {isEditing ? " — drag to reorder, then Save" : " — click Edit to change fields"}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!readOnly && (
              <>
                {!isEditing ? (
                  <Button variant="outline" size="sm" onClick={handleStartEdit}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={!draftFlat}>
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      {saved ? "Saved!" : "Save"}
                    </Button>
                  </>
                )}
              </>
            )}
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
                      <TableHead className="text-xs">Type</TableHead>
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
                        onDataTypeChange={handleDataTypeChange}
                        onRemove={handleRemove}
                        readOnly={tableReadOnly}
                      />
                    ))}
                  </TableBody>
                </Table>
              </SortableContext>
            </DndContext>
          </div>

          {!readOnly && isEditing && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={handleAddField}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Field
            </Button>
          )}

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
