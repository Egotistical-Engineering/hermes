BEGIN;

-- Extend invite_codes: null = standard, non-null = trial (number of days)
ALTER TABLE public.invite_codes
  ADD COLUMN IF NOT EXISTS trial_days INTEGER;

-- Track trial expiry per user: null = no trial, future = active, past = expired
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ;

-- New version of use_invite_code that returns trial_days info.
-- Returns -1 when invalid/exhausted, 0 when standard, N>0 when trial.
CREATE OR REPLACE FUNCTION public.use_invite_code_v2(code_input TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trial_days INTEGER;
  updated_count INTEGER;
BEGIN
  UPDATE public.invite_codes
  SET current_uses = current_uses + 1
  WHERE code = code_input AND current_uses < max_uses
  RETURNING trial_days INTO v_trial_days;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count = 0 THEN
    RETURN -1;
  END IF;

  RETURN COALESCE(v_trial_days, 0);
END;
$$;

COMMIT;

-- NOTE: Trial invite code should be inserted manually via Supabase SQL editor:
--   INSERT INTO public.invite_codes (code, max_uses, trial_days)
--     VALUES ('your-secret-trial-code', 50, 30);
-- Do NOT add real codes here — this is an open-source repo.
