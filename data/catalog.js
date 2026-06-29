// catalog.js - illustrative dataset for Open Doors.
//
// This is hand-authored EXAMPLE content, not validated curriculum or
// labor-market data. It models three kinds of node:
//
//   CAREERS     - the "paths" the network opens. Each is a destination node.
//   COURSES     - selectable inputs, grouped by level (1000 / 2000 / 3000).
//   INTERNSHIPS - selectable inputs, grouped by org type (MNC / Small Business
//                 / Startup).
//
// Each course / internship lists the career ids it keeps reachable. Selecting
// inputs on the left lights the careers they reach on the map; a career that
// several of your picks reach burns hotter (the reinforcement / option-value
// signal carried over from the original heat map).
//
// Swap in your own arrays of the same shape to map a real catalog:
//   CAREER     { id, name }
//   COURSE     { id, name, level: 1000|2000|3000, dept, destinations: id[] }
//   INTERNSHIP { id, role, orgType: 'MNC'|'Small Business'|'Startup',
//                destinations: id[] }

// Each career carries the end-goal of the courses and internships that point at
// it: the common responsibilities you would actually own, and the skills you
// should be able to demonstrate in a resume and interview (not just box-check
// that you took the class). These are illustrative, opinionated summaries.
export const CAREERS = [
  {
    id: "swe",
    name: "Software Engineer",
    responsibilities: [
      "Ship features end to end: design, build, test, review, and operate them",
      "Read and navigate large codebases you did not write before changing them",
      "Fix bugs and incidents, then prevent the whole class of failure, not just the instance",
    ],
    skills: [
      "Writing code for the next reader: clear names, small units, honest comments",
      "Breaking a fuzzy task into reviewable increments behind a feature flag",
      "Naming trade-offs out loud (correctness vs. latency vs. simplicity)",
      "Testing the behavior that matters instead of chasing a coverage number",
    ],
  },
  {
    id: "backend",
    name: "Backend Engineer",
    responsibilities: [
      "Design APIs and data models other teams build on for years",
      "Keep services correct under load, partial failure, and concurrent access",
      "Own data integrity: migrations, idempotency, and safe rollouts",
    ],
    skills: [
      "Schema and API design that survives change (versioning, backward compatibility)",
      "Reasoning about consistency, caching, and idempotency under failure",
      "Observability instincts: logs, metrics, and traces that make incidents debuggable",
      "Spotting cost and capacity traps (missing indexes, N+1 queries)",
    ],
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    responsibilities: [
      "Turn vague business questions into measurable definitions and queries",
      "Build dashboards and recurring reports stakeholders actually use",
      "Investigate anomalies and explain what moved a metric and why",
    ],
    skills: [
      "Understanding statistical fallacies and common pitfalls (Simpson's paradox, survivorship bias, p-hacking)",
      "Communicating with non-technical stakeholders, leading with the decision not the method",
      "Matching effort to context (causal inference: descriptive trends to cohort analysis to propensity-score matching to A/B testing)",
      "SQL fluency and clean, reproducible analysis (versioned queries, documented assumptions)",
    ],
  },
  {
    id: "data-scientist",
    name: "Data Scientist",
    responsibilities: [
      "Frame an ambiguous problem as something data can actually answer",
      "Prototype models, quantify uncertainty, then hand off or productionize",
      "Design experiments and read the results without fooling yourself",
    ],
    skills: [
      "Knowing when a simple baseline beats a complex model",
      "Validation discipline (leakage, train/test hygiene, honest holdouts)",
      "Translating a metric lift into business value and its caveats",
      "Separating statistical significance from practical significance",
    ],
  },
  {
    id: "ml-engineer",
    name: "Machine Learning Engineer",
    responsibilities: [
      "Take a model from notebook to a reliable, monitored service",
      "Build training and feature pipelines that are reproducible and retrainable",
      "Watch for drift and degradation in production, not just offline metrics",
    ],
    skills: [
      "Bridging research code and production systems (latency, batching, versioning)",
      "Feature and data pipeline hygiene and reproducibility",
      "Evaluating on the metric the business cares about, not just training loss",
      "Monitoring for drift, skew, and silent failures",
    ],
  },
  {
    id: "pm",
    name: "Product Manager",
    responsibilities: [
      "Decide what to build and, harder, what not to build",
      "Write crisp specs and acceptance criteria engineering can act on",
      "Align design, engineering, and stakeholders around one priority",
    ],
    skills: [
      "Separating the user's real problem from their proposed solution",
      "Sequencing work by impact and risk, and saying no with reasons",
      "Reading qualitative and quantitative signal together",
      "Writing that makes a decision unambiguous",
    ],
  },
  {
    id: "ux",
    name: "UX Researcher",
    responsibilities: [
      "Plan and run studies that answer a real product question",
      "Turn messy observations into findings teams can act on",
      "Choose the method that fits the question and the timeline",
    ],
    skills: [
      "Writing non-leading questions and catching your own bias",
      "Matching method to question (interviews to usability tests to surveys to diary studies)",
      "Synthesizing qualitative data into a defensible claim",
      "Influencing decisions without owning the roadmap",
    ],
  },
  {
    id: "designer",
    name: "Product Designer",
    responsibilities: [
      "Turn a problem into flows, wireframes, and high-fidelity screens",
      "Keep consistency through a design system, not one-off screens",
      "Validate designs with real users before they ship",
    ],
    skills: [
      "Visual hierarchy and interaction patterns that need no explanation",
      "Designing the empty, error, and edge states, not just the happy path",
      "Giving and taking critique on the work, not the person",
      "Communicating intent to engineers (specs, tokens, handoff)",
    ],
  },
  {
    id: "quant",
    name: "Quantitative Analyst",
    responsibilities: [
      "Build and test models for pricing, risk, or trading signals",
      "Prove a backtest is signal, not overfit history",
      "Translate market structure into code and constraints",
    ],
    skills: [
      "Probability and stochastic reasoning under real constraints",
      "Guarding against overfitting and look-ahead bias",
      "Numerical care (stability, precision, edge cases)",
      "Stating model assumptions and where they break",
    ],
  },
  {
    id: "ibanking",
    name: "Investment Banking",
    responsibilities: [
      "Build financial models and valuations (DCF, comparables, LBO)",
      "Prepare pitch materials and diligence for live deals",
      "Stress-test the assumptions behind a transaction",
    ],
    skills: [
      "Accounting fluency (how the three statements connect)",
      "Valuation judgment, not just the mechanics",
      "Precision under deadline pressure",
      "Stating a recommendation crisply to decision-makers",
    ],
  },
  {
    id: "fin-analyst",
    name: "Financial Analyst",
    responsibilities: [
      "Build budgets, forecasts, and variance analysis",
      "Explain why actuals diverged from the plan",
      "Turn financial data into decisions for non-finance teams",
    ],
    skills: [
      "Modeling that is auditable and assumption-driven",
      "Connecting operational drivers to financial outcomes",
      "Telling a clear narrative around the numbers for executives",
      "Healthy skepticism toward a too-clean forecast",
    ],
  },
  {
    id: "consultant",
    name: "Management Consultant",
    responsibilities: [
      "Structure an ambiguous problem into testable hypotheses",
      "Gather evidence and pressure-test the client's assumptions",
      "Land a recommendation the client can actually execute",
    ],
    skills: [
      "Issue trees and MECE structuring",
      "Driving to the 'so what', not just the analysis",
      "Synthesizing into a clear, defensible storyline",
      "Reading the room and managing stakeholders",
    ],
  },
  {
    id: "founder",
    name: "Startup Founder",
    responsibilities: [
      "Find a problem people will pay to solve, then build the smallest test of it",
      "Recruit, sell, and fundraise long before it feels ready",
      "Decide what to ignore so the one thing that matters gets done",
    ],
    skills: [
      "Talking to users and hearing what they mean, not what flatters you",
      "Prioritizing ruthlessly under uncertainty and scarce cash",
      "Selling the vision to hires, customers, and investors",
      "Learning whatever the company needs this month",
    ],
  },
  {
    id: "bizops",
    name: "Operations and BizOps",
    responsibilities: [
      "Find the bottleneck in a process and fix the system, not the symptom",
      "Stand up the metrics and tooling a growing team runs on",
      "Run cross-functional projects no single team owns",
    ],
    skills: [
      "Process mapping and root-cause analysis",
      "Building a metric from raw data and defending its definition",
      "Influence without authority across teams",
      "Knowing when to automate vs. when to standardize first",
    ],
  },
  {
    id: "researcher",
    name: "Research Scientist",
    responsibilities: [
      "Pose a question, design experiments, and report honestly",
      "Situate work in the literature and reproduce before extending",
      "Communicate results through papers, talks, and reviews",
    ],
    skills: [
      "Experimental design and controlling for confounds",
      "Reading critically and reproducing others' results",
      "Writing precisely, including the limitations",
      "Statistical literacy and resistance to wishful interpretation",
    ],
  },
  {
    id: "biotech",
    name: "Biotech and Bioinformatics",
    responsibilities: [
      "Build pipelines to process sequencing or assay data at scale",
      "Connect computational findings back to wet-lab reality",
      "Keep analyses reproducible and traceable for compliance",
    ],
    skills: [
      "Handling noisy, high-dimensional biological data",
      "Domain fluency to avoid biologically meaningless results",
      "Reproducible pipelines (versioned data, environments, parameters)",
      "Multiple-testing discipline at genome scale",
    ],
  },
  {
    id: "economist",
    name: "Economist and Policy",
    responsibilities: [
      "Estimate the effect of a policy or intervention from imperfect data",
      "Translate findings into options decision-makers can weigh",
      "Defend identification, not just correlation",
    ],
    skills: [
      "Causal identification (natural experiments, difference-in-differences, instrumental variables)",
      "Separating correlation from causation in observational data",
      "Communicating uncertainty and assumptions to non-economists",
      "Reasoning about incentives and second-order effects",
    ],
  },
  {
    id: "growth",
    name: "Marketing and Growth",
    responsibilities: [
      "Find and scale the channels that actually acquire users",
      "Run experiments across the funnel and read them honestly",
      "Tie spend to retained value, not vanity metrics",
    ],
    skills: [
      "Funnel and cohort thinking (acquisition to activation to retention)",
      "Experiment design that survives novelty effects and seasonality",
      "Distinguishing a real channel effect from correlation",
      "Messaging that matches the audience and the channel",
    ],
  },
];

export const COURSES = [
  // Level 1000 - broad introductions that keep many doors open.
  {
    id: "cs101",
    name: "Intro to Programming",
    level: 1000,
    dept: "Computer Science",
    destinations: ["swe", "backend", "data-analyst", "data-scientist", "founder"],
  },
  {
    id: "calc1",
    name: "Calculus I",
    level: 1000,
    dept: "Mathematics",
    destinations: ["quant", "ml-engineer", "researcher", "economist"],
  },
  {
    id: "stats101",
    name: "Intro to Statistics",
    level: 1000,
    dept: "Statistics",
    destinations: ["data-analyst", "data-scientist", "quant", "economist", "researcher"],
  },
  {
    id: "econ101",
    name: "Principles of Economics",
    level: 1000,
    dept: "Economics",
    destinations: ["economist", "consultant", "fin-analyst", "pm", "ibanking"],
  },
  {
    id: "psych101",
    name: "Intro to Psychology",
    level: 1000,
    dept: "Psychology",
    destinations: ["ux", "designer", "researcher", "growth"],
  },
  {
    id: "writing101",
    name: "Academic Writing",
    level: 1000,
    dept: "Humanities",
    destinations: ["consultant", "pm", "growth", "founder"],
  },

  // Level 2000 - intermediate courses that start to specialise.
  {
    id: "ds201",
    name: "Data Structures and Algorithms",
    level: 2000,
    dept: "Computer Science",
    destinations: ["swe", "backend", "ml-engineer", "quant"],
  },
  {
    id: "linalg",
    name: "Linear Algebra",
    level: 2000,
    dept: "Mathematics",
    destinations: ["ml-engineer", "quant", "data-scientist", "researcher"],
  },
  {
    id: "db201",
    name: "Databases and SQL",
    level: 2000,
    dept: "Computer Science",
    destinations: ["backend", "data-analyst", "data-scientist", "bizops"],
  },
  {
    id: "micro",
    name: "Microeconomics",
    level: 2000,
    dept: "Economics",
    destinations: ["economist", "consultant", "fin-analyst", "pm"],
  },
  {
    id: "accounting",
    name: "Financial Accounting",
    level: 2000,
    dept: "Business",
    destinations: ["fin-analyst", "ibanking", "consultant", "bizops"],
  },
  {
    id: "cogsci",
    name: "Cognitive Science",
    level: 2000,
    dept: "Psychology",
    destinations: ["ux", "designer", "researcher", "pm"],
  },

  // Level 3000 - advanced courses that commit to a few deep paths.
  {
    id: "ml301",
    name: "Machine Learning",
    level: 3000,
    dept: "Computer Science",
    destinations: ["ml-engineer", "data-scientist", "researcher"],
  },
  {
    id: "systems",
    name: "Distributed Systems",
    level: 3000,
    dept: "Computer Science",
    destinations: ["backend", "swe", "founder"],
  },
  {
    id: "econometrics",
    name: "Econometrics",
    level: 3000,
    dept: "Economics",
    destinations: ["quant", "economist", "data-scientist", "fin-analyst"],
  },
  {
    id: "design-studio",
    name: "Product Design Studio",
    level: 3000,
    dept: "Design",
    destinations: ["designer", "ux", "pm", "founder"],
  },
  {
    id: "compbio",
    name: "Computational Biology",
    level: 3000,
    dept: "Biology",
    destinations: ["biotech", "researcher", "data-scientist"],
  },
];

export const INTERNSHIPS = [
  // MNC - large multinational employers.
  {
    id: "mnc-swe",
    role: "Software Engineer Intern",
    orgType: "MNC",
    destinations: ["swe", "backend", "ml-engineer"],
  },
  {
    id: "mnc-ib",
    role: "Investment Banking Analyst Intern",
    orgType: "MNC",
    destinations: ["ibanking", "fin-analyst", "consultant"],
  },
  {
    id: "mnc-data",
    role: "Data Analyst Intern",
    orgType: "MNC",
    destinations: ["data-analyst", "data-scientist", "bizops"],
  },
  {
    id: "mnc-brand",
    role: "Brand Marketing Intern",
    orgType: "MNC",
    destinations: ["growth", "pm", "consultant"],
  },

  // Small Business - lean teams, generalist roles.
  {
    id: "sb-fullstack",
    role: "Full-Stack Developer Intern",
    orgType: "Small Business",
    destinations: ["swe", "backend", "founder"],
  },
  {
    id: "sb-ops",
    role: "Operations Generalist Intern",
    orgType: "Small Business",
    destinations: ["bizops", "consultant", "founder"],
  },
  {
    id: "sb-account",
    role: "Accounting Intern",
    orgType: "Small Business",
    destinations: ["fin-analyst", "bizops", "ibanking"],
  },

  // Startup - early-stage, high-ownership roles.
  {
    id: "st-founding-eng",
    role: "Founding Engineer Intern",
    orgType: "Startup",
    destinations: ["swe", "backend", "ml-engineer", "founder"],
  },
  {
    id: "st-growth",
    role: "Growth and Product Intern",
    orgType: "Startup",
    destinations: ["growth", "pm", "founder", "designer"],
  },
  {
    id: "st-founders-assoc",
    role: "Founder's Associate Intern",
    orgType: "Startup",
    destinations: ["founder", "bizops", "consultant", "pm"],
  },
];
