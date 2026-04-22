import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { KiteSessionProvider } from "@/components/dashboard/KiteSessionProvider";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <KiteSessionProvider>
      <DashboardShell>{children}</DashboardShell>
    </KiteSessionProvider>
  );
}
