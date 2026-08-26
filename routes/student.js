const express = require('express');
const router = express.Router();
const { protect, student } = require('../middleware/authMiddleware');
const Attendance = require('../models/Attendance');
const Session = require('../models/Session');

// Helper to get current Date and Time in Indian Standard Time (IST - Asia/Kolkata)
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
  parts.forEach(p => map[p.type] = p.value);
  
  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const timeStr = `${map.hour}:${map.minute}:${map.second}`;
  
  return { date: dateStr, time: timeStr };
};

const getLocalDateString = () => {
  return getISTDateTimeParts().date;
};

const getLocalTimeString = () => {
  return getISTDateTimeParts().time;
};

// Apply protect & student middlewares to all student endpoints
router.use(protect, student);

// @route   GET /api/student/dashboard
// @desc    Get student dashboard details (profile, schedule, today's status)
// @access  Private/Student
router.get('/dashboard', async (req, res) => {
  try {
    const todayStr = getLocalDateString();
    
    // Find today's attendance record
    const todayAttendance = await Attendance.findOne({
      student: req.user._id,
      date: todayStr
    });

    res.json({
      student: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        sessionName: req.user.session ? req.user.session.name : 'N/A'
      },
      schedule: req.user.session ? req.user.session.schedule : null,
      todayAttendance: todayAttendance ? {
        date: todayAttendance.date,
        checkIn: todayAttendance.checkIn,
        checkOut: todayAttendance.checkOut,
        status: todayAttendance.status
      } : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/student/check-in
// @desc    Perform check-in
// @access  Private/Student
router.post('/check-in', async (req, res) => {
  try {
    const todayStr = getLocalDateString();
    const timeStr = getLocalTimeString();

    // Double check if student has a session
    if (!req.user.session) {
      return res.status(400).json({ message: 'You are not assigned to any session' });
    }

    const session = req.user.session;

    // Check if session is blocked
    if (session.status === 'blocked') {
      return res.status(400).json({ message: 'Your session is blocked by admin' });
    }

    // Validate if today is a scheduled class day
    if (session.schedule && session.schedule.days && session.schedule.days.length > 0) {
      const todayDayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      if (!session.schedule.days.includes(todayDayName)) {
        return res.status(400).json({
          message: `Today (${todayDayName}) is not a scheduled class day for session ${session.name}.`
        });
      }
    }

    // Check if attendance already logged for today
    let attendance = await Attendance.findOne({
      student: req.user._id,
      date: todayStr
    });

    if (attendance) {
      if (attendance.checkIn) {
        return res.status(400).json({ message: 'You have already checked in today.' });
      }
    } else {
      // Create new attendance record in pending state
      attendance = new Attendance({
        student: req.user._id,
        session: session._id,
        date: todayStr,
        checkIn: timeStr,
        status: 'pending'
      });
      await attendance.save();
    }

    res.status(200).json({
      message: 'Check-in recorded. Pending admin approval.',
      attendance
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/student/check-out
// @desc    Perform check-out
// @access  Private/Student
router.post('/check-out', async (req, res) => {
  try {
    const todayStr = getLocalDateString();
    const timeStr = getLocalTimeString();

    // Check if session is blocked
    if (req.user.session.status === 'blocked') {
      return res.status(400).json({ message: 'Your session is blocked by admin' });
    }

    // Find attendance record for today
    let attendance = await Attendance.findOne({
      student: req.user._id,
      date: todayStr
    });

    if (!attendance || !attendance.checkIn) {
      return res.status(400).json({ message: 'You must check-in before checking out.' });
    }

    if (attendance.checkOut) {
      return res.status(400).json({ message: 'You have already checked out today.' });
    }

    // Update with check-out time and set status to pending for admin review
    attendance.checkOut = timeStr;
    attendance.status = 'pending';
    await attendance.save();

    res.status(200).json({
      message: 'Check-out recorded. Pending admin approval.',
      attendance
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/student/history
// @desc    Get student's own attendance history
// @access  Private/Student
router.get('/history', async (req, res) => {
  try {
    const history = await Attendance.find({ student: req.user._id })
      .sort({ date: -1 })
      .limit(50);
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
