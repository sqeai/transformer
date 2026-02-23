"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DefaultValues } from "@/lib/types";
import { ShieldCheck, X } from "lucide-react";

interface DefaultValuesPanelProps {
  unmappedTargetPaths: string[];
  defaultValues: DefaultValues;
  onDefaultValuesChange: (values: DefaultValues) => void;
}

export default function DefaultValuesPanel({
  unmappedTargetPaths,
  defaultValues,
  onDefaultValuesChange,
}: DefaultValuesPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    return () => {
      for (const t of Object.values(debounceRefs.current)) clearTimeout(t);
    };
  }, []);

  const commitDefault = useCallback(
    (targetPath: string, value: string) => {
      const next = { ...defaultValues };
      if (value) {
        next[targetPath] = value;
      } else {
        delete next[targetPath];
      }
      onDefaultValuesChange(next);
    },
    [defaultValues, onDefaultValuesChange],
  );

  const handleChange = useCallback(
    (targetPath: string, value: string) => {
      setDrafts((d) => ({ ...d, [targetPath]: value }));
      clearTimeout(debounceRefs.current[targetPath]);
      debounceRefs.current[targetPath] = setTimeout(() => {
        commitDefault(targetPath, value);
        setDrafts((d) => {
          const next = { ...d };
          delete next[targetPath];
          return next;
        });
      }, 400);
    },
    [commitDefault],
  );

  const clearDefault = useCallback(
    (targetPath: string) => {
      setDrafts((d) => {
        const next = { ...d };
        delete next[targetPath];
        return next;
      });
      commitDefault(targetPath, "");
    },
    [commitDefault],
  );

  const getDisplayValue = (targetPath: string) => {
    if (targetPath in drafts) return drafts[targetPath];
    return defaultValues[targetPath] ?? "";
  };

  if (unmappedTargetPaths.length === 0) return null;

  const withValues = unmappedTargetPaths.filter((p) => defaultValues[p]);
  const withoutValues = unmappedTargetPaths.filter((p) => !defaultValues[p]);

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Default Values</CardTitle>
        </div>
        <CardDescription>
          Set static values for output fields that have no mapped source column.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {withValues.length > 0 && (
          <div className="space-y-1.5">
            {withValues.map((path) => (
              <div
                key={path}
                className="rounded-md border bg-muted/30 px-3 py-2 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium break-words min-w-0">
                    {path}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => clearDefault(path)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <Input
                  value={getDisplayValue(path)}
                  onChange={(e) => handleChange(path, e.target.value)}
                  placeholder="No default"
                  className="h-7 text-xs"
                />
              </div>
            ))}
          </div>
        )}

        {withoutValues.length > 0 && (
          <div className="space-y-1.5">
            {withValues.length > 0 && (
              <label className="text-xs font-medium text-muted-foreground">
                No default set
              </label>
            )}
            {withoutValues.map((path) => (
              <div
                key={path}
                className="rounded-md border bg-muted/10 px-3 py-2 space-y-1.5"
              >
                <span className="text-sm font-medium break-words">
                  {path}
                </span>
                <Input
                  value={getDisplayValue(path)}
                  onChange={(e) => handleChange(path, e.target.value)}
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
