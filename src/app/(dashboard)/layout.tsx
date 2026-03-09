import { Suspense } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <DashboardLayout>{children}</DashboardLayout>
    </Suspense>
  );
}
