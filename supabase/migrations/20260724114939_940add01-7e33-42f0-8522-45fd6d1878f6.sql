
CREATE POLICY "doubt images read auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'doubt-images');
CREATE POLICY "doubt images upload own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'doubt-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "doubt images delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'doubt-images' AND (storage.foldername(name))[1] = auth.uid()::text);
