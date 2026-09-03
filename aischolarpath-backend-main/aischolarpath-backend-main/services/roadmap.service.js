/**
 * Roadmap Service — static milestone template + personalized roadmap building
 */
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

/**
 * Build the dated roadmap for the nearest deadline.
 * @param {Date} deadline
 */
function buildRoadmap(deadline) {
  return roadmapTemplate.map(item => {
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
}

module.exports = { roadmapTemplate, buildRoadmap };
