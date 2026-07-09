const mongoose = require('mongoose');

// This defines the exact shape of a citizen's complaint in our database vault
const TicketSchema = new mongoose.Schema({
  ticketId: { 
    type: String, 
    required: true, 
    unique: true  // No two tickets can ever have the same ID number
  },
  latitude: { 
    type: Number, 
    required: true // The GPS map coordinates are mandatory
  },
  longitude: { 
    type: Number, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['Open', 'In-Progress', 'Resolved'], 
    default: 'Open' // Every new complaint starts as 'Open'
  },
  timerExpiresAt: { 
    type: Date, 
    required: true // The exact moment the 48-hour deadline hits
  }
});

module.exports = mongoose.model('Ticket', TicketSchema);