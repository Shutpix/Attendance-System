const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  punchIn: { type: String },  // ISO timestamps or HH:MM string
  punchOut: { type: String },
  totalWorkedHours: { type: Number, default: 0 }, // in hours (decimal)
  punctuality: { type: String, enum: ['early', 'on-time', 'late', 'unknown'], default: 'unknown' },
  createdAt: { type: Date, default: Date.now }
});

// unique per employee+date
AttendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', AttendanceSchema);
