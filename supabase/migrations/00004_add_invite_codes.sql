-- Invite codes table for beta gating
CREATE TABLE public.invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  max_uses INTEGER NOT NULL DEFAULT 25,
  current_uses INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS policies — only the server (service key) accesses this table
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- Atomic: increment usage only if under the limit, returns true/false
CREATE OR REPLACE FUNCTION public.use_invite_code(code_input TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.invite_codes
  SET current_uses = current_uses + 1
  WHERE code = code_input AND current_uses < max_uses;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rollback: decrement usage (used when user creation fails after code was consumed)
CREATE OR REPLACE FUNCTION public.rollback_invite_code(code_input TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.invite_codes
  SET current_uses = GREATEST(current_uses - 1, 0)
  WHERE code = code_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed initial invite code
INSERT INTO public.invite_codes (code, max_uses) VALUES ('HERMES-BETA-2026', 25);
