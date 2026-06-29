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

export const CAREERS = [
  { id: "swe", name: "Software Engineer" },
  { id: "backend", name: "Backend Engineer" },
  { id: "data-analyst", name: "Data Analyst" },
  { id: "data-scientist", name: "Data Scientist" },
  { id: "ml-engineer", name: "Machine Learning Engineer" },
  { id: "pm", name: "Product Manager" },
  { id: "ux", name: "UX Researcher" },
  { id: "designer", name: "Product Designer" },
  { id: "quant", name: "Quantitative Analyst" },
  { id: "ibanking", name: "Investment Banking" },
  { id: "fin-analyst", name: "Financial Analyst" },
  { id: "consultant", name: "Management Consultant" },
  { id: "founder", name: "Startup Founder" },
  { id: "bizops", name: "Operations and BizOps" },
  { id: "researcher", name: "Research Scientist" },
  { id: "biotech", name: "Biotech and Bioinformatics" },
  { id: "economist", name: "Economist and Policy" },
  { id: "growth", name: "Marketing and Growth" },
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
