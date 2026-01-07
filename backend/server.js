// ============================================
// CareCompass AI - Backend Server
// ============================================
// This is a simple Express server that provides AI-assisted triage
// using Google Gemini. It has ONE endpoint: POST /analyze
//
// SETUP INSTRUCTIONS:
// 1. Install dependencies: npm install
// 2. Get a Google Gemini API key from: https://makersuite.google.com/app/apikey
// 3. Replace YOUR_GEMINI_API_KEY_HERE below with your actual API key
// 4. Run the server: node server.js
// 5. Server will run on http://localhost:3000

// Load environment variables for security
// Load environment variables from the SAME directory as this script
const path = require('path');
const fs = require('fs');

// Try standard dotenv
const envPath = path.resolve(__dirname, '.env');
require('dotenv').config({ path: envPath });

// Fallback: If dotenv found nothing (likely encoding issue), read manual
if (!process.env.GEMINI_API_KEY) {
    try {
        if (fs.existsSync(envPath)) {
            console.log('⚠️ Standard dotenv failed. Attempting manual read...');
            const raw = fs.readFileSync(envPath, 'utf8');
            // Simple manual parse for GEMINI_API_KEY
            const match = raw.match(/GEMINI_API_KEY\s*=\s*(.*)/);
            if (match && match[1]) {
                process.env.GEMINI_API_KEY = match[1].trim();
                console.log('✅ Manually loaded GEMINI_API_KEY');
            }
        }
    } catch (e) {
        console.error('Manual read failed:', e);
    }
}

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ============================================
// CONFIGURATION
// ============================================

// API Key loaded EXCLUSIVELY from environment variables for security.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Fail fast if key is not found (prevents crash later)
if (!GEMINI_API_KEY) {
    console.error('CRITICAL ERROR: GEMINI_API_KEY is not set in environment variables!');
    console.error('Please ensure your .env file has the key.');
    process.exit(1);
}

const PORT = process.env.PORT || 3000;

// ============================================
// INITIALIZE EXPRESS APP
// ============================================

const app = express();

// Middleware to parse JSON requests
app.use(express.json());

// Enable CORS so frontend can call this API
app.use(cors());

// Initialize Google Gemini AI - Using v1beta for broader model support
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY, { apiVersion: 'v1beta' });

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Creates a safe fallback response when AI fails
 * This ensures the frontend never crashes
 */
function createFallbackResponse() {
    return {
        risk_level: 'Moderate',
        risk_score: 50,
        key_concerns: ['Unable to complete AI analysis', 'Manual review recommended'],
        triage_recommendation: 'Please conduct manual assessment. AI analysis unavailable.',
        clinical_summary: 'AI triage system temporarily unavailable. Proceed with standard clinical assessment protocols.',
        tests_advised: ['Complete vital signs assessment', 'Standard clinical examination'],
        first_aid_steps: ['Ensure patient is stable', 'Monitor vital signs', 'Await clinical assessment'],
        when_to_refer: 'Follow standard triage protocols for this presentation.',
        ai_note: 'This is a fallback response. AI analysis could not be completed.'
    };
}

/**
 * Parses AI response and extracts structured JSON
 * Handles various response formats from Gemini
 */
function parseAIResponse(text) {
    try {
        // More robust parsing: find content between first { and last }
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');

        if (start === -1 || end === -1) {
            console.error('No JSON object found in Gemini output. Raw text:', text);
            return createFallbackResponse();
        }

        const jsonContent = text.substring(start, end + 1);
        const parsed = JSON.parse(jsonContent);

        if (!parsed.risk_level) {
            console.warn('AI response missing risk_level. Body:', jsonContent);
            return createFallbackResponse();
        }

        return parsed;
    } catch (error) {
        console.error('Failed to parse AI response:', error);
        console.error('Original Gemini Text:', text);
        return createFallbackResponse();
    }
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * POST /analyze
 * 
 * Analyzes patient data and provides AI-assisted triage
 * 
 * Request body:
 * {
 *   patientName: string,
 *   age: string,
 *   symptoms: string,
 *   vitals: string
 * }
 * 
 * Response:
 * {
 *   risk_level: string,
 *   risk_score: number,
 *   key_concerns: array,
 *   triage_recommendation: string,
 *   clinical_summary: string,
 *   tests_advised: array,
 *   first_aid_steps: array,
 *   when_to_refer: string
 * }
 */
app.post('/analyze', async (req, res) => {
    try {
        console.log('Received triage request:', req.body);

        const { patientName, age, symptoms, vitals } = req.body;

        // Validate input
        if (!symptoms || symptoms.trim() === '') {
            return res.status(400).json({
                error: 'Symptoms are required for triage analysis'
            });
        }

        // Build the prompt for Gemini
        const prompt = `You are a clinical triage assistant. Analyze the following patient presentation and provide structured triage support.

IMPORTANT: This is triage support only, NOT diagnosis. Your role is to help prioritize care.

Patient Information:
- Name: ${patientName || 'Not provided'}
- Age: ${age || 'Not provided'}
- Symptoms: ${symptoms}
- Vitals: ${vitals || 'Not provided'}

Provide your response as a JSON object with the following structure:
{
  "risk_level": "Low" | "Moderate" | "High" | "Critical",
  "risk_score": <number 0-100>,
  "key_concerns": [<array of main concerns>],
  "triage_recommendation": "<immediate action recommendation>",
  "clinical_summary": "<brief clinical summary>",
  "tests_advised": [<array of recommended tests/assessments>],
  "first_aid_steps": [<array of immediate care steps if applicable>],
  "when_to_refer": "<guidance on when to escalate care>"
}

Guidelines:
- risk_score: 0-25 = Low, 26-50 = Moderate, 51-75 = High, 76-100 = Critical
- Be conservative - when in doubt, recommend higher acuity
- Focus on triage priority, not diagnosis
- Provide actionable recommendations
- Consider vital signs if provided

Respond ONLY with the JSON object, no additional text.`;

        // Call Gemini API - Upgraded to 2.5 Flash
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log('Raw AI response:', text);

        // Parse and validate the response
        const triageData = parseAIResponse(text);

        console.log('Parsed triage data:', triageData);

        // Always return 200 OK with structured data
        // This prevents frontend crashes
        res.json(triageData);

    } catch (error) {
        console.error('!!! Gemini API Failure !!!');
        console.error(error.stack || error);

        const fallback = createFallbackResponse();
        // Pass error message to frontend for easier debugging
        fallback.clinical_summary = `AI Error: ${error.message}. Please check your model name and API key.`;
        res.json(fallback);
    }
});

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'CareCompass AI Backend is running',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log('===========================================');
    console.log('CareCompass AI Backend Server');
    console.log('===========================================');
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: /health`);
    console.log(`Triage endpoint: POST /analyze`);
    console.log('===========================================');

    // Warn if API key is not set
    if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
        console.warn('⚠️  WARNING: Gemini API key not set!');
        console.warn('⚠️  Please replace YOUR_GEMINI_API_KEY_HERE in server.js');
        console.warn('⚠️  Get your key from: https://makersuite.google.com/app/apikey');
    }
});
