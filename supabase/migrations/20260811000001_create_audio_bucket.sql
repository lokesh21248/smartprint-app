-- Create the 'audio' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policy to allow public read access
CREATE POLICY "Public read access for audio bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio');

-- Optional: Policy to allow authenticated users to upload files to this bucket (if needed via UI)
-- CREATE POLICY "Allow authenticated uploads"
-- ON storage.objects FOR INSERT TO authenticated
-- WITH CHECK (bucket_id = 'audio');
