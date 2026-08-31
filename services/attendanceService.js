const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');

// Get current date, time, and total minutes from midnight in Indian Standard Time (IST - Asia/Kolkata)
const getISTDateTimeParts = () => {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const map = {};
  parts.forEach(p => (map[p.type] = p.value));

  const hours = parseInt(map.hour, 10);
  const minutes = parseInt(map.minute, 10);
  const seconds = parseInt(map.second, 10);

  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const timeStr = `${map.hour}:${map.minute}:${map.second}`;
  const totalMinutes = hours * 60 + minutes;

  return {
    date: dateStr,
    time: timeStr,
    hours,
    minutes,
    seconds,
    totalMinutes
  };
};

// Convert time strings like "09:00" or "09:30:00" to total minutes from midnight
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

// Check if check-in is more than 30 minutes past session start time
const checkIfLate = (sessionTimeStart, currentTotalMinutes) => {
  if (!sessionTimeStart || sessionTimeStart.trim() === '') {
    return { isLate: false, diffMinutes: 0 };
  }

  const startMinutes = parseTimeToMinutes(sessionTimeStart);
  if (startMinutes === null) {
    return { isLate: false, diffMinutes: 0 };
  }

  let diffMinutes = currentTotalMinutes - startMinutes;
  // Handle midnight crossover if session started near midnight (e.g. 23:00 and current is 00:10)
  if (diffMinutes < -720) {
    diffMinutes += 1440;
  }

  // Late if current time is strictly greater than start time + 30 minutes
  if (diffMinutes > 30) {
    return { isLate: true, diffMinutes };
  }

  return { isLate: false, diffMinutes };
};

// Normalize session timeEnd string to HH:MM:SS format
const formatTimeEnd = (timeEndStr) => {
  if (!timeEndStr) return '17:00:00';
  const trimmed = timeEndStr.trim();
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
  }
  if (parts.length === 3) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
  }
  return trimmed;
};

// Run automated check-out for unclosed attendance records past session end time
const runAutoCheckOut = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return; // Database not connected yet
    }
    const { date: currentDateStr, totalMinutes: currentMinutes } = getISTDateTimeParts();

    // Find all attendance records where checkIn exists but checkOut is null
    const openRecords = await Attendance.find({
      checkIn: { $ne: null },
      checkOut: null
    }).populate('session');

    for (const record of openRecords) {
      if (!record.session || !record.session.schedule || !record.session.schedule.timeEnd) {
        continue;
      }

      const sessionEndMinutes = parseTimeToMinutes(record.session.schedule.timeEnd);
      if (sessionEndMinutes === null) continue;

      let shouldAutoCheckOut = false;

      // Case 1: Record is from a past date
      if (record.date < currentDateStr) {
        shouldAutoCheckOut = true;
      }
      // Case 2: Record is from today, and current time >= session end time
      else if (record.date === currentDateStr && currentMinutes >= sessionEndMinutes) {
        shouldAutoCheckOut = true;
      }

      if (shouldAutoCheckOut) {
        record.checkOut = formatTimeEnd(record.session.schedule.timeEnd);
        record.isAutoCheckOut = true;
        // Keep status as pending (or existing status) for admin review
        await record.save();
      }
    }
  } catch (error) {
    console.error('Error executing runAutoCheckOut:', error.message);
  }
};

module.exports = {
  getISTDateTimeParts,
  parseTimeToMinutes,
  checkIfLate,
  formatTimeEnd,
  runAutoCheckOut
};
