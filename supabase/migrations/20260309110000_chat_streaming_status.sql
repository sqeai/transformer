ALTER TABLE public.chat_history
  ADD COLUMN IF NOT EXISTS streaming_status TEXT NOT NULL DEFAULT 'idle';
