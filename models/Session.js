const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // e.g., "s2", "s3"
  status: { type: String, enum: ['active', 'blocked'], default: 'active' },
  schedule: {
    days: { type: [String], default: [] },      // e.g., ["Monday", "Wednesday", "Friday"]
    timeStart: { type: String, default: "" },   // e.g., "09:00"
    timeEnd: { type: String, default: "" },     // e.g., "17:00"
    totalDays: { type: Number, default: 0 }
  }
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);
