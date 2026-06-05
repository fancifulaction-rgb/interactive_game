-- IMP-DATA-003: authenticated admin может удалять объекты в игровых buckets

DROP POLICY IF EXISTS "Authenticated delete game media" ON storage.objects;
CREATE POLICY "Authenticated delete game media" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('avatars', 'answer-media', 'question-media', 'quest-logos'));
