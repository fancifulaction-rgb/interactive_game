-- Storage buckets для медиа

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/*']::text[]),
  ('answer-media', 'answer-media', true, 52428800, ARRAY['image/*','video/*','audio/*']::text[]),
  ('question-media', 'question-media', true, 52428800, ARRAY['image/*','video/*','audio/*']::text[]),
  ('quest-logos', 'quest-logos', true, 5242880, ARRAY['image/*']::text[])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "Public upload avatars" ON storage.objects;
CREATE POLICY "Public upload avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Public read answer-media" ON storage.objects;
CREATE POLICY "Public read answer-media" ON storage.objects FOR SELECT USING (bucket_id = 'answer-media');
DROP POLICY IF EXISTS "Public upload answer-media" ON storage.objects;
CREATE POLICY "Public upload answer-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'answer-media');

DROP POLICY IF EXISTS "Public read question-media" ON storage.objects;
CREATE POLICY "Public read question-media" ON storage.objects FOR SELECT USING (bucket_id = 'question-media');
DROP POLICY IF EXISTS "Public upload question-media" ON storage.objects;
CREATE POLICY "Public upload question-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'question-media');

DROP POLICY IF EXISTS "Public read quest-logos" ON storage.objects;
CREATE POLICY "Public read quest-logos" ON storage.objects FOR SELECT USING (bucket_id = 'quest-logos');
DROP POLICY IF EXISTS "Public upload quest-logos" ON storage.objects;
CREATE POLICY "Public upload quest-logos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'quest-logos');
