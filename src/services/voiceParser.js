// DEMO-GRADE: OpenAI Whisper API + lightweight dictionary parser for SIH prototype.
// PRODUCTION ROADMAP: Replace transcription with Bhashini ASR; replace regex parser
// with a trained NER model for produce/quantity/price extraction at scale.

/**
 * Crop Dictionary with Hindi, Hinglish, and English synonyms mapped to canonical crops
 */
const PRODUCE_DICTIONARY = {
  Tomato: ['टमाटर', 'tomato', 'tomatoes', 'tamatar', 'tamator', 'टोमेटो'],
  Potato: ['आलू', 'aloo', 'potato', 'potatoes', 'batata', 'बटाटा', 'आलु'],
  Onion: ['प्याज', 'प्याज़', 'कांदा', 'कंदा', 'onion', 'onions', 'pyaz', 'pyaaj', 'kanda'],
  Wheat: ['गेहूं', 'गेहूँ', 'wheat', 'gehu', 'gehun', 'गहू'],
  Rice: ['चावल', 'धान', 'rice', 'paddy', 'chawal', 'dhan'],
  Maize: ['मक्का', 'भुट्टा', 'maize', 'corn', 'makka', 'bhutta'],
  Mustard: ['सरसों', 'राई', 'mustard', 'sarson', 'rai', 'सर्सों'],
  Soybean: ['सोयाबीन', 'soybean', 'soya', 'सोया'],
  Cotton: ['कपास', 'रूई', 'cotton', 'kapas', 'rui'],
  Garlic: ['लहसुन', 'garlic', 'lahsun', 'लसन'],
  Ginger: ['अदरक', 'ginger', 'adrak'],
  'Green Chilli': ['मिर्च', 'हरी मिर्च', 'chilli', 'mirch', 'chili', 'मिर्ची'],
  Mango: ['आम', 'mango', 'aam'],
  Apple: ['सेब', 'apple', 'seb'],
  Banana: ['केला', 'banana', 'kela'],
  Guava: ['अमरूद', 'guava', 'amrud', 'अमरुद'],
  Papaya: ['पपीता', 'papaya', 'papita'],
  Cauliflower: ['फूलगोभी', 'गोभी', 'cauliflower', 'phoolgobhi', 'gobhi'],
  Cabbage: ['पत्तागोभी', 'बंदगोभी', 'cabbage', 'pattagobhi'],
  Brinjal: ['बैंगन', 'brinjal', 'eggplant', 'baingan', 'bhanta'],
  Carrot: ['गाजर', 'carrot', 'gajar'],
  Radish: ['मूली', 'radish', 'mooli'],
};

/**
 * Hindi & English number words lookup
 */
const NUMBER_WORDS = {
  // Hindi units
  शून्य: 0,
  जीरो: 0,
  एक: 1,
  दो: 2,
  तीन: 3,
  चार: 4,
  पांच: 5,
  पाँच: 5,
  छह: 6,
  छः: 6,
  सात: 7,
  आठ: 8,
  नौ: 9,
  दस: 10,
  ग्यारह: 11,
  बारह: 12,
  तेरह: 13,
  चौदह: 14,
  पंद्रह: 15,
  पन्द्रह: 15,
  सोलह: 16,
  सत्रह: 17,
  अठारह: 18,
  उन्नीस: 19,
  बीस: 20,
  इक्कीस: 21,
  बाईस: 22,
  तेईस: 23,
  चौबीस: 24,
  पच्चीस: 25,
  छब्बीस: 26,
  सत्ताईस: 27,
  अट्ठाईस: 28,
  उनतीस: 29,
  तीस: 30,
  इकतीस: 31,
  बत्तीस: 32,
  तैंतीस: 33,
  चौंतीस: 34,
  पैंतीस: 35,
  छत्तीस: 36,
  सैंतीस: 37,
  अड़तीस: 38,
  उनतालीस: 39,
  चालीस: 40,
  इकतालीस: 41,
  बयालीस: 42,
  तैंतालीस: 43,
  चवालीस: 44,
  पैंतालीस: 45,
  छियालीस: 46,
  सैंतालीस: 47,
  अड़तालीस: 48,
  उनचास: 49,
  पचास: 50,
  इक्यावन: 51,
  बावन: 52,
  तिरपन: 53,
  चौवन: 54,
  पचपन: 55,
  छप्पन: 56,
  सत्तावन: 57,
  अट्ठावन: 58,
  उनसठ: 59,
  साठ: 60,
  इकसठ: 61,
  बासठ: 62,
  तिरसठ: 63,
  चौंसठ: 64,
  पैंसठ: 65,
  छियासठ: 66,
  सरसठ: 67,
  अड़सठ: 68,
  उनहत्तर: 69,
  सत्तर: 70,
  इकहत्तर: 71,
  बहत्तर: 72,
  तिहत्तर: 73,
  चौहत्तर: 74,
  पचहत्तर: 75,
  छिहत्तर: 76,
  सतहत्तर: 77,
  अठहत्तर: 78,
  उनासी: 79,
  अस्सी: 80,
  इक्यासी: 81,
  बयासी: 82,
  तिरासी: 83,
  चौरासी: 84,
  पचासी: 85,
  छियासी: 86,
  सत्तासी: 87,
  अट्ठासी: 88,
  नवासी: 89,
  नब्बे: 90,
  इक्यानवे: 91,
  बानवे: 92,
  तिरानवे: 93,
  चौरानवे: 94,
  पंचानवे: 95,
  छियानवे: 96,
  सत्तानवे: 97,
  अट्ठानवे: 98,
  निन्यानवे: 99,
  सौ: 100,
  हजार: 1000,
  हज़ार: 1000,
  लाख: 100000,
  डेढ़: 1.5,
  ढाई: 2.5,

  // English number words
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
  lakh: 100000,
};

/**
 * Converts Devanagari numerals (०-९) to ASCII digits (0-9)
 */
function normalizeDevanagariDigits(str) {
  const devanagariDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  return str.replace(/[०-९]/g, (char) => devanagariDigits.indexOf(char).toString());
}

/**
 * Parses numeric value from a phrase containing words or digits
 * e.g. "दो सौ" -> 200, "50" -> 50, "हजार" -> 1000, "डेढ़ सौ" -> 150
 */
function parseNumberFromPhrase(phrase) {
  if (!phrase) return null;
  const clean = normalizeDevanagariDigits(String(phrase).trim().toLowerCase());

  // Direct digit check
  const digitMatch = clean.match(/^\d+(\.\d+)?$/);
  if (digitMatch) {
    return parseFloat(digitMatch[0]);
  }

  const tokens = clean.split(/\s+/);
  let total = 0;
  let currentGroup = 0;
  let foundAny = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (/^\d+(\.\d+)?$/.test(token)) {
      currentGroup += parseFloat(token);
      foundAny = true;
      continue;
    }

    const val = NUMBER_WORDS[token];
    if (val !== undefined) {
      foundAny = true;
      if (val === 100) {
        currentGroup = (currentGroup === 0 ? 1 : currentGroup) * 100;
      } else if (val === 1000 || val === 100000) {
        currentGroup = (currentGroup === 0 ? 1 : currentGroup) * val;
        total += currentGroup;
        currentGroup = 0;
      } else {
        currentGroup += val;
      }
    }
  }

  total += currentGroup;
  return foundAny ? total : null;
}

/**
 * Parse spoken agricultural sell order
 * @param {string} text Spoken input transcript
 * @returns {{ produce: string|null, quantity: number|null, unit: string, pricePerUnit: number|null, rawText: string, confidence: "high"|"low" }}
 */
function parseVoiceOrder(text) {
  if (!text || typeof text !== 'string') {
    return {
      produce: null,
      quantity: null,
      unit: 'kg',
      pricePerUnit: null,
      rawText: text || '',
      confidence: 'low',
    };
  }

  const rawText = text.trim();
  const lowerText = normalizeDevanagariDigits(rawText.toLowerCase());

  // 1. Detect Produce Name
  let detectedProduce = null;

  for (const [canonicalCrop, synonyms] of Object.entries(PRODUCE_DICTIONARY)) {
    for (const syn of synonyms) {
      const idx = lowerText.indexOf(syn.toLowerCase());
      if (idx !== -1) {
        detectedProduce = canonicalCrop;
        break;
      }
    }
    if (detectedProduce) break;
  }

  // 2. Detect Unit
  let detectedUnit = 'kg'; // Default kg
  if (/(क्विंटल|कुंतल|कुन्तल|quintal|quintals|qtl)/i.test(lowerText)) {
    detectedUnit = 'quintal';
  } else if (/(टन|ton|tons|tonne|tonnes|metric ton|mt)/i.test(lowerText)) {
    detectedUnit = 'ton';
  } else if (/(किलो|किग्रा|किलोग्राम|kg|kgs|kilo|kilogram|kilograms)/i.test(lowerText)) {
    detectedUnit = 'kg';
  }

  // 3. Detect Price per Unit
  let detectedPrice = null;
  const pricePatterns = [
    // Pattern: [Number words/digits] + [रुपये/रुपया/rs/inr/rupees]
    /([०-९\d]+|एक|दो|तीन|चार|पांच|पाँच|छह|छः|सात|आठ|नौ|दस|ग्यारह|बारह|पंद्रह|बीस|पच्चीस|तीस|चालीस|पचास|साठ|सत्तर|अस्सी|नब्बे|सौ|हजार|hundred|fifty|forty|thirty|twenty)\s*(?:रुपये|रुपया|रुपए|rupees|rupee|rs|inr|₹)/i,
    // Pattern: ₹ + [Number]
    /₹\s*([०-९\d]+)/i,
    // Pattern: [भाव/दर/रेट/rate/price] + [:]? + [Number]
    /(?:भाव|दर|रेट|कीमत|मूल्य|rate|price)\s*(?:है|का|के|:)?\s*([०-९\d]+|एक|दो|तीन|चार|पांच|पाँच|दस|बीस|तीस|चालीस|पचास|साठ|सत्तर|अस्सी|नब्बे|सौ)/i,
    // Pattern: [Number] + [प्रति किलो / प्रति क्विंटल / per kg]
    /([०-९\d]+)\s*(?:प्रति|पर|\/|per)\s*(?:किलो|किग्रा|क्विंटल|kg|quintal)/i,
  ];

  let priceMatchPhrase = null;
  for (const pattern of pricePatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      priceMatchPhrase = match[0];
      const val = parseNumberFromPhrase(match[1]);
      if (val !== null && val > 0) {
        detectedPrice = val;
        break;
      }
    }
  }

  // 4. Detect Quantity
  let textWithoutPrice = lowerText;
  if (priceMatchPhrase) {
    textWithoutPrice = textWithoutPrice.replace(priceMatchPhrase, ' ');
  }

  let detectedQuantity = null;

  // Pattern A: Number directly before unit (e.g. "दो सौ किलो", "500 kg", "50 क्विंटल")
  const unitQuantityPattern = /((?:[०-९\d]+|एक|दो|तीन|चार|पांच|पाँच|छह|सात|आठ|नौ|दस|ग्यारह|बारह|पंद्रह|बीस|पच्चीस|तीस|चालीस|पचास|साठ|सत्तर|अस्सी|नब्बे|सौ|हजार|हज़ार|डेढ़|ढाई|one|two|three|four|five|ten|twenty|fifty|hundred|thousand)(?:\s+(?:सौ|हजार|हज़ार|hundred|thousand))?)\s*(?:किलो|किग्रा|किलोग्राम|क्विंटल|कुंतल|कुन्तल|टन|kg|kgs|kilo|quintal|ton)/i;
  const unitMatch = textWithoutPrice.match(unitQuantityPattern);
  if (unitMatch) {
    const qty = parseNumberFromPhrase(unitMatch[1]);
    if (qty !== null && qty > 0) {
      detectedQuantity = qty;
    }
  }

  // Pattern B: Digits in the remaining text
  if (detectedQuantity === null) {
    const digitMatches = textWithoutPrice.match(/\b\d+(\.\d+)?\b/g);
    if (digitMatches && digitMatches.length > 0) {
      const candidates = digitMatches.map(Number).filter(n => !isNaN(n) && n > 0 && n !== detectedPrice);
      if (candidates.length > 0) {
        detectedQuantity = candidates[0];
      }
    }
  }

  // Pattern C: Hindi number words in the remaining text
  if (detectedQuantity === null) {
    const words = textWithoutPrice.split(/\s+/);
    let numPhrase = [];
    for (const w of words) {
      if (NUMBER_WORDS[w] !== undefined) {
        numPhrase.push(w);
      } else if (numPhrase.length > 0) {
        break;
      }
    }
    if (numPhrase.length > 0) {
      const qty = parseNumberFromPhrase(numPhrase.join(' '));
      if (qty !== null && qty > 0 && qty !== detectedPrice) {
        detectedQuantity = qty;
      }
    }
  }

  // 5. Calculate Confidence
  // High confidence requires both produce AND quantity identified clearly
  const hasProduce = Boolean(detectedProduce);
  const hasQuantity = typeof detectedQuantity === 'number' && detectedQuantity > 0;
  const confidence = (hasProduce && hasQuantity) ? 'high' : 'low';

  return {
    produce: detectedProduce,
    quantity: detectedQuantity,
    unit: detectedUnit,
    pricePerUnit: detectedPrice,
    rawText,
    confidence,
  };
}

module.exports = {
  PRODUCE_DICTIONARY,
  NUMBER_WORDS,
  parseVoiceOrder,
  parseNumberFromPhrase,
};
