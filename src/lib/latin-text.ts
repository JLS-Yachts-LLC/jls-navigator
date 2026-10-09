/**
 * English (Latin) letters only, for passport and visa fields — SD-0050.
 *
 * Immigration forms take Latin script. Russian passports print the place of
 * birth region in Cyrillic only ("СВЕРДЛОВСКАЯ ОБЛ. / USSR"), Bulgarian ones
 * print the issuing authority in both scripts ("МВР Варна / MoI BGR"), and a
 * scan can slip a Cyrillic look-alike letter into an English name
 * ("ГALALЕТDINOVA"). toLatin() turns all of those into plain English letters:
 *
 *  1. a value printed in two scripts keeps its Latin half;
 *  2. Cyrillic look-alikes inside an otherwise English word become the English letter;
 *  3. anything still Cyrillic is transliterated (passport-style, ICAO 9303), with
 *     the usual place words given in English (Обл. → Oblast, Край → Krai).
 *
 * Used by the passport scanner (server) and the passport forms (warning + fix).
 */

const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN = /[A-Za-z]/;

/** True when the text holds any non-Latin letters an immigration form would refuse. */
export function hasNonLatin(text: string | null | undefined): boolean {
  return !!text && CYRILLIC.test(text);
}

// ICAO 9303 transliteration (as used in Russian / Ukrainian / Bulgarian passports),
// except Ъ: Bulgarian passports write it "A" (Търново → Tarnovo); in Russian it is
// a silent hard sign that hardly ever appears in a name or place.
const TRANSLIT: Record<string, string> = {
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Е: "E", Ё: "E", Ж: "ZH", З: "Z", И: "I", Й: "I",
  К: "K", Л: "L", М: "M", Н: "N", О: "O", П: "P", Р: "R", С: "S", Т: "T", У: "U", Ф: "F",
  Х: "KH", Ц: "TS", Ч: "CH", Ш: "SH", Щ: "SHCH", Ъ: "A", Ы: "Y", Ь: "", Э: "E", Ю: "IU", Я: "IA",
  І: "I", Ї: "I", Є: "IE", Ґ: "G", Ў: "U",
};

// Cyrillic letters that look like Latin ones — what a scan slips into an English word.
const LOOKALIKE: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y",
  І: "I", Ј: "J", Ѕ: "S", Г: "G",
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", к: "k", м: "m", т: "t",
};

/** Common place-of-birth words, given in English rather than letter by letter. */
const PLACE_WORDS: [RegExp, string][] = [
  [/^обл\.?$/i, "Oblast"], [/^область$/i, "Oblast"],
  [/^край$/i, "Krai"], [/^респ\.?$/i, "Republic"], [/^республика$/i, "Republic"],
  [/^ао$/i, "Autonomous Okrug"], [/^ссср$/i, "USSR"], [/^россия$/i, "Russia"],
  [/^г\.?$/i, ""],  // "г." = city of — dropped: "г. Москва" → "Moskva"
];

function transliterateWord(word: string): string {
  const bare = word.replace(/[.,]+$/, "");
  const trail = word.slice(bare.length);
  for (const [re, en] of PLACE_WORDS) {
    if (re.test(word) || re.test(bare)) {
      if (!en) return "";
      const upper = bare === bare.toUpperCase();
      return (upper ? en.toUpperCase() : en) + trail.replace(/^\./, "");
    }
  }
  const allUpper = bare === bare.toUpperCase();
  let out = "";
  for (const ch of word) {
    const up = ch.toUpperCase();
    const t = TRANSLIT[up];
    if (t === undefined) { out += ch; continue; }
    const isUpper = ch === up && ch !== ch.toLowerCase();
    // ALL CAPS stays all caps; a capital in a mixed-case word is a capital then lower ("Ж" → "Zh").
    out += isUpper ? (allUpper ? t : t.charAt(0) + t.slice(1).toLowerCase()) : t.toLowerCase();
  }
  return out;
}

function fixWord(word: string): string {
  if (!CYRILLIC.test(word)) return word;
  const latinCount = [...word].filter((c) => LATIN.test(c)).length;
  const cyrCount = [...word].filter((c) => CYRILLIC.test(c)).length;
  // Mostly English with a stray look-alike or two: swap them for the English letter.
  if (latinCount > cyrCount && [...word].every((c) => !CYRILLIC.test(c) || LOOKALIKE[c])) {
    return [...word].map((c) => LOOKALIKE[c] ?? c).join("");
  }
  return transliterateWord(word);
}

/** The text in English letters only (see the module note). Unchanged when already Latin. */
export function toLatin(text: string): string;
export function toLatin(text: string | null | undefined): string | null | undefined;
export function toLatin(text: string | null | undefined): string | null | undefined {
  if (!text || !CYRILLIC.test(text)) return text;

  // Two scripts side by side ("МВР Варна / MoI BGR"): keep the English half(s).
  const parts = text.split(/\s*\/\s*/);
  if (parts.length > 1) {
    const latinParts = parts.filter((p) => !CYRILLIC.test(p) && LATIN.test(p));
    if (latinParts.length && latinParts.length < parts.length) {
      // A Cyrillic region + an English country ("КРАСНОДАРСКИЙ КРАЙ / USSR") keeps both, transliterated.
      const allCyrillicArePlaces = parts.length === 2 && latinParts.length === 1 && /^(ussr|russia|russian federation|cccp)$/i.test(latinParts[0].trim());
      if (!allCyrillicArePlaces) return latinParts.join(" / ");
    }
  }

  return text
    .split(/(\s+)/)
    .map((w) => (/\s+/.test(w) ? w : fixWord(w)))
    .join("")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/^[\s,/]+|[\s,]+$/g, "")
    .trim();
}
