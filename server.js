import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// High body size limit to support Base64 photo uploads from citizen frontend
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve static files from root directory
app.use(express.static(__dirname));

// Root route serves login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Initialize Gemini API if key is present
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

let complaints = [
  {
    ticketId: "TICK-1001",
    category: "Streetlight Malfunction",
    description: "3 dark poles near central junction park avenue corner.",
    coords: { latitude: "12.9716", longitude: "77.5946" },
    status: "In Progress",
    timestamp: new Date().toISOString()
  },
  {
    ticketId: "TICK-1002",
    category: "Pothole / Road Damage",
    description: "Massive crater near the exit turning path.",
    coords: { latitude: "13.0827", longitude: "80.2707" },
    status: "Open",
    timestamp: new Date().toISOString()
  }
];

// OTP Verification Endpoint
app.post('/api/verify-otp', (req, res) => {
  const { otp } = req.body;
  if (otp === "1234") {
    return res.json({ success: true, message: "Authorized" });
  }
  return res.status(400).json({ success: false, error: "Invalid OTP code." });
});

// Citizen Issue Submission with AI Classification & Fraud Detection
app.post('/api/submit-complaint', async (req, res) => {
  const { category, description, latitude, longitude, coords, image } = req.body;
  
  let finalCategory = (category && category !== "Auto") ? category : "Pothole / Road Damage";
  let isAuthentic = true;

  // Perform AI Inspection & Categorization if photo and GEMINI_API_KEY exist
  if (image && ai) {
    try {
      const base64Data = image.split(',')[1] || image;
      
      const prompt = `You are a municipal civic complaint AI classifier.
      Task:
      1. Analyze this civic incident image.
      2. Strictly classify the issue into EXACTLY ONE of these categories:
         - "Pothole / Road Damage"
         - "Streetlight Malfunction"
         - "Garbage Accumulation"
         - "Water Leakage"
      3. Anti-fraud check: Detect if this photo is an authentic real photo taken on a smartphone, or if it is a fake/stock photo downloaded from Google/internet, or non-civic picture.

      Return ONLY a JSON object:
      {"category": "EXACT_CATEGORY_NAME", "isReal": true/false}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
            ]
          }
        ]
      });

      const jsonText = response.text.replace(/```json|```/g, '').trim();
      const aiAnalysis = JSON.parse(jsonText);

      if (aiAnalysis.category) {
        finalCategory = aiAnalysis.category; // Auto-classified by Gemini!
      }
      if (typeof aiAnalysis.isReal === 'boolean') {
        isAuthentic = aiAnalysis.isReal;
      }
    } catch (err) {
      console.error("AI Analysis error:", err.message);
    }
  }

  // Reject fake or downloaded images
  if (!isAuthentic) {
    return res.status(400).json({
      success: false,
      error: "AI Rejection: Image flagged as downloaded stock photo, fake, or non-civic."
    });
  }

  // Extract location stamped at photo time
  const lat = coords?.latitude || latitude || "12.9716";
  const lng = coords?.longitude || longitude || "77.5946";

  const newTicket = {
    ticketId: `TICK-${Math.floor(1000 + Math.random() * 9000)}`,
    category: finalCategory,
    description: description || "No extra remarks provided.",
    coords: { latitude: lat, longitude: lng },
    status: "Submitted",
    timestamp: new Date().toISOString()
  };

  complaints.unshift(newTicket);
  res.json({ success: true, ticketId: newTicket.ticketId, ticket: newTicket });
});

// Get Complaints
app.get('/api/complaints', (req, res) => {
  res.json({ success: true, complaints });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));