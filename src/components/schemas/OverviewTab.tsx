"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
import { flattenFields } from "@/lib/schema-store";
import {
  Layers,
  CalendarDays,
  User,
  UserPlus,
  Loader2,
  X,
} from "lucide-react";
import FinalSchemaTable from "@/components/FinalSchemaTable";
import type { FinalSchema } from "@/lib/types";

interface OverviewTabProps {
  schema: FinalSchema;
  isOwner: boolean;
  schemaId: string;
  onUpdateSchema: (id: string, updates: Partial<FinalSchema>) => void;
  onDirtyChange: (dirty: boolean) => void;
}

export function OverviewTab({ schema, isOwner, schemaId, onUpdateSchema, onDirtyChange }: OverviewTabProps) {
  const [grants, setGrants] = useState<{ id: string; grantedToUserId: string; grantedAt: string; user: { id: string; email: string; name: string } }[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [grantEmail, setGrantEmail] = useState("");
  const [granting, setGranting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchGrants = useCallback(() => {
    if (!schemaId || !isOwner) return;
    setGrantsLoading(true);
    fetch(`/api/schemas/${schemaId}/grants`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { grants: [] }))
      .then((data) => setGrants(Array.isArray(data?.grants) ? data.grants : []))
      .finally(() => setGrantsLoading(false));
  }, [schemaId, isOwner]);

  useEffect(() => {
    if (isOwner) fetchGrants();
  }, [isOwner, fetchGrants]);

  const handleGrant = async () => {
    const email = grantEmail.trim();
    if (!email || granting) return;
    setGranting(true);
    try {
      const res = await fetch(`/api/schemas/${schemaId}/grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to grant access");
      setGrantEmail("");
      fetchGrants();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to grant access");
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (grantedToUserId: string) => {
    const g = grants.find((x) => x.grantedToUserId === grantedToUserId);
    if (!g || revokingId) return;
    setRevokingId(g.id);
    try {
      const res = await fetch(`/api/schemas/${schemaId}/grants/${grantedToUserId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to revoke");
      }
      fetchGrants();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setRevokingId(null);
    }
  };

  const leafFields = flattenFields(schema.fields).filter((f) => !f.children?.length);
  const createdDate = new Date(schema.createdAt).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
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
              <User className="h-3.5 w-3.5" />
              Creator
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {schema.creator?.name || schema.creator?.email || "\u2014"}
            </p>
            {schema.creator?.email && schema.creator?.name && (
              <p className="text-xs text-muted-foreground">{schema.creator.email}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      <FinalSchemaTable
        schema={schema}
        onUpdateSchema={onUpdateSchema}
        rawRows={[]}
        columnMappings={[]}
        readOnly={false}
        onDirtyChange={onDirtyChange}
      />
    </div>
  );
}
