// -----------------------------------------------------------------------
// This file is the single data layer for the whole app. Every page reads
// from here instead of hardcoding content, so swapping this static data
// for real API/scraper calls later only means changing this file -
// no component code has to change.
//
// The entries below are sourced from real, publicly available info
// (real universities, real scholarship programs with real official
// apply links, real Pakistani attestation authorities) so the demo
// isn't showing invented names. They are still static placeholders,
// not live data - a live version needs a backend to actually fetch
// and refresh this (browsers can't scrape third-party sites directly).
// -----------------------------------------------------------------------

export const student = {
  name: 'Amina',
  profileStrength: 62,
  missingBoosts: [
    { id: 'ielts', label: 'add IELTS score', gain: 12 },
    { id: 'sop', label: 'add statement of purpose', gain: 10 },
    { id: 'transcript', label: 'upload transcript', gain: 8 },
  ],
}

export const profileChecklist = [
  { id: 'basics', label: 'Basic info (name, country, email)' },
  { id: 'cv', label: 'Upload & analyze CV' },
  { id: 'academics', label: 'Academic details (auto-filled from CV)' },
]

// Required documents, tracked as fixed slots so status (submitted / pending /
// missing) means something specific rather than an arbitrary uploaded list
export const requiredDocuments = [
  { id: 'cv', label: 'CV / Resume', status: 'missing', fileName: null },
]

// Matches the student currently qualifies for
export const universityMatches = [
  {
    id: 1,
    name: 'University of Melbourne',
    country: 'Australia',
    fit: 94,
    program: 'BSc Computer Science',
    website: 'https://www.unimelb.edu.au/',
  },
  {
    id: 2,
    name: 'University of Toronto',
    country: 'Canada',
    fit: 89,
    program: 'BSc Data Science',
    website: 'https://www.utoronto.ca/',
  },
  {
    id: 3,
    name: 'TU Delft',
    country: 'Netherlands',
    fit: 85,
    program: 'BSc Applied Math',
    website: 'https://www.tudelft.nl/',
  },
  {
    id: 4,
    name: 'National University of Singapore',
    country: 'Singapore',
    fit: 80,
    program: 'BEng Computer Engineering',
    website: 'https://www.nus.edu.sg/',
  },
]

// Universities the student could unlock with specific improvements -
// shown alongside current matches so the gap to close is always visible
export const possibleMatches = [
  {
    id: 101,
    name: 'ETH Zurich',
    country: 'Switzerland',
    fit: 71,
    program: 'BSc Computer Science',
    website: 'https://ethz.ch/',
    missing: [
      'Add an IELTS or TOEFL score - ETH requires proof of English proficiency for this program.',
      'Add 2 more extracurricular activities to strengthen your profile.',
    ],
  },
  {
    id: 102,
    name: 'University of British Columbia',
    country: 'Canada',
    fit: 68,
    program: 'BSc Data Science',
    website: 'https://www.ubc.ca/',
    missing: [
      'Complete your statement of purpose - this program weighs it heavily.',
      'Upload your final transcript to confirm your GPA.',
    ],
  },
  {
    id: 103,
    name: 'University of Manchester',
    country: 'United Kingdom',
    fit: 74,
    program: 'BSc Computer Science',
    website: 'https://www.manchester.ac.uk/',
    missing: [
      'Add your IELTS score - minimum 6.5 overall is required.',
    ],
  },
]

// Full browsable directory - independent of personal matching, filterable
// by country / degree / department, each linking to its real official site
export const universityDirectory = [
  { id: 1, name: 'University of Melbourne', country: 'Australia', degrees: ['Bachelor’s', 'Master’s'], departments: ['Computer Science', 'Business Administration'], website: 'https://www.unimelb.edu.au/' },
  { id: 2, name: 'University of Toronto', country: 'Canada', degrees: ['Bachelor’s', 'Master’s', 'PhD'], departments: ['Computer Science', 'Data Science', 'Medicine'], website: 'https://www.utoronto.ca/' },
  { id: 3, name: 'TU Delft', country: 'Netherlands', degrees: ['Bachelor’s', 'Master’s'], departments: ['Electrical Engineering', 'Computer Science'], website: 'https://www.tudelft.nl/' },
  { id: 4, name: 'National University of Singapore', country: 'Singapore', degrees: ['Bachelor’s', 'Master’s', 'PhD'], departments: ['Electrical Engineering', 'Business Administration'], website: 'https://www.nus.edu.sg/' },
  { id: 5, name: 'ETH Zurich', country: 'Switzerland', degrees: ['Bachelor’s', 'Master’s', 'PhD'], departments: ['Computer Science', 'Data Science'], website: 'https://ethz.ch/' },
  { id: 6, name: 'University of British Columbia', country: 'Canada', degrees: ['Bachelor’s', 'Master’s'], departments: ['Data Science', 'Law'], website: 'https://www.ubc.ca/' },
  { id: 7, name: 'University of Manchester', country: 'United Kingdom', degrees: ['Bachelor’s', 'Master’s'], departments: ['Computer Science', 'Business Administration'], website: 'https://www.manchester.ac.uk/' },
  { id: 8, name: 'Lund University', country: 'Sweden', degrees: ['Bachelor’s', 'Master’s'], departments: ['Business Administration', 'Electrical Engineering'], website: 'https://www.lunduniversity.lu.se/' },
  { id: 9, name: 'RWTH Aachen University', country: 'Germany', degrees: ['Bachelor’s', 'Master’s', 'PhD'], departments: ['Electrical Engineering', 'Computer Science'], website: 'https://www.rwth-aachen.de/' },
  { id: 10, name: 'University College London', country: 'United Kingdom', degrees: ['Bachelor’s', 'Master’s', 'PhD'], departments: ['Medicine', 'Law', 'Computer Science'], website: 'https://www.ucl.ac.uk/' },
  { id: 11, name: 'Tsinghua University', country: 'China', degrees: ['Bachelor’s', 'Master’s', 'PhD'], departments: ['Computer Science', 'Electrical Engineering', 'Business Administration'], website: 'https://www.tsinghua.edu.cn/en/' },
]

// Scholarships tied to current matches, each with its real official apply link
export const scholarships = [
  {
    id: 1,
    name: 'Melbourne International Undergraduate Scholarship',
    amount: 'Up to 100% tuition',
    amountValue: 45000,
    deadline: 'Oct 31, 2026',
    matchedTo: 'University of Melbourne',
    country: 'Australia',
    type: 'University-funded',
    degree: 'Bachelor’s',
    department: 'Computer Science',
    applyLink: 'https://study.unimelb.edu.au/scholarships',
  },
  {
    id: 2,
    name: 'Lester B. Pearson International Scholarship',
    amount: 'Full tuition + living costs',
    amountValue: 60000,
    deadline: 'Nov 30, 2026',
    matchedTo: 'University of Toronto',
    country: 'Canada',
    type: 'University-funded',
    degree: 'Bachelor’s',
    department: 'Data Science',
    applyLink: 'https://future.utoronto.ca/pearson/',
  },
  {
    id: 3,
    name: 'Holland Scholarship',
    amount: '€5,000',
    amountValue: 5400,
    deadline: 'Jan 15, 2027',
    matchedTo: 'TU Delft',
    country: 'Netherlands',
    type: 'Government-funded',
    degree: 'Bachelor’s',
    department: 'Electrical Engineering',
    applyLink: 'https://www.studyinholland.nl/finances/holland-scholarship',
  },
  {
    id: 4,
    name: 'Chevening Scholarship',
    amount: 'Fully funded',
    amountValue: 50000,
    deadline: 'Oct 6, 2026',
    matchedTo: 'General (any UK university)',
    country: 'United Kingdom',
    type: 'Government-funded',
    degree: 'Master’s',
    department: 'Business Administration',
    applyLink: 'https://www.chevening.org/scholarships/',
  },
  {
    id: 5,
    name: 'DAAD Scholarship',
    amount: 'Monthly stipend + tuition support',
    amountValue: 12000,
    deadline: 'Varies by program',
    matchedTo: 'General (any German university)',
    country: 'Germany',
    type: 'Government-funded',
    degree: 'Master’s',
    department: 'Electrical Engineering',
    applyLink: 'https://www.daad.de/en/',
  },
  {
    id: 6,
    name: 'NUS Science & Technology Undergraduate Scholarship',
    amount: 'Full tuition + living allowance',
    amountValue: 40000,
    deadline: 'Feb 28, 2027',
    matchedTo: 'National University of Singapore',
    country: 'Singapore',
    type: 'University-funded',
    degree: 'Bachelor’s',
    department: 'Electrical Engineering',
    applyLink: 'https://www.nus.edu.sg/oam/scholarships-and-financial-aid',
  },
  {
    id: 7,
    name: 'ETH Excellence Scholarship & Opportunity Programme',
    amount: 'CHF 12,000/year + tuition waiver',
    amountValue: 13000,
    deadline: 'Dec 15, 2026',
    matchedTo: 'ETH Zurich',
    country: 'Switzerland',
    type: 'University-funded',
    degree: 'Master’s',
    department: 'Computer Science',
    applyLink: 'https://ethz.ch/en/studies/financial/scholarships/excellence-scholarship-and-opportunity-programme.html',
  },
  {
    id: 8,
    name: 'Swedish Institute Scholarship for Global Professionals',
    amount: 'Fully funded',
    amountValue: 30000,
    deadline: 'Feb 2027 (opens annually)',
    matchedTo: 'Lund University',
    country: 'Sweden',
    type: 'Government-funded',
    degree: 'Master’s',
    department: 'Business Administration',
    applyLink: 'https://si.se/en/apply/scholarships/',
  },
  {
    id: 9,
    name: 'Chinese Government Scholarship (CSC)',
    amount: 'Full tuition + monthly stipend',
    amountValue: 20000,
    deadline: 'Varies by embassy (typically Feb–Apr)',
    matchedTo: 'Tsinghua University',
    country: 'China',
    type: 'Government-funded',
    degree: 'Master’s',
    department: 'Computer Science',
    applyLink: 'https://www.campuschina.org',
  },
]

// Document attestation guidance for Pakistani students - the 3 official routes
export const attestationOptions = [
  {
    id: 'hec',
    name: 'HEC',
    fullName: 'Higher Education Commission',
    forDocuments: 'Bachelor’s and Master’s degrees, transcripts',
    steps: [
      'Create an account on the HEC e-Services Portal.',
      'Complete your personal and education profile.',
      'Upload your final certificates, degrees, and transcripts from Matric onward.',
      'Go to “Apply for Degree Attestation” and select the degree to attest.',
      'Wait for scrutiny by the HEC Attestation Team (usually 8–10 working days).',
      'Once verified, schedule your appointment date and regional centre from your dashboard.',
      'Pay the attestation fee (around Rs. 3,000 per document) via 1-Link.',
      'Visit the HEC regional centre on your scheduled date with your CNIC and original documents to collect your attested degree.',
    ],
    officialLink: 'https://eservices.hec.gov.pk',
  },
  {
    id: 'ibcc',
    name: 'IBCC',
    fullName: 'Inter Board Committee of Chairmen',
    forDocuments: 'Matric (SSC) and Intermediate (HSSC) certificates',
    steps: [
      'Collect your original SSC/HSSC certificate, a photocopy, and your CNIC or B-Form.',
      'Register an account on the IBCC e-Services Portal.',
      'Fill out the certificate attestation application form online.',
      'Upload scanned copies of your certificates and mark sheets.',
      'Pay the attestation fee (varies by certificate type).',
      'IBCC verifies your certificate with the issuing board.',
      'Book an appointment or wait for courier return, depending on the option chosen.',
      'Collect your attested certificate - this is required before MOFA attestation.',
    ],
    officialLink: 'https://attest.ibcc.edu.pk',
  },
  {
    id: 'mofa',
    name: 'MOFA',
    fullName: 'Ministry of Foreign Affairs',
    forDocuments: 'Final attestation/apostille for use abroad, after HEC or IBCC',
    steps: [
      'Make sure your document is already attested by HEC (degrees) or IBCC (Matric/Intermediate) first - MOFA does not verify documents without this step.',
      'Book an online appointment through the MOFA apostille portal.',
      'Fill in your details: name, CNIC, document type, and number of papers.',
      'Choose your nearest office (Islamabad, Lahore, Karachi, Peshawar, Quetta, Gujrat) and a date/time.',
      'Print or save your appointment slip - you need it to enter the office.',
      'Visit on your scheduled date with original documents, copies, and CNIC.',
      'Pay the attestation fee and submit documents at the counter.',
      'Collect your MOFA-attested (apostille) document, ready for embassy or university submission.',
    ],
    officialLink: 'https://apostille.mofa.gov.pk',
  },
]

export const faqs = [
  {
    id: 1,
    question: 'How does ScholarPath match me with universities?',
    answer:
      'We look at your academics, test scores, interests, and budget, then rank universities by how closely each program fits your profile. Matches update automatically as you complete your profile.',
  },
  {
    id: 2,
    question: 'Do I need a finished CV to use the CV builder?',
    answer:
      'No. You can upload an existing CV for AI feedback and polish, or start from scratch - the builder will ask a few questions and generate a professional draft for you.',
  },
  {
    id: 3,
    question: 'Can the AI improve my recommendation letter?',
    answer:
      'Yes. Paste a draft into the recommendation letter box and the AI will tighten the language, fix tone, and suggest stronger phrasing while keeping the meaning intact.',
  },
  {
    id: 4,
    question: 'Are the scholarships matched to my specific profile?',
    answer:
      'Scholarships shown are tied to the universities you match with, and filtered by the eligibility details in your profile - so you mostly see ones you can actually apply for. Each one links to its real, official apply page.',
  },
  {
    id: 5,
    question: 'Is my document data kept private?',
    answer:
      'Your documents and profile are only used to generate your matches and AI suggestions - they are not shared with third parties without your consent.',
  },
  {
    id: 6,
    question: 'Which attestation do I need - HEC, IBCC, or MOFA?',
    answer:
      'IBCC attests Matric/Intermediate certificates, HEC attests Bachelor’s/Master’s degrees, and MOFA gives the final apostille after HEC or IBCC - required for most study-abroad and visa applications. The Document Attestation tab walks you through each.',
  },
]
