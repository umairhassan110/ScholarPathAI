/**
 * Language Prep Service — static test guides + personalized gap analysis data
 */
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

function getGuide(testType) {
  return languagePrepGuides[testType.toUpperCase()] || null;
}

module.exports = { languagePrepGuides, getGuide };
