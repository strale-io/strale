import { registerCapability, type CapabilityInput } from "./index.js";

// ─── EU AI Act classification — pure algorithmic, rule-based ─────────────────
// Based on Regulation (EU) 2024/1689 (EU AI Act)

interface ClassificationResult {
  system_description_summary: string;
  risk_level: "unacceptable" | "high" | "limited" | "minimal";
  classification_reason: string;
  matched_keywords: string[];
  applicable_articles: string[];
  obligations: string[];
  conformity_assessment_needed: boolean;
  prohibited: boolean;
  timeline: string;
  recommendations: string[];
}

// ─── Keyword/pattern rules ───────────────────────────────────────────────────

interface RiskRule {
  risk_level: "unacceptable" | "high" | "limited";
  category: string;
  keywords: string[];
  applicable_articles: string[];
  obligations: string[];
  conformity_assessment_needed: boolean;
  timeline: string;
}

const UNACCEPTABLE_RULES: RiskRule[] = [
  {
    risk_level: "unacceptable",
    category: "Social scoring by public authorities",
    keywords: ["social scoring", "social credit", "citizen scoring"],
    applicable_articles: ["Article 5(1)(c)", "Article 5(1)(d)"],
    obligations: ["System is prohibited and must not be placed on the market or used"],
    conformity_assessment_needed: false,
    timeline: "Prohibited from 2 February 2025",
  },
  {
    risk_level: "unacceptable",
    category: "Subliminal manipulation",
    keywords: ["subliminal manipulation", "subliminal technique", "manipulative ai", "covert manipulation"],
    applicable_articles: ["Article 5(1)(a)"],
    obligations: ["System is prohibited — uses subliminal techniques to distort behavior"],
    conformity_assessment_needed: false,
    timeline: "Prohibited from 2 February 2025",
  },
  {
    risk_level: "unacceptable",
    category: "Exploitation of vulnerabilities",
    keywords: ["exploit vulnerabilities", "exploiting vulnerable", "exploit disability", "exploit age", "exploit children"],
    applicable_articles: ["Article 5(1)(b)"],
    obligations: ["System is prohibited — exploits vulnerabilities of specific groups"],
    conformity_assessment_needed: false,
    timeline: "Prohibited from 2 February 2025",
  },
  {
    risk_level: "unacceptable",
    category: "Real-time remote biometric identification in public spaces",
    keywords: ["real-time remote biometric identification", "real-time biometric", "live facial recognition public", "mass surveillance biometric"],
    applicable_articles: ["Article 5(1)(h)", "Article 5(2)", "Article 5(3)"],
    obligations: ["System is prohibited for law enforcement in publicly accessible spaces (with narrow exceptions)"],
    conformity_assessment_needed: false,
    timeline: "Prohibited from 2 February 2025",
  },
  {
    risk_level: "unacceptable",
    category: "Emotion recognition in workplace/education",
    keywords: ["emotion recognition workplace", "emotion recognition education", "emotion detection employee", "emotion detection student", "emotion monitoring staff"],
    applicable_articles: ["Article 5(1)(f)"],
    obligations: ["System is prohibited — emotion recognition in workplace or educational settings"],
    conformity_assessment_needed: false,
    timeline: "Prohibited from 2 February 2025",
  },
];

const HIGH_RISK_RULES: RiskRule[] = [
  {
    risk_level: "high",
    category: "Biometric identification and categorisation",
    keywords: ["biometric", "facial recognition", "fingerprint identification", "biometric categorisation", "remote biometric", "biometric verification"],
    applicable_articles: ["Annex III, Area 1", "Article 6(2)"],
    obligations: ["Risk management system", "Data governance", "Technical documentation", "Record-keeping", "Transparency", "Human oversight", "Accuracy/robustness/cybersecurity"],
    conformity_assessment_needed: true,
    timeline: "Obligations apply from 2 August 2026",
  },
  {
    risk_level: "high",
    category: "Critical infrastructure management",
    keywords: ["critical infrastructure", "energy grid", "water supply", "traffic management", "gas supply", "heating supply", "digital infrastructure management"],
    applicable_articles: ["Annex III, Area 2", "Article 6(2)"],
    obligations: ["Risk management system", "Data governance", "Technical documentation", "Record-keeping", "Transparency", "Human oversight", "Accuracy/robustness/cybersecurity"],
    conformity_assessment_needed: true,
    timeline: "Obligations apply from 2 August 2026",
  },
  {
    risk_level: "high",
    category: "Education and vocational training",
    keywords: ["student assessment", "admission scoring", "exam grading", "educational access", "learning assessment", "student evaluation", "academic scoring"],
    applicable_articles: ["Annex III, Area 3", "Article 6(2)"],
    obligations: ["Risk management system", "Data governance", "Technical documentation", "Record-keeping", "Transparency", "Human oversight", "Accuracy/robustness/cybersecurity"],
    conformity_assessment_needed: true,
    timeline: "Obligations apply from 2 August 2026",
  },
  {
    risk_level: "high",
    category: "Employment, workers management and access to self-employment",
    keywords: ["recruitment", "hiring decision", "cv screening", "employee monitoring", "promotion decision", "termination decision", "job candidate screening", "workforce management ai", "resume screening"],
    applicable_articles: ["Annex III, Area 4", "Article 6(2)"],
    obligations: ["Risk management system", "Data governance", "Technical documentation", "Record-keeping", "Transparency", "Human oversight", "Accuracy/robustness/cybersecurity", "Inform workers' representatives"],
    conformity_assessment_needed: true,
    timeline: "Obligations apply from 2 August 2026",
  },
  {
    risk_level: "high",
    category: "Access to essential private and public services",
    keywords: ["credit scoring", "insurance pricing", "social benefits", "emergency services dispatch", "creditworthiness", "insurance risk assessment", "benefit eligibility"],
    applicable_articles: ["Annex III, Area 5", "Article 6(2)"],
    obligations: ["Risk management system", "Data governance", "Technical documentation", "Record-keeping", "Transparency", "Human oversight", "Accuracy/robustness/cybersecurity"],
    conformity_assessment_needed: true,
    timeline: "Obligations apply from 2 August 2026",
  },
  {
    risk_level: "high",
    category: "Law enforcement",
    keywords: ["recidivism", "crime prediction", "evidence assessment", "profiling", "predictive policing", "risk assessment criminal", "polygraph ai", "lie detection"],
    applicable_articles: ["Annex III, Area 6", "Article 6(2)"],
    obligations: ["Risk management system", "Data governance", "Technical documentation", "Record-keeping", "Transparency", "Human oversight", "Accuracy/robustness/cybersecurity", "Fundamental rights impact assessment"],
    conformity_assessment_needed: true,
    timeline: "Obligations apply from 2 August 2026",
  },
  {
    risk_level: "high",
    category: "Migration, asylum and border control management",
    keywords: ["visa assessment", "asylum", "border control", "immigration", "migration risk", "travel document verification", "asylum application"],
    applicable_articles: ["Annex III, Area 7", "Article 6(2)"],
    obligations: ["Risk management system", "Data governance", "Technical documentation", "Record-keeping", "Transparency", "Human oversight", "Accuracy/robustness/cybersecurity", "Fundamental rights impact assessment"],
    conformity_assessment_needed: true,
    timeline: "Obligations apply from 2 August 2026",
  },
  {
    risk_level: "high",
    category: "Administration of justice and democratic processes",
    keywords: ["sentencing", "judicial decision", "legal interpretation", "court ruling", "judicial outcome prediction", "legal fact analysis"],
    applicable_articles: ["Annex III, Area 8", "Article 6(2)"],
    obligations: ["Risk management system", "Data governance", "Technical documentation", "Record-keeping", "Transparency", "Human oversight", "Accuracy/robustness/cybersecurity"],
    conformity_assessment_needed: true,
    timeline: "Obligations apply from 2 August 2026",
  },
];

const LIMITED_RISK_RULES: RiskRule[] = [
  {
    risk_level: "limited",
    category: "Transparency obligations (AI-generated content / interaction)",
    keywords: ["chatbot", "deepfake", "generated content", "synthetic media", "customer service bot", "virtual assistant", "ai-generated", "text generation", "conversational ai"],
    applicable_articles: ["Article 50"],
    obligations: [
      "Inform users they are interacting with an AI system",
      "Label AI-generated content (text, audio, image, video)",
      "Disclose deepfakes and synthetic media",
    ],
    conformity_assessment_needed: false,
    timeline: "Transparency obligations apply from 2 August 2026",
  },
];

function classifySystem(description: string): ClassificationResult {
  const lower = description.toLowerCase();
  const allMatchedKeywords: string[] = [];

  // Check unacceptable risk first (highest priority)
  for (const rule of UNACCEPTABLE_RULES) {
    const matched = rule.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
    if (matched.length > 0) {
      allMatchedKeywords.push(...matched);
      return {
        system_description_summary: description.slice(0, 200),
        risk_level: "unacceptable",
        classification_reason: `Matches prohibited AI practice: ${rule.category}`,
        matched_keywords: allMatchedKeywords,
        applicable_articles: rule.applicable_articles,
        obligations: rule.obligations,
        conformity_assessment_needed: rule.conformity_assessment_needed,
        prohibited: true,
        timeline: rule.timeline,
        recommendations: [
          "This system is PROHIBITED under the EU AI Act.",
          "Do not place on the market, put into service, or use this system in the EU.",
          "Consider redesigning the system to avoid prohibited practices.",
          "Consult legal counsel specializing in EU AI regulation.",
        ],
      };
    }
  }

  // Check high risk (Annex III)
  for (const rule of HIGH_RISK_RULES) {
    const matched = rule.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
    if (matched.length > 0) {
      allMatchedKeywords.push(...matched);
      return {
        system_description_summary: description.slice(0, 200),
        risk_level: "high",
        classification_reason: `Falls under high-risk category: ${rule.category}`,
        matched_keywords: allMatchedKeywords,
        applicable_articles: rule.applicable_articles,
        obligations: rule.obligations,
        conformity_assessment_needed: rule.conformity_assessment_needed,
        prohibited: false,
        timeline: rule.timeline,
        recommendations: [
          "Register the system in the EU database for high-risk AI systems.",
          "Implement a comprehensive risk management system (Article 9).",
          "Ensure training data quality and governance (Article 10).",
          "Prepare technical documentation (Article 11).",
          "Implement automatic logging/record-keeping (Article 12).",
          "Provide clear instructions for deployers (Article 13).",
          "Design for effective human oversight (Article 14).",
          "Ensure appropriate accuracy, robustness, and cybersecurity (Article 15).",
          "Undergo conformity assessment before placing on the EU market.",
          "Appoint an EU authorized representative if based outside the EU.",
        ],
      };
    }
  }

  // Check limited risk
  for (const rule of LIMITED_RISK_RULES) {
    const matched = rule.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
    if (matched.length > 0) {
      allMatchedKeywords.push(...matched);
      return {
        system_description_summary: description.slice(0, 200),
        risk_level: "limited",
        classification_reason: `Subject to transparency obligations: ${rule.category}`,
        matched_keywords: allMatchedKeywords,
        applicable_articles: rule.applicable_articles,
        obligations: rule.obligations,
        conformity_assessment_needed: rule.conformity_assessment_needed,
        prohibited: false,
        timeline: rule.timeline,
        recommendations: [
          "Clearly disclose to users that they are interacting with an AI system.",
          "Label any AI-generated or manipulated content appropriately.",
          "Implement transparency measures before the obligation deadline.",
          "Consider voluntary compliance with high-risk obligations for trust-building.",
        ],
      };
    }
  }

  // Default: minimal risk
  return {
    system_description_summary: description.slice(0, 200),
    risk_level: "minimal",
    classification_reason: "No high-risk, limited-risk, or prohibited keywords detected. System appears to fall under minimal risk.",
    matched_keywords: [],
    applicable_articles: ["Article 95 (Codes of conduct for minimal-risk AI)"],
    obligations: [
      "No mandatory obligations under the EU AI Act.",
      "Voluntary codes of conduct encouraged (Article 95).",
    ],
    conformity_assessment_needed: false,
    prohibited: false,
    timeline: "No mandatory compliance deadline, but voluntary codes of conduct may apply.",
    recommendations: [
      "Although not legally required, consider adopting voluntary codes of conduct (Article 95).",
      "Maintain good AI development practices (transparency, fairness, safety).",
      "Monitor regulatory developments — classification may change with delegated acts.",
      "Document your AI system's purpose and functionality for potential future audits.",
    ],
  };
}

registerCapability("eu-ai-act-classify", async (input: CapabilityInput) => {
  const description = (
    (input.description as string) ??
    (input.system_description as string) ??
    (input.task as string) ??
    ""
  ).trim();

  if (!description) {
    throw new Error(
      "'description' or 'system_description' is required. Provide a text description of the AI system to classify.",
    );
  }

  const result = classifySystem(description);

  return {
    output: { ...result },
    provenance: {
      source: "algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
