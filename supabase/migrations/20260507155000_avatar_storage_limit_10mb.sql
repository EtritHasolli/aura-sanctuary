-- Raise avatar bucket limit to 10 MB
UPDATE storage.buckets
SET file_size_limit = 10485760
WHERE id = 'avatars';
