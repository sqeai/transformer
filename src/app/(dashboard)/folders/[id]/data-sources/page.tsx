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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Cable, Plus, Loader2, ArrowLeft, Database, Server, Container, Warehouse, FolderOpen } from "lucide-react";

interface DataSource {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  folderId?: string;
  folderName?: string | null;
}

export default function FolderDataSourcesPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const goToNew = (type: string) => {
    setDialogOpen(false);
    router.push(`/data-sources/new?type=${type}&folderId=${folderId}`);
  };

  const ownDataSources = dataSources.filter(
    (ds) => !ds.folderId || ds.folderId === folderId,
  );
  const subfolderDataSources = dataSources.filter(
    (ds) => ds.folderId && ds.folderId !== folderId,
  );

  const subfolderGroups = subfolderDataSources.reduce<
    Record<string, { folderName: string; folderId: string; dataSources: DataSource[] }>
  >((acc, ds) => {
    const id = ds.folderId!;
    if (!acc[id]) {
      acc[id] = {
        folderName: ds.folderName || "Unknown Folder",
        folderId: id,
        dataSources: [],
      };
    }
    acc[id].dataSources.push(ds);
    return acc;
  }, {});

  const hasSubfolders = Object.keys(subfolderGroups).length > 0;

  return (
    <>
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
                {dataSources.length} data source{dataSources.length !== 1 ? "s" : ""} in this folder
                {subfolderDataSources.length > 0 &&
                  ` (${subfolderDataSources.length} from subfolders)`}
              </p>
            </div>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Data Source
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
              <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add New
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {ownDataSources.length > 0 && (
              <div className="space-y-3">
                {hasSubfolders && (
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-1">
                    This Folder
                  </h2>
                )}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {ownDataSources.map((ds) => (
                    <DataSourceCard key={ds.id} ds={ds} router={router} />
                  ))}
                </div>
              </div>
            )}

            {Object.values(subfolderGroups).map((group) => (
              <div key={group.folderId} className="space-y-3">
                <button
                  onClick={() =>
                    router.push(`/folders/${group.folderId}/data-sources`)
                  }
                  className="flex items-center gap-2 px-1 group cursor-pointer"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
                    {group.folderName}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    ({group.dataSources.length})
                  </span>
                </button>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {group.dataSources.map((ds) => (
                    <DataSourceCard
                      key={ds.id}
                      ds={ds}
                      router={router}
                      isSubfolder
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Data Source</DialogTitle>
            <DialogDescription>
              Choose the type of database you want to connect.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <button
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-border p-6 transition-all hover:border-primary hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={() => goToNew("bigquery")}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500/10">
                <Database className="h-7 w-7 text-blue-500" />
              </div>
              <span className="text-sm font-semibold">BigQuery</span>
              <span className="text-xs text-muted-foreground text-center">
                Google Cloud data warehouse
              </span>
            </button>
            <button
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-border p-6 transition-all hover:border-primary hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={() => goToNew("mysql")}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-orange-500/10">
                <Server className="h-7 w-7 text-orange-500" />
              </div>
              <span className="text-sm font-semibold">MySQL</span>
              <span className="text-xs text-muted-foreground text-center">
                Open-source relational database
              </span>
            </button>
            <button
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-border p-6 transition-all hover:border-primary hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={() => goToNew("postgres")}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-sky-500/10">
                <Container className="h-7 w-7 text-sky-500" />
              </div>
              <span className="text-sm font-semibold">PostgreSQL</span>
              <span className="text-xs text-muted-foreground text-center">
                Advanced open-source database
              </span>
            </button>
            <button
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-border p-6 transition-all hover:border-primary hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={() => goToNew("redshift")}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-500/10">
                <Warehouse className="h-7 w-7 text-red-500" />
              </div>
              <span className="text-sm font-semibold">AWS Redshift</span>
              <span className="text-xs text-muted-foreground text-center">
                AWS cloud data warehouse
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DataSourceCard({
  ds,
  router,
  isSubfolder,
}: {
  ds: DataSource;
  router: ReturnType<typeof useRouter>;
  isSubfolder?: boolean;
}) {
  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${isSubfolder ? "border-dashed" : ""}`}
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
          Created {new Date(ds.createdAt).toLocaleDateString()}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
