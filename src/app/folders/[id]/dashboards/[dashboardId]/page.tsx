"use client";

import { useParams } from "next/navigation";
import { DashboardBuilder } from "@/components/dashboard/DashboardBuilder";

export default function DashboardDetailPage() {
  const params = useParams();
  const folderId = params.id as string;
  const dashboardId = params.dashboardId as string;

  return <DashboardBuilder dashboardId={dashboardId} folderId={folderId} />;
}
