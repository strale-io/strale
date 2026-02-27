import { registerCapability, type CapabilityInput } from "./index.js";

// ─── Skill gap analysis — pure algorithmic with fuzzy matching ────────────────

// Alias map: each group of aliases maps to a canonical form
const ALIAS_GROUPS: string[][] = [
  ["React", "React.js", "ReactJS"],
  ["Vue", "Vue.js", "VueJS"],
  ["Next.js", "Next", "NextJS"],
  ["Nuxt", "Nuxt.js", "NuxtJS"],
  ["Angular", "AngularJS", "Angular.js"],
  ["Node.js", "Node", "NodeJS"],
  ["PostgreSQL", "Postgres", "psql"],
  ["TypeScript", "TS"],
  ["JavaScript", "JS"],
  ["Amazon Web Services", "AWS"],
  ["Google Cloud Platform", "GCP", "Google Cloud"],
  ["Microsoft Azure", "Azure"],
  ["Kubernetes", "K8s"],
  ["Machine Learning", "ML"],
  ["Artificial Intelligence", "AI"],
  ["CI/CD", "CICD", "Continuous Integration", "Continuous Deployment"],
  ["C#", "CSharp", "C Sharp"],
  [".NET", "dotnet", "DotNet", "Dot NET"],
  ["ASP.NET", "ASP.NET Core", "ASPNET"],
  ["Python", "Python3", "Python 3"],
  ["Java", "Java SE", "Java EE"],
  ["Ruby on Rails", "Rails", "RoR"],
  ["MongoDB", "Mongo"],
  ["Elasticsearch", "ElasticSearch", "Elastic"],
  ["RabbitMQ", "Rabbit MQ"],
  ["GraphQL", "Graph QL"],
  ["Docker", "Docker Engine"],
  ["Terraform", "TF"],
  ["GitHub Actions", "GHA"],
  ["GitLab CI", "GitLab CI/CD"],
  ["Amazon S3", "S3", "AWS S3"],
  ["Amazon EC2", "EC2", "AWS EC2"],
  ["Amazon Lambda", "Lambda", "AWS Lambda"],
  ["Amazon RDS", "RDS", "AWS RDS"],
  ["Amazon DynamoDB", "DynamoDB"],
  ["Amazon SQS", "SQS"],
  ["Amazon SNS", "SNS"],
  ["Redis", "Redis Cache"],
  ["MySQL", "My SQL"],
  ["SQL Server", "MSSQL", "MS SQL"],
  ["Power BI", "PowerBI"],
  ["Tailwind CSS", "Tailwind", "TailwindCSS"],
  ["Spring Boot", "SpringBoot", "Spring"],
  ["React Native", "RN", "ReactNative"],
  ["Express", "Express.js", "ExpressJS"],
  ["FastAPI", "Fast API"],
  ["scikit-learn", "sklearn", "scikit learn"],
  ["TensorFlow", "TF", "Tensor Flow"],
  ["PyTorch", "Py Torch"],
  ["Natural Language Processing", "NLP"],
  ["Computer Vision", "CV"],
  ["RESTful API", "REST API", "REST", "RESTful"],
  ["Object-Oriented Programming", "OOP"],
  ["Functional Programming", "FP"],
  ["Test-Driven Development", "TDD"],
  ["Behavior-Driven Development", "BDD"],
  ["Domain-Driven Design", "DDD"],
  ["Infrastructure as Code", "IaC"],
  ["Single Page Application", "SPA"],
  ["Progressive Web App", "PWA"],
  ["Cascading Style Sheets", "CSS"],
  ["HyperText Markup Language", "HTML"],
  ["Structured Query Language", "SQL"],
];

// Build lookup: lowercase alias → canonical (first entry in group)
const aliasToCanonical = new Map<string, string>();
for (const group of ALIAS_GROUPS) {
  const canonical = group[0].toLowerCase();
  for (const alias of group) {
    aliasToCanonical.set(alias.toLowerCase(), canonical);
  }
}

function normalize(skill: string): string {
  const trimmed = skill.trim().toLowerCase();
  return aliasToCanonical.get(trimmed) ?? trimmed;
}

function parseSkillList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function findOriginalAlias(
  normalizedRequired: string,
  candidateSkills: string[],
): { found: string; exact: boolean } | null {
  // Check each candidate skill
  for (const cs of candidateSkills) {
    const normalizedCandidate = normalize(cs);
    if (normalizedCandidate === normalizedRequired) {
      return {
        found: cs,
        exact: cs.toLowerCase() === normalizedRequired,
      };
    }
  }
  return null;
}

registerCapability("skill-gap-analyze", async (input: CapabilityInput) => {
  // Accept multiple alias field names
  const requiredRaw =
    input.required_skills ?? input.job_skills ?? input.required ?? [];
  const candidateRaw =
    input.candidate_skills ?? input.cv_skills ?? input.candidate ?? [];

  const requiredSkills = parseSkillList(requiredRaw);
  const candidateSkills = parseSkillList(candidateRaw);

  if (requiredSkills.length === 0) {
    throw new Error(
      "'required_skills' is required. Provide skills as an array or comma-separated string.",
    );
  }
  if (candidateSkills.length === 0) {
    throw new Error(
      "'candidate_skills' is required. Provide skills as an array or comma-separated string.",
    );
  }

  const matched: Array<{
    required: string;
    found: string;
    exact: boolean;
  }> = [];
  const fuzzyMatches: Array<{
    required: string;
    found: string;
    confidence: number;
  }> = [];
  const missing: string[] = [];

  for (const req of requiredSkills) {
    const normalizedReq = normalize(req);
    const match = findOriginalAlias(normalizedReq, candidateSkills);

    if (match) {
      matched.push({
        required: req,
        found: match.found,
        exact: match.exact,
      });
      if (!match.exact) {
        fuzzyMatches.push({
          required: req,
          found: match.found,
          confidence: 0.9, // Alias match = high confidence
        });
      }
    } else {
      missing.push(req);
    }
  }

  // Find extra skills (in candidate but not in required)
  const normalizedRequired = new Set(
    requiredSkills.map((s) => normalize(s)),
  );
  const extra = candidateSkills.filter(
    (cs) => !normalizedRequired.has(normalize(cs)),
  );

  const matchScorePercent =
    requiredSkills.length > 0
      ? Math.round((matched.length / requiredSkills.length) * 100)
      : 0;

  const summary =
    matchScorePercent === 100
      ? "All required skills are matched by the candidate."
      : matchScorePercent >= 75
        ? `Strong match: ${matched.length}/${requiredSkills.length} required skills present. Missing: ${missing.join(", ")}.`
        : matchScorePercent >= 50
          ? `Partial match: ${matched.length}/${requiredSkills.length} required skills present. Key gaps: ${missing.join(", ")}.`
          : `Weak match: only ${matched.length}/${requiredSkills.length} required skills present. Major gaps: ${missing.join(", ")}.`;

  return {
    output: {
      matched,
      missing,
      extra,
      match_score_percent: matchScorePercent,
      fuzzy_matches: fuzzyMatches,
      total_required: requiredSkills.length,
      total_candidate: candidateSkills.length,
      summary,
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
