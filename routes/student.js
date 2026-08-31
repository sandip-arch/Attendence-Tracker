const express = require('express');
const router = express.Router();
const { protect, student } = require('../middleware/authMiddleware');
const Attendance = require('../models/Attendance');
const Session = require('../models/Session');
const { getISTDateTimeParts, checkIfLate, runAutoCheckOut } = require('../services/attendanceService');

// Apply protect & student middlewares to all student endpoints
router.use(protect, student);

// @route   GET /api/student/dashboard
// @desc    Get student dashboard details (profile, schedule, today's status)
// @access  Private/Student
router.get('/dashboard', async (req, res) => {
  try {
    // Run auto-checkout check on demand to ensure real-time accuracy
    await runAutoCheckOut();

    const { date: todayStr } = getISTDateTimeParts();

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
      todayAttendance: todayAttendance
        ? {
            date: todayAttendance.date,
            checkIn: todayAttendance.checkIn,
            checkOut: todayAttendance.checkOut,
            status: todayAttendance.status,
            isLate: todayAttendance.isLate,
            lateReason: todayAttendance.lateReason,
            isAutoCheckOut: todayAttendance.isAutoCheckOut
          }
        : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/student/check-in
// @desc    Perform check-in (requires reason if >30 min after start time)
// @access  Private/Student
router.post('/check-in', async (req, res) => {
  try {
    const { date: todayStr, time: timeStr, totalMinutes } = getISTDateTimeParts();
    const { lateReason } = req.body;

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
      const todayDayName = new Date().toLocaleDateString('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long'
      });
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

    if (attendance && attendance.checkIn) {
      return res.status(400).json({ message: 'You have already checked in today.' });
    }

    // Determine if student is late (> 30 minutes after session start time)
    const lateCheck = checkIfLate(session.schedule ? session.schedule.timeStart : null, totalMinutes);
    let finalIsLate = false;
    let finalLateReason = null;

    if (lateCheck.isLate) {
      if (!lateReason || typeof lateReason !== 'string' || lateReason.trim() === '') {
        return res.status(400).json({
          requiresReason: true,
          isLate: true,
          message: 'You are checking in more than 30 minutes after session start time. Please provide a valid reason for late check-in.'
        });
      }
      finalIsLate = true;
      finalLateReason = lateReason.trim();
    }

    if (attendance) {
      attendance.checkIn = timeStr;
      attendance.isLate = finalIsLate;
      attendance.lateReason = finalLateReason;
      attendance.status = 'pending';
      await attendance.save();
    } else {
      // Create new attendance record in pending state
      attendance = new Attendance({
        student: req.user._id,
        session: session._id,
        date: todayStr,
        checkIn: timeStr,
        status: 'pending',
        isLate: finalIsLate,
        lateReason: finalLateReason
      });
      await attendance.save();
    }

    res.status(200).json({
      message: finalIsLate
        ? 'Late check-in recorded with reason. Pending admin approval.'
        : 'Check-in recorded. Pending admin approval.',
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
    // Run auto-checkout check first
    await runAutoCheckOut();

    const { date: todayStr, time: timeStr } = getISTDateTimeParts();

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
      if (attendance.isAutoCheckOut) {
        return res.status(400).json({
          message: `You were already automatically checked out at ${attendance.checkOut} (session end time).`
        });
      }
      return res.status(400).json({ message: 'You have already checked out today.' });
    }

    // Update with check-out time and set status to pending for admin review
    attendance.checkOut = timeStr;
    attendance.isAutoCheckOut = false;
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
    await runAutoCheckOut();

    const history = await Attendance.find({ student: req.user._id })
      .sort({ date: -1 })
      .limit(50);
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
