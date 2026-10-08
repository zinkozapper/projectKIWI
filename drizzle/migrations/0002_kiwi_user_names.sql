-- Email sign-up sends the name as display_name, which the trigger ignored, leaving first_name/last_name empty.
-- Split display_name (or full_name/name from OAuth) into first and last name, and backfill existing users.
CREATE OR REPLACE FUNCTION public.handle_new_kiwi_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  full_name text := trim(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', ''));
BEGIN
  INSERT INTO public.users (user_id, email, first_name, last_name, user_picture)
  VALUES (NEW.id, COALESCE(NEW.email,''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', split_part(full_name,' ',1)),
    COALESCE(NEW.raw_user_meta_data->>'last_name', CASE WHEN position(' ' in full_name) > 0 THEN trim(substr(full_name, position(' ' in full_name) + 1)) ELSE '' END),
    NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.pantry (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

UPDATE public.users u SET
  first_name = split_part(n.full_name,' ',1),
  last_name = CASE WHEN position(' ' in n.full_name) > 0 THEN trim(substr(n.full_name, position(' ' in n.full_name) + 1)) ELSE '' END
FROM (SELECT id, trim(COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'display_name', raw_user_meta_data->>'name', '')) AS full_name FROM auth.users) n
WHERE u.user_id = n.id AND u.first_name = '' AND n.full_name <> '';
