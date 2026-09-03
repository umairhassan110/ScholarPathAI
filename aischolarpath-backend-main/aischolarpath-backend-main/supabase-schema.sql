-- ============================================================
-- ScholarPathAI — Complete Supabase Database Schema
-- Run this ENTIRE file in Supabase Dashboard → SQL Editor
-- ============================================================

-- MIGRATION: Add new columns (run this in Supabase Dashboard → SQL Editor)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cnic text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS residency_country text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fsc_percentage numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS previous_degree text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS previous_university text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS previous_percentage numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_field text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS reasons jsonb DEFAULT '[]';

-- 1. PROFILES (users table — custom auth, NOT Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  cgpa numeric,
  ielts_score numeric,
  target_country text,
  target_degree text,
  target_department text,
  phone text,
  gender text,
  date_of_birth text,
  cnic text,
  residency_country text,
  fsc_percentage numeric,
  previous_degree text,
  previous_university text,
  previous_percentage numeric,
  target_field text,
  cv_file_path text,
  reset_token text,
  reset_token_expiry timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 2. UNIVERSITIES
CREATE TABLE IF NOT EXISTS universities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text NOT NULL,
  degree_programs text[] DEFAULT '{}',
  official_portal_url text,
  created_at timestamptz DEFAULT now()
);

-- 3. SCHOLARSHIPS
CREATE TABLE IF NOT EXISTS scholarships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  country text NOT NULL,
  university_id uuid REFERENCES universities(id) ON DELETE SET NULL,
  scholarship_type text DEFAULT 'merit-based',
  degree_level text,
  department text,
  eligibility_criteria jsonb DEFAULT '{}',
  deadline text,
  apply_url text,
  source_url text,
  status text DEFAULT 'active',
  last_verified_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(title, country)
);

-- 4. MATCHES (eligibility engine results)
CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  scholarship_id uuid REFERENCES scholarships(id) ON DELETE CASCADE NOT NULL,
  university_id uuid REFERENCES universities(id) ON DELETE SET NULL,
  match_score numeric DEFAULT 0,
  status text DEFAULT 'Missing Requirements',
  evidence jsonb DEFAULT '[]',
  reasons jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

-- 5. ATTESTATION_STEPS
CREATE TABLE IF NOT EXISTS attestation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  authority text NOT NULL,
  step_order integer NOT NULL,
  step_description text NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- 6. SHORTLIST
CREATE TABLE IF NOT EXISTS shortlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('scholarship', 'university')),
  item_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 7. APPLICATIONS
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  scholarship_id uuid REFERENCES scholarships(id) ON DELETE CASCADE NOT NULL,
  status text DEFAULT 'saved',
  notes text,
  next_action text,
  next_action_date date,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- 8. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 9. EXTRACTED_PROFILE_DATA (from CV analysis)
CREATE TABLE IF NOT EXISTS extracted_profile_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  raw_extraction jsonb DEFAULT '{}',
  skills text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- 10. DISCOVERY_LOG (web scraping logs)
CREATE TABLE IF NOT EXISTS discovery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  status text DEFAULT 'pending',
  raw_snapshot jsonb DEFAULT '{}',
  fetched_at timestamptz DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — DISABLED for custom JWT auth
-- Since we use our own JWT auth (not Supabase Auth),
-- we disable RLS and rely on API-level checks.
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE universities ENABLE ROW LEVEL SECURITY;
ALTER TABLE scholarships ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE attestation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE shortlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_profile_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_log ENABLE ROW LEVEL SECURITY;

-- Allow all operations (auth is handled by the Express API with JWT)
CREATE POLICY "Allow all for API" ON profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for API" ON universities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for API" ON scholarships FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for API" ON matches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for API" ON attestation_steps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for API" ON shortlist FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for API" ON applications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for API" ON notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for API" ON extracted_profile_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for API" ON discovery_log FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- STORAGE BUCKET for CV uploads
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('cvs', 'cvs', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated uploads/reads (handled by API, not Supabase Auth)
CREATE POLICY "Allow all for API" ON storage.objects FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- SAMPLE DATA — universities
-- ============================================================
INSERT INTO universities (id, name, country, degree_programs, official_portal_url) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'University of Melbourne', 'Australia', ARRAY['Bachelor''s', 'Master''s', 'PhD'], 'https://www.unimelb.edu.au'),
  ('a0000001-0000-0000-0000-000000000002', 'University of Toronto', 'Canada', ARRAY['Bachelor''s', 'Master''s', 'PhD'], 'https://www.utoronto.ca'),
  ('a0000001-0000-0000-0000-000000000003', 'TU Delft', 'Netherlands', ARRAY['Bachelor''s', 'Master''s', 'PhD'], 'https://www.tudelft.nl'),
  ('a0000001-0000-0000-0000-000000000004', 'University of Oxford', 'United Kingdom', ARRAY['Bachelor''s', 'Master''s', 'PhD'], 'https://www.ox.ac.uk'),
  ('a0000001-0000-0000-0000-000000000005', 'Stanford University', 'United States', ARRAY['Bachelor''s', 'Master''s', 'PhD'], 'https://www.stanford.edu'),
  ('a0000001-0000-0000-0000-000000000006', 'TU Munich', 'Germany', ARRAY['Bachelor''s', 'Master''s', 'PhD'], 'https://www.tum.de'),
  ('a0000001-0000-0000-0000-000000000007', 'University of British Columbia', 'Canada', ARRAY['Bachelor''s', 'Master''s', 'PhD'], 'https://www.ubc.ca'),
  ('a0000001-0000-0000-0000-000000000008', 'KTH Royal Institute of Technology', 'Sweden', ARRAY['Bachelor''s', 'Master''s', 'PhD'], 'https://www.kth.se'),
  ('a0000001-0000-0000-0000-000000000009', 'University of Sydney', 'Australia', ARRAY['Bachelor''s', 'Master''s', 'PhD'], 'https://www.sydney.edu.au'),
  ('a0000001-0000-0000-0000-000000000010', 'Imperial College London', 'United Kingdom', ARRAY['Bachelor''s', 'Master''s', 'PhD'], 'https://www.imperial.ac.uk')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SAMPLE DATA — scholarships
-- ============================================================
INSERT INTO scholarships (title, country, university_id, scholarship_type, degree_level, department, eligibility_criteria, deadline, apply_url, status) VALUES
  ('Melbourne Graduate Research Scholarship', 'Australia', 'a0000001-0000-0000-0000-000000000001', 'merit-based', 'Master''s', 'Computer Science',
   '{"min_cgpa": 3.5, "min_ielts": 6.5, "required_degree": "Bachelor''s", "funding_coverage": "Full tuition + $35,000 stipend", "funding_value": 50000}',
   '2026-10-31', 'https://scholarships.unimelb.edu.au/award/graduate-research-scholarship', 'active'),

  ('Lester B. Pearson International Scholarship', 'Canada', 'a0000001-0000-0000-0000-000000000002', 'merit-based', 'Bachelor''s', NULL,
   '{"min_cgpa": 3.7, "min_ielts": 6.5, "funding_coverage": "Full tuition + books + incidental", "funding_value": 60000}',
   '2026-11-30', 'https://future.utoronto.ca/pearson/', 'active'),

  ('Holland Scholarship', 'Netherlands', NULL, 'merit-based', 'Bachelor''s', NULL,
   '{"min_cgpa": 3.0, "min_ielts": 6.0, "funding_coverage": "€5,000 one-time", "funding_value": 5000}',
   '2026-02-01', 'https://www.studyinholland.nl/finances/scholarships/holland-scholarship', 'active'),

  ('Rhodes Scholarship', 'United Kingdom', 'a0000001-0000-0000-0000-000000000004', 'merit-based', 'Master''s', NULL,
   '{"min_cgpa": 3.8, "min_ielts": 7.5, "required_degree": "Bachelor''s", "funding_coverage": "Full tuition + stipend + travel", "funding_value": 70000}',
   '2026-07-31', 'https://www.rhodeshouse.ox.ac.uk/scholarships/', 'active'),

  ('Fulbright Foreign Student Program', 'United States', NULL, 'merit-based', 'Master''s', NULL,
   '{"min_cgpa": 3.5, "min_ielts": 7.0, "required_degree": "Bachelor''s", "funding_coverage": "Full tuition + living stipend + travel", "funding_value": 55000}',
   '2026-05-15', 'https://foreign.fulbrightonline.org/', 'active'),

  ('DAAD Scholarship', 'Germany', NULL, 'merit-based', 'Master''s', NULL,
   '{"min_cgpa": 3.0, "min_ielts": 6.0, "funding_coverage": "€934/month + travel + insurance", "funding_value": 12000}',
   '2026-09-30', 'https://www.daad.de/en/studying-in-germany/scholarships/', 'active'),

  ('Knight-Hennessy Scholars', 'United States', 'a0000001-0000-0000-0000-000000000005', 'merit-based', 'Master''s', NULL,
   '{"min_cgpa": 3.8, "min_ielts": 7.0, "required_degree": "Bachelor''s", "funding_coverage": "Full tuition + stipend + travel", "funding_value": 80000}',
   '2026-10-06', 'https://knight-hennessy.stanford.edu/', 'active'),

  ('UBC International Major Entrance Scholarship', 'Canada', 'a0000001-0000-0000-0000-000000000007', 'merit-based', 'Bachelor''s', NULL,
   '{"min_cgpa": 3.8, "min_ielts": 6.5, "funding_coverage": "Up to $40,000", "funding_value": 40000}',
   '2026-12-01', 'https://you.ubc.ca/finances/scholarships-awards/', 'active'),

  ('KTH Scholarship', 'Sweden', 'a0000001-0000-0000-0000-000000000008', 'merit-based', 'Master''s', 'Computer Science',
   '{"min_cgpa": 3.5, "min_ielts": 6.5, "required_degree": "Bachelor''s", "funding_coverage": "Full tuition", "funding_value": 20000}',
   '2026-01-15', 'https://www.kth.se/en/studies/master/application/scholarships', 'active'),

  ('Sydney Scholars Awards', 'Australia', 'a0000001-0000-0000-0000-000000000009', 'merit-based', 'Bachelor''s', NULL,
   '{"min_cgpa": 3.5, "min_ielts": 6.5, "funding_coverage": "$6,000 per year", "funding_value": 6000}',
   '2026-09-30', 'https://www.sydney.edu.au/scholarships', 'active'),

  ('Chevening Scholarship', 'United Kingdom', NULL, 'government', 'Master''s', NULL,
   '{"min_cgpa": 3.3, "min_ielts": 6.5, "required_degree": "Bachelor''s", "funding_coverage": "Full tuition + living + travel", "funding_value": 50000}',
   '2026-11-02', 'https://www.chevening.org/scholarships/', 'active'),

  ('Erasmus Mundus Joint Masters', 'Netherlands', NULL, 'government', 'Master''s', NULL,
   '{"min_cgpa": 3.0, "min_ielts": 6.5, "required_degree": "Bachelor''s", "funding_coverage": "Full tuition + €1,000/month + travel", "funding_value": 30000}',
   '2026-01-31', 'https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters-scholarships', 'active'),

  ('Gates Cambridge Scholarship', 'United Kingdom', NULL, 'merit-based', 'Master''s', NULL,
   '{"min_cgpa": 3.8, "min_ielts": 7.5, "required_degree": "Bachelor''s", "funding_coverage": "Full tuition + stipend + travel", "funding_value": 65000}',
   '2026-10-15', 'https://www.gatescambridge.org/', 'active'),

  ('Australia Awards Scholarships', 'Australia', NULL, 'government', 'Master''s', NULL,
   '{"min_cgpa": 3.0, "min_ielts": 6.5, "funding_coverage": "Full tuition + stipend + travel + health", "funding_value": 45000}',
   '2026-04-30', 'https://www.dfat.gov.au/people-to-people/australia-awards/australia-awards-scholarships', 'active'),

  ('TU Munich Excellence Scholarship', 'Germany', 'a0000001-0000-0000-0000-000000000006', 'merit-based', 'Master''s', 'Computer Science',
   '{"min_cgpa": 3.7, "min_ielts": 6.5, "required_degree": "Bachelor''s", "funding_coverage": "€10,000 per year", "funding_value": 10000}',
   '2026-07-15', 'https://www.tum.de/en/studies/fees-and-financial-aid/scholarships', 'active');

-- ============================================================
-- Done! Your database is ready.
-- Now update .env with your Supabase URL and Key.
-- ============================================================
