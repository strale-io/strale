import { registerCapability, type CapabilityInput } from "./index.js";
import { franc, francAll } from "franc";

// ISO 639-3 to name mapping (most common languages)
const LANG_NAMES: Record<string, string> = {
  eng: "English", spa: "Spanish", fra: "French", deu: "German", ita: "Italian",
  por: "Portuguese", nld: "Dutch", swe: "Swedish", nor: "Norwegian", dan: "Danish",
  fin: "Finnish", pol: "Polish", ces: "Czech", slk: "Slovak", ron: "Romanian",
  hun: "Hungarian", bul: "Bulgarian", hrv: "Croatian", slv: "Slovenian", ell: "Greek",
  tur: "Turkish", ara: "Arabic", heb: "Hebrew", hin: "Hindi", ben: "Bengali",
  urd: "Urdu", tha: "Thai", vie: "Vietnamese", ind: "Indonesian", msa: "Malay",
  jpn: "Japanese", kor: "Korean", zho: "Chinese", cmn: "Chinese (Mandarin)",
  rus: "Russian", ukr: "Ukrainian", kat: "Georgian", hye: "Armenian",
  est: "Estonian", lav: "Latvian", lit: "Lithuanian", afr: "Afrikaans",
  cat: "Catalan", eus: "Basque", glg: "Galician", isl: "Icelandic",
  und: "Undetermined",
};

// Script detection heuristics
function detectScript(text: string): string {
  if (/[\u4e00-\u9fff]/.test(text)) return "Han";
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return "Japanese";
  if (/[\uac00-\ud7af]/.test(text)) return "Hangul";
  if (/[\u0600-\u06ff]/.test(text)) return "Arabic";
  if (/[\u0590-\u05ff]/.test(text)) return "Hebrew";
  if (/[\u0900-\u097f]/.test(text)) return "Devanagari";
  if (/[\u0e00-\u0e7f]/.test(text)) return "Thai";
  if (/[\u0400-\u04ff]/.test(text)) return "Cyrillic";
  if (/[\u0370-\u03ff]/.test(text)) return "Greek";
  if (/[\u10a0-\u10ff]/.test(text)) return "Georgian";
  if (/[\u0530-\u058f]/.test(text)) return "Armenian";
  return "Latin";
}

registerCapability("language-detect", async (input: CapabilityInput) => {
  const text = ((input.text as string) ?? (input.task as string) ?? "").trim();
  if (!text) {
    throw new Error("'text' is required.");
  }

  const minLength = (input.min_length as number) ?? 10;

  if (text.length < minLength) {
    return {
      output: {
        language_code: "und",
        language_name: "Undetermined",
        confidence: 0,
        alternatives: [],
        script_detected: detectScript(text),
        text_length: text.length,
        note: `Text too short for reliable detection (${text.length} chars, minimum ${minLength}).`,
      },
      provenance: { source: "franc", fetched_at: new Date().toISOString() },
    };
  }

  const detected = franc(text);
  const allResults = francAll(text);

  // Calculate confidence from the top results
  const topResults = allResults.slice(0, 5);
  const topScore = topResults[0]?.[1] ?? 0;
  const secondScore = topResults[1]?.[1] ?? 0;

  // Confidence is higher when the gap between top and second is larger
  let confidence = topScore === 1 ? 1 : Math.min(topScore, 1);
  if (topScore > 0 && secondScore > 0) {
    confidence = Math.min((topScore - secondScore) / topScore + 0.5, 1);
  }
  confidence = Math.round(confidence * 100) / 100;

  const alternatives = topResults.slice(1).map(([code, score]) => ({
    language_code: code,
    language_name: LANG_NAMES[code] ?? code,
    confidence: Math.round(Math.min(score, 1) * 100) / 100,
  }));

  return {
    output: {
      language_code: detected,
      language_name: LANG_NAMES[detected] ?? detected,
      confidence,
      alternatives,
      script_detected: detectScript(text),
      text_length: text.length,
    },
    provenance: { source: "franc", fetched_at: new Date().toISOString() },
  };
});
