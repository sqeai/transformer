import DashboardLayout from "@/components/layout/DashboardLayout";

export default function FolderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
