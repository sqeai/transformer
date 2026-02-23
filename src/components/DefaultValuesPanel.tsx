"use client";

import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ColumnMapping } from "@/lib/types";
import { ShieldCheck, X, Sparkles } from "lucide-react";

interface DefaultValuesPanelProps {
  columnMappings: ColumnMapping[];
  onColumnMappingsChange: (mappings: ColumnMapping[]) => void;
}

export default function DefaultValuesPanel({
  columnMappings,
  onColumnMappingsChange,
}: DefaultValuesPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const mappingsWithDefaults = useMemo(
    () => columnMappings.filter((m) => m.defaultValue != null && m.defaultValue !== ""),
    [columnMappings],
  );

  const mappingsWithoutDefaults = useMemo(
    () => columnMappings.filter((m) => m.defaultValue == null || m.defaultValue === ""),
    [columnMappings],
  );

  useEffect(() => {
    return () => {
      for (const t of Object.values(debounceRefs.current)) clearTimeout(t);
    };
  }, []);

  const commitDefault = useCallback(
    (rawColumn: string, value: string) => {
      onColumnMappingsChange(
        columnMappings.map((m) =>
          m.rawColumn === rawColumn
            ? { ...m, defaultValue: value || undefined }
            : m,
        ),
      );
    },
    [columnMappings, onColumnMappingsChange],
  );

  const handleChange = useCallback(
    (rawColumn: string, value: string) => {
      setDrafts((d) => ({ ...d, [rawColumn]: value }));
      clearTimeout(debounceRefs.current[rawColumn]);
      debounceRefs.current[rawColumn] = setTimeout(() => {
        commitDefault(rawColumn, value);
        setDrafts((d) => {
          const next = { ...d };
          delete next[rawColumn];
          return next;
        });
      }, 400);
    },
    [commitDefault],
  );

  const clearDefault = useCallback(
    (rawColumn: string) => {
      setDrafts((d) => {
        const next = { ...d };
        delete next[rawColumn];
        return next;
      });
      commitDefault(rawColumn, "");
    },
    [commitDefault],
  );

  const getDisplayValue = (m: ColumnMapping) => {
    if (m.rawColumn in drafts) return drafts[m.rawColumn];
    return m.defaultValue ?? "";
  };

  if (columnMappings.length === 0) return null;

  const hasAnyDefaults = mappingsWithDefaults.length > 0;

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Default Values</CardTitle>
        </div>
        <CardDescription>
          Fallback values used when a raw data cell is empty or missing.
          {hasAnyDefaults && (
            <span className="flex items-center gap-1 mt-1 text-primary">
              <Sparkles className="h-3 w-3" />
              AI-suggested defaults are pre-filled below.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {mappingsWithDefaults.length > 0 && (
          <div className="space-y-1.5">
            {mappingsWithDefaults.map((m) => (
              <div
                key={m.rawColumn}
                className="rounded-md border bg-muted/30 px-3 py-2 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm break-words min-w-0">
                    <span className="font-medium">{m.rawColumn}</span>
                    <span className="text-muted-foreground">
                      {" "}&rarr; {m.targetPath}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => clearDefault(m.rawColumn)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <Input
                  value={getDisplayValue(m)}
                  onChange={(e) => handleChange(m.rawColumn, e.target.value)}
                  placeholder="No default"
                  className="h-7 text-xs"
                />
              </div>
            ))}
          </div>
        )}

        {mappingsWithoutDefaults.length > 0 && (
          <div className="space-y-1.5">
            {hasAnyDefaults && (
              <label className="text-xs font-medium text-muted-foreground">
                No default set
              </label>
            )}
            {mappingsWithoutDefaults.map((m) => (
              <div
                key={m.rawColumn}
                className="rounded-md border bg-muted/10 px-3 py-2 space-y-1.5"
              >
                <div className="text-sm break-words">
                  <span className="font-medium">{m.rawColumn}</span>
                  <span className="text-muted-foreground">
                    {" "}&rarr; {m.targetPath}
                  </span>
                </div>
                <Input
                  value={getDisplayValue(m)}
                  onChange={(e) => handleChange(m.rawColumn, e.target.value)}
                  placeholder="No default"
                  className="h-7 text-xs"
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
