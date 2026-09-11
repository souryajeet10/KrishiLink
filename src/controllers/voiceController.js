// PRIMARY: Gemini native audio input — single call for transcription + structured
// extraction. Chosen as primary because Gemini handles code-switched Hindi/English
// agricultural speech well and reduces latency (one API call vs two).
// FALLBACK CHAIN: Whisper (transcription) -> Gemini (text parse) -> regex/dictionary,
// triggered only if Gemini's primary audio call fails or times out.

const { parseVoiceOrder } = require('../services/voiceParser');
const {
  processOrderFromAudio,
  parseOrderWithGemini,
  transcribeWithWhisper,
} = require('../services/geminiOrderParser');

/**
 * PRIMARY ENDPOINT: Process spoken audio order in a single call.
 * Primary: Native audio input to Google Gemini (multimodal)
 * Fallback Chain: Whisper (transcribe) -> Gemini (text parse) -> Regex (dictionary)
 * POST /api/voice/process-order
 */
async function processOrderVoice(req, res) {
  try {
    const mockText = req.body?.mockText || req.headers['x-mock-transcript'] || '';
    const audioBuffer = req.file?.buffer;
    const mimeType = req.file?.mimetype || 'audio/webm';
    const originalName = req.file?.originalname || 'audio.webm';
    const audioSize = audioBuffer ? audioBuffer.length : 0;

    console.log(`[Voice Backend] POST /api/voice/process-order received request | file: ${originalName} | size: ${audioSize} bytes | mimetype: ${mimeType} | mockText: ${mockText ? `"${mockText.slice(0, 40)}"` : 'none'}`);

    if (!audioBuffer && !mockText) {
      console.warn('[Voice Backend] Rejected: No audio file or mockText provided in request.');
      return res.status(400).json({
        success: false,
        error: 'No audio file provided. Please record or upload an audio sample.',
      });
    }

    const orderData = await processOrderFromAudio(audioBuffer, mimeType, originalName, mockText);

    return res.json({
      success: true,
      data: orderData,
    });
  } catch (error) {
    console.error('[VoiceController] processOrderVoice error:', error.message);
    return res.status(502).json({
      success: false,
      error: 'Voice order processing temporarily unavailable. You can enter details manually.',
      details: error.message,
    });
  }
}

/**
 * Transcribe speech audio using OpenAI Whisper API with graceful fallback
 * POST /api/voice/transcribe
 */
async function transcribeAudio(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file provided. Please record or upload an audio sample.',
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    // If OpenAI API Key is provided, call Whisper API
    if (apiKey && apiKey.trim() !== '' && apiKey !== 'your_openai_api_key_here') {
      try {
        const result = await transcribeWithWhisper(
          req.file.buffer,
          req.file.mimetype || 'audio/webm',
          req.file.originalname || 'audio.webm'
        );

        return res.json({
          success: true,
          transcribedText: result.transcribedText || '',
          detectedLanguage: result.detectedLanguage || 'auto',
        });
      } catch (apiErr) {
        console.error('[VoiceController] Whisper API request error:', apiErr.message);
        return res.status(502).json({
          success: false,
          error: 'Transcription service temporarily unavailable. You can enter details manually.',
        });
      }
    }

    // Dev/Demo fallback when OpenAI API key is not configured
    const fallbackText = req.body?.mockText || req.headers['x-mock-transcript'] || '';
    if (fallbackText) {
      return res.json({
        success: true,
        transcribedText: fallbackText,
        detectedLanguage: 'hi',
        isMock: true,
      });
    }

    return res.status(503).json({
      success: false,
      error: 'OPENAI_API_KEY is not configured on the server. Please provide the key in .env or enter details manually.',
    });
  } catch (error) {
    console.error('[VoiceController] transcribeAudio error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to process audio recording.',
    });
  }
}

/**
 * Parse transcribed order text into structured sell fields using Gemini with fallback
 * POST /api/voice/parse-order
 */
async function parseOrder(req, res) {
  try {
    const { transcribedText, text, detectedLanguage } = req.body;
    const inputText = transcribedText || text;

    if (!inputText || typeof inputText !== 'string' || !inputText.trim()) {
      return res.status(400).json({
        success: false,
        error: 'transcribedText is required and must be a non-empty string.',
      });
    }

    // Call Gemini API with 5s timeout; falls back gracefully to regex parser if API fails/times out
    const parsed = await parseOrderWithGemini(inputText, detectedLanguage || 'hi');

    return res.json({
      success: true,
      data: parsed,
    });
  } catch (error) {
    console.error('[VoiceController] parseOrder error:', error.message);
    // Even if an unexpected error occurs, try regex fallback as safety net
    try {
      const fallback = parseVoiceOrder(req.body?.transcribedText || req.body?.text || '');
      return res.json({
        success: true,
        data: {
          ...fallback,
          confidence: 'low',
          notes: 'Fallback parser used (internal error)',
          source: 'fallback',
        },
      });
    } catch {
      return res.status(500).json({
        success: false,
        error: 'Failed to parse order text.',
      });
    }
  }
}

module.exports = {
  processOrderVoice,
  transcribeAudio,
  parseOrder,
};
