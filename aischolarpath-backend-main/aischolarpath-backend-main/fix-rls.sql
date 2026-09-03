-- ============================================================
-- ScholarPathAI — RLS Fix Script
-- Run this in Supabase Dashboard → SQL Editor → Run
-- This drops old policies and creates fresh permissive ones
-- ============================================================

-- 1. Drop existing policies (old names + new names)
DROP POLICY IF EXISTS "Allow all for API" ON profiles;
DROP POLICY IF EXISTS "Allow all for API" ON universities;
DROP POLICY IF EXISTS "Allow all for API" ON scholarships;
DROP POLICY IF EXISTS "Allow all for API" ON matches;
DROP POLICY IF EXISTS "Allow all for API" ON attestation_steps;
DROP POLICY IF EXISTS "Allow all for API" ON shortlist;
DROP POLICY IF EXISTS "Allow all for API" ON applications;
DROP POLICY IF EXISTS "Allow all for API" ON notifications;
DROP POLICY IF EXISTS "Allow all for API" ON extracted_profile_data;
DROP POLICY IF EXISTS "Allow all for API" ON discovery_log;
DROP POLICY IF EXISTS "Allow all for API" ON storage.objects;
DROP POLICY IF EXISTS "api_all_access" ON profiles;
DROP POLICY IF EXISTS "api_all_access" ON universities;
DROP POLICY IF EXISTS "api_all_access" ON scholarships;
DROP POLICY IF EXISTS "api_all_access" ON matches;
DROP POLICY IF EXISTS "api_all_access" ON attestation_steps;
DROP POLICY IF EXISTS "api_all_access" ON shortlist;
DROP POLICY IF EXISTS "api_all_access" ON applications;
DROP POLICY IF EXISTS "api_all_access" ON notifications;
DROP POLICY IF EXISTS "api_all_access" ON extracted_profile_data;
DROP POLICY IF EXISTS "api_all_access" ON discovery_log;
DROP POLICY IF EXISTS "api_all_access" ON storage.objects;

-- 2. Disable RLS on all tables (API handles auth via JWT)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE universities DISABLE ROW LEVEL SECURITY;
ALTER TABLE scholarships DISABLE ROW LEVEL SECURITY;
ALTER TABLE matches DISABLE ROW LEVEL SECURITY;
ALTER TABLE attestation_steps DISABLE ROW LEVEL SECURITY;
ALTER TABLE shortlist DISABLE ROW LEVEL SECURITY;
ALTER TABLE applications DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_profile_data DISABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_log DISABLE ROW LEVEL SECURITY;

-- 3. Force create permissive policies as backup (in case RLS gets re-enabled)
CREATE POLICY "api_all_access" ON profiles FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "api_all_access" ON universities FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "api_all_access" ON scholarships FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "api_all_access" ON matches FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "api_all_access" ON attestation_steps FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "api_all_access" ON shortlist FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "api_all_access" ON applications FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "api_all_access" ON notifications FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "api_all_access" ON extracted_profile_data FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "api_all_access" ON discovery_log FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Storage bucket policies
DROP POLICY IF EXISTS "api_all_access" ON storage.objects;
CREATE POLICY "api_all_access" ON storage.objects FOR ALL TO anon USING (true) WITH CHECK (true);

-- Done! RLS is now disabled + backup permissive policies created.
