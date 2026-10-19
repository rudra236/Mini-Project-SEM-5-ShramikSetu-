-- Migration: 20261007000029_complaint_reports_and_police_filing.sql
-- Adds complaint_reports table for official police/labour office filing reports with tamper-evident hashes.

CREATE TABLE IF NOT EXISTS public.complaint_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  report_ref TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  language TEXT NOT NULL CHECK (language IN ('EN', 'HI', 'MR')),
  recipient_type TEXT NOT NULL DEFAULT 'POLICE_STATION' CHECK (recipient_type IN ('POLICE_STATION', 'LABOUR_OFFICE', 'OTHER')),
  recipient_name TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  ledger_hash TEXT NOT NULL,
  report_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by UUID NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_complaint_reports_dispute_id ON public.complaint_reports(dispute_id);
CREATE INDEX IF NOT EXISTS idx_complaint_reports_ref ON public.complaint_reports(report_ref);
CREATE INDEX IF NOT EXISTS idx_complaint_reports_version ON public.complaint_reports(dispute_id, version DESC);

-- Enable RLS
ALTER TABLE public.complaint_reports ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Workers can view reports for their disputes"
  ON public.complaint_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.disputes d
      JOIN public.workers w ON w.id = d.worker_id
      WHERE d.id = complaint_reports.dispute_id
      AND w.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'INSTITUTIONAL_USER')
    )
  );

CREATE POLICY "Workers can generate reports for their disputes"
  ON public.complaint_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.disputes d
      JOIN public.workers w ON w.id = d.worker_id
      WHERE d.id = complaint_reports.dispute_id
      AND w.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'INSTITUTIONAL_USER')
    )
  );
