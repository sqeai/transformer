"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, ArrowLeft, Plus, Trash2, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Alert {
  id: string;
  name: string;
  description: string | null;
  sql_query: string;
  condition: string;
  threshold: number | null;
  cron_expression: string;
  is_active: boolean;
  last_checked_at: string | null;
  last_triggered_at: string | null;
  created_at: string;
}

const CONDITIONS = [
  { value: "gt", label: "Greater than" },
  { value: "lt", label: "Less than" },
  { value: "eq", label: "Equal to" },
  { value: "gte", label: "Greater or equal" },
  { value: "lte", label: "Less or equal" },
  { value: "neq", label: "Not equal to" },
];

export default function FolderAlertsPage() {
  const params = useParams();
  const router = useRouter();
  const folderId = params.id as string;
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    sqlQuery: "",
    condition: "gt",
    threshold: "",
    cronExpression: "0 * * * *",
  });

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch(`/api/alerts?folderId=${folderId}`);
      if (res.ok) setAlerts(await res.json());
    } catch {
      toast.error("Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const createAlert = async () => {
    if (!form.name || !form.sqlQuery) {
      toast.error("Name and SQL query are required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId,
          name: form.name,
          description: form.description || null,
          sqlQuery: form.sqlQuery,
          condition: form.condition,
          threshold: form.threshold ? Number(form.threshold) : null,
          cronExpression: form.cronExpression,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAlerts((prev) => [data, ...prev]);
        setDialogOpen(false);
        setForm({ name: "", description: "", sqlQuery: "", condition: "gt", threshold: "", cronExpression: "0 * * * *" });
        toast.success("Alert created");
      } else {
        toast.error("Failed to create alert");
      }
    } catch {
      toast.error("Failed to create alert");
    } finally {
      setCreating(false);
    }
  };

  const toggleAlert = async (id: string, isActive: boolean) => {
    try {
      await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_active: !isActive } : a)),
      );
    } catch {
      toast.error("Failed to update alert");
    }
  };

  const deleteAlert = async (id: string) => {
    try {
      await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      toast.success("Alert deleted");
    } catch {
      toast.error("Failed to delete alert");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
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
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Alert
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Alert</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Revenue drop alert"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Alert when daily revenue drops below threshold"
                  />
                </div>
                <div>
                  <Label>SQL Query</Label>
                  <textarea
                    value={form.sqlQuery}
                    onChange={(e) => setForm((f) => ({ ...f, sqlQuery: e.target.value }))}
                    placeholder="SELECT SUM(revenue) as value FROM orders WHERE date = CURRENT_DATE"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Query must return a single numeric column named &quot;value&quot;
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Condition</Label>
                    <Select
                      value={form.condition}
                      onValueChange={(v) => setForm((f) => ({ ...f, condition: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Threshold</Label>
                    <Input
                      type="number"
                      value={form.threshold}
                      onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                      placeholder="1000"
                    />
                  </div>
                </div>
                <div>
                  <Label>Schedule (cron)</Label>
                  <Input
                    value={form.cronExpression}
                    onChange={(e) => setForm((f) => ({ ...f, cronExpression: e.target.value }))}
                    placeholder="0 * * * *"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Default: every hour. Use cron syntax.
                  </p>
                </div>
                <Button onClick={createAlert} disabled={creating} className="w-full">
                  {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Alert
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : alerts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No alerts yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create alerts to monitor your data and get notified when thresholds are crossed.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <Card key={alert.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          alert.is_active ? "bg-green-500" : "bg-muted-foreground/30",
                        )}
                      />
                      <div>
                        <h3 className="font-semibold">{alert.name}</h3>
                        {alert.description && (
                          <p className="text-xs text-muted-foreground">{alert.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1 font-mono">
                          {CONDITIONS.find((c) => c.value === alert.condition)?.label}{" "}
                          {alert.threshold}
                          {" · "}
                          {alert.cron_expression}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleAlert(alert.id, alert.is_active)}
                        title={alert.is_active ? "Pause" : "Resume"}
                      >
                        {alert.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteAlert(alert.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
