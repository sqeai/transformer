"use client";

import { useParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { DashboardBuilder } from "@/components/dashboard/DashboardBuilder";

export default function DashboardDetailPage() {
  const params = useParams();
  const folderId = params.id as string;
  const dashboardId = params.dashboardId as string;

  return (
    <DashboardLayout>
      <DashboardBuilder dashboardId={dashboardId} folderId={folderId} />
    </DashboardLayout>
  );
}
