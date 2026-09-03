/**
 * Attestation Service — static authority guides + tracked step rows
 */
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

function getGuide(authority) {
  return attestationGuides[authority.toUpperCase()] || null;
}

/** Build insertable attestation_steps rows for a profile */
function buildStepRows(profileId, authority) {
  const guide = getGuide(authority);
  if (!guide) return null;
  return guide.map(step => ({
    profile_id: profileId,
    authority: authority.toUpperCase(),
    step_order: step.step_order,
    step_description: step.description,
    status: 'pending'
  }));
}

module.exports = { attestationGuides, getGuide, buildStepRows };
