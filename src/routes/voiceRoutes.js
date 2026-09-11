// PRIMARY: Gemini native audio input — single call for transcription + structured
// extraction. Chosen as primary because Gemini handles code-switched Hindi/English
// agricultural speech well and reduces latency (one API call vs two).
// FALLBACK CHAIN: Whisper (transcription) -> Gemini (text parse) -> regex/dictionary,
// triggered only if Gemini's primary audio call fails or times out.

const express = require('express');
const multer = require('multer');
const {
  processOrderVoice,
  transcribeAudio,
  parseOrder,
} = require('../controllers/voiceController');

const router = express.Router();

// Configure multer for in-memory audio upload (max 10MB, max 30s audio typically <2MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow standard audio MIME types
    if (
      file.mimetype.startsWith('audio/') ||
      file.mimetype === 'video/webm' ||
      file.mimetype === 'application/octet-stream'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only audio recordings are permitted.'));
    }
  },
});

// Middleware to handle multer file upload errors smoothly
const handleAudioUpload = (req, res, next) => {
  upload.single('audio')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'Audio file exceeds 10MB limit. Please record a shorter message (under 30 seconds).',
        });
      }
      return res.status(400).json({
        success: false,
        error: `Audio upload failed: ${err.message}`,
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        error: err.message || 'Audio upload error.',
      });
    }
    next();
  });
};

// Route: Primary single-call audio -> transcription + structured order extraction
// Uses Gemini native audio input; Whisper -> Gemini text -> Regex fallback
router.post('/process-order', handleAudioUpload, processOrderVoice);

// Backwards-compatible route: Transcribe audio stream via Whisper
router.post('/transcribe', handleAudioUpload, transcribeAudio);

// Backwards-compatible route: Parse transcribed order text via Gemini NLU
router.post('/parse-order', parseOrder);

module.exports = router;
