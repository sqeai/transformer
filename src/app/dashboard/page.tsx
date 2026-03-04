"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { DashboardBuilder } from "@/components/dashboard/DashboardBuilder";

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <DashboardBuilder />
    </DashboardLayout>
  );
}
