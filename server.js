import 'dotenv/config'; // Loads .env file automatically
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from root directory
app.use(express.static(__dirname));

// Root route serves login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Initialize Gemini AI Client
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY is missing in your .env file!");
}
const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });

// ==========================================
// 1. DATA MODELS & IN-MEMORY STORES
// ==========================================

const DEPARTMENTS = [
  { id: 'PWD', name: 'Roads & Public Works (PWD)' },
  { id: 'WASTE', name: 'Waste Management & Sanitation' },
  { id: 'WATER', name: 'Water Supply & Sewage' },
  { id: 'ELEC', name: 'Electrical & Streetlighting' }
];

// BBMP Bengaluru Ward Members & Department Level Officers
const EMPLOYEES = [
  // --- Level 1: BBMP Department Heads ---
  { id: 'EMP-101', name: 'Rajesh Kumar', email: 'rajesh.pwd@bbmp.gov.in', department_id: 'Roads & Public Works (PWD)', level: 1, designation: 'Executive Engineer (Bengaluru PWD)', assigned_ward: 'All', reports_to_id: null },
  { id: 'EMP-102', name: 'Priya Sharma', email: 'priya.waste@bbmp.gov.in', department_id: 'Waste Management & Sanitation', level: 1, designation: 'Chief Sanitary Officer (BBMP)', assigned_ward: 'All', reports_to_id: null },
  { id: 'EMP-103', name: 'Amitabh Sen', email: 'amitabh.water@bwssb.gov.in', department_id: 'Water Supply & Sewage', level: 1, designation: 'BWSSB Chief Engineer', assigned_ward: 'All', reports_to_id: null },
  { id: 'EMP-104', name: 'Sunita Rao', email: 'sunita.elec@bescom.org', department_id: 'Electrical & Streetlighting', level: 1, designation: 'BESCOM General Manager', assigned_ward: 'All', reports_to_id: null },

  // --- Level 2: BBMP Ward Officers / Ward Engineers ---
  { id: 'EMP-201', name: 'Suresh Gowda', email: 'suresh.koramangala@bbmp.gov.in', department_id: 'Roads & Public Works (PWD)', level: 2, designation: 'Ward Engineer - Koramangala', assigned_ward: 'Koramangala', reports_to_id: 'EMP-101' },
  { id: 'EMP-202', name: 'Ananya Reddy', email: 'ananya.indiranagar@bbmp.gov.in', department_id: 'Roads & Public Works (PWD)', level: 2, designation: 'Ward Engineer - Indiranagar', assigned_ward: 'Indiranagar', reports_to_id: 'EMP-101' },
  { id: 'EMP-203', name: 'Ramesh Hegde', email: 'ramesh.whitefield@bbmp.gov.in', department_id: 'Roads & Public Works (PWD)', level: 2, designation: 'Ward Engineer - Whitefield', assigned_ward: 'Whitefield', reports_to_id: 'EMP-101' },
  { id: 'EMP-204', name: 'Kavitha Murthy', email: 'kavitha.jayanagar@bbmp.gov.in', department_id: 'Roads & Public Works (PWD)', level: 2, designation: 'Ward Engineer - Jayanagar', assigned_ward: 'Jayanagar', reports_to_id: 'EMP-101' },
  { id: 'EMP-205', name: 'Deepak Rao', email: 'deepak.hsr@bbmp.gov.in', department_id: 'Roads & Public Works (PWD)', level: 2, designation: 'Ward Engineer - HSR Layout', assigned_ward: 'HSR Layout', reports_to_id: 'EMP-101' },
  
  { id: 'EMP-206', name: 'Venkatesh K', email: 'venkatesh.sanitation@bbmp.gov.in', department_id: 'Waste Management & Sanitation', level: 2, designation: 'Sanitary Inspector - Koramangala', assigned_ward: 'Koramangala', reports_to_id: 'EMP-102' },
  { id: 'EMP-207', name: 'Meena Shivkumar', email: 'meena.sanitation@bbmp.gov.in', department_id: 'Waste Management & Sanitation', level: 2, designation: 'Sanitary Inspector - Indiranagar', assigned_ward: 'Indiranagar', reports_to_id: 'EMP-102' },
  { id: 'EMP-208', name: 'Rohan Gupta', email: 'rohan.water@bwssb.gov.in', department_id: 'Water Supply & Sewage', level: 2, designation: 'BWSSB Inspector - Whitefield', assigned_ward: 'Whitefield', reports_to_id: 'EMP-103' },
  { id: 'EMP-209', name: 'Neha Fernandez', email: 'neha.elec@bescom.org', department_id: 'Electrical & Streetlighting', level: 2, designation: 'BESCOM Inspector - HSR Layout', assigned_ward: 'HSR Layout', reports_to_id: 'EMP-104' }
];

let complaints = [];

// Area-Aware Smart Routing Logic
function routeComplaint(department, wardString) {
  const cleanWard = (wardString || '').toLowerCase();

  // Find Ward Officer matching Department and Ward Area Name
  let assignedOfficer = EMPLOYEES.find(emp => {
    const empWard = emp.assigned_ward.toLowerCase();
    const sameDept = (emp.department_id === department || emp.department_id === getDeptName(department));
    return emp.level === 2 && sameDept && (cleanWard.includes(empWard) || empWard.includes(cleanWard));
  });

  // Fallback: If specific ward officer is not found for that ward/dept combo, assign to the general department level officer
  if (!assignedOfficer) {
    assignedOfficer = EMPLOYEES.find(emp => 
      emp.level === 2 && (emp.department_id === department || emp.department_id === getDeptName(department))
    ) || EMPLOYEES[0];
  }

  const supervisor = EMPLOYEES.find(emp => emp.id === assignedOfficer.reports_to_id) || EMPLOYEES[0];

  return {
    assigned_to_employee_id: assignedOfficer.id,
    assigned_officer_name: assignedOfficer.name,
    supervisor_id: supervisor.id
  };
}

function getDeptName(departmentKey) {
  if (departmentKey === 'PWD') return 'Roads & Public Works (PWD)';
  if (departmentKey === 'WASTE') return 'Waste Management & Sanitation';
  if (departmentKey === 'WATER') return 'Water Supply & Sewage';
  if (departmentKey === 'ELEC') return 'Electrical & Streetlighting';
  return departmentKey;
}

function mapCategoryToDepartment(category) {
  if (!category) return 'Roads & Public Works (PWD)';
  const catLower = category.toLowerCase();
  if (catLower.includes('pothole') || catLower.includes('road')) return 'Roads & Public Works (PWD)';
  if (catLower.includes('garbage') || catLower.includes('waste') || catLower.includes('sanitation')) return 'Waste Management & Sanitation';
  if (catLower.includes('water') || catLower.includes('sewage') || catLower.includes('leakage')) return 'Water Supply & Sewage';
  if (catLower.includes('electric') || catLower.includes('light')) return 'Electrical & Streetlighting';
  return 'Roads & Public Works (PWD)';
}

// ==========================================
// 2. GEMINI AI CLASSIFICATION ENDPOINT
// ==========================================
app.post('/api/classify-image', async (req, res) => {
  try {
    const { image, imageBase64 } = req.body;
    const rawImage = image || imageBase64;

    if (!rawImage) {
      return res.status(400).json({ success: false, error: 'No image provided.' });
    }

    console.log("📸 Received image for Gemini AI Analysis...");

    const mimeMatch = rawImage.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const base64Data = rawImage.replace(/^data:image\/\w+;base64,/, '');

    const prompt = `Analyze this image for civic infrastructure/public service issues. 
Select EXACTLY one of the following category strings that best matches the image content:
- "Pothole / Road Damage"
- "Streetlight Malfunction"
- "Garbage Accumulation"
- "Water Leakage"

Respond ONLY with the exact chosen category string and nothing else.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ]
    });

    const categoryText = response.text ? response.text.trim() : 'Pothole / Road Damage';
    console.log("✨ Gemini Classified Image as:", categoryText);

    res.json({
      success: true,
      category: categoryText
    });
  } catch (err) {
    console.error("❌ AI Classification Error:", err.message);
    res.status(500).json({
      success: false,
      error: err.message,
      fallbackCategory: "Pothole / Road Damage"
    });
  }
});

// ==========================================
// 3. OTHER API ENDPOINTS
// ==========================================
app.get('/api/departments', (req, res) => res.json({ success: true, departments: DEPARTMENTS }));
app.get('/api/employees', (req, res) => res.json({ success: true, employees: EMPLOYEES }));
app.get('/api/complaints', (req, res) => res.json({ success: true, complaints }));

app.post('/api/submit-complaint', (req, res) => {
  try {
    let { category, description, coords, latitude, longitude, image, imageBase64, ward, department_id, department, location, officerId, phone } = req.body;

    const imgData = image || imageBase64 || null;
    if (!category || category === 'Auto Detect' || category === 'Pending AI Classification') category = 'Pothole / Road Damage';
    ward = ward || 'Koramangala';

    const resolvedDeptName = department || getDeptName(department_id) || mapCategoryToDepartment(category);
    const routing = routeComplaint(resolvedDeptName, ward);

    const ticketId = `TICK-${Date.now().toString().slice(-6)}`;
    const newComplaint = {
      id: ticketId,
      ticketId,
      ticket_id: ticketId,
      category,
      description: description || 'No description provided.',
      department: resolvedDeptName,
      department_id: resolvedDeptName,
      ward,
      location: location || `BBMP Area: ${ward} (${coords ? coords.latitude : latitude || '12.9344'}, ${coords ? coords.longitude : longitude || '77.6101'})`,
      coords: coords || { latitude: latitude || "12.9344", longitude: longitude || "77.6101" },
      latitude: latitude || (coords ? coords.latitude : "12.9344"),
      longitude: longitude || (coords ? coords.longitude : "77.6101"),
      image: imgData,
      imageBase64: imgData,
      beforeImage: imgData,
      afterImage: null,
      status: 'OPEN',
      officerId: officerId || routing.assigned_to_employee_id || 'EMP-201',
      assigned_to_employee_id: routing.assigned_to_employee_id || officerId || 'EMP-201',
      assigned_officer_name: routing.assigned_officer_name,
      supervisor_id: routing.supervisor_id,
      phone: phone || null,
      is_escalated: false,
      createdAt: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    complaints.unshift(newComplaint);

    res.json({
      success: true,
      message: 'Complaint lodged successfully.',
      ticketId: newComplaint.ticketId,
      ticket: newComplaint
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/complaints/:id/resolve', (req, res) => {
  const { id } = req.params;
  const { afterImage } = req.body;

  const complaint = complaints.find(c => c.id === id || c.ticketId === id || c.ticket_id === id);
  if (!complaint) {
    return res.status(404).json({ success: false, message: 'Complaint not found.' });
  }

  complaint.status = 'Resolved';
  if (afterImage) {
    complaint.afterImage = afterImage;
  }

  res.json({ success: true, message: 'Complaint marked as resolved.', complaint });
});

app.post('/api/verify-otp', (req, res) => {
  const { otp } = req.body;
  if (otp === '1234') res.json({ success: true, message: 'Authenticated successfully.' });
  else res.status(400).json({ success: false, error: 'Invalid OTP code.' });
});

// PATCH: HOD Reassigns Neglected Complaint to New Staff
app.patch('/api/complaints/:id/reassign', (req, res) => {
  const { id } = req.params;
  const { newStaffId } = req.body;

  const complaint = complaints.find(c => c.id === id || c.ticketId === id);
  if (!complaint) return res.status(404).json({ success: false, error: 'Complaint not found.' });

  complaint.assigned_to_employee_id = newStaffId;
  complaint.officerId = newStaffId;
  complaint.is_reassigned = true;

  res.json({ success: true, message: `Complaint reassigned to ${newStaffId}`, complaint });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));