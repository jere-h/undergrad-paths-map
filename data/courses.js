// Illustrative dataset for Open Doors - the option-value heat map.
// This is hand-authored example content, NOT validated labor-market data.
// Swap in your own array of the same shape to map your real choices:
//   { name: string, destinations: string[], effort: number }
// - name:         unique, non-empty course label.
// - destinations: distinct career paths this course keeps reachable.
//                 The COUNT of these is the raw option-value score printed
//                 on each tile (it never changes as you move the slider).
// - effort:       rough time/effort-to-payoff on a 1-5 scale, traded off
//                 against breadth by the re-weighting slider.
//
// The list is authored so destination counts vary widely (a broad intro
// course keeps many doors open; a niche seminar keeps few) and so the
// broad-but-slow courses (high destinations AND high effort) visibly cool
// as the slider rewards faster payoff - giving the slider something to show.

export const COURSES = [
  {
    name: "Intro to SQL",
    destinations: [
      "Data Analyst",
      "Business Intelligence",
      "Product Analyst",
      "Backend Engineer",
      "Data Engineer",
      "Operations Analyst",
      "Marketing Analyst",
      "Healthcare Data Roles",
    ],
    effort: 2,
  },
  {
    name: "Foundations of Statistics",
    destinations: [
      "Data Scientist",
      "Quantitative Analyst",
      "Epidemiologist",
      "Actuarial Roles",
      "Market Researcher",
      "Policy Analyst",
      "UX Researcher",
      "Sports Analytics",
      "Clinical Trials",
    ],
    effort: 4,
  },
  {
    name: "Programming I: Python",
    destinations: [
      "Software Engineer",
      "Data Scientist",
      "Automation Engineer",
      "Backend Engineer",
      "Bioinformatics",
      "Quantitative Developer",
      "Game Developer",
      "DevOps",
    ],
    effort: 3,
  },
  {
    name: "Microeconomics",
    destinations: [
      "Economic Consultant",
      "Policy Analyst",
      "Financial Analyst",
      "Product Manager",
      "Strategy Consultant",
      "Market Researcher",
    ],
    effort: 3,
  },
  {
    name: "Technical Writing",
    destinations: [
      "Technical Writer",
      "Developer Advocate",
      "Product Manager",
      "Grant Writer",
      "Content Strategist",
    ],
    effort: 1,
  },
  {
    name: "Organic Chemistry",
    destinations: [
      "Medical School Track",
      "Pharmacist",
      "Materials Scientist",
      "Chemical Engineer",
      "Biotech Researcher",
    ],
    effort: 5,
  },
  {
    name: "Public Speaking",
    destinations: [
      "Sales",
      "Management Track",
      "Educator",
      "Consultant",
      "Community Organizer",
      "Founder",
    ],
    effort: 1,
  },
  {
    name: "Linear Algebra",
    destinations: [
      "Machine Learning Engineer",
      "Computer Graphics",
      "Quantitative Analyst",
      "Robotics Engineer",
      "Data Scientist",
      "Signal Processing",
      "Operations Research",
    ],
    effort: 4,
  },
  {
    name: "Graphic Design Basics",
    destinations: [
      "UI Designer",
      "Brand Designer",
      "Marketing Roles",
      "Front-End Developer",
    ],
    effort: 2,
  },
  {
    name: "Financial Accounting",
    destinations: [
      "Accountant",
      "Financial Analyst",
      "Auditor",
      "Investment Banking",
      "Startup Operator",
      "Consultant",
    ],
    effort: 3,
  },
  {
    name: "Comparative Mythology Seminar",
    destinations: ["Academic Researcher", "Writer"],
    effort: 4,
  },
  {
    name: "Intro to Cognitive Science",
    destinations: [
      "UX Researcher",
      "Product Manager",
      "Human-Computer Interaction",
      "AI Research",
      "Speech Pathology",
      "Education Designer",
      "Marketing Researcher",
    ],
    effort: 3,
  },
];
