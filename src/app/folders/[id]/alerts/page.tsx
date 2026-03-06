"use client";

import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, ArrowLeft } from "lucide-react";

export default function FolderAlertsPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/folders/${folderId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
            <p className="text-sm text-muted-foreground">
              Threshold alerts and notifications
            </p>
          </div>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">Alerts coming soon</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Metric alerts and threshold notifications will be available in the next phase.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
