const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory data logs
let mockDatabase = [];
let activeOTPs = {}; // Format: { phone: "1234" }

// --- OTP AUTHENTICATION ENDPOINTS ---

// 1. Send OTP Route
app.post('/api/send-otp', (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, message: "Phone number required" });
  }

  // Hardcoded standard demo OTP code
  activeOTPs[phone] = "1234";
  console.log(`📱 OTP generated for +91 ${phone} -> 1234`);
  
  res.status(200).json({ success: true, message: "OTP transmitted successfully!" });
});

// 2. Verify OTP Route
app.post('/api/verify-otp', (req, res) => {
  const { phone, otp } = req.body;
  
  if (activeOTPs[phone] && activeOTPs[phone] === otp) {
    delete activeOTPs[phone]; // Clear OTP once consumed
    console.log(`🔒 Session Authorized successfully for +91 ${phone}`);
    return res.status(200).json({ success: true, token: "mock-jwt-token-98765" });
  }

  res.status(401).json({ success: false, message: "❌ Invalid verification code." });
});


// --- COMPLAINT ENGINE ENDPOINTS ---

app.post('/api/submit-complaint', (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const ticketId = 'TK-' + Math.floor(1000 + Math.random() * 9000);
    const timerExpiresAt = new Date();
    timerExpiresAt.setHours(timerExpiresAt.getHours() + 48);

    const newTicket = { ticketId, latitude, longitude, status: 'Open', timerExpiresAt };
    
    mockDatabase.push(newTicket);
    console.log(`📥 Database Updated! Live Tickets Count: ${mockDatabase.length}`);
    
    res.status(201).json({ success: true, ticketId, message: "Ticket saved!" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Launch server instance
app.listen(3000, () => {
  console.log('🚀 Brain running flawlessly on Port 3000! Core modules online.');
});