const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'student'], default: 'student' },
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },
  isApproved: { type: Boolean, default: false } // Required for students to log in / check-in
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
