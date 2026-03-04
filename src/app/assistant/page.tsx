"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { AnalystChat } from "@/components/analyst/AnalystChat";

export default function AssistantPage() {
  return (
    <DashboardLayout>
      <AnalystChat />
    </DashboardLayout>
  );
}
