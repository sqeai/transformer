"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Loader2, Cable, Database, Server, Container, Warehouse } from "lucide-react";

interface DataSourceItem {
  id: string;
  name: string;
  type: "bigquery" | "mysql" | "postgres" | "redshift";
  createdAt: string;
  updatedAt: string;
}

const TYPE_META: Record<string, { label: string; icon: typeof Database; color: string }> = {
  bigquery: { label: "BigQuery", icon: Database, color: "text-blue-500" },
  mysql: { label: "MySQL", icon: Server, color: "text-orange-500" },
  postgres: { label: "PostgreSQL", icon: Container, color: "text-sky-500" },
  redshift: { label: "Redshift", icon: Warehouse, color: "text-red-500" },
};

export default function DataSourcesPage() {
  const router = useRouter();
  const [dataSources, setDataSources] = useState<DataSourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchDataSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/data-sources");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDataSources(data.dataSources ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDataSources();
  }, [fetchDataSources]);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Data Sources</h1>
            <p className="text-muted-foreground">
              Manage your external database connections.
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add New
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground py-10">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading data sources...</span>
              </div>
            ) : dataSources.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Cable className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground text-lg font-medium">
                  No data sources yet
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  Connect to BigQuery, MySQL, PostgreSQL, or Redshift to get started.
                </p>
                <Button className="mt-4" onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add New
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataSources.map((ds) => {
                    const meta = TYPE_META[ds.type] ?? TYPE_META.mysql;
                    const Icon = meta.icon;
                    return (
                      <TableRow
                        key={ds.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/data-sources/${ds.id}`)}
                      >
                        <TableCell className="font-medium">{ds.name}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <Icon className={`h-4 w-4 ${meta.color}`} />
                            {meta.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(ds.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
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
              onClick={() => {
                setDialogOpen(false);
                router.push("/data-sources/new?type=bigquery");
              }}
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
              onClick={() => {
                setDialogOpen(false);
                router.push("/data-sources/new?type=mysql");
              }}
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
              onClick={() => {
                setDialogOpen(false);
                router.push("/data-sources/new?type=postgres");
              }}
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
              onClick={() => {
                setDialogOpen(false);
                router.push("/data-sources/new?type=redshift");
              }}
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
    </DashboardLayout>
  );
}
