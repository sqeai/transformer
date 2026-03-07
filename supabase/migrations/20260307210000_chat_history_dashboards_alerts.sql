-- ============================================================================
-- Migration: Chat History, Server-Persisted Dashboards, Alerts, File Tracking
-- Supports Features 2 (Chatbot), 3 (Dashboard), and 4 (User Profile)
-- ============================================================================

-- Chat history table
CREATE TABLE IF NOT EXISTS public.chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  agent_type TEXT NOT NULL DEFAULT 'analyst',
  title TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  persona TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_history_user ON public.chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_folder ON public.chat_history(folder_id);

-- Server-persisted dashboards
CREATE TABLE IF NOT EXISTS public.dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboards_folder ON public.dashboards(folder_id);

-- Dashboard panels
CREATE TABLE IF NOT EXISTS public.dashboard_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  chart_type TEXT NOT NULL,
  sql_query TEXT,
  data JSONB NOT NULL DEFAULT '[]',
  config JSONB NOT NULL DEFAULT '{}',
  width INTEGER NOT NULL DEFAULT 1,
  height INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_panels_dashboard ON public.dashboard_panels(dashboard_id);

-- Alerts / thresholds
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  data_source_id UUID REFERENCES public.data_sources(id) ON DELETE SET NULL,
  sql_query TEXT NOT NULL,
  condition TEXT NOT NULL,
  threshold NUMERIC,
  cron_expression TEXT NOT NULL DEFAULT '0 * * * *',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  last_triggered_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_folder ON public.alerts(folder_id);

-- Alert history / log
CREATE TABLE IF NOT EXISTS public.alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  value NUMERIC,
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_alert_logs_alert ON public.alert_logs(alert_id);

-- File tracking for Anthropic uploads (for cleanup cron)
ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS anthropic_file_id TEXT,
  ADD COLUMN IF NOT EXISTS anthropic_uploaded_at TIMESTAMPTZ;

-- Auto-update triggers
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_history_updated ON public.chat_history;
CREATE TRIGGER trg_chat_history_updated
  BEFORE UPDATE ON public.chat_history
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS trg_dashboards_updated ON public.dashboards;
CREATE TRIGGER trg_dashboards_updated
  BEFORE UPDATE ON public.dashboards
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS trg_panels_updated ON public.dashboard_panels;
CREATE TRIGGER trg_panels_updated
  BEFORE UPDATE ON public.dashboard_panels
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

DROP TRIGGER IF EXISTS trg_alerts_updated ON public.alerts;
CREATE TRIGGER trg_alerts_updated
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
