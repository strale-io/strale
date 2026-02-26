import { registerCapability, type CapabilityInput } from "./index.js";

// Standard gitignore templates by language/framework/IDE
const TEMPLATES: Record<string, string[]> = {
  // Languages
  typescript: ["*.js", "*.d.ts", "*.js.map", "dist/", "build/", "node_modules/", "*.tsbuildinfo"],
  javascript: ["node_modules/", "dist/", "build/", "*.min.js", "*.min.css"],
  python: ["__pycache__/", "*.py[cod]", "*$py.class", "*.so", ".Python", "venv/", "env/", ".venv/", "*.egg-info/", "dist/", "build/", ".eggs/", "*.egg", ".pytest_cache/", ".mypy_cache/", ".ruff_cache/"],
  go: ["*.exe", "*.exe~", "*.dll", "*.so", "*.dylib", "*.test", "*.out", "vendor/"],
  rust: ["target/", "Cargo.lock", "**/*.rs.bk"],
  java: ["*.class", "*.jar", "*.war", "*.ear", "*.nar", "target/", "build/", ".gradle/", "gradle/", "out/"],
  ruby: ["*.gem", "*.rbc", ".bundle/", "vendor/bundle/", "coverage/", "tmp/"],
  csharp: ["bin/", "obj/", "*.suo", "*.user", ".vs/", "*.csproj.user", "packages/"],
  swift: [".build/", "Packages/", "*.xcodeproj/", "xcuserdata/"],
  // Frameworks
  react: [".next/", "out/", ".cache/"],
  nextjs: [".next/", "out/", ".vercel/"],
  vue: [".nuxt/", ".output/"],
  django: ["*.sqlite3", "db.sqlite3", "media/", "staticfiles/"],
  fastapi: [".ruff_cache/"],
  express: [],
  spring: [".mvn/", "mvnw", "mvnw.cmd"],
  rails: ["log/", "tmp/", "storage/", "public/packs/"],
  flutter: [".dart_tool/", ".flutter-plugins", ".flutter-plugins-dependencies", ".packages"],
  // IDEs
  vscode: [".vscode/*", "!.vscode/settings.json", "!.vscode/tasks.json", "!.vscode/launch.json", "!.vscode/extensions.json"],
  intellij: [".idea/", "*.iml", "*.ipr", "*.iws"],
  vim: ["*.swp", "*.swo", "*~", "Session.vim"],
  emacs: ["*~", "\\#*\\#", ".\\#*"],
  // Common
  _common: [".env", ".env.local", ".env.*.local", ".DS_Store", "Thumbs.db", "*.log", "npm-debug.log*", "yarn-debug.log*", "yarn-error.log*", ".cache/", "coverage/", "*.pem"],
};

registerCapability("gitignore-generate", async (input: CapabilityInput) => {
  const languages = (input.languages as string[]) ?? [];
  const frameworks = (input.frameworks as string[]) ?? [];
  const ides = (input.ides as string[]) ?? [];

  if (languages.length === 0 && frameworks.length === 0 && ides.length === 0) {
    throw new Error("At least one of 'languages', 'frameworks', or 'ides' is required.");
  }

  const allKeys = [
    ...languages.map((l) => l.toLowerCase()),
    ...frameworks.map((f) => f.toLowerCase()),
    ...ides.map((i) => i.toLowerCase()),
  ];

  const rules = new Set<string>();
  const sources: string[] = [];

  // Always include common
  for (const rule of TEMPLATES._common) rules.add(rule);
  sources.push("common");

  for (const key of allKeys) {
    const template = TEMPLATES[key];
    if (template) {
      for (const rule of template) rules.add(rule);
      sources.push(key);
    }
  }

  // Build organized gitignore content
  const sections: string[] = [];

  // Common
  sections.push("# Environment & OS\n" + TEMPLATES._common.filter((r) => rules.has(r)).join("\n"));

  // Languages
  for (const lang of languages) {
    const key = lang.toLowerCase();
    if (TEMPLATES[key]) {
      sections.push(`# ${lang}\n${TEMPLATES[key].join("\n")}`);
    }
  }

  // Frameworks
  for (const fw of frameworks) {
    const key = fw.toLowerCase();
    if (TEMPLATES[key]) {
      sections.push(`# ${fw}\n${TEMPLATES[key].join("\n")}`);
    }
  }

  // IDEs
  for (const ide of ides) {
    const key = ide.toLowerCase();
    if (TEMPLATES[key]) {
      sections.push(`# ${ide}\n${TEMPLATES[key].join("\n")}`);
    }
  }

  const gitignore = sections.join("\n\n") + "\n";

  return {
    output: {
      gitignore,
      sources,
      total_rules: rules.size,
      unrecognized: allKeys.filter((k) => !TEMPLATES[k]),
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
