const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
// Validate required environment variables at startup
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'JWT_SECRET'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.warn(`Warning: Missing environment variables: ${missingVars.join(', ')}`);
  console.warn('Some features will not work until these are configured in .env');
}
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cheerio = require('cheerio');
const { validate, rateLimit, sanitizeInput } = require('./validation');
let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch (e) { console.warn('pdf-parse unavailable:', e.message); }
const mammoth = require('mammoth');
let jsPDF = null;
try { jsPDF = require('jspdf').jsPDF; } catch (e) { console.warn('jspdf unavailable:', e.message); }
let Resend = null;
try { Resend = require('resend').Resend; } catch (e) { console.warn('resend unavailable:', e.message); }

// ── AI Agent Setup (Google Gemini) ──────────────────────────
// The Gemini free tier enforces a separate daily quota per model, so we keep a
// fallback chain: when one model's quota is exhausted (429), the next is tried.
const AI_MODEL_CHAIN = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite'];
let aiModel = null;
let aiModelChain = [];
try {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && !geminiKey.startsWith('YOUR_') && geminiKey.length > 10) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(geminiKey);
    aiModelChain = AI_MODEL_CHAIN.map((name) => ({ name, model: genAI.getGenerativeModel({ model: name }) }));
    aiModel = aiModelChain[0].model;
    console.log(`AI agent initialized (Google Gemini: ${AI_MODEL_CHAIN.join(' -> ')}).`);
  } else {
    console.warn('Warning: GEMINI_API_KEY not set - AI features will use fallback responses.');
    console.warn('Get a free key at: https://aistudio.google.com/apikey');
  }
} catch (err) {
  console.warn('AI agent failed to initialize:', err.message);
}

function isQuotaError(err) {
  return /\[429|Too Many Requests|exceeded your current quota/i.test((err && err.message) || '');
}

function isTransientError(err) {
  return /\[5\d\d|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|unavailable|overloaded/i.test((err && err.message) || '');
}

async function askAI(prompt, jsonMode = false) {
  if (!aiModel) {
    return jsonMode ? null : 'AI is not configured. Please set GEMINI_API_KEY in .env.';
  }
  let quotaExhausted = false;
  for (const { name, model } of aiModelChain) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (jsonMode) {
        // Try to extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      }
      return text;
    } catch (err) {
      console.error(`AI error (${name}):`, err.message);
      if (isQuotaError(err)) quotaExhausted = true;
      // Quota limits and transient failures are retried on the next model in the chain
      if (isQuotaError(err) || isTransientError(err)) continue;
      break;
    }
  }
  if (quotaExhausted) {
    return jsonMode ? null : 'The AI assistant has reached its free daily request limit. Please try again later - the quota resets daily at midnight Pacific Time.';
  }
  return jsonMode ? null : 'Sorry, the AI assistant encountered an error. Please try again.';
}

try {
  const { Agent, setGlobalDispatcher } = require('undici');
  const agent = new Agent({
    connections: 50,
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 600_000,
    connectTimeout: 30_000
  });
  setGlobalDispatcher(agent);
} catch (e) {
  console.warn('undici Agent setup skipped (serverless):', e.message);
}
const upload = multer({ storage: multer.memoryStorage() });
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    const allowed = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'https://scholarpath-ai-olive.vercel.app',
    ];
    if (allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    callback(null, true); // allow all in production for now
  },
  credentials: true
}));


// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }
    req.userId = decoded.id;
    next();
  });
}
app.use(express.json());

// XSS sanitization - must run AFTER express.json() so req.body is parsed
app.use(sanitizeInput);

// Supabase client setup
let supabase;
try {
  supabase = createClient(
    process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_KEY || 'placeholder-key'
  );
  console.log('Supabase client initialized.');
} catch (err) {
  console.warn('Supabase client failed to initialize:', err.message);
  console.warn('Set SUPABASE_URL and SUPABASE_KEY in .env to enable database features.');
}

// Supabase availability check middleware
function requireSupabase(req, res, next) {
  if (!supabase) {
    return res.status(503).json({
      success: false,
      error: 'Database not configured. Set SUPABASE_URL and SUPABASE_KEY in .env and restart the server.'
    });
  }
  next();
}

// Test route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running!' });
});

// Test Supabase connection
app.get('/api/test-db', requireSupabase, async (req, res) => {
  const { data, error } = await supabase.from('profiles').select('*').limit(1);
  if (error) {
    return res.status(500).json({ connected: false, error: error.message });
  }
  res.json({ connected: true, data });
});
// Update own profile (linked to logged-in user, no duplicate rows)
app.patch('/api/profile', authenticateToken, requireSupabase, async (req, res) => {
  const { full_name, cgpa, ielts_score, target_country, target_degree, target_department, phone, gender, date_of_birth, cnic, residency_country, fsc_percentage, previous_degree, previous_university, previous_percentage, target_field } = req.body;

  const updates = {};
  if (full_name !== undefined) updates.full_name = full_name;
  if (cgpa !== undefined) updates.cgpa = cgpa;
  if (ielts_score !== undefined) updates.ielts_score = ielts_score;
  if (target_country !== undefined) updates.target_country = target_country;
  if (target_degree !== undefined) updates.target_degree = target_degree;
  if (target_department !== undefined) updates.target_department = target_department;
  if (phone !== undefined) updates.phone = phone;
  if (gender !== undefined) updates.gender = gender;
  if (date_of_birth !== undefined) updates.date_of_birth = date_of_birth;
  if (cnic !== undefined) updates.cnic = cnic;
  if (residency_country !== undefined) updates.residency_country = residency_country;
  if (fsc_percentage !== undefined) updates.fsc_percentage = fsc_percentage;
  if (previous_degree !== undefined) updates.previous_degree = previous_degree;
  if (previous_university !== undefined) updates.previous_university = previous_university;
  if (previous_percentage !== undefined) updates.previous_percentage = previous_percentage;
  if (target_field !== undefined) updates.target_field = target_field;

  // Also copy target_field to target_department for backward compat
  if (target_field !== undefined && !updates.target_department) {
    updates.target_department = target_field;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', req.userId)
    .select();

  if (error) {
    // If extra columns don't exist yet, retry with core fields only
    if (error.message?.includes('column') || error.code === '42703') {
      const core = {};
      if (full_name !== undefined) core.full_name = full_name;
      if (cgpa !== undefined) core.cgpa = cgpa;
      if (ielts_score !== undefined) core.ielts_score = ielts_score;
      if (target_country !== undefined) core.target_country = target_country;
      if (target_degree !== undefined) core.target_degree = target_degree;
      if (target_department !== undefined) core.target_department = target_department;
      const { data: d2, error: e2 } = await supabase.from('profiles').update(core).eq('id', req.userId).select();
      if (e2) return res.status(500).json({ success: false, error: e2.message });
      return res.json({ success: true, profile: d2[0], warning: 'Some fields not saved. Run the migration SQL to add new columns.' });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, profile: data[0] });
});

// Get profile by id
app.get('/api/profile/:id', authenticateToken, requireSupabase, async (req, res) => {
  const { id } = req.params;
  if (id !== req.userId) {
  return res.status(403).json({ success: false, error: 'Not authorized to view this profile' });
}

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return res.status(404).json({ success: false, error: error.message });
  }
  res.json({ success: true, profile: data });
});
// Upload CV and link to profile
app.post('/api/profile/:id/upload-cv', authenticateToken, requireSupabase, upload.single('cv'), async (req, res) => {
  const { id } = req.params;
  if (id !== req.userId) {
  return res.status(403).json({ success: false, error: 'Not authorized' });
}
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const filePath = `${id}/${Date.now()}_${file.originalname}`;

  const { data, error } = await supabase.storage
    .from('cvs')
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
    });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ cv_file_path: filePath })
    .eq('id', id);

  if (updateError) {
    return res.status(500).json({ success: false, error: updateError.message });
  }

  res.json({ success: true, file_path: filePath });
});
// Analyze CV - AI Agent extracts academic data from uploaded CV (real PDF/DOCX parsing)
// Accepts either a direct file upload OR downloads from Supabase storage if no file provided
app.post('/api/profile/:id/analyze', authenticateToken, requireSupabase, upload.single('cv'), async (req, res) => {
  const { id } = req.params;
  if (id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  let cvText = '';
  let fileBuf = null;
  let mimeType = '';

  if (req.file) {
    // File uploaded directly in this request
    fileBuf = req.file.buffer;
    mimeType = req.file.mimetype;
  } else {
    // No file in request - try to download from Supabase storage
    const { data: profile } = await supabase.from('profiles').select('cv_file_path').eq('id', id).single();
    if (profile?.cv_file_path) {
      try {
        const { data: fileData, error: dlError } = await supabase.storage.from('cvs').download(profile.cv_file_path);
        if (!dlError && fileData) {
          fileBuf = Buffer.from(await fileData.arrayBuffer());
          mimeType = fileData.type || 'application/pdf';
          // Also re-upload to this request for storage path update
        }
      } catch (e) {
        console.error('Storage download failed:', e.message);
      }
    }
  }

  // Extract text from file
  if (fileBuf) {
    if (mimeType === 'application/pdf') {
      try {
        const pdfData = await pdfParse(fileBuf);
        cvText = pdfData.text.slice(0, 5000);
      } catch (e) {
        cvText = `[PDF parsing failed: ${e.message}]`;
      }
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        const docxResult = await mammoth.extractRawText({ buffer: fileBuf });
        cvText = docxResult.value.slice(0, 5000);
      } catch (e) {
        cvText = `[DOCX parsing failed: ${e.message}]`;
      }
    } else if (mimeType === 'text/plain') {
      cvText = fileBuf.toString('utf-8').slice(0, 5000);
    } else {
      cvText = `[Unsupported file type: ${mimeType}]`;
    }

    // Upload to Supabase storage (only if file was directly uploaded)
    if (req.file) {
      const filePath = `${id}/${Date.now()}_${req.file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from('cvs')
        .upload(filePath, fileBuf, { contentType: mimeType });
      if (!uploadError) {
        await supabase.from('profiles').update({ cv_file_path: filePath }).eq('id', id);
      }
    }
  }

  const extractedPrompt = `You are a CV parser for an academic scholarship matching platform.
Analyze this CV/resume text and extract academic details accurately.
Do NOT invent information that does not exist. If something is missing, return null.

CV text:
${cvText || 'No CV content available.'}

Return ONLY valid JSON:
{
  "cgpa": number (0-4 scale, null if not found),
  "ielts_score": number (0-9 scale, null if not found),
  "degree_level": string (e.g. "BS", "MS", "Bachelor's", "Master's", null if not found),
  "department": string (e.g. "Computer Science", null if not found),
  "university": string (current/past university name, null if not found),
  "skills": array of strings (technical and soft skills found in CV),
  "experience_years": number (total years of work experience, 0 if none),
  "languages": array of strings (languages mentioned),
  "certifications": array of strings (certifications mentioned)
}`;

  let extractedData = await askAI(extractedPrompt, true);

  if (!extractedData) {
    extractedData = {
      cgpa: null, ielts_score: null, degree_level: null, department: null,
      skills: ['Upload a PDF/DOCX CV for better extraction'],
      experience_years: 0, languages: [], certifications: []
    };
  }

  // Save extracted data
  const { error: insertError } = await supabase
    .from('extracted_profile_data')
    .insert([{
      profile_id: id,
      raw_extraction: extractedData,
      skills: extractedData.skills || []
    }]);

  if (insertError) {
    return res.status(500).json({ success: false, error: insertError.message });
  }

  // Update profile with extracted values (only non-null)
  const profileUpdates = {};
  if (extractedData.cgpa != null) profileUpdates.cgpa = extractedData.cgpa;
  if (extractedData.ielts_score != null) profileUpdates.ielts_score = extractedData.ielts_score;
  if (extractedData.degree_level) profileUpdates.target_degree = extractedData.degree_level;
  if (extractedData.department) profileUpdates.target_department = extractedData.department;

  if (Object.keys(profileUpdates).length > 0) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update(profileUpdates)
      .eq('id', id);

    if (updateError) {
      return res.status(500).json({ success: false, error: updateError.message });
    }
  }

  res.json({ success: true, extracted: extractedData, cv_text_length: cvText.length });
});
// List scholarships with filters
app.get('/api/scholarships', requireSupabase, async (req, res) => {
  const { country, scholarship_type, department, degree_level } = req.query;

  let query = supabase.from('scholarships').select('*, universities(name, official_portal_url)');

  if (country) query = query.eq('country', country);
  if (scholarship_type) query = query.eq('scholarship_type', scholarship_type);
  if (department) query = query.eq('department', department);
  if (degree_level) query = query.eq('degree_level', degree_level);

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, scholarships: data });
});

// Get single scholarship by id
app.get('/api/scholarships/:id', requireSupabase, async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('scholarships')
    .select('*, universities(name, official_portal_url)')
    .eq('id', id)
    .single();

  if (error) {
    return res.status(404).json({ success: false, error: error.message });
  }
  res.json({ success: true, scholarship: data });
});
// List universities with filters - includes those with direct scholarships OR country-wide scholarships
app.get('/api/universities', requireSupabase, async (req, res) => {
  const { country, degree_program, search } = req.query;

  // Get all universities matching basic filters
  let uniQuery = supabase.from('universities').select('*');
  if (country) uniQuery = uniQuery.eq('country', country);
  if (degree_program) uniQuery = uniQuery.contains('degree_programs', [degree_program]);
  if (search) uniQuery = uniQuery.ilike('name', `%${search}%`);

  // Run university query and scholarship queries in parallel for speed
  const [uniResult, directResult, countryResult] = await Promise.all([
    uniQuery,
    supabase.from('scholarships').select('university_id').not('university_id', 'is', null).eq('status', 'active'),
    supabase.from('scholarships').select('country').is('university_id', null).eq('status', 'active'),
  ]);

  const { data: universities, error: uniError } = uniResult;
  if (uniError) {
    return res.status(500).json({ success: false, error: uniError.message });
  }

  const directScholarships = directResult.data || [];
  const countryWideScholarships = countryResult.data || [];

  const directUniversityIds = new Set(directScholarships.map(s => s.university_id));
  const countryWideCountries = new Set(countryWideScholarships.map(s => s.country));

  // Filter + deduplicate by name (prevent duplicate universities)
  const seen = new Set();
  const filtered = universities.filter(u => {
    if (!directUniversityIds.has(u.id) && !countryWideCountries.has(u.country)) return false;
    const key = u.name + '|' + u.country;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  res.json({ success: true, universities: filtered });
});


// Get single university by id
app.get('/api/universities/:id', requireSupabase, async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('universities')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return res.status(404).json({ success: false, error: error.message });
  }
  res.json({ success: true, university: data });
});
// Static Language Preparation reference data
const languagePrepGuides = {
  IELTS: {
    full_name: "International English Language Testing System",
    sections: ["Listening", "Reading", "Writing", "Speaking"],
    score_range: "0-9 bands",
    typical_requirement: "6.0 - 7.5 depending on program",
    free_resources: [
      "British Council IELTS free practice materials",
      "IELTS Liz (free lessons and tips)",
      "Cambridge IELTS past papers (books 10-18)"
    ],
    study_plan: [
      "Week 1-2: Diagnostic test + identify weak sections",
      "Week 3-6: Focused practice on weakest sections daily",
      "Week 7-8: Full-length mock tests under timed conditions",
      "Week 9: Final review and light practice before test day"
    ]
  },
  TOEFL: {
    full_name: "Test of English as a Foreign Language",
    sections: ["Reading", "Listening", "Speaking", "Writing"],
    score_range: "0-120 points",
    typical_requirement: "80 - 100 depending on program",
    free_resources: [
      "ETS official free practice test",
      "TOEFL Go app (official)",
      "Notefull free YouTube lessons"
    ],
    study_plan: [
      "Week 1-2: Diagnostic test + identify weak sections",
      "Week 3-6: Focused practice on weakest sections daily",
      "Week 7-8: Full-length mock tests under timed conditions",
      "Week 9: Final review and light practice before test day"
    ]
  },
  PTE: {
    full_name: "Pearson Test of English",
    sections: ["Speaking & Writing", "Reading", "Listening"],
    score_range: "10-90 points",
    typical_requirement: "58 - 76 depending on program",
    free_resources: [
      "Pearson official free practice questions",
      "PTE Tutorials (free YouTube channel)",
      "APEUni free question bank"
    ],
    study_plan: [
      "Week 1-2: Diagnostic test + identify weak sections",
      "Week 3-6: Focused practice on weakest sections daily",
      "Week 7-8: Full-length mock tests under timed conditions",
      "Week 9: Final review and light practice before test day"
    ]
  }
};

// Get static guide for a test type
app.get('/api/language-prep/:testType', (req, res) => {
  const { testType } = req.params;
  const guide = languagePrepGuides[testType.toUpperCase()];

  if (!guide) {
    return res.status(404).json({ success: false, error: 'Unknown test type. Use IELTS, TOEFL, or PTE.' });
  }
  res.json({ success: true, test_type: testType.toUpperCase(), guide });
});

// Get personalized language prep info for a profile (compares current score to what their matches require)
app.get('/api/language-prep/profile/:profileId', authenticateToken, requireSupabase, async (req, res) => {
  const { profileId } = req.params;
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('ielts_score')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return res.status(404).json({ success: false, error: 'Profile not found' });
  }

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('*, scholarships(title, eligibility_criteria)')
    .eq('profile_id', profileId);

  if (matchesError) {
    return res.status(500).json({ success: false, error: matchesError.message });
  }

  const currentScore = profile.ielts_score;
  const requirements = matches
    .filter(m => m.scholarships?.eligibility_criteria?.min_ielts != null)
    .map(m => ({
      scholarship: m.scholarships.title,
      required: m.scholarships.eligibility_criteria.min_ielts,
      gap: currentScore != null ? (m.scholarships.eligibility_criteria.min_ielts - currentScore).toFixed(1) : null
    }));

  const highestRequirement = requirements.length > 0
    ? Math.max(...requirements.map(r => r.required))
    : null;

  res.json({
    success: true,
    current_ielts_score: currentScore,
    highest_required_score: highestRequirement,
    needs_improvement: currentScore != null && highestRequirement != null ? currentScore < highestRequirement : null,
    requirements_by_scholarship: requirements,
    guide: languagePrepGuides.IELTS
  });
});
// Static reference guides for each authority
const attestationGuides = {
  HEC: [
    { step_order: 1, description: "Create an account on HEC's online attestation portal" },
    { step_order: 2, description: "Upload scanned copies of your degree and transcript" },
    { step_order: 3, description: "Pay the attestation fee online" },
    { step_order: 4, description: "Submit original documents at your nearest HEC regional center" },
    { step_order: 5, description: "Collect attested documents after processing (usually 7-10 working days)" }
  ],
  IBCC: [
    { step_order: 1, description: "Apply for equivalence certificate if you studied O/A Levels or foreign curriculum" },
    { step_order: 2, description: "Submit original certificates along with IBCC application form" },
    { step_order: 3, description: "Pay the required processing fee" },
    { step_order: 4, description: "Wait for verification and equivalence certificate issuance" }
  ],
  MOFA: [
    { step_order: 1, description: "Ensure your documents are already attested by HEC/IBCC first" },
    { step_order: 2, description: "Submit documents to Ministry of Foreign Affairs for final attestation" },
    { step_order: 3, description: "Pay MOFA attestation fee" },
    { step_order: 4, description: "Collect MOFA-stamped documents, required for international submission" }
  ]
};

// Get static guide for an authority
app.get('/api/attestation/:authority', (req, res) => {
  const { authority } = req.params;
  const guide = attestationGuides[authority.toUpperCase()];

  if (!guide) {
    return res.status(404).json({ success: false, error: 'Unknown authority. Use HEC, IBCC, or MOFA.' });
  }
  res.json({ success: true, authority: authority.toUpperCase(), steps: guide });
});

// Initialize tracked steps for a profile
app.post('/api/attestation/:authority/init/:profileId', authenticateToken, requireSupabase, async (req, res) => {

  const { authority, profileId } = req.params;
  if (profileId !== req.userId) {
  return res.status(403).json({ success: false, error: 'Not authorized' });
}
  const guide = attestationGuides[authority.toUpperCase()];

  if (!guide) {
    return res.status(404).json({ success: false, error: 'Unknown authority. Use HEC, IBCC, or MOFA.' });
  }

  const rows = guide.map(step => ({
    profile_id: profileId,
    authority: authority.toUpperCase(),
    step_order: step.step_order,
    step_description: step.description,
    status: 'pending'
  }));

  const { data, error } = await supabase.from('attestation_steps').insert(rows).select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, steps: data });
});

// Get a profile's tracked attestation steps
app.get('/api/attestation/profile/:profileId', authenticateToken, requireSupabase, async (req, res) => {
  const { profileId } = req.params;

  // Check if the user is authorized to view this profile's attestation steps
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data, error } = await supabase
    .from('attestation_steps')
    .select('*')
    .eq('profile_id', profileId)
    .order('authority')
    .order('step_order');

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, steps: data });
});

// Mark a step as done
app.patch('/api/attestation/:id/complete', authenticateToken, requireSupabase, async (req, res) => {
  const { id } = req.params;

  // Check if the user is authorized to update this step
  const { data: existing, error: fetchError } = await supabase
    .from('attestation_steps')
    .select('profile_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ success: false, error: 'Step not found' });
  }

  if (existing.profile_id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data, error } = await supabase
    .from('attestation_steps')
    .update({ status: 'done' })
    .eq('id', id)
    .select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, step: data[0] });
});
// Signup
app.post('/api/auth/signup', rateLimit({ windowMs: 60000, max: 5 }), requireSupabase, validate({
  full_name: { required: true, minLength: 2, maxLength: 100 },
  email: { required: true, type: 'email', maxLength: 255 },
  password: { required: true, minLength: 6, maxLength: 128 },
}), async (req, res) => {
  const { full_name, email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('profiles')
    .insert([{ full_name, email, password_hash }])
    .select('id, full_name, email');

  if (error) {
    if (error.code === '23505' || error.message?.includes('duplicate')) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists. Try logging in instead.' });
    }
    return res.status(500).json({ success: false, error: error.message });
  }

  const token = jwt.sign({ id: data[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' });

  res.json({ success: true, user: data[0], token });
});

// Login
app.post('/api/auth/login', rateLimit({ windowMs: 60000, max: 10 }), requireSupabase, validate({
  email: { required: true, type: 'email' },
  password: { required: true, minLength: 1 },
}), async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, password_hash')
    .eq('email', email)
    .single();

  if (error || !data) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  const passwordMatches = await bcrypt.compare(password, data.password_hash);

  if (!passwordMatches) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  const token = jwt.sign({ id: data.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

  res.json({
    success: true,
    user: { id: data.id, full_name: data.full_name, email: data.email },
    token
  });
});
// ── Weighted Eligibility Engine (imported from matching-engine.js) ──
const { WEIGHTS, FIELD_GROUPS, normalizeDegree, degreesMatch, fieldsMatch, isDeadlineValid } = require('./matching-engine');

// Run matching for a profile against all scholarships - Weighted Engine with Reasons
app.post('/api/profile/:id/match-scholarships', authenticateToken, requireSupabase, async (req, res) => {

  const { id } = req.params;
  if (id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (profileError || !profile) {
    return res.status(404).json({ success: false, error: 'Profile not found' });
  }

  // Match scholarships from user's target country (or all if no country set)
  let query = supabase
    .from('scholarships')
    .select('*, universities(name)')
    .eq('status', 'active');

  if (profile.target_country) {
    query = query.eq('country', profile.target_country);
  }

  const { data: scholarships, error: scholarshipsError } = await query;

  if (scholarshipsError) {
    return res.status(500).json({ success: false, error: scholarshipsError.message });
  }

  // Determine which CGPA to use based on degree type
  const isBachelor = profile.target_degree && profile.target_degree.toLowerCase().includes('bachelor');
  const userGpa = isBachelor ? (profile.fsc_percentage || profile.cgpa) : profile.cgpa;
  const gpaLabel = isBachelor && profile.fsc_percentage ? 'FSc %' : 'CGPA';

  const allResults = scholarships.map(sch => {
    const criteria = sch.eligibility_criteria || {};
    const evidence = [];
    const reasons = []; // Clear reasons WHY not eligible
    let weightedScore = 0;
    let totalWeightUsed = 0;
    let fatalFail = false;

    // 1. Deadline check (hard filter - expired = Not Eligible)
    if (sch.deadline && !isDeadlineValid(sch.deadline)) {
      evidence.push({ criterion: 'Deadline', required: sch.deadline, actual: 'Expired', result: 'Fail', weight: 0, note: 'Deadline has passed' });
      reasons.push('Application deadline has passed (' + sch.deadline + ')');
      fatalFail = true;
    }

    // 2. CGPA / FSc percentage (25%)
    if (criteria.min_cgpa != null) {
      const w = WEIGHTS.cgpa;
      totalWeightUsed += w;
      if (userGpa == null) {
        evidence.push({ criterion: gpaLabel, required: criteria.min_cgpa, actual: null, result: 'Missing', weight: w });
        reasons.push(gpaLabel + ' not provided - minimum required is ' + criteria.min_cgpa);
      } else if (Number(userGpa) >= Number(criteria.min_cgpa)) {
        evidence.push({ criterion: gpaLabel, required: criteria.min_cgpa, actual: Number(userGpa), result: 'Pass', weight: w });
        weightedScore += w * 100;
      } else {
        evidence.push({ criterion: gpaLabel, required: criteria.min_cgpa, actual: Number(userGpa), result: 'Fail', weight: w });
        reasons.push('Your ' + gpaLabel + ' (' + Number(userGpa) + ') is below the minimum required (' + criteria.min_cgpa + ')');
        if (Number(userGpa) < Number(criteria.min_cgpa) - 0.5) fatalFail = true;
      }
    }

    // 3. Field/Department matching (25%)
    const userField = profile.target_department || profile.target_field;
    if (sch.department) {
      const w = WEIGHTS.field;
      totalWeightUsed += w;
      const match = fieldsMatch(userField, sch.department);
      if (match === null) {
        evidence.push({ criterion: 'Field', required: sch.department, actual: userField || null, result: 'Missing', weight: w });
        reasons.push('Target field not specified in your profile');
      } else if (match === 'exact') {
        evidence.push({ criterion: 'Field', required: sch.department, actual: userField, result: 'Pass', weight: w });
        weightedScore += w * 100;
      } else if (match === 'related') {
        evidence.push({ criterion: 'Field', required: sch.department, actual: userField, result: 'Pass', weight: w, note: 'Related field accepted' });
        weightedScore += w * 75;
      } else {
        evidence.push({ criterion: 'Field', required: sch.department, actual: userField, result: 'Fail', weight: w });
        reasons.push('Your field (' + (userField || 'not set') + ') does not match the required field (' + sch.department + ')');
        fatalFail = true;
      }
    }

    // 4. Degree level (20%) - use eligibility_criteria.required_degree OR top-level degree_level
    const requiredDeg = criteria.required_degree || sch.degree_level;
    if (requiredDeg) {
      const w = WEIGHTS.degree;
      totalWeightUsed += w;
      if (!profile.target_degree) {
        evidence.push({ criterion: 'Degree', required: requiredDeg, actual: null, result: 'Missing', weight: w });
        reasons.push('Target degree not specified in your profile');
      } else {
        const degResult = degreesMatch(profile.target_degree, requiredDeg);
        if (degResult === 'exact') {
          evidence.push({ criterion: 'Degree', required: requiredDeg, actual: profile.target_degree, result: 'Pass', weight: w });
          weightedScore += w * 100;
        } else if (degResult === 'progression') {
          // User has lower degree (e.g. Bachelor's applying for Master's) - still allow with partial score
          evidence.push({ criterion: 'Degree', required: requiredDeg, actual: profile.target_degree, result: 'Pass', weight: w, note: 'Degree progression accepted' });
          weightedScore += w * 80;
        } else if (degResult === null) {
          evidence.push({ criterion: 'Degree', required: requiredDeg, actual: profile.target_degree, result: 'Missing', weight: w });
          reasons.push('Could not determine degree match');
        } else {
          evidence.push({ criterion: 'Degree', required: requiredDeg, actual: profile.target_degree, result: 'Fail', weight: w });
          reasons.push('This scholarship requires ' + requiredDeg + ' but you selected ' + profile.target_degree);
          fatalFail = true;
        }
      }
    }

    // 5. IELTS (15%)
    if (criteria.min_ielts != null) {
      const w = WEIGHTS.ielts;
      totalWeightUsed += w;
      if (profile.ielts_score == null) {
        evidence.push({ criterion: 'IELTS', required: criteria.min_ielts, actual: null, result: 'Missing', weight: w });
        reasons.push('IELTS score not provided - minimum required is ' + criteria.min_ielts);
      } else if (Number(profile.ielts_score) >= Number(criteria.min_ielts)) {
        evidence.push({ criterion: 'IELTS', required: criteria.min_ielts, actual: Number(profile.ielts_score), result: 'Pass', weight: w });
        weightedScore += w * 100;
      } else {
        evidence.push({ criterion: 'IELTS', required: criteria.min_ielts, actual: Number(profile.ielts_score), result: 'Fail', weight: w });
        reasons.push('Your IELTS score (' + Number(profile.ielts_score) + ') is below the minimum required (' + criteria.min_ielts + ')');
      }
    }

    // 6. Country (pre-filtered)
    if (sch.country && profile.target_country) {
      evidence.push({ criterion: 'Country', required: sch.country, actual: profile.target_country, result: 'Pass', weight: 0 });
    }

    // Normalize score
    const matchScore = totalWeightUsed > 0 ? weightedScore / totalWeightUsed : 0;

    // Determine status
    // Hard fails (degree mismatch, field mismatch, expired deadline) = Not Eligible
    // Soft fails (CGPA/IELTS slightly below min) = Partially Eligible (user can still apply)
    // Missing data = Partially Eligible
    const hardFailCriteria = ['Degree', 'Field', 'Deadline'];
    const softFailCriteria = ['CGPA', 'FSc %'];
    const hasHardFail = evidence.some(e => e.result === 'Fail' && hardFailCriteria.includes(e.criterion));
    const hasSoftFail = evidence.some(e => e.result === 'Fail' && !hardFailCriteria.includes(e.criterion));
    const hasMissing = evidence.some(e => e.result === 'Missing');
    let status;
    if (totalWeightUsed === 0) status = 'Not Scored';
    else if (fatalFail || hasHardFail) status = 'Not Eligible';
    else if (hasSoftFail) status = 'Partially Eligible';
    else if (hasMissing) status = 'Partially Eligible';
    else status = 'Eligible';

    return {
      profile_id: id,
      scholarship_id: sch.id,
      university_id: sch.university_id,
      match_score: matchScore.toFixed(2),
      status,
      evidence,
      reasons // Array of clear text reasons for Not Eligible
    };
  });

  // Filter out field mismatches
  const results = allResults.filter(r => {
    const fieldFail = r.evidence.some(e => e.criterion === 'Field' && e.result === 'Fail');
    return !fieldFail;
  });

  // Clear old matches, insert fresh
  await supabase.from('matches').delete().eq('profile_id', id);

  // Try insert with reasons; if column doesn't exist, insert without
  let inserted, insertError;
  try {
    const result = await supabase.from('matches').insert(results).select();
    inserted = result.data;
    insertError = result.error;
  } catch (e) {
    // If reasons column missing, strip reasons and retry
    const stripped = results.map(r => { const { reasons, ...rest } = r; return rest; });
    const result2 = await supabase.from('matches').insert(stripped).select();
    inserted = result2.data;
    insertError = result2.error;
  }

  if (insertError) {
    return res.status(500).json({ success: false, error: insertError.message });
  }

  res.json({ success: true, matches: inserted });
});

// Get stored matches for a profile
app.get('/api/profile/:id/matches', authenticateToken, requireSupabase, async (req, res) => {
  const { id } = req.params;

  if (id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  const { data, error } = await supabase
    .from('matches')
    .select('*, scholarships(title, country, deadline, apply_url), universities(name)')
    .eq('profile_id', id)
    .order('match_score', { ascending: false });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, matches: data });
});
// Overview/Dashboard summary for a profile
app.get('/api/profile/:id/overview', authenticateToken, requireSupabase, async (req, res) => {
  const { id } = req.params;

  if (id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (profileError || !profile) {
    return res.status(404).json({ success: false, error: 'Profile not found' });
  }

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('*, scholarships(title, country, deadline), universities(name)')
    .eq('profile_id', id);

  if (matchesError) {
    return res.status(500).json({ success: false, error: matchesError.message });
  }

  const eligibleCount = matches.filter(m => m.status === 'Eligible').length;
  const missingCount = matches.filter(m => m.status === 'Missing Requirements').length;
  const notEligibleCount = matches.filter(m => m.status === 'Not Eligible').length;

  const topRecommendations = [...matches]
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 3);

  const uniqueUniversities = [...new Set(matches.map(m => m.university_id))];

  res.json({
    success: true,
    overview: {
      profile_completeness: {
        has_cgpa: profile.cgpa != null,
        has_ielts: profile.ielts_score != null,
        has_cv: profile.cv_file_path != null,
        has_target_degree: profile.target_degree != null
      },
      summary: {
        total_scholarships_checked: matches.length,
        eligible: eligibleCount,
        missing_requirements: missingCount,
        not_eligible: notEligibleCount,
        universities_covered: uniqueUniversities.length
      },
      top_recommendations: topRecommendations
    }
  });
});
// Add item to shortlist
app.post('/api/shortlist', authenticateToken, requireSupabase, async (req, res) => {
  const { profile_id, item_type, item_id } = req.body;

  if (!profile_id || !item_type || !item_id) {
    return res.status(400).json({ success: false, error: 'profile_id, item_type, and item_id are required' });
  }

  if (!['scholarship', 'university'].includes(item_type)) {
    return res.status(400).json({ success: false, error: "item_type must be 'scholarship' or 'university'" });
  }

  const { data, error } = await supabase
    .from('shortlist')
    .insert([{ profile_id, item_type, item_id }])
    .select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, shortlisted: data[0] });
});

// Remove item from shortlist
app.delete('/api/shortlist/:id', authenticateToken, requireSupabase, async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase.from('shortlist').delete().eq('id', id);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, message: 'Removed from shortlist' });
});

// Get a profile's full shortlist (with scholarship/university details)
app.get('/api/shortlist/:profileId', authenticateToken, requireSupabase, async (req, res) => {
  const { profileId } = req.params;

  // Check if the user is authorized to view this shortlist
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data: items, error } = await supabase
    .from('shortlist')
    .select('*')
    .eq('profile_id', profileId);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  const scholarshipIds = items.filter(i => i.item_type === 'scholarship').map(i => i.item_id);
  const universityIds = items.filter(i => i.item_type === 'university').map(i => i.item_id);

  let scholarships = [];
  let universities = [];

  if (scholarshipIds.length > 0) {
    const { data } = await supabase.from('scholarships').select('*').in('id', scholarshipIds);
    scholarships = data || [];
  }

  if (universityIds.length > 0) {
    const { data } = await supabase.from('universities').select('*').in('id', universityIds);
    universities = data || [];
  }

  res.json({ success: true, scholarships, universities });
});
// Create or start tracking an application
app.post('/api/applications', authenticateToken, requireSupabase, async (req, res) => {
  const { profile_id, scholarship_id, status, notes, next_action, next_action_date } = req.body;

  if (!profile_id || !scholarship_id) {
    return res.status(400).json({ success: false, error: 'profile_id and scholarship_id are required' });
  }

  const { data, error } = await supabase
    .from('applications')
    .insert([{
      profile_id,
      scholarship_id,
      status: status || 'saved',
      notes,
      next_action,
      next_action_date
    }])
    .select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, application: data[0] });
});

// Update an application's status/notes
app.patch('/api/applications/:id', authenticateToken, requireSupabase, async (req, res) => {
  const { id } = req.params;
  const { status, notes, next_action, next_action_date } = req.body;

  // Check if the user is authorized to update this application
    // Fetch existing application to verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from('applications')
    .select('profile_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ success: false, error: 'Application not found' });
  }

  if (existing.profile_id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const updates = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (next_action !== undefined) updates.next_action = next_action;
  if (next_action_date !== undefined) updates.next_action_date = next_action_date;

  const { data, error } = await supabase
    .from('applications')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, application: data[0] });
});

// Get all applications for a profile (with scholarship details)
app.get('/api/applications/:profileId', authenticateToken, requireSupabase, async (req, res) => {
  const { profileId } = req.params;

  // Check if the user is authorized to view this profile's applications
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data, error } = await supabase
    .from('applications')
    .select('*, scholarships(title, country, deadline, apply_url)')
    .eq('profile_id', profileId)
    .order('updated_at', { ascending: false });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, applications: data });
});

// Delete/remove an application from tracker
app.delete('/api/applications/:id', authenticateToken, requireSupabase, async (req, res) => {
  const { id } = req.params;

  // Check if the user is authorized to delete this application
  const { data: existing, error: fetchError } = await supabase
    .from('applications')
    .select('profile_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ success: false, error: 'Application not found' });
  }

  if (existing.profile_id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { error } = await supabase.from('applications').delete().eq('id', id);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, message: 'Application removed from tracker' });
});
// Document Tools: CV to Europass converter - REAL profile data + AI-structured + full PDF
app.post('/api/documents/cv/convert', authenticateToken, requireSupabase, upload.single('cv'), async (req, res) => {
  const profileId = req.body?.profile_id || req.userId;

  // Fetch profile data from DB
  let profile = null;
  if (supabase) {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', profileId).single();
      profile = data;
    } catch (e) { console.error('Profile fetch failed:', e.message); }
  }

  // Get CV text from uploaded file OR Supabase storage
  let cvText = '';
  let file = req.file;

  if (file) {
    if (file.mimetype === 'application/pdf') {
      try { cvText = (await pdfParse(file.buffer)).text.slice(0, 6000); } catch { cvText = ''; }
    } else if (file.mimetype.includes('wordprocessingml')) {
      try { cvText = (await mammoth.extractRawText({ buffer: file.buffer })).value.slice(0, 6000); } catch { cvText = ''; }
    } else if (file.mimetype === 'text/plain') {
      cvText = file.buffer.toString('utf-8').slice(0, 6000);
    }
  } else if (supabase && profile?.cv_file_path) {
    // Download from storage
    try {
      const { data: fileData } = await supabase.storage.from('cvs').download(profile.cv_file_path);
      if (fileData) {
        const buf = Buffer.from(await fileData.arrayBuffer());
        const mime = fileData.type || 'application/pdf';
        if (mime === 'application/pdf') {
          cvText = (await pdfParse(buf)).text.slice(0, 6000);
        } else if (mime.includes('wordprocessingml')) {
          cvText = (await mammoth.extractRawText({ buffer: buf })).value.slice(0, 6000);
        } else {
          cvText = buf.toString('utf-8').slice(0, 6000);
        }
      }
    } catch (e) { console.error('CV download failed:', e.message); }
  }

  // AI parses CV into structured Europass sections - ONLY from CV, no profile mixing
  const fullName = profile?.full_name || 'Your Name';

  const europassPrompt = `You are a Europass CV formatting expert. Parse the CV text below into structured Europass sections.
Extract ALL information ONLY from the CV text itself. Do NOT make up or assume any information not present in the CV.

CV Text:
${cvText || 'No CV text available.'}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "full_name": "Full name as it appears on the CV",
  "email": "email if found in CV",
  "phone": "phone if found in CV",
  "address": "address/city/country if found in CV",
  "summary": "2-3 line professional summary from the CV",
  "work_experience": [
    { "period": "MM/YYYY - MM/YYYY", "role": "Job Title", "employer": "Company Name", "city": "City, Country", "description": "Key responsibilities and achievements" }
  ],
  "education": [
    { "period": "YYYY - YYYY", "degree": "Degree Name", "institution": "University/School Name", "city": "City, Country", "description": "Key subjects, thesis, CGPA if mentioned" }
  ],
  "certifications": [
    { "name": "Certification name", "issuer": "Issuing organization", "year": "YYYY" }
  ],
  "projects": [
    { "name": "Project name", "description": "Brief description", "technologies": "Technologies used" }
  ],
  "achievements": [
    "Achievement 1",
    "Achievement 2"
  ],
  "skills": {
    "communication": "From CV",
    "organisational": "From CV",
    "digital": "From CV",
    "technical": "From CV - tools, languages, frameworks",
    "other": "Other skills from CV"
  },
  "languages": [
    { "language": "English", "level": "Native/A1/A2/B1/B2/C1/C2/Fluent/Intermediate" }
  ],
  "hobbies": "Hobbies/interests if mentioned in CV",
  "references": "References if mentioned in CV, otherwise 'Available upon request'",
  "suggestions": ["suggestion 1 for improvement", "suggestion 2", "suggestion 3"]
}`;

  let parsed = await askAI(europassPrompt, true);
  if (!parsed) {
    parsed = {
      summary: 'Could not extract CV data. Please upload a clearer PDF.',
      work_experience: [],
      education: [],
      skills: { communication: '', organisational: '', digital: '', other: '' },
      languages: [],
      suggestions: ['Upload a PDF with clear text for better results', 'Make sure your CV has distinct sections', 'Use standard section headings like Education, Experience, Skills']
    };
  }

  // ── Build proper Europass PDF ──
  let pdfBase64 = null;
  try {
    const doc = new jsPDF();
    const M = 15; // margin
    const W = 180; // usable width
    const COL1 = 55; // label column width
    const COL2 = W - COL1; // content column width
    let y = 15;

    function addPageIfNeeded(needed) {
      if (y + needed > 280) { doc.addPage(); y = 15; }
    }

    function sectionHeader(title) {
      addPageIfNeeded(15);
      // Simple gray line (no blue color)
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.2);
      doc.line(M, y, M + W, y);
      y += 3;
      doc.setFontSize(11);
      doc.setTextColor(51, 51, 51);
      doc.setFont('helvetica', 'bold');
      doc.text(title.toUpperCase(), M, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
    }

    function labelValue(label, value) {
      if (!value) return;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(label, M, y);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(String(value), COL2 - 5);
      doc.text(lines, M + COL1, y);
      y += Math.max(lines.length * 4.5, 5) + 2;
    }

    // Use AI-extracted name ONLY (from CV, not profile)
    const cvName = parsed.full_name || 'Your Name';

    // ── SIMPLE EUROPASS HEADER (no blue bars - clean professional style) ──
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 51, 51);
    doc.text('CURRICULUM VITAE', M, y);
    y += 8;
    doc.setFontSize(22);
    doc.setTextColor(0, 0, 0);
    doc.text(cvName, M, y);
    y += 6;
    // Thin black line separator
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.5);
    doc.line(M, y, M + W, y);
    y += 8;

    // ── PERSONAL INFORMATION ──
    sectionHeader('Personal Information');
    labelValue('Name', cvName);
    labelValue('Email', parsed.email || '');
    labelValue('Phone', parsed.phone || '');
    labelValue('Address', parsed.address || '');
    y += 3;

    // ── PROFESSIONAL SUMMARY ──
    if (parsed.summary) {
      sectionHeader('About Me');
      doc.setFontSize(10);
      const sumLines = doc.splitTextToSize(parsed.summary, W);
      doc.text(sumLines, M, y);
      y += sumLines.length * 4.5 + 5;
    }

    // ── WORK EXPERIENCE ──
    const workExp = Array.isArray(parsed.work_experience) ? parsed.work_experience : [];
    if (workExp.length > 0) {
      sectionHeader('Work Experience');
      workExp.forEach((job) => {
        addPageIfNeeded(25);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(job.role || '', M + COL1, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        if (job.period) doc.text(String(job.period), M, y);
        doc.setTextColor(0, 0, 0);
        y += 5;
        doc.setFontSize(10);
        if (job.employer) {
          let empLine = job.employer;
          if (job.city) empLine += `, ${job.city}`;
          doc.text(empLine, M + COL1, y);
          y += 5;
        }
        if (job.description) {
          const descLines = doc.splitTextToSize(String(job.description), COL2 - 5);
          doc.setFontSize(9);
          doc.text(descLines, M + COL1, y);
          y += descLines.length * 4 + 5;
        }
        y += 3;
      });
    }

    // ── EDUCATION AND TRAINING ──
    const education = Array.isArray(parsed.education) ? parsed.education : [];
    if (education.length > 0) {
      sectionHeader('Education and Training');
      education.forEach((edu) => {
        addPageIfNeeded(25);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(edu.degree || '', M + COL1, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        if (edu.period) doc.text(String(edu.period), M, y);
        doc.setTextColor(0, 0, 0);
        y += 5;
        doc.setFontSize(10);
        if (edu.institution) {
          let instLine = edu.institution;
          if (edu.city) instLine += `, ${edu.city}`;
          doc.text(instLine, M + COL1, y);
          y += 5;
        }
        if (edu.description) {
          const descLines = doc.splitTextToSize(String(edu.description), COL2 - 5);
          doc.setFontSize(9);
          doc.text(descLines, M + COL1, y);
          y += descLines.length * 4 + 5;
        }
        y += 3;
      });
    }

    // ── PERSONAL SKILLS ──
    sectionHeader('Personal Skills');
    const skills = parsed.skills || {};
    if (skills.technical) labelValue('Technical skills', skills.technical);
    if (skills.communication) labelValue('Communication', skills.communication);
    if (skills.organisational) labelValue('Organisational', skills.organisational);
    if (skills.digital) labelValue('Digital skills', skills.digital);
    if (skills.other) labelValue('Other skills', skills.other);
    y += 3;

    // ── CERTIFICATIONS ──
    const certs = Array.isArray(parsed.certifications) ? parsed.certifications : [];
    if (certs.length > 0) {
      sectionHeader('Certifications');
      certs.forEach((cert) => {
        addPageIfNeeded(12);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(cert.name || '', M + 5, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        const detail = [cert.issuer, cert.year].filter(Boolean).join(' · ');
        if (detail) doc.text(detail, M + 5, y + 5);
        doc.setTextColor(0, 0, 0);
        y += detail ? 12 : 7;
      });
      y += 3;
    }

    // ── PROJECTS ──
    const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
    if (projects.length > 0) {
      sectionHeader('Projects');
      projects.forEach((proj) => {
        addPageIfNeeded(18);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(proj.name || '', M + 5, y);
        doc.setFont('helvetica', 'normal');
        y += 5;
        if (proj.description) {
          const descLines = doc.splitTextToSize(String(proj.description), W - 15);
          doc.setFontSize(9);
          doc.text(descLines, M + 5, y);
          y += descLines.length * 4;
        }
        if (proj.technologies) {
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          doc.text(`Tech: ${proj.technologies}`, M + 5, y);
          doc.setTextColor(0, 0, 0);
          y += 5;
        }
        y += 3;
      });
    }

    // ── ACHIEVEMENTS ──
    const achievements = Array.isArray(parsed.achievements) ? parsed.achievements : [];
    if (achievements.length > 0) {
      sectionHeader('Key Achievements');
      achievements.forEach((ach) => {
        addPageIfNeeded(10);
        doc.setFontSize(10);
        doc.text(`•  ${String(ach)}`, M + 5, y);
        y += 6;
      });
      y += 3;
    }

    // ── LANGUAGES ──
    const langs = Array.isArray(parsed.languages) ? parsed.languages : [];
    if (langs.length > 0) {
      addPageIfNeeded(15);
      doc.setFontSize(11);
      doc.setTextColor(51, 51, 51);
      doc.setFont('helvetica', 'bold');
      doc.text('LANGUAGES', M, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      langs.forEach((lang) => {
        doc.setFontSize(10);
        doc.text(lang.language || '', M + 5, y);
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        doc.text(`(${lang.level || ''})`, M + 50, y);
        doc.setTextColor(0, 0, 0);
        y += 6;
      });
    }

    // ── HOBBIES & INTERESTS ──
    if (parsed.hobbies) {
      sectionHeader('Hobbies & Interests');
      doc.setFontSize(10);
      const hobbyLines = doc.splitTextToSize(String(parsed.hobbies), W);
      doc.text(hobbyLines, M, y);
      y += hobbyLines.length * 4.5 + 5;
    }

    // ── REFERENCES ──
    if (parsed.references) {
      sectionHeader('References');
      doc.setFontSize(10);
      doc.text(String(parsed.references), M, y);
      y += 8;
    }

    // ── Footer on each page ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${p} of ${totalPages}`, 105, 290, { align: 'center' });
      doc.text(`Generated by ScholarPath AI · ${new Date().toLocaleDateString()}`, M, 290);
    }

    pdfBase64 = doc.output('datauristring');
  } catch (pdfErr) {
    console.error('PDF generation error:', pdfErr.message);
  }

  res.json({
    success: true,
    message: 'CV converted to Europass format.',
    suggestions: parsed.suggestions || [],
    pdf_base64: pdfBase64,
    summary: parsed.summary || '',
    work_experience: parsed.work_experience || [],
    education: parsed.education || [],
    certifications: parsed.certifications || [],
    projects: parsed.projects || [],
    achievements: parsed.achievements || [],
    skills: parsed.skills || {},
    languages: parsed.languages || [],
    hobbies: parsed.hobbies || '',
    references: parsed.references || '',
  });
});

// Document Tools: Recommendation letter generator - AI Agent polishes/generates letters
app.post('/api/documents/letter/generate', upload.single('draft'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, error: 'No draft uploaded' });
  }

  // Read the file content (works best with .txt files)
  let draftText = '';
  if (file.mimetype === 'text/plain') {
    draftText = file.buffer.toString('utf-8');
  } else {
    draftText = `[Uploaded file: ${file.originalname}]`;
  }

  const letterPrompt = `You are an expert academic recommendation letter writer.
${draftText
  ? `Here is a draft recommendation letter:\n"${draftText.slice(0, 2000)}"\n\nPolish and improve this letter. Make it more professional, add stronger language about the candidate's abilities, and ensure a compelling closing.`
  : 'Generate a professional academic recommendation letter template for a student applying to a Master\'s program abroad.'}

Write a polished, professional recommendation letter (about 200-300 words). Return ONLY the letter text, no JSON, no markdown.`;

  const letterText = await askAI(letterPrompt);

  res.json({
    success: true,
    message: 'Letter generated.',
    letter_text: letterText
  });
});

// Chatbot - AI Agent powered by Google Gemini
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, error: 'No message provided' });
  }

  const systemPrompt = `You are ScholarPath AI, a short-answer assistant for students applying abroad.
Help with: scholarships, universities, eligibility, documents, CV tips, deadlines.

RULES:
- Reply in MAXIMUM 2-3 short sentences
- Never write long paragraphs
- Be direct and specific
- If asked about a specific country/university, give 1 key fact only

Student: ${message}`;

  const reply = await askAI(systemPrompt);
  res.json({ success: true, reply });
});
// Create a notification (used internally or by other routes)
app.post('/api/notifications', authenticateToken, requireSupabase, async (req, res) => {
  const { profile_id, type, title, message } = req.body;

  if (!profile_id || !type || !title) {
    return res.status(400).json({ success: false, error: 'profile_id, type, and title are required' });
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert([{ profile_id, type, title, message }])
    .select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, notification: data[0] });
});

// Get all notifications for a profile
app.get('/api/notifications/:profileId', authenticateToken, requireSupabase, async (req, res) => {
  const { profileId } = req.params;

  // Check if the user is authorized to view this profile's notifications
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, notifications: data });
});

// Mark a notification as read
app.patch('/api/notifications/:id/read', authenticateToken, requireSupabase, async (req, res) => {
  const { id } = req.params;

  // Check if the user is authorized to update this notification
  const { data: existing, error: fetchError } = await supabase
    .from('notifications')
    .select('profile_id')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return res.status(404).json({ success: false, error: 'Notification not found' });
  }

  if (existing.profile_id !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, notification: data[0] });
});

// Check for scholarships nearing deadline (run manually or via cron later) and create reminders
 app.post('/api/notifications/check-deadlines/:profileId', authenticateToken, requireSupabase, async (req, res) => {
  const { profileId } = req.params;
  if (profileId !== req.userId) {
  return res.status(403).json({ success: false, error: 'Not authorized' });
}
  // Find applications with scholarships whose deadline is within 14 days
  const twoWeeksFromNow = new Date();
  twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);

  const { data: applications, error } = await supabase
    .from('applications')
    .select('*, scholarships(title, deadline)')
    .eq('profile_id', profileId)
    .in('status', ['saved', 'preparing']);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }

  const dueApps = applications.filter(app => {
    if (!app.scholarships?.deadline) return false;
    const deadline = new Date(app.scholarships.deadline);
    return deadline <= twoWeeksFromNow && deadline >= new Date();
  });

  const notificationsToCreate = dueApps.map(app => ({
    profile_id: profileId,
    type: 'deadline_reminder',
    title: `Deadline approaching: ${app.scholarships.title}`,
    message: `The deadline for ${app.scholarships.title} is ${app.scholarships.deadline}. Current status: ${app.status}.`
  }));

  if (notificationsToCreate.length === 0) {
    return res.json({ success: true, message: 'No upcoming deadlines found', notifications: [] });
  }

  const { data: created, error: insertError } = await supabase
    .from('notifications')
    .insert(notificationsToCreate)
    .select();

  if (insertError) {
    return res.status(500).json({ success: false, error: insertError.message });
  }

  res.json({ success: true, notifications: created });
});
// Forgot password: generate a reset token
app.post('/api/auth/forgot-password', requireSupabase, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  const { data: user, error: findError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .single();

  if (findError || !user) {
    // For security, don't reveal whether the email exists
    return res.json({ success: true, message: 'If that email exists, a reset link has been generated.' });
  }

  const resetToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ reset_token: resetToken, reset_token_expiry: expiry })
    .eq('id', user.id);

  if (updateError) {
    return res.status(500).json({ success: false, error: updateError.message });
  }

  // Send reset email via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (Resend && resendKey && !resendKey.startsWith('re_')) {
    // No valid key, skip email
  }

  let emailSent = false;
  if (Resend && resendKey) {
    try {
      const resend = new Resend(resendKey);
      const resetUrl = `${req.headers.origin || 'https://aischolarpath-backend-main.vercel.app'}/?reset=${resetToken}`;
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <div style="background: #125BC9; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">ScholarPath.AI</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
            <h2 style="color: #111827; margin-top: 0;">Reset Your Password</h2>
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
              You requested a password reset. Click the button below to set a new password.
              This link expires in 1 hour.
            </p>
            <div style="text-align: center; margin: 25px 0;">
              <a href="${resetUrl}" style="background: #125BC9; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">Reset Password</a>
            </div>
            <p style="color: #9ca3af; font-size: 12px;">
              If you didn't request this, ignore this email. Your password won't change.
            </p>
          </div>
        </div>
      `;
      await resend.emails.send({
        from: 'ScholarPath <onboarding@resend.dev>',
        to: email,
        subject: 'ScholarPath - Reset Your Password',
        html: htmlContent,
      });
      emailSent = true;
    } catch (emailErr) {
      console.error('Email send failed:', emailErr.message);
    }
  }

  res.json({
    success: true,
    message: emailSent
      ? 'Password reset link sent to your email.'
      : 'If that email exists, a reset link has been generated.',
  });
});

// Reset password using the token
app.post('/api/auth/reset-password', requireSupabase, async (req, res) => {
  const { reset_token, new_password } = req.body;

  if (!reset_token || !new_password) {
    return res.status(400).json({ success: false, error: 'reset_token and new_password are required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(reset_token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired reset token' });
  }

  const { data: user, error: findError } = await supabase
    .from('profiles')
    .select('id, reset_token, reset_token_expiry')
    .eq('id', decoded.id)
    .single();

  if (findError || !user || user.reset_token !== reset_token) {
    return res.status(401).json({ success: false, error: 'Invalid reset token' });
  }

  if (new Date(user.reset_token_expiry) < new Date()) {
    return res.status(401).json({ success: false, error: 'Reset token has expired' });
  }

  const password_hash = await bcrypt.hash(new_password, 10);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ password_hash, reset_token: null, reset_token_expiry: null })
    .eq('id', user.id);

  if (updateError) {
    return res.status(500).json({ success: false, error: updateError.message });
  }

  res.json({ success: true, message: 'Password has been reset successfully' });
});

// ── Real-time Web Scraping: Scholarships by Country ──
// Known scholarship portal URLs per country
const SCHOLARSHIP_PORTALS = {
  'China': [
    { url: 'https://www.campuschina.org/scholarships/index.html', name: 'Campus China' },
    { url: 'https://www.csc.edu.cn/laihua/scholarship', name: 'CSC Scholarships' },
  ],
  'United Kingdom': [
    { url: 'https://www.chevening.org/scholarships/', name: 'Chevening' },
    { url: 'https://www.gov.uk/government/publications/commonwealth-scholarships', name: 'Commonwealth' },
  ],
  'United States': [
    { url: 'https://foreign.fulbrightonline.org/about-the-program', name: 'Fulbright' },
    { url: 'https://www.iie.org/programs', name: 'IIE Programs' },
  ],
  'Canada': [
    { url: 'https://www.educanada.ca/scholarships-bourses/non_can/index.aspx', name: 'EduCanada' },
  ],
  'Australia': [
    { url: 'https://www.dfat.gov.au/people-to-people/australia-awards/australia-awards-scholarships', name: 'Australia Awards' },
  ],
  'Germany': [
    { url: 'https://www.daad.de/en/studying-in-germany/scholarships/', name: 'DAAD' },
  ],
  'Japan': [
    { url: 'https://www.studyinjapan.go.jp/en/planning/scholarship/', name: 'Study in Japan' },
  ],
  'South Korea': [
    { url: 'https://www.studyinkorea.go.kr/en/sub/gks/allnew_invite.do', name: 'Study in Korea' },
  ],
  'Turkey': [
    { url: 'https://www.turkiyeburslari.gov.tr/', name: 'Turkiye Burslari' },
  ],
  'Netherlands': [
    { url: 'https://www.studyinholland.nl/finances/scholarships', name: 'Study in Holland' },
  ],
  'Singapore': [
    { url: 'https://www.a-star.edu.sg/Scholarships/singapore-international-graduate-award-singa', name: 'SINGA' },
  ],
  'Sweden': [
    { url: 'https://si.se/en/apply/scholarships/swedish-institute-scholarships-for-global-professionals/', name: 'SI Scholarship' },
  ],
  'Pakistan': [
    { url: 'https://www.hec.gov.pk/english/scholarshipsgrants/Pages/Scholarship-Announcements.aspx', name: 'HEC' },
  ],
  'Malaysia': [
    { url: 'https://biasiswa.moe.gov.my/INTER/index.php', name: 'Malaysia International' },
  ],
  'South Africa': [
    { url: 'https://www.nrf.ac.za/bursaries/scholarships', name: 'NRF' },
  ],
  'Italy': [
    { url: 'https://studyinitaly.esteri.it/en/call-for-procedures', name: 'Study in Italy' },
  ],
  'France': [
    { url: 'https://www.france-visas.gouv.fr/web/france-visas/ai-je-droit-a-un-visa', name: 'France Excellence' },
  ],
};

// Scrape scholarships for a specific country - real-time, AI-structured
app.post('/api/scholarships/scrape-country', authenticateToken, requireSupabase, async (req, res) => {
  const { country } = req.body;
  if (!country) {
    return res.status(400).json({ success: false, error: 'country is required' });
  }

  const portals = SCHOLARSHIP_PORTALS[country] || [];
  if (portals.length === 0) {
    return res.json({ success: true, scholarships: [], message: `No known scholarship portals for ${country}. Try checking official government websites.` });
  }

  // First check if we already have recent scraped data for this country (cache: 24h)
  const { data: existingScholarships } = await supabase
    .from('scholarships')
    .select('id, title, country, department, degree_level, deadline, eligibility_criteria, apply_url, scholarship_type, last_verified_at')
    .eq('country', country)
    .eq('status', 'active')
    .order('title');

  if (existingScholarships && existingScholarships.length > 0) {
    const latestCheck = existingScholarships[0].last_verified_at;
    if (latestCheck && (Date.now() - new Date(latestCheck).getTime()) < 24 * 60 * 60 * 1000) {
      // Data is fresh - return cached
      return res.json({ success: true, scholarships: existingScholarships, source: 'cached', message: `${existingScholarships.length} scholarships found for ${country} (updated within 24h)` });
    }
  }

  // Scrape portals
  const allScrapedText = [];
  const scrapeErrors = [];

  for (const portal of portals) {
    try {
      const response = await fetch(portal.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove scripts, styles, nav
      $('script, style, nav, header, footer, aside').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000);
      allScrapedText.push(`=== Source: ${portal.name} (${portal.url}) ===\n${text}`);
    } catch (err) {
      scrapeErrors.push(`${portal.name}: ${err.message}`);
    }
  }

  if (allScrapedText.length === 0) {
    // All portals failed - return existing DB data
    const fallback = existingScholarships || [];
    return res.json({ success: true, scholarships: fallback, source: 'database_fallback', scrape_errors: scrapeErrors, message: `Could not scrape live data. Found ${fallback.length} scholarships for ${country}.` });
  }

  // AI structures the scraped content
  const combinedText = allScrapedText.join('\n\n');
  const aiPrompt = `You are an expert at extracting scholarship information from web pages. Parse the scraped content below and extract ALL scholarships mentioned.

Country: ${country}

Scraped content:
${combinedText}

Return ONLY valid JSON (no markdown):
{
  "scholarships": [
    {
      "title": "Exact scholarship name",
      "department": "Field of study (Computer Science, Engineering, etc) or null if open to all",
      "degree_level": "Bachelor's, Master's, or PhD or null if not specified",
      "eligibility_criteria": {
        "min_cgpa": number or null,
        "min_ielts": number or null,
        "required_degree": "string or null",
        "funding_coverage": "Full tuition/Partial/Stipend etc",
        "funding_value": estimated_value_number_or_0
      },
      "deadline": "YYYY-MM-DD format or null",
      "apply_url": "URL or null",
      "description": "1-2 line description"
    }
  ]
}

Extract ONLY real scholarships mentioned in the content. If a field is not mentioned, use null. Do NOT make up scholarships.`;

  let parsed = await askAI(aiPrompt, true);
  if (!parsed || !parsed.scholarships || parsed.scholarships.length === 0) {
    // AI failed - return existing DB data
    const fallback = existingScholarships || [];
    return res.json({ success: true, scholarships: fallback, source: 'database_fallback', message: `AI could not parse live data. Found ${fallback.length} scholarships for ${country}.` });
  }

  // Store scraped scholarships in DB (upsert)
  const now = new Date().toISOString();
  const toInsert = parsed.scholarships.map(s => ({
    title: s.title,
    country,
    department: s.department || null,
    degree_level: s.degree_level || null,
    scholarship_type: 'Scraped',
    eligibility_criteria: s.eligibility_criteria || {},
    deadline: s.deadline || null,
    apply_url: s.apply_url || null,
    status: 'active',
    source_url: portals[0]?.url || null,
    last_verified_at: now,
  }));

  if (toInsert.length > 0) {
    const { error } = await supabase.from('scholarships').upsert(toInsert, { onConflict: 'title,country' });
    if (error) console.error('Scrape insert error:', error.message);
  }

  // Fetch updated list from DB
  const { data: freshScholarships } = await supabase
    .from('scholarships')
    .select('id, title, country, department, degree_level, deadline, eligibility_criteria, apply_url, scholarship_type, last_verified_at')
    .eq('country', country)
    .eq('status', 'active')
    .order('title');

  // Log the scrape
  await supabase.from('discovery_log').insert([{
    source_url: portals.map(p => p.url).join(', '),
    status: 'success',
    raw_snapshot: { country, found: parsed.scholarships.length, errors: scrapeErrors }
  }]);

  res.json({
    success: true,
    scholarships: freshScholarships || [],
    source: 'live_scrape',
    scraped_count: parsed.scholarships.length,
    scrape_errors: scrapeErrors.length > 0 ? scrapeErrors : undefined,
    message: `Scraped ${parsed.scholarships.length} scholarships for ${country} from ${allScrapedText.length} portal(s).`
  });
});

// Generic scraper: fetches a page and extracts listing items using CSS selectors
app.post('/api/discovery/scrape', authenticateToken, requireSupabase, async (req, res) =>{
  const { url, item_selector, title_selector, link_selector } = req.body;

  if (!url || !item_selector) {
    return res.status(400).json({ success: false, error: 'url and item_selector are required' });
  }

  try {
    const response = await fetch(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
});

    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const items = [];
    $(item_selector).each((i, el) => {
      const title = title_selector ? $(el).find(title_selector).first().text().trim() : $(el).text().trim();
      let link = link_selector ? $(el).find(link_selector).first().attr('href') : $(el).attr('href');

      // Resolve relative links to absolute
      if (link && !link.startsWith('http')) {
        try {
          link = new URL(link, url).href;
        } catch (e) {
          // leave as-is if URL resolution fails
        }
      }

      if (title) items.push({ title, link });
    });

    const { data, error } = await supabase
      .from('discovery_log')
      .insert([{
        source_url: url,
        status: items.length > 0 ? 'success' : 'needs_review',
        raw_snapshot: { items }
      }])
      .select();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, items_found: items.length, items, log: data[0] });
  } catch (err) {
    await supabase.from('discovery_log').insert([{
      source_url: url,
      status: 'failed',
      raw_snapshot: { error: err.message }
    }]);
    res.status(500).json({ success: false, error: err.message });
  }
});

// View past scraping logs
app.get('/api/discovery/logs', requireSupabase, async (req, res) => {
  const { data, error } = await supabase
    .from('discovery_log')
    .select('*')
    .order('fetched_at', { ascending: false })
    .limit(20);

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, logs: data });
});
// Bulk scraper: scrapes multiple URLs with the same selectors in one call
 app.post('/api/discovery/scrape-bulk', authenticateToken, requireSupabase, async (req, res) =>{
  const { urls, item_selector, title_selector, link_selector } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0 || !item_selector) {
    return res.status(400).json({ success: false, error: 'urls (array) and item_selector are required' });
  }

  const results = [];

  for (const url of urls) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between requests
    try {
      const response = await fetch(url, {
  headers: {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
},
});

      if (!response.ok) throw new Error(`Failed to fetch page: ${response.status}`);

      const html = await response.text();
      const $ = cheerio.load(html);

      const items = [];
      $(item_selector).each((i, el) => {
        const title = title_selector ? $(el).find(title_selector).first().text().trim() : $(el).text().trim();
        let link = link_selector ? $(el).find(link_selector).first().attr('href') : $(el).attr('href');

        if (link && !link.startsWith('http')) {
          try { link = new URL(link, url).href; } catch (e) {}
        }
        if (title) items.push({ title, link });
      });

      const { data } = await supabase
        .from('discovery_log')
        .insert([{ source_url: url, status: items.length > 0 ? 'success' : 'needs_review', raw_snapshot: { items } }])
        .select();

      results.push({ url, items_found: items.length, log_id: data?.[0]?.id });
    } catch (err) {
      await supabase.from('discovery_log').insert([{ source_url: url, status: 'failed', raw_snapshot: { error: err.message } }]);
      results.push({ url, items_found: 0, error: err.message });
    }
  }

  const totalItems = results.reduce((sum, r) => sum + (r.items_found || 0), 0);
  res.json({ success: true, total_items_found: totalItems, results });
});
// Scrape + auto-structure using pattern matching (no AI, best-effort)
app.post('/api/discovery/scrape-and-structure', authenticateToken, requireSupabase, async (req, res) => {
  const { listing_url, item_selector, country, max_items } = req.body;

  if (!listing_url || !item_selector || !country) {
    return res.status(400).json({ success: false, error: 'listing_url, item_selector, and country are required' });
  }

  const limit = max_items || 5;

  try {
    // Step 1: scrape the listing page
    const listResponse = await fetch(listing_url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIScholarPathBot/1.0)' }
    });
    const listHtml = await listResponse.text();
    const $list = cheerio.load(listHtml);

    const items = [];
    $list(item_selector).each((i, el) => {
      if (items.length >= limit) return;
      const title = $list(el).text().trim();
      let link = $list(el).attr('href');
      if (link && !link.startsWith('http')) {
        try { link = new URL(link, listing_url).href; } catch (e) {}
      }
      if (title && link) items.push({ title, link });
    });

    const structuredResults = [];

    // Step 2: visit each scholarship page and try to extract fields
    for (const item of items) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // be polite, avoid rate limiting

      try {
        const pageResponse = await fetch(item.link, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIScholarPathBot/1.0)' }
        });
        const pageHtml = await pageResponse.text();
        const $page = cheerio.load(pageHtml);
        const pageText = $page('body').text();

        // Best-effort pattern matching (not AI - may miss or misread values)
        const ieltsMatch = pageText.match(/IELTS[^0-9]{0,15}(\d\.\d|\d)/i);
        const gpaMatch = pageText.match(/(?:GPA|CGPA)[^0-9]{0,15}(\d\.\d)/i);
        const deadlineMatch = pageText.match(/deadline[^a-zA-Z0-9]{0,10}([A-Z][a-z]+ \d{1,2},? \d{4})/i);

        const eligibility_criteria = {
          min_ielts: ieltsMatch ? parseFloat(ieltsMatch[1]) : null,
          min_cgpa: gpaMatch ? parseFloat(gpaMatch[1]) : null,
          required_degree: null
        };

        const { data, error } = await supabase
          .from('scholarships')
          .upsert([{
            title: item.title,
            country,
            eligibility_criteria,
            deadline: deadlineMatch ? deadlineMatch[1] : null,
            apply_url: item.link,
            source_url: item.link,
            status: 'under_review',
            last_verified_at: new Date().toISOString()
          }], { onConflict: 'title,country' })
          .select();

        structuredResults.push({ title: item.title, saved: !error, extracted: eligibility_criteria, deadline_found: !!deadlineMatch, error: error?.message });
      } catch (err) {
        console.error(`FULL ERROR for ${item.title}:`, err);
structuredResults.push({ title: item.title, saved: false, error: err.message, detail: JSON.stringify(err.cause || {})
 });
      }
    }

    res.json({ success: true, processed: structuredResults.length, results: structuredResults });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// Scrape a single official scholarship page directly (authentic source, no listing needed)
app.post('/api/discovery/scrape-official', authenticateToken, requireSupabase, async (req, res) =>{
  const { title, url, country } = req.body;

  if (!title || !url || !country) {
    return res.status(400).json({ success: false, error: 'title, url, and country are required' });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIScholarPathBot/1.0)' }
    });
    const html = await response.text();
    const $ = cheerio.load(html);
    const pageText = $('body').text();

    const ieltsMatch = pageText.match(/IELTS[^0-9]{0,20}(\d\.\d|\d)/i);
    const gpaMatch = pageText.match(/(?:GPA|CGPA)[^0-9]{0,20}(\d\.\d)/i);
    const deadlineMatch = pageText.match(/deadline[^a-zA-Z0-9]{0,15}([A-Z][a-z]+ \d{1,2},? \d{4}|\d{1,2} [A-Z][a-z]+ \d{4})/i);

    const eligibility_criteria = {
      min_ielts: ieltsMatch ? parseFloat(ieltsMatch[1]) : null,
      min_cgpa: gpaMatch ? parseFloat(gpaMatch[1]) : null,
      required_degree: null
    };

    const { data, error } = await supabase
      .from('scholarships')
      .upsert([{
        title,
        country,
        eligibility_criteria,
        deadline: deadlineMatch ? deadlineMatch[1] : null,
        apply_url: url,
        source_url: url,
        status: 'under_review',
        last_verified_at: new Date().toISOString()
      }], { onConflict: 'title,country' })
      .select();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, scholarship: data[0], extracted: eligibility_criteria, deadline_found: !!deadlineMatch });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// Scrape multiple official scholarship pages in one request - AI-enhanced extraction
app.post('/api/discovery/scrape-official-bulk', authenticateToken, requireSupabase, async (req, res) => {
  const { scholarships, auto_approve } = req.body;

  if (!scholarships || !Array.isArray(scholarships) || scholarships.length === 0) {
    return res.status(400).json({ success: false, error: 'scholarships (array of {title, url, country}) is required' });
  }

  const results = [];

  for (const item of scholarships) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const response = await fetch(item.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const $ = cheerio.load(html);
      const pageText = $('body').text().slice(0, 8000);

      // Use Gemini AI for deep extraction
      let extracted = {
        min_cgpa: null, min_ielts: null, required_degree: null,
        funding_coverage: null, funding_value: 0,
        degree_level: item.degree_level || null,
        department: item.department || null,
        description: null
      };

      if (aiModel) {
        const extractPrompt = `You are a scholarship data extraction expert.
Analyze this scholarship page text and extract structured information.

Scholarship title: "${item.title}"
Country: "${item.country}"
URL: ${item.url}

Page text (truncated):
${pageText.slice(0, 4000)}

Return ONLY valid JSON:
{
  "min_cgpa": number (0-4 scale, null if not found),
  "min_ielts": number (0-9 scale, null if not found),
  "required_degree": string (e.g. "Bachelor's", "Master's", null if not found),
  "funding_coverage": string (e.g. "Full tuition + stipend", null if not found),
  "funding_value": number (estimated USD value, 0 if unknown),
  "degree_level": string ("Bachelor's", "Master's", "PhD", null if not found),
  "department": string (field of study, null if open to all),
  "deadline": string (YYYY-MM-DD format, null if not found or varies),
  "description": string (1-2 sentence summary of the scholarship)`;

        const aiResult = await askAI(extractPrompt, true);
        if (aiResult) extracted = { ...extracted, ...aiResult };
      } else {
        // Fallback to regex
        const ieltsMatch = pageText.match(/IELTS[^0-9]{0,20}(\d\.?\d?)/i);
        const gpaMatch = pageText.match(/(?:GPA|CGPA)[^0-9]{0,20}(\d\.?\d?)/i);
        if (ieltsMatch) extracted.min_ielts = parseFloat(ieltsMatch[1]);
        if (gpaMatch) extracted.min_cgpa = parseFloat(gpaMatch[1]);
      }

      const eligibility_criteria = {
        min_cgpa: extracted.min_cgpa,
        min_ielts: extracted.min_ielts,
        required_degree: extracted.required_degree,
        funding_coverage: extracted.funding_coverage,
        funding_value: extracted.funding_value
      };

      // Find or create university if title suggests one
      let university_id = item.university_id || null;

      const { data, error } = await supabase
        .from('scholarships')
        .upsert([{
          title: item.title,
          country: item.country,
          university_id,
          scholarship_type: item.scholarship_type || 'merit-based',
          degree_level: extracted.degree_level,
          department: extracted.department,
          eligibility_criteria,
          deadline: extracted.deadline || null,
          apply_url: item.url,
          source_url: item.url,
          status: auto_approve ? 'active' : 'under_review',
          last_verified_at: new Date().toISOString()
        }], { onConflict: 'title,country' })
        .select();

      results.push({ title: item.title, saved: !error, extracted, deadline_found: !!extracted.deadline, error: error?.message });
    } catch (err) {
      console.error(`Scrape error for ${item.title}:`, err.message);
      results.push({ title: item.title, saved: false, error: err.message });
    }
  }

  res.json({ success: true, processed: results.length, results });
});
// Get all scholarships pending review (scraped, not yet verified)
app.get('/api/scholarships/pending/review', requireSupabase, async (req, res) => {
  const { data, error } = await supabase
    .from('scholarships')
    .select('*')
    .eq('status', 'under_review');

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, count: data.length, pending: data });
});

// Approve a scholarship (mark it active after manual verification)
app.patch('/api/scholarships/:id/approve', authenticateToken, requireSupabase, async (req, res) => {
  const { id } = req.params;
  const { eligibility_criteria, deadline } = req.body || {};

  const updates = { status: 'active', last_verified_at: new Date().toISOString() };
  if (eligibility_criteria) updates.eligibility_criteria = eligibility_criteria;
  if (deadline) updates.deadline = deadline;

  const { data, error } = await supabase
    .from('scholarships')
    .update(updates)
    .eq('id', id)
    .select();

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, scholarship: data[0] });
});
// Centralized error handler - catches any unhandled errors from routes
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ success: false, error: 'Something went wrong on the server' });
});
// Static roadmap template - generic milestones before a scholarship deadline
const roadmapTemplate = [
  { months_before_deadline: 4, task: "Finalize target scholarships and universities", category: "Planning" },
  { months_before_deadline: 3, task: "Complete or update CV/Resume", category: "Documents" },
  { months_before_deadline: 3, task: "Request recommendation letters from professors/employers", category: "Documents" },
  { months_before_deadline: 2, task: "Take/retake IELTS or other language test if needed", category: "Language" },
  { months_before_deadline: 2, task: "Draft personal statement / motivation letter", category: "Documents" },
  { months_before_deadline: 1, task: "Complete HEC/IBCC/MOFA attestation", category: "Attestation" },
  { months_before_deadline: 1, task: "Finalize and proofread all application documents", category: "Documents" },
  { weeks_before_deadline: 2, task: "Submit application", category: "Submission" },
  { weeks_before_deadline: 1, task: "Confirm submission and save confirmation receipt", category: "Submission" }
];

// Get personalized application roadmap for a profile, based on their nearest scholarship deadline
app.get('/api/roadmap/:profileId', authenticateToken, requireSupabase, async (req, res) => {
  const { profileId } = req.params;
  if (profileId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('*, scholarships(title, deadline)')
    .eq('profile_id', profileId)
    .in('status', ['Eligible', 'Missing Requirements'])
    .order('match_score', { ascending: false });

  if (matchesError) {
    return res.status(500).json({ success: false, error: matchesError.message });
  }

  const withDeadlines = matches
    .filter(m => m.scholarships?.deadline)
    .sort((a, b) => new Date(a.scholarships.deadline) - new Date(b.scholarships.deadline));

  if (withDeadlines.length === 0) {
    return res.json({ success: true, message: 'No upcoming deadlines found among your matches to build a roadmap from.', roadmap: [] });
  }

  const targetScholarship = withDeadlines[0].scholarships;
  const deadline = new Date(targetScholarship.deadline);

  const roadmap = roadmapTemplate.map(item => {
    const dueDate = new Date(deadline);
    if (item.months_before_deadline) {
      dueDate.setMonth(dueDate.getMonth() - item.months_before_deadline);
    } else if (item.weeks_before_deadline) {
      dueDate.setDate(dueDate.getDate() - item.weeks_before_deadline * 7);
    }
    return {
      task: item.task,
      category: item.category,
      target_date: dueDate.toISOString().split('T')[0],
      is_overdue: dueDate < new Date()
    };
  });

  res.json({
    success: true,
    based_on_scholarship: targetScholarship.title,
    deadline: targetScholarship.deadline,
    roadmap
  });
});
// ═══════════════════════════════════════════════════════════════
// SMART AGENT - Intelligent Scholarship Matching with Live Data
// ═══════════════════════════════════════════════════════════════

// Helper: scrape scholarships for a country (FAST MODE - optimized for serverless)
async function scrapeScholarshipsForCountry(supabaseClient, country) {
  const portals = SCHOLARSHIP_PORTALS[country] || [];

  // Always check DB first - fast path
  const { data: cached } = await supabaseClient
    .from('scholarships')
    .select('id, title, country, department, degree_level, deadline, eligibility_criteria, apply_url, scholarship_type, university_id, last_verified_at, universities(name)')
    .eq('country', country).eq('status', 'active').order('title');

  // If DB has scholarships, use them immediately - much faster than scraping
  if (cached && cached.length > 0) {
    return { scholarships: cached, source: 'database', count: cached.length };
  }

  if (portals.length === 0) {
    return { scholarships: [], source: 'no_portals' };
  }

  // Only scrape if DB is empty for this country - quick scrape, 5s timeout
  const allText = [];
  const firstPortal = portals[0];
  try {
    const resp = await fetch(firstPortal.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(5000)
    });
    if (resp.ok) {
      const html = await resp.text();
      const $ = cheerio.load(html);
      $('script, style, nav, header, footer, aside').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000);
      if (text.length > 50) {
        allText.push(`=== Source: ${firstPortal.name} (${firstPortal.url}) ===\n${text}`);
      }
    }
  } catch (e) { /* skip scrape errors */ }

  if (allText.length === 0) {
    return { scholarships: [], source: 'no_data' };
  }

  // AI structures the scraped content
  const combined = allText.join('\n\n');
  const aiPrompt = `You are an expert at extracting scholarship information from web pages. Parse the scraped content below and extract ALL scholarships mentioned.

Country: ${country}

Scraped content:
${combined}

Return ONLY valid JSON (no markdown):
{"scholarships":[{"title":"Exact scholarship name","department":"Field of study or null","degree_level":"Bachelor's, Master's, or PhD or null","eligibility_criteria":{"min_cgpa":number_or_null,"min_ielts":number_or_null,"required_degree":"string or null","funding_coverage":"Full tuition/Partial/Stipend","funding_value":number_or_0},"deadline":"YYYY-MM-DD or null","apply_url":"URL or null","description":"1-2 line description"}]}

Extract ONLY real scholarships mentioned. If a field is not mentioned, use null. Do NOT make up scholarships.`;

  let parsed = await askAI(aiPrompt, true);
  if (!parsed?.scholarships?.length) {
    return { scholarships: [], source: 'no_data' };
  }

  // Store in DB (upsert prevents duplicates)
  const now = new Date().toISOString();
  const toInsert = parsed.scholarships.map(s => ({
    title: s.title, country, department: s.department || null,
    degree_level: s.degree_level || null, scholarship_type: 'Scraped',
    eligibility_criteria: s.eligibility_criteria || {},
    deadline: s.deadline || null, apply_url: s.apply_url || null,
    status: 'active', source_url: portals[0]?.url || null, last_verified_at: now,
  }));
  if (toInsert.length > 0) {
    try { await supabaseClient.from('scholarships').upsert(toInsert, { onConflict: 'title,country' }); } catch(e) { /* ignore */ }
  }

  const { data: fresh } = await supabaseClient
    .from('scholarships').select('id, title, country, department, degree_level, deadline, eligibility_criteria, apply_url, scholarship_type, university_id, last_verified_at, universities(name)')
    .eq('country', country).eq('status', 'active').order('title');

  return { scholarships: fresh || [], source: 'live_scrape', scraped_count: parsed.scholarships.length };
}

// Helper: calculate probability/chance of getting a scholarship
function calculateChance(match) {
  const score = Number(match.match_score) || 0;
  const evidence = match.evidence || [];
  const reasons = match.reasons || [];

  // Base probability from score
  let chance = score;

  // Hard fail = 0% chance
  if (match.status === 'Not Eligible') chance = Math.min(chance * 0.05, 5);

  // Partially eligible = reduced
  else if (match.status === 'Partially Eligible') {
    const missingCount = evidence.filter(e => e.result === 'Missing').length;
    const failCount = evidence.filter(e => e.result === 'Fail').length;
    chance = score * (0.5 - failCount * 0.1 - missingCount * 0.05);
  }

  // Not scored = unknown
  if (match.status === 'Not Scored') chance = 15;

  // Clamp 0-95 (never 100% - always some uncertainty)
  chance = Math.max(0, Math.min(95, Math.round(chance)));

  // Label
  let label, color;
  if (chance >= 75) { label = 'High Chance'; color = 'green'; }
  else if (chance >= 50) { label = 'Good Chance'; color = 'blue'; }
  else if (chance >= 25) { label = 'Moderate'; color = 'amber'; }
  else if (chance > 5) { label = 'Low Chance'; color = 'orange'; }
  else { label = 'Very Low'; color = 'red'; }

  return { chance, label, color };
}

// Smart Agent test endpoint (GET) - verify route exists
app.get('/api/smart-agent/status', (req, res) => {
  res.json({ status: 'ok', message: 'Smart Agent is active', version: '2.0' });
});

// Smart Agent endpoint - the main entry point
app.post('/api/smart-agent/match', authenticateToken, requireSupabase, async (req, res) => {
  const targetId = req.body.profileId;
  if (!targetId || targetId !== req.userId) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }

  try {
  // 1. Get user profile + CV data in parallel for speed
  const [profileResult, cvResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', targetId).single(),
    supabase.from('extracted_profile_data').select('*').eq('profile_id', targetId).order('created_at', { ascending: false }).limit(1).then(r => r).catch(() => ({ data: null })),
  ]);

  const { data: profile, error: profileError } = profileResult;
  if (profileError || !profile) {
    return res.status(404).json({ success: false, error: 'Profile not found: ' + (profileError?.message || 'no data') });
  }

  // 2. CV extracted data
  let cvData = {};
  const extracted = cvResult?.data;
  if (extracted?.length > 0) {
    cvData = extracted[0].raw_extraction || {};
  }
  const hasCv = !!(profile.cv_file_path || Object.keys(cvData).length > 0);

  // 3. Get scholarships - fast DB-first, scrape only if empty
  let scholarships = [];
  let scrapeInfo = { source: 'database' };

  if (profile.target_country) {
    try {
      const scrapeResult = await scrapeScholarshipsForCountry(supabase, profile.target_country);
      scholarships = scrapeResult.scholarships;
      scrapeInfo = scrapeResult;
    } catch (e) {
      scrapeInfo = { source: 'scrape_failed', error: e.message };
    }
  }

  // Only fetch additional DB scholarships if scraping didn't return enough
  if (scholarships.length < 5) {
    const { data: dbScholarships } = await supabase
      .from('scholarships').select('*, universities(name)')
      .eq('status', 'active')
      .limit(200);

    // Merge with deduplication by title+country
    const seen = new Set(scholarships.map(s => `${s.title}|${s.country}`));
    if (dbScholarships) {
      for (const s of dbScholarships) {
        const key = `${s.title}|${s.country}`;
        if (!seen.has(key)) {
          if (!profile.target_country || s.country === profile.target_country) {
            scholarships.push(s);
            seen.add(key);
          }
        }
      }
    }
  }

  if (scholarships.length === 0) {
    return res.json({
      success: true,
      matches: [],
      scholarship_count: 0,
      scrape_info: scrapeInfo,
      analysis: 'No scholarships found for your target country. Try selecting a different country or check back later.',
      profile_summary: {
        degree: profile.target_degree, field: profile.target_department || profile.target_field,
        country: profile.target_country, cgpa: profile.cgpa, ielts: profile.ielts_score,
        cv_analyzed: hasCv
      }
    });
  }

  // 4. Run matching engine
  // Helper: enhance generic scholarship titles
  function enhanceTitle(sch) {
    const title = (sch.title || '').trim();
    const generic = ['Government/University', 'Government', 'University', 'Government-funded', 'merit-based', 'need-based'];
    if (generic.some(g => title.toLowerCase() === g.toLowerCase()) || title.length < 5) {
      // Build a descriptive title from available data
      const parts = [];
      if (sch.country) parts.push(sch.country);
      if (sch.department) parts.push(sch.department);
      if (sch.degree_level) parts.push(sch.degree_level);
      parts.push('Scholarship');
      return parts.join(' ');
    }
    return title;
  }
  const isBachelor = profile.target_degree && profile.target_degree.toLowerCase().includes('bachelor');
  const userGpa = isBachelor ? (profile.fsc_percentage || profile.cgpa) : profile.cgpa;
  const gpaLabel = isBachelor && profile.fsc_percentage ? 'FSc %' : 'CGPA';
  const userField = profile.target_department || profile.target_field;

  const results = scholarships.map(sch => {
    const criteria = sch.eligibility_criteria || {};
    const evidence = [];
    const reasons = [];
    let weightedScore = 0;
    let totalWeightUsed = 0;
    let fatalFail = false;

    // Deadline check
    if (sch.deadline && !isDeadlineValid(sch.deadline)) {
      evidence.push({ criterion: 'Deadline', required: sch.deadline, actual: 'Expired', result: 'Fail', weight: 0 });
      reasons.push('Application deadline has passed (' + sch.deadline + ')');
      fatalFail = true;
    }

    // CGPA (25%)
    if (criteria.min_cgpa != null) {
      const w = WEIGHTS.cgpa;
      totalWeightUsed += w;
      if (userGpa == null) {
        evidence.push({ criterion: gpaLabel, required: criteria.min_cgpa, actual: null, result: 'Missing', weight: w });
        reasons.push(gpaLabel + ' not provided - minimum required is ' + criteria.min_cgpa);
      } else if (Number(userGpa) >= Number(criteria.min_cgpa)) {
        evidence.push({ criterion: gpaLabel, required: criteria.min_cgpa, actual: Number(userGpa), result: 'Pass', weight: w });
        weightedScore += w * 100;
      } else {
        evidence.push({ criterion: gpaLabel, required: criteria.min_cgpa, actual: Number(userGpa), result: 'Fail', weight: w });
        reasons.push('Your ' + gpaLabel + ' (' + Number(userGpa) + ') is below minimum (' + criteria.min_cgpa + ')');
        if (Number(userGpa) < Number(criteria.min_cgpa) - 0.5) fatalFail = true;
      }
    }

    // Field (25%)
    if (sch.department) {
      const w = WEIGHTS.field;
      totalWeightUsed += w;
      const fm = fieldsMatch(userField, sch.department);
      if (fm === null) {
        evidence.push({ criterion: 'Field', required: sch.department, actual: userField || null, result: 'Missing', weight: w });
        reasons.push('Target field not specified in your profile');
      } else if (fm === 'exact') {
        evidence.push({ criterion: 'Field', required: sch.department, actual: userField, result: 'Pass', weight: w });
        weightedScore += w * 100;
      } else if (fm === 'related') {
        evidence.push({ criterion: 'Field', required: sch.department, actual: userField, result: 'Pass', weight: w, note: 'Related field' });
        weightedScore += w * 75;
      } else {
        evidence.push({ criterion: 'Field', required: sch.department, actual: userField, result: 'Fail', weight: w });
        reasons.push('Your field (' + (userField || 'not set') + ') doesn\'t match (' + sch.department + ')');
        fatalFail = true;
      }
    }

    // Degree (20%)
    const requiredDeg = criteria.required_degree || sch.degree_level;
    if (requiredDeg) {
      const w = WEIGHTS.degree;
      totalWeightUsed += w;
      if (!profile.target_degree) {
        evidence.push({ criterion: 'Degree', required: requiredDeg, actual: null, result: 'Missing', weight: w });
        reasons.push('Target degree not specified');
      } else {
        const degResult = degreesMatch(profile.target_degree, requiredDeg);
        if (degResult === 'exact') {
          evidence.push({ criterion: 'Degree', required: requiredDeg, actual: profile.target_degree, result: 'Pass', weight: w });
          weightedScore += w * 100;
        } else if (degResult === 'progression') {
          evidence.push({ criterion: 'Degree', required: requiredDeg, actual: profile.target_degree, result: 'Pass', weight: w, note: 'Progression' });
          weightedScore += w * 80;
        } else if (degResult === null) {
          evidence.push({ criterion: 'Degree', required: requiredDeg, actual: profile.target_degree, result: 'Missing', weight: w });
          reasons.push('Could not determine degree match');
        } else {
          evidence.push({ criterion: 'Degree', required: requiredDeg, actual: profile.target_degree, result: 'Fail', weight: w });
          reasons.push('Requires ' + requiredDeg + ' but you selected ' + profile.target_degree);
          fatalFail = true;
        }
      }
    }

    // IELTS (15%)
    if (criteria.min_ielts != null) {
      const w = WEIGHTS.ielts;
      totalWeightUsed += w;
      if (profile.ielts_score == null) {
        evidence.push({ criterion: 'IELTS', required: criteria.min_ielts, actual: null, result: 'Missing', weight: w });
        reasons.push('IELTS not provided - minimum required is ' + criteria.min_ielts);
      } else if (Number(profile.ielts_score) >= Number(criteria.min_ielts)) {
        evidence.push({ criterion: 'IELTS', required: criteria.min_ielts, actual: Number(profile.ielts_score), result: 'Pass', weight: w });
        weightedScore += w * 100;
      } else {
        evidence.push({ criterion: 'IELTS', required: criteria.min_ielts, actual: Number(profile.ielts_score), result: 'Fail', weight: w });
        reasons.push('IELTS (' + Number(profile.ielts_score) + ') below minimum (' + criteria.min_ielts + ')');
      }
    }

    const matchScore = totalWeightUsed > 0 ? weightedScore / totalWeightUsed : 0;

    // Status determination
    const hardFailCriteria = ['Degree', 'Field', 'Deadline'];
    const hasHardFail = evidence.some(e => e.result === 'Fail' && hardFailCriteria.includes(e.criterion));
    const hasSoftFail = evidence.some(e => e.result === 'Fail' && !hardFailCriteria.includes(e.criterion));
    const hasMissing = evidence.some(e => e.result === 'Missing');
    let status;
    if (totalWeightUsed === 0) status = 'Not Scored';
    else if (fatalFail || hasHardFail) status = 'Not Eligible';
    else if (hasSoftFail) status = 'Partially Eligible';
    else if (hasMissing) status = 'Partially Eligible';
    else status = 'Eligible';

    // Calculate chance
    const chanceInfo = calculateChance({ match_score: matchScore, status, evidence, reasons });

    const displayTitle = enhanceTitle(sch);
    const uniName = sch.universities?.name || null;

    return {
      profile_id: targetId,
      scholarship_id: sch.id,
      university_id: sch.university_id,
      university_name: uniName,
      match_score: matchScore.toFixed(2),
      status,
      evidence,
      reasons,
      chance: chanceInfo.chance,
      chance_label: chanceInfo.label,
      chance_color: chanceInfo.color,
      title: displayTitle,
      country: sch.country,
      deadline: sch.deadline || null,
      apply_url: sch.apply_url || null,
      degree: sch.degree_level || null,
      department: sch.department || null,
      scholarship_type: sch.scholarship_type || null,
      funding: criteria.funding_coverage || null,
      funding_value: criteria.funding_value || 0,
    };
  });

  // Sort by chance (highest first), then by score
  results.sort((a, b) => b.chance - a.chance || Number(b.match_score) - Number(a.match_score));

  // Filter out field mismatches - don't show scholarships for wrong fields
  const fieldFiltered = results.filter(r => {
    const fieldFail = r.evidence.some(e => e.criterion === 'Field' && e.result === 'Fail');
    return !fieldFail;
  });

  // Final deduplication - remove duplicate scholarships by title+country
  const resultSeen = new Set();
  const deduplicated = fieldFiltered.filter(r => {
    const key = `${r.title}|${r.country}`;
    if (resultSeen.has(key)) return false;
    resultSeen.add(key);
    return true;
  });

  // 5. Store matches in DB
  try { await supabase.from('matches').delete().eq('profile_id', targetId); } catch(e) { /* ignore */ }
  const dbRecords = deduplicated.map(r => ({
    profile_id: r.profile_id, scholarship_id: r.scholarship_id,
    university_id: r.university_id, match_score: r.match_score,
    status: r.status, evidence: r.evidence, reasons: r.reasons,
  }));
  try {
    await supabase.from('matches').insert(dbRecords);
  } catch (e) {
    const stripped = dbRecords.map(r => { const { reasons, ...rest } = r; return rest; });
    try { await supabase.from('matches').insert(stripped); } catch(e) { /* ignore */ }
  }

  // 6. AI analysis (if Gemini available) - use deduplicated results
  let aiAnalysis = null;
  const eligible = deduplicated.filter(r => r.status === 'Eligible').length;
  const partial = deduplicated.filter(r => r.status === 'Partially Eligible').length;
  const notEligible = deduplicated.filter(r => r.status === 'Not Eligible').length;
  const topChance = deduplicated.length > 0 ? deduplicated[0] : null;

  if (aiModel) {
    try {
      const summaryPrompt = `You are a scholarship advisor for a Pakistani student. Analyze this profile and matching results, then give a brief, honest assessment in 3-4 sentences.

PROFILE:
- Degree: ${profile.target_degree || 'not set'}
- Field: ${userField || 'not set'}
- Country: ${profile.target_country || 'not set'}
- CGPA: ${profile.cgpa || 'not provided'}
- FSc: ${profile.fsc_percentage || 'not provided'}%
- IELTS: ${profile.ielts_score || 'not provided'}
- CV analyzed: ${Object.keys(cvData).length > 0 ? 'Yes' : 'No'}

MATCHING RESULTS:
- ${deduplicated.length} scholarships checked
- ${eligible} eligible, ${partial} partially eligible, ${notEligible} not eligible
- Best chance: ${topChance ? topChance.title + ' (' + topChance.chance + '% chance)' : 'None'}

Give honest, actionable advice. Mention the best opportunity and what they should improve. Write in simple English. Do NOT use markdown.`;

      aiAnalysis = await askAI(summaryPrompt);
    } catch (e) { /* quota exceeded or error */ }
  }

  if (!aiAnalysis) {
    // Fallback analysis
    if (eligible > 0) {
      aiAnalysis = `Great news! You're eligible for ${eligible} scholarship(s). Your top pick is "${topChance?.title}" with ${topChance?.chance}% chance. Focus on preparing strong application documents before the deadline.`;
    } else if (partial > 0) {
      const bestPartial = deduplicated.find(r => r.status === 'Partially Eligible');
      aiAnalysis = `You have ${partial} partially eligible scholarship(s). Your best option is "${bestPartial?.title}" (${bestPartial?.chance}% chance). ${bestPartial?.reasons?.[0] || 'Complete your profile to improve.'}`;
    } else {
      aiAnalysis = `Currently no scholarships match your profile well. Consider broadening your target country or improving your CGPA/IELTS scores to unlock more opportunities.`;
    }
  }

  res.json({
    success: true,
    matches: deduplicated,
    scholarship_count: deduplicated.length,
    scrape_info: scrapeInfo,
    stats: { eligible, partial, not_eligible: notEligible, total: deduplicated.length },
    analysis: aiAnalysis,
    profile_summary: {
      degree: profile.target_degree, field: userField,
      country: profile.target_country, cgpa: profile.cgpa,
      fsc_percentage: profile.fsc_percentage,
      ielts: profile.ielts_score,
      cv_analyzed: hasCv
    }
  });

  } catch (err) {
    console.error('Smart Agent error:', err.message, err.stack);
    return res.status(500).json({ success: false, error: 'Smart Agent error: ' + err.message });
  }
});

// SPA fallback - serve index.html for any non-API route
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

 const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;