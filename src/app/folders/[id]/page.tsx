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
import {
  Folder,
  FolderOpen,
  FileText,
  Database,
  FileStack,
  LayoutDashboard,
  Cable,
  Bell,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

interface FolderDetail {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

interface FolderChild {
  id: string;
  name: string;
}

const SECTIONS = [
  { key: "context", label: "Context", icon: FileText, description: "Business context and documentation" },
  { key: "data-sources", label: "Data Sources", icon: Cable, description: "Database connections" },
  { key: "schemas", label: "Schemas", icon: FileStack, description: "Data schemas and field definitions" },
  { key: "datasets", label: "Datasets", icon: Database, description: "Processed datasets" },
  { key: "dashboards", label: "Dashboards", icon: LayoutDashboard, description: "Charts and analytics" },
  { key: "alerts", label: "Alerts", icon: Bell, description: "Threshold alerts and notifications" },
];

export default function FolderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const [folder, setFolder] = useState<FolderDetail | null>(null);
  const [children, setChildren] = useState<FolderChild[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFolder = useCallback(async () => {
    try {
      const res = await fetch(`/api/folders/${folderId}`);
      if (res.ok) {
        const data = await res.json();
        setFolder(data.folder);
        setChildren(data.children ?? []);
      } else {
        router.push("/folders");
      }
    } catch {
      router.push("/folders");
    } finally {
      setLoading(false);
    }
  }, [folderId, router]);

  useEffect(() => {
    fetchFolder();
  }, [fetchFolder]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!folder) return null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          {folder.parent_id && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`/folders/${folder.parent_id}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FolderOpen className="h-6 w-6 text-amber-500" />
              {folder.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Created {new Date(folder.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => (
            <Link key={section.key} href={`/folders/${folderId}/${section.key}`}>
              <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <section.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{section.label}</CardTitle>
                      <CardDescription className="text-xs">
                        {section.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>

        {children.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Sub-Folders</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {children.map((child) => (
                <Card
                  key={child.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => router.push(`/folders/${child.id}`)}
                >
                  <CardContent className="flex items-center gap-3 py-4">
                    <Folder className="h-5 w-5 text-amber-500" />
                    <span className="font-medium">{child.name}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
