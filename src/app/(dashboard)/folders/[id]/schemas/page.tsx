"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileStack, Plus, Loader2 } from "lucide-react";
import { AddSchemaDialog } from "@/components/schemas/AddSchemaDialog";

interface Schema {
  id: string;
  name: string;
  createdAt: string;
  fieldCount?: number;
}

export default function FolderSchemasPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSchemaOpen, setAddSchemaOpen] = useState(false);

  const fetchSchemas = useCallback(async () => {
    try {
      const res = await fetch(`/api/schemas?folderId=${folderId}`);
      if (res.ok) {
        const data = await res.json();
        setSchemas(data.schemas ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    fetchSchemas();
  }, [fetchSchemas]);

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Schemas</h1>
            <p className="text-sm text-muted-foreground">
              Data schemas in this folder
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setAddSchemaOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Schema
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : schemas.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileStack className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No schemas yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create a schema to define your data structure.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {schemas.map((schema) => (
              <Card
                key={schema.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/folders/${folderId}/schemas/${schema.id}`)}
              >
                <CardHeader>
                  <CardTitle className="text-base">{schema.name}</CardTitle>
                  <CardDescription className="text-xs">
                    Created {new Date(schema.createdAt).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AddSchemaDialog
        open={addSchemaOpen}
        onOpenChange={setAddSchemaOpen}
        folderId={folderId}
      />
    </>
  );
}
