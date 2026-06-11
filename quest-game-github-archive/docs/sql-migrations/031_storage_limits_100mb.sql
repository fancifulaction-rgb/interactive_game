-- Увеличить лимит объектов в медиа-buckets: 50 MB → 100 MB (видео после сжатия).
-- Фото сжимается на клиенте до ~10 MB; исходник до 20 MB.

UPDATE storage.buckets
SET file_size_limit = 104857600
WHERE id IN ('answer-media', 'question-media');
