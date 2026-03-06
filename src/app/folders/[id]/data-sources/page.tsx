"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cable, Plus, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface DataSource {
  id: string;
  name: string;
  type: string;
  created_at: string;
}

export default function FolderDataSourcesPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDataSources = useCallback(async () => {
    try {
      const res = await fetch(`/api/data-sources?folderId=${folderId}`);
      if (res.ok) {
        const data = await res.json();
        setDataSources(data.dataSources ?? data.data_sources ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    fetchDataSources();
  }, [fetchDataSources]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`/folders/${folderId}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Data Sources</h1>
              <p className="text-sm text-muted-foreground">
                Database connections in this folder
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href={`/data-sources/new?folderId=${folderId}`}>
              <Plus className="mr-2 h-4 w-4" />
              New Data Source
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : dataSources.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Cable className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No data sources yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Connect a database to start querying data.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {dataSources.map((ds) => (
              <Card
                key={ds.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/data-sources/${ds.id}`)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{ds.name}</CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {ds.type}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Created {new Date(ds.created_at).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
