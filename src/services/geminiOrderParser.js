// PRIMARY: Gemini native audio input — single call for transcription + structured
// extraction. Chosen as primary because Gemini handles code-switched Hindi/English
// agricultural speech well and reduces latency (one API call vs two).
// FALLBACK CHAIN: Whisper (transcription) -> Gemini (text parse) -> regex/dictionary,
// triggered only if Gemini's primary audio call fails or times out.

const { parseVoiceOrder: parseWithRegexFallback } = require('./voiceParser');

// Candidate models with automated fallback pool
const GEMINI_AUDIO_MODELS = [
  process.env.GEMINI_AUDIO_MODEL,
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.6-flash'
].filter(Boolean);

const GEMINI_TEXT_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3-flash-preview'
].filter(Boolean);

const GEMINI_TEXT_TIMEOUT_MS = 5000;
const GEMINI_AUDIO_TIMEOUT_MS = 7500; // ~6-8s timeout for native multimodal audio processing

const TEXT_SYSTEM_INSTRUCTION = `You are an AI order parsing assistant for KrishiLink, a digital agricultural marketplace for Indian farmers (SIH 2026).
You receive transcribed spoken sell orders from farmers in Hindi, English, or code-switched Hinglish (e.g. "दो सौ किलो टमाटर पचास रुपये किलो", "I have 50 quintal wheat at 2200 per quintal", "1000 kg aloo 18 rs").
Extract structured agricultural sell order details accurately. Handle spoken numbers (e.g. "दो सौ" -> 200, "डेढ़ सौ" -> 150, "हजार" -> 1000), regional units, and common produce names.

Return ONLY a JSON object matching this exact schema:
{
  "produce": string | null,
  "quantity": number | null,
  "unit": "kg" | "quintal" | null,
  "pricePerUnit": number | null,
  "confidence": "high" | "low",
  "notes": string
}

Produce must be canonical English (e.g., "Tomato", "Potato", "Onion", "Wheat", "Rice", "Maize", "Mustard", "Soybean", "Cotton", "Garlic", "Ginger", "Chilli", etc.).
Unit must be standardized to "kg" or "quintal".
Confidence must be "high" if BOTH produce and quantity are identified; otherwise "low".
Notes must be a brief explanation (e.g. "Extracted via Gemini Flash NLU" or specific reason if confidence is low).
Output ONLY raw JSON. No markdown ticks, no preamble.`;

const AUDIO_SYSTEM_INSTRUCTION = `You are KrishiLink AI Voice Assistant for Indian farmers (SIH 2026).
You are listening to spoken audio of an agricultural sell order in Hindi, English, or Hinglish.
Listen carefully to the actual audio track provided.
CRITICAL INSTRUCTIONS:
1. Do NOT invent, assume, or hallucinate words that were not spoken.
2. Transcribe strictly what was actually spoken in the audio into "transcribedText".
3. If no words were spoken or the audio contains only silence, breathing, or background noise, return transcribedText as "" and confidence as "low".
4. Extract structured agricultural sell order fields:
   - produce: Standardized canonical English (e.g. Tomato, Potato, Onion, Wheat, Rice, Maize, Mustard, Garlic, Ginger, Chilli) or null.
   - quantity: Spoken quantity as a number (e.g. "दो सौ" -> 200, "50 quintal" -> 50) or null.
   - unit: "kg" or "quintal" (standardized).
   - pricePerUnit: Spoken price per unit as a number or null.
   - confidence: "high" only if BOTH produce and quantity were clearly spoken; otherwise "low".
   - notes: Brief description.

Return ONLY a valid JSON object matching this exact schema:
{
  "transcribedText": string,
  "detectedLanguage": string,
  "produce": string | null,
  "quantity": number | null,
  "unit": "kg" | "quintal" | null,
  "pricePerUnit": number | null,
  "confidence": "high" | "low",
  "notes": string
}
No markdown fences, no commentary.`;

/**
 * Sanitize MIME type for Gemini API inlineData
 */
function cleanMimeType(rawMime) {
  if (!rawMime) return 'audio/webm';
  const base = rawMime.split(';')[0].trim().toLowerCase();
  if (base.startsWith('audio/')) {
    return base;
  }
  if (base === 'video/webm') {
    return 'audio/webm';
  }
  return 'audio/webm';
}

/**
 * Standardize output fields to ensure type consistency
 */
function normalizeOrderResult(parsed, fallbackText = '') {
  const produce = typeof parsed.produce === 'string' && parsed.produce.trim() ? parsed.produce.trim() : null;
  const quantity = typeof parsed.quantity === 'number' && !isNaN(parsed.quantity) && parsed.quantity > 0 ? parsed.quantity : null;
  let unit = parsed.unit === 'quintal' || parsed.unit === 'kg' ? parsed.unit : (parsed.unit ? String(parsed.unit).toLowerCase() : null);
  if (unit && unit.includes('quintal')) unit = 'quintal';
  else if (unit && (unit.includes('kg') || unit.includes('kilo'))) unit = 'kg';
  else if (!unit && quantity) unit = 'kg';

  const pricePerUnit = typeof parsed.pricePerUnit === 'number' && !isNaN(parsed.pricePerUnit) && parsed.pricePerUnit > 0 ? parsed.pricePerUnit : null;
  const confidence = (produce && quantity) ? (parsed.confidence === 'low' ? 'low' : 'high') : 'low';
  const notes = parsed.notes || (confidence === 'high' ? 'Extracted successfully' : 'Some details unclear');

  const transcribedText = typeof parsed.transcribedText === 'string' && parsed.transcribedText.trim()
    ? parsed.transcribedText.trim()
    : fallbackText;
  const detectedLanguage = typeof parsed.detectedLanguage === 'string' && parsed.detectedLanguage.trim()
    ? parsed.detectedLanguage.trim()
    : 'hi';

  return {
    transcribedText,
    detectedLanguage,
    produce,
    quantity,
    unit,
    pricePerUnit,
    confidence,
    notes,
  };
}

/**
 * PRIMARY: Call Gemini API with native audio buffer (single-call audio -> transcription + structured fields)
 * 6-8s timeout safeguard
 *
 * @param {Buffer} audioBuffer
 * @param {string} rawMimeType
 * @returns {Promise<object>}
 */
async function processAudioWithGemini(audioBuffer, rawMimeType = 'audio/webm') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('Audio buffer is empty');
  }

  const mimeType = cleanMimeType(rawMimeType);
  const base64Audio = audioBuffer.toString('base64');
  let lastErr = null;

  for (const model of GEMINI_AUDIO_MODELS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_AUDIO_TIMEOUT_MS);

    try {
      const prompt = 'Transcribe this spoken agricultural sell order and extract produce, quantity, unit, and pricePerUnit. Return strictly valid JSON with keys: transcribedText, detectedLanguage, produce, quantity, unit, pricePerUnit, confidence, notes.';

      const requestBody = {
        systemInstruction: {
          parts: [{ text: AUDIO_SYSTEM_INSTRUCTION }]
        },
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Audio
                }
              },
              {
                text: prompt
              }
            ]
          }
        ]
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`Gemini Audio [${model}] HTTP ${response.status}: ${errBody.slice(0, 150)}`);
      }

      const data = await response.json();
      const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidateText) {
        throw new Error(`Gemini [${model}] returned empty candidate for audio input`);
      }

      const cleaned = candidateText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      const normalized = normalizeOrderResult(parsed);
      return {
        ...normalized,
        source: 'gemini_primary',
        modelUsed: model
      };
    } catch (err) {
      lastErr = err;
      console.warn(`[Voice Pipeline] Gemini audio model ${model} failed: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastErr || new Error('All Gemini audio models failed');
}

/**
 * FALLBACK STEP 1: Transcribe audio using OpenAI Whisper API
 *
 * @param {Buffer} audioBuffer
 * @param {string} rawMimeType
 * @param {string} originalName
 * @returns {Promise<{transcribedText: string, detectedLanguage: string}>}
 */
async function transcribeWithWhisper(audioBuffer, rawMimeType = 'audio/webm', originalName = 'audio.webm') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_openai_api_key_here') {
    throw new Error('OPENAI_API_KEY is not configured on server');
  }

  const mimeType = cleanMimeType(rawMimeType);
  const formData = new FormData();
  const audioBlob = new Blob([audioBuffer], { type: mimeType });
  formData.append('file', audioBlob, originalName || 'audio.webm');
  formData.append('model', 'whisper-1');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });

    if (!whisperResponse.ok) {
      const errData = await whisperResponse.json().catch(() => ({}));
      throw new Error(`Whisper HTTP ${whisperResponse.status}: ${errData.error?.message || 'Whisper API error'}`);
    }

    const result = await whisperResponse.json();
    return {
      transcribedText: result.text || '',
      detectedLanguage: result.language || 'auto',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call Gemini text-only API with strict 5-second timeout and fallback model pool
 *
 * @param {string} text Transcribed spoken text
 * @param {string} [detectedLanguage] Optional language hint
 * @returns {Promise<object>} Parsed order object
 */
async function extractOrderWithGemini(text, detectedLanguage = 'hi') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  let lastErr = null;
  for (const model of GEMINI_TEXT_MODELS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TEXT_TIMEOUT_MS);

    try {
      const prompt = `Transcribed Text: "${text}"\nDetected Language: "${detectedLanguage}"\n\nExtract produce, quantity, unit, and pricePerUnit.`;

      const requestBody = {
        systemInstruction: {
          parts: [{ text: TEXT_SYSTEM_INSTRUCTION }]
        },
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`Gemini text [${model}] HTTP ${response.status}: ${errBody.slice(0, 150)}`);
      }

      const data = await response.json();
      const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidateText) {
        throw new Error(`Gemini text [${model}] returned empty candidate`);
      }

      const cleaned = candidateText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      const normalized = normalizeOrderResult(parsed, text);
      return {
        ...normalized,
        rawText: text,
        source: 'gemini',
        modelUsed: model
      };
    } catch (err) {
      lastErr = err;
      console.warn(`[Voice Pipeline] Gemini text model ${model} failed: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastErr || new Error('All Gemini text models failed');
}

/**
 * Text-only Order Parsing function (used by POST /api/voice/parse-order):
 * 1. Attempts Gemini Flash extraction with strict JSON schema and 5s timeout.
 * 2. Falls back to deterministic regex/dictionary parser if Gemini fails or times out.
 */
async function parseOrderWithGemini(text, detectedLanguage = 'hi') {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return {
      produce: null,
      quantity: null,
      unit: 'kg',
      pricePerUnit: null,
      confidence: 'low',
      notes: 'No speech text provided',
      rawText: text || '',
      source: 'fallback'
    };
  }

  const rawText = text.trim();

  try {
    const result = await extractOrderWithGemini(rawText, detectedLanguage);
    return result;
  } catch (err) {
    console.warn(`[GeminiOrderParser] Falling back to regex parser: ${err.message}`);
    const fallbackResult = parseWithRegexFallback(rawText);
    return {
      ...fallbackResult,
      confidence: 'low',
      notes: `Fallback parser used (${err.message.includes('abort') ? 'timeout' : 'service unavailable'})`,
      source: 'fallback'
    };
  }
}

/**
 * PRIMARY WORKFLOW FOR POST /api/voice/process-order:
 * Primary: Gemini native audio input (single call audio -> transcript + structured order)
 * Fallback Chain: Whisper (transcription) -> Gemini (text parse) -> regex/dictionary
 *
 * @param {Buffer} audioBuffer
 * @param {string} mimeType
 * @param {string} originalName
 * @param {string} [mockText] Optional mock transcript for dev/testing
 * @returns {Promise<object>} Structured order
 */
async function processOrderFromAudio(audioBuffer, mimeType = 'audio/webm', originalName = 'audio.webm', mockText = '') {
  // If mock text is provided without audio, process directly
  if ((!audioBuffer || audioBuffer.length === 0) && mockText) {
    console.log('[Voice Pipeline] Mock text provided without audio buffer, evaluating via NLU...');
    try {
      const geminiRes = await extractOrderWithGemini(mockText, 'hi');
      console.log('[Voice Pipeline] Path used: gemini_primary (mock)');
      return {
        transcribedText: mockText,
        detectedLanguage: 'hi',
        ...geminiRes,
        source: 'gemini_primary',
      };
    } catch {
      console.log('[Voice Pipeline] Path used: regex_fallback (mock)');
      const regexRes = parseWithRegexFallback(mockText);
      return {
        transcribedText: mockText,
        detectedLanguage: 'hi',
        ...regexRes,
        confidence: 'low',
        notes: 'Regex fallback parser used for mock input',
        source: 'regex_fallback',
      };
    }
  }

  // 1. PRIMARY: Gemini native audio multimodal call
  try {
    console.log('[Voice Pipeline] Calling Gemini Primary native audio engine...');
    const primaryResult = await processAudioWithGemini(audioBuffer, mimeType);
    console.log(`[Voice Pipeline] Path used: gemini_primary (${primaryResult.modelUsed || 'default'})`);
    return primaryResult;
  } catch (geminiAudioErr) {
    console.warn(`[Voice Pipeline] Gemini primary audio failed or timed out: ${geminiAudioErr.message}`);
  }

  // 2. FALLBACK STEP 1: Whisper ASR Transcription
  let transcribedText = '';
  let detectedLanguage = 'hi';

  try {
    console.log('[Voice Pipeline] Initiating Fallback Step 1: Whisper transcription...');
    const whisperRes = await transcribeWithWhisper(audioBuffer, mimeType, originalName);
    transcribedText = (whisperRes.transcribedText || '').trim();
    detectedLanguage = whisperRes.detectedLanguage || 'hi';
  } catch (whisperErr) {
    console.warn(`[Voice Pipeline] Whisper fallback transcription failed: ${whisperErr.message}`);
    if (mockText) {
      transcribedText = mockText.trim();
    }
  }

  // If still no speech detected, return graceful low-confidence order instead of crashing
  if (!transcribedText) {
    console.warn('[Voice Pipeline] No audible speech transcribed from Gemini or Whisper.');
    return {
      transcribedText: '',
      detectedLanguage: 'hi',
      produce: null,
      quantity: null,
      unit: 'kg',
      pricePerUnit: null,
      confidence: 'low',
      notes: 'आवाज़ पहचान में नहीं आई। कृपया दोबारा बोलें या नीचे दिए गए विकल्पों में से चुनें / No speech recognized.',
      source: 'unrecognized',
    };
  }

  // 3. FALLBACK STEP 2: Gemini text-only NLU parsing
  try {
    console.log('[Voice Pipeline] Initiating Fallback Step 2: Gemini text NLU parsing...');
    const geminiTextRes = await extractOrderWithGemini(transcribedText, detectedLanguage);
    console.log('[Voice Pipeline] Path used: whisper_fallback');
    return {
      transcribedText,
      detectedLanguage,
      ...geminiTextRes,
      source: 'whisper_fallback',
    };
  } catch (geminiTextErr) {
    console.warn(`[Voice Pipeline] Gemini text parsing failed: ${geminiTextErr.message}`);
  }

  // 4. FALLBACK STEP 3: Deterministic regex/dictionary parser safety net
  console.log('[Voice Pipeline] Initiating Fallback Step 3: Regex/dictionary parser safety net...');
  console.log('[Voice Pipeline] Path used: regex_fallback');
  const regexRes = parseWithRegexFallback(transcribedText);
  return {
    transcribedText,
    detectedLanguage,
    ...regexRes,
    confidence: 'low',
    notes: 'Regex fallback parser used (Gemini unavailable)',
    source: 'regex_fallback',
  };
}

module.exports = {
  processOrderFromAudio,
  processAudioWithGemini,
  transcribeWithWhisper,
  extractOrderWithGemini,
  parseOrderWithGemini,
  parseWithRegexFallback,
};
