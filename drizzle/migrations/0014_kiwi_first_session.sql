-- Only accounts created after this migration participate; existing accounts are not new.
CREATE TABLE public.first_account_session (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid
);
ALTER TABLE public.first_account_session ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.first_account_session FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.kiwi_register_new_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.first_account_session (user_id) VALUES (NEW.id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.kiwi_register_new_account() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER kiwi_register_new_account AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.kiwi_register_new_account();

CREATE FUNCTION public.kiwi_register_first_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.first_account_session SET session_id = NEW.id
  WHERE user_id = NEW.user_id AND session_id IS NULL;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.kiwi_register_first_session() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER kiwi_register_first_session AFTER INSERT ON auth.sessions
FOR EACH ROW EXECUTE FUNCTION public.kiwi_register_first_session();

CREATE FUNCTION public.is_first_account_session() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.first_account_session
    WHERE user_id = auth.uid() AND session_id::text = auth.jwt()->>'session_id'
  );
$$;
REVOKE ALL ON FUNCTION public.is_first_account_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_first_account_session() TO authenticated;
