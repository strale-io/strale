import { registerCapability, type CapabilityInput } from "./index.js";

// Top common passwords (subset for detection)
const COMMON_PASSWORDS = new Set([
  "password", "123456", "12345678", "qwerty", "abc123", "monkey", "1234567",
  "letmein", "trustno1", "dragon", "baseball", "iloveyou", "master", "sunshine",
  "ashley", "bailey", "shadow", "123123", "654321", "superman", "qazwsx",
  "michael", "football", "password1", "password123", "admin", "welcome",
  "login", "princess", "starwars", "solo", "passw0rd", "hello", "charlie",
  "donald", "root", "toor", "pass", "test", "guest", "mustang", "access",
]);

const KEYBOARD_PATTERNS = [
  "qwerty", "qwertz", "azerty", "asdf", "zxcv", "1234", "4321",
  "qweasd", "1qaz", "2wsx", "3edc", "0987", "7890",
];

registerCapability("password-strength", async (input: CapabilityInput) => {
  const password = ((input.password as string) ?? "").toString();
  if (!password) throw new Error("'password' is required.");

  const issues: string[] = [];
  const suggestions: string[] = [];

  // Length
  const length = password.length;
  if (length < 8) issues.push("Too short (minimum 8 characters)");
  if (length < 12) suggestions.push("Use at least 12 characters for better security");

  // Character classes
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const classCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;

  if (classCount < 2) issues.push("Uses only one character class");
  if (!hasUpper) suggestions.push("Add uppercase letters");
  if (!hasDigit) suggestions.push("Add numbers");
  if (!hasSpecial) suggestions.push("Add special characters (!@#$%^&*)");

  // Common password check
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    issues.push("This is a commonly used password");
  }

  // Keyboard patterns
  const lowerPwd = password.toLowerCase();
  for (const pattern of KEYBOARD_PATTERNS) {
    if (lowerPwd.includes(pattern)) {
      issues.push(`Contains keyboard pattern: "${pattern}"`);
      break;
    }
  }

  // Repeated characters
  if (/(.)\1{2,}/.test(password)) {
    issues.push("Contains repeated characters (3+ in a row)");
  }

  // All same character
  if (new Set(password).size === 1) {
    issues.push("All characters are the same");
  }

  // Sequential characters
  let sequential = 0;
  for (let i = 1; i < password.length; i++) {
    if (password.charCodeAt(i) === password.charCodeAt(i - 1) + 1) {
      sequential++;
      if (sequential >= 3) { issues.push("Contains sequential characters (e.g., abc, 123)"); break; }
    } else {
      sequential = 0;
    }
  }

  // Entropy calculation (Shannon entropy)
  const charFreq: Record<string, number> = {};
  for (const c of password) charFreq[c] = (charFreq[c] ?? 0) + 1;
  let entropy = 0;
  for (const count of Object.values(charFreq)) {
    const p = count / length;
    entropy -= p * Math.log2(p);
  }
  const totalEntropy = entropy * length;

  // Crack time estimate (rough, based on 10B guesses/sec)
  const poolSize = (hasLower ? 26 : 0) + (hasUpper ? 26 : 0) + (hasDigit ? 10 : 0) + (hasSpecial ? 33 : 0);
  const combinations = Math.pow(Math.max(poolSize, 1), length);
  const secondsToCrack = combinations / 1e10;

  let crackTime: string;
  if (secondsToCrack < 1) crackTime = "instant";
  else if (secondsToCrack < 60) crackTime = `${Math.round(secondsToCrack)} seconds`;
  else if (secondsToCrack < 3600) crackTime = `${Math.round(secondsToCrack / 60)} minutes`;
  else if (secondsToCrack < 86400) crackTime = `${Math.round(secondsToCrack / 3600)} hours`;
  else if (secondsToCrack < 86400 * 365) crackTime = `${Math.round(secondsToCrack / 86400)} days`;
  else if (secondsToCrack < 86400 * 365 * 1000) crackTime = `${Math.round(secondsToCrack / (86400 * 365))} years`;
  else crackTime = "millions of years";

  // Score
  let score = 0;
  score += Math.min(length * 4, 40); // length up to 40 points
  score += classCount * 10; // character classes up to 40 points
  score += Math.min(totalEntropy * 2, 20); // entropy up to 20 points
  score -= issues.length * 15; // penalty for issues
  score = Math.max(0, Math.min(100, Math.round(score)));

  let strength: string;
  if (score < 20) strength = "weak";
  else if (score < 40) strength = "fair";
  else if (score < 60) strength = "good";
  else if (score < 80) strength = "strong";
  else strength = "very_strong";

  return {
    output: {
      score,
      strength,
      crack_time_estimate: crackTime,
      entropy_bits: Math.round(totalEntropy * 100) / 100,
      length,
      character_classes: { lowercase: hasLower, uppercase: hasUpper, digits: hasDigit, special: hasSpecial, count: classCount },
      issues,
      suggestions,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
