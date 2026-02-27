import { registerCapability, type CapabilityInput } from "./index.js";

// ─── Skill extraction — pure algorithmic, pattern matching against curated taxonomy ───

// ── Technical skills (200+) ──
const TECHNICAL_SKILLS = [
  // Programming languages
  "JavaScript", "TypeScript", "Python", "Java", "C\\+\\+", "C#", "Go", "Rust",
  "Ruby", "PHP", "Swift", "Kotlin", "Scala", "R", "MATLAB", "Perl", "Lua",
  "Haskell", "Erlang", "Elixir", "Clojure", "F#", "Objective-C", "Dart",
  "Julia", "COBOL", "Fortran", "Assembly", "Solidity", "Zig", "Nim",
  "Visual Basic", "VBA", "Groovy", "Shell", "Bash", "PowerShell",
  // Query & data languages
  "SQL", "NoSQL", "GraphQL", "REST", "gRPC", "SOAP", "XML", "JSON",
  "YAML", "Protobuf", "Avro", "Parquet", "HTML", "CSS", "SASS", "LESS",
  "Tailwind CSS", "Bootstrap",
  // Frontend frameworks
  "React", "Angular", "Vue", "Svelte", "Next\\.js", "Nuxt", "Gatsby",
  "Remix", "Astro", "SolidJS", "Preact", "Ember", "Backbone",
  "Alpine\\.js", "Lit", "Stencil", "Qwik",
  // Backend frameworks
  "Node\\.js", "Express", "Django", "Flask", "FastAPI", "Spring",
  "Spring Boot", "\\.NET", "ASP\\.NET", "Rails", "Ruby on Rails",
  "Laravel", "Symfony", "Hono", "NestJS", "Koa", "Fastify", "Gin",
  "Echo", "Fiber", "Actix", "Rocket", "Phoenix", "Ktor",
  // Cloud & infrastructure
  "AWS", "Azure", "GCP", "Google Cloud", "Docker", "Kubernetes",
  "Terraform", "Ansible", "Puppet", "Chef", "Vagrant", "Pulumi",
  "CloudFormation", "ARM Templates", "Helm", "Istio", "Envoy",
  "Consul", "Vault", "Nomad",
  // CI/CD & DevOps
  "Jenkins", "GitHub Actions", "GitLab CI", "CircleCI", "Travis CI",
  "Bamboo", "TeamCity", "ArgoCD", "Flux", "Spinnaker", "Octopus Deploy",
  "CI/CD", "DevOps", "SRE", "GitOps",
  // Databases
  "PostgreSQL", "MySQL", "MariaDB", "MongoDB", "Redis", "Elasticsearch",
  "DynamoDB", "Cassandra", "CockroachDB", "Neo4j", "InfluxDB",
  "TimescaleDB", "Supabase", "Firebase", "Firestore", "Couchbase",
  "SQLite", "Oracle Database", "SQL Server", "Snowflake", "BigQuery",
  "Redshift", "Databricks", "dbt",
  // Messaging & streaming
  "Kafka", "RabbitMQ", "NATS", "Pulsar", "SQS", "SNS", "EventBridge",
  "Kinesis", "Celery", "Sidekiq", "BullMQ",
  // ML & AI
  "TensorFlow", "PyTorch", "scikit-learn", "pandas", "NumPy", "SciPy",
  "Keras", "Hugging Face", "OpenAI", "LangChain", "LlamaIndex",
  "MLflow", "Kubeflow", "Ray", "Dask", "XGBoost", "LightGBM",
  "ONNX", "OpenCV", "spaCy", "NLTK", "Transformers",
  // Big data
  "Spark", "Hadoop", "Flink", "Hive", "Presto", "Trino", "Airflow",
  "Luigi", "Dagster", "Prefect",
  // Visualization
  "Tableau", "Power BI", "Grafana", "Kibana", "D3\\.js", "Chart\\.js",
  "Plotly", "Matplotlib", "Seaborn", "Looker", "Metabase", "Superset",
  // Design tools
  "Figma", "Sketch", "Adobe XD", "InVision", "Zeplin", "Storybook",
  // Testing
  "Jest", "Mocha", "Cypress", "Playwright", "Selenium", "Puppeteer",
  "JUnit", "pytest", "RSpec", "TestCafe", "Vitest", "Testing Library",
  // Architecture & patterns
  "Microservices", "Serverless", "Event-driven", "CQRS", "Event Sourcing",
  "Domain-driven Design", "DDD", "Clean Architecture", "Hexagonal",
  "Monolith", "SOA", "API Gateway", "Service Mesh",
  // Web3 & blockchain
  "Blockchain", "Web3", "Ethereum", "Smart Contracts", "DeFi", "NFT",
  "Hardhat", "Truffle", "Foundry", "IPFS",
  // Mobile
  "React Native", "Flutter", "SwiftUI", "Jetpack Compose", "Xamarin",
  "Ionic", "Cordova", "Capacitor", "Expo",
  // Security
  "OAuth", "JWT", "SAML", "OpenID Connect", "OWASP", "Penetration Testing",
  "Cryptography", "TLS", "SSL", "Zero Trust",
  // Other
  "Linux", "Git", "WebSockets", "WebRTC", "PWA", "SEO", "Accessibility",
  "i18n", "Responsive Design", "Performance Optimization", "Caching",
  "CDN", "Load Balancing", "API Design", "System Design",
  "Data Modeling", "ETL", "Data Pipeline", "Data Warehouse",
  "Machine Learning", "Deep Learning", "NLP", "Computer Vision",
  "Generative AI", "RAG", "Vector Database", "Embedding",
  "Pinecone", "Weaviate", "Qdrant", "Milvus", "ChromaDB",
];

// ── Soft skills (50+) ──
const SOFT_SKILLS = [
  "Leadership", "Communication", "Teamwork", "Collaboration",
  "Problem[- ]solving", "Analytical Thinking", "Critical Thinking",
  "Project Management", "Time Management", "Agile", "Scrum", "Kanban",
  "SAFe", "Lean", "Stakeholder Management", "Presentation",
  "Negotiation", "Mentoring", "Coaching", "Strategic Planning",
  "Decision Making", "Conflict Resolution", "Adaptability",
  "Creativity", "Innovation", "Empathy", "Emotional Intelligence",
  "Active Listening", "Written Communication", "Public Speaking",
  "Cross-functional", "Self-motivated", "Detail-oriented",
  "Results-oriented", "Customer Focus", "Business Acumen",
  "Change Management", "Risk Management", "Quality Assurance",
  "Continuous Improvement", "Process Improvement", "Facilitation",
  "Prioritization", "Delegation", "Accountability", "Ownership",
  "Growth Mindset", "Remote Work", "Async Communication",
  "Cultural Awareness", "Diversity", "Inclusion",
];

// ── Tools (100+) ──
const TOOLS = [
  "Jira", "Confluence", "Slack", "Notion", "Trello", "Asana",
  "Monday\\.com", "Linear", "ClickUp", "Basecamp", "Shortcut",
  "Salesforce", "HubSpot", "Pipedrive", "Zoho", "Marketo",
  "SAP", "Oracle", "Workday", "ServiceNow", "Zendesk", "Intercom",
  "Freshdesk", "PagerDuty", "OpsGenie", "VictorOps",
  "Datadog", "Splunk", "Grafana", "New Relic", "Sentry",
  "LogRocket", "Hotjar", "Amplitude", "Mixpanel", "Segment",
  "Google Analytics", "Adobe Analytics", "Heap",
  "Postman", "Insomnia", "Swagger", "OpenAPI",
  "VS Code", "IntelliJ", "WebStorm", "PyCharm", "Eclipse",
  "Xcode", "Android Studio", "Vim", "Neovim", "Emacs",
  "GitHub", "GitLab", "Bitbucket", "Azure DevOps",
  "Vercel", "Netlify", "Heroku", "Railway", "Fly\\.io", "Render",
  "DigitalOcean", "Linode", "Cloudflare", "Fastly", "Akamai",
  "Stripe", "PayPal", "Braintree", "Adyen", "Square",
  "Twilio", "SendGrid", "Mailchimp", "Mailgun",
  "Auth0", "Okta", "Clerk", "Firebase Auth", "Cognito",
  "Terraform Cloud", "Pulumi Cloud", "Spacelift",
  "Docker Compose", "Docker Swarm", "Rancher", "Portainer",
  "Miro", "FigJam", "Whimsical", "Excalidraw", "Lucidchart",
  "Loom", "Zoom", "Microsoft Teams", "Google Meet", "Discord",
  "Airtable", "Google Sheets", "Excel", "Power Automate", "Zapier",
  "Make", "n8n", "Retool", "Appsmith", "Budibase",
  "Prisma", "Drizzle", "Sequelize", "TypeORM", "Knex",
  "SQLAlchemy", "Alembic", "Flyway", "Liquibase",
  "Webpack", "Vite", "esbuild", "Rollup", "Parcel", "Turbopack",
  "pnpm", "Yarn", "npm", "Bun", "Deno",
  "ChatGPT", "Claude", "Copilot", "Cursor",
];

// ── Certifications (50+) ──
const CERTIFICATIONS = [
  "AWS Certified", "AWS Solutions Architect", "AWS Developer",
  "AWS SysOps", "AWS DevOps", "AWS Machine Learning",
  "Azure Certified", "Azure Administrator", "Azure Developer",
  "Azure Solutions Architect", "Azure Data Engineer",
  "GCP Certified", "Google Cloud Certified",
  "Google Professional Cloud Architect",
  "PMP", "PRINCE2", "PMI-ACP",
  "CISSP", "CISM", "CISA", "CEH", "CompTIA Security\\+",
  "CompTIA Network\\+", "CompTIA A\\+",
  "CPA", "CFA", "FRM",
  "TOGAF", "ITIL", "COBIT",
  "Six Sigma", "Lean Six Sigma", "Six Sigma Green Belt",
  "Six Sigma Black Belt",
  "Scrum Master", "CSM", "PSM", "SAFe Agilist",
  "Product Owner", "CSPO", "PSPO",
  "ISTQB", "ISTQB Foundation",
  "Terraform Associate", "Kubernetes Administrator", "CKA", "CKAD",
  "Docker Certified Associate",
  "Cisco CCNA", "Cisco CCNP",
  "Oracle Certified", "Java Certified",
  "Red Hat Certified", "RHCSA", "RHCE",
  "Salesforce Certified", "Salesforce Administrator",
  "HubSpot Certified", "Google Ads Certified",
];

// ── Languages ──
const LANGUAGES = [
  "English", "Swedish", "Norwegian", "Danish", "Finnish", "Icelandic",
  "German", "French", "Spanish", "Italian", "Portuguese", "Dutch",
  "Polish", "Czech", "Slovak", "Hungarian", "Romanian", "Bulgarian",
  "Croatian", "Serbian", "Slovenian", "Greek", "Turkish",
  "Japanese", "Chinese", "Mandarin", "Cantonese", "Korean",
  "Arabic", "Hindi", "Urdu", "Bengali", "Tamil", "Telugu",
  "Russian", "Ukrainian", "Thai", "Vietnamese", "Indonesian",
  "Malay", "Tagalog", "Hebrew", "Persian", "Farsi",
  "Swahili", "Amharic", "Estonian", "Latvian", "Lithuanian",
];

// ── Seniority signals ──
const SENIORITY_PATTERNS = [
  { pattern: /\b(senior|sr\.?)\b/i, level: "senior" },
  { pattern: /\b(lead|team lead|tech lead)\b/i, level: "lead" },
  { pattern: /\b(principal)\b/i, level: "principal" },
  { pattern: /\b(staff)\b/i, level: "staff" },
  { pattern: /\b(junior|jr\.?)\b/i, level: "junior" },
  { pattern: /\b(intern|internship)\b/i, level: "intern" },
  { pattern: /\b(entry[- ]level)\b/i, level: "entry-level" },
  { pattern: /\b(mid[- ]level|mid[- ]senior)\b/i, level: "mid" },
  { pattern: /\b(director)\b/i, level: "director" },
  { pattern: /\b(vp|vice president)\b/i, level: "vp" },
  { pattern: /\b(c-level|cto|ceo|cfo|coo|cio|ciso)\b/i, level: "c-level" },
  { pattern: /\b(manager|engineering manager)\b/i, level: "manager" },
  { pattern: /\b(architect|solutions architect)\b/i, level: "architect" },
  { pattern: /\b(head of)\b/i, level: "head" },
];

const EXPERIENCE_RE = /(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)?/gi;

function matchSkills(text: string, taxonomy: string[]): string[] {
  const found: Set<string> = new Set();
  for (const skill of taxonomy) {
    // Build word-boundary regex — some skills contain regex chars
    // The taxonomy already has escaped special chars where needed
    const re = new RegExp(`\\b${skill}\\b`, "i");
    if (re.test(text)) {
      // Store the canonical (unescaped) form
      found.add(skill.replace(/\\\+/g, "+").replace(/\\\./g, "."));
    }
  }
  return Array.from(found);
}

registerCapability("skill-extract", async (input: CapabilityInput) => {
  const text = (input.text as string) ?? (input.task as string) ?? "";
  if (typeof text !== "string" || !text.trim()) {
    throw new Error(
      "'text' is required. Provide a job description or CV text to extract skills from.",
    );
  }

  const content = text.trim();

  const technicalSkills = matchSkills(content, TECHNICAL_SKILLS);
  const softSkills = matchSkills(content, SOFT_SKILLS);
  const tools = matchSkills(content, TOOLS);
  const certifications = matchSkills(content, CERTIFICATIONS);
  const languages = matchSkills(content, LANGUAGES);

  // Detect seniority signals
  const senioritySignals: string[] = [];
  for (const { pattern, level } of SENIORITY_PATTERNS) {
    if (pattern.test(content)) {
      senioritySignals.push(level);
    }
  }

  // Extract experience level mentions (years of experience)
  const experienceLevels: string[] = [];
  let expMatch: RegExpExecArray | null;
  const expRe = new RegExp(EXPERIENCE_RE.source, EXPERIENCE_RE.flags);
  while ((expMatch = expRe.exec(content)) !== null) {
    experienceLevels.push(`${expMatch[1]}+ years`);
  }

  const totalSkills =
    technicalSkills.length +
    softSkills.length +
    tools.length +
    certifications.length +
    languages.length;

  return {
    output: {
      technical_skills: technicalSkills,
      soft_skills: softSkills,
      tools,
      certifications,
      languages,
      experience_levels_mentioned: Array.from(new Set(experienceLevels)),
      seniority_signals: Array.from(new Set(senioritySignals)),
      total_skills_found: totalSkills,
    },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
