-- IMP-SEC-015: anon не пишет в Storage; игрок — только Edge player-upload (service_role).
-- Админ: INSERT в question-media и quest-logos под authenticated.

DROP POLICY IF EXISTS "Public upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public upload answer-media" ON storage.objects;
DROP POLICY IF EXISTS "Public upload question-media" ON storage.objects;
DROP POLICY IF EXISTS "Public upload quest-logos" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated upload admin media" ON storage.objects;
CREATE POLICY "Authenticated upload admin media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('question-media', 'quest-logos'));
