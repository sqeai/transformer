"use client";

import { useState } from "react";
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
} from "lucide-react";
import FinalSchemaTable from "@/components/FinalSchemaTable";
import type { FinalSchema } from "@/lib/types";

export default function SchemaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { getSchema, updateSchema, setCurrentSchema, workflow } = useSchemaStore();
  const schema = getSchema(id);
  const [name, setName] = useState(schema?.name ?? "");
  const [saved, setSaved] = useState(false);

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
    setCurrentSchema(id);
    router.push("/upload");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push("/schemas")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{schema.name}</h1>
              <p className="text-muted-foreground">
                Configure fields, descriptions, ordering, and default values.
              </p>
            </div>
          </div>
          <Button onClick={handleUseSchema}>
            Use This Schema
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
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
                <FileStack className="h-3.5 w-3.5" />
                Usage Stats
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Coming soon</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Track how often this schema is used
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Schema name editor */}
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

        <Separator />

        {/* Fields table — the main content */}
        <FinalSchemaTable
          schema={schema}
          onUpdateSchema={handleUpdateSchema}
          rawRows={workflow.currentSchemaId === id ? workflow.rawRows : []}
          columnMappings={workflow.currentSchemaId === id ? workflow.columnMappings : []}
        />
      </div>
    </DashboardLayout>
  );
}
