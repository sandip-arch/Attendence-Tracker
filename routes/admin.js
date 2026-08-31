const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { protect, admin } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Session = require('../models/Session');
const Attendance = require('../models/Attendance');
const { runAutoCheckOut } = require('../services/attendanceService');

// Apply admin protection to all routes in this router
router.use(protect, admin);

// ==========================================
// SESSION MANAGEMENT ROUTES
// ==========================================

// @route   POST /api/admin/sessions
// @desc    Create a new session
// @access  Private/Admin
router.post('/sessions', async (req, res) => {
  const { name, days, timeStart, timeEnd, totalDays } = req.body;

  try {
    if (!name) {
      return res.status(400).json({ message: 'Session name is required' });
    }

    const sessionExists = await Session.findOne({ name });
    if (sessionExists) {
      return res.status(400).json({ message: 'Session already exists' });
    }

    const session = await Session.create({
      name,
      status: 'active',
      schedule: {
        days: days || [],
        timeStart: timeStart || '',
        timeEnd: timeEnd || '',
        totalDays: totalDays || 0
      }
    });

    res.status(201).json({ message: 'Session created successfully', session });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/admin/sessions
// @desc    List all sessions
// @access  Private/Admin
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await Session.find().sort({ createdAt: -1 });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/admin/sessions/:id/status
// @desc    Block or Unblock a session
// @access  Private/Admin
router.put('/sessions/:id/status', async (req, res) => {
  const { status } = req.body; // 'active' or 'blocked'
  try {
    if (!['active', 'blocked'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const session = await Session.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    session.status = status;
    await session.save();

    res.json({ message: `Session ${session.name} has been ${status === 'blocked' ? 'blocked' : 'activated'}.`, session });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/admin/sessions/:id/schedule
// @desc    Update session schedule
// @access  Private/Admin
router.put('/sessions/:id/schedule', async (req, res) => {
  const { days, timeStart, timeEnd, totalDays } = req.body;
  try {
    const session = await Session.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    session.schedule = {
      days: days || session.schedule.days,
      timeStart: timeStart || session.schedule.timeStart,
      timeEnd: timeEnd || session.schedule.timeEnd,
      totalDays: totalDays !== undefined ? totalDays : session.schedule.totalDays
    };

    await session.save();
    res.json({ message: 'Session schedule updated successfully', session });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// ==========================================
// STUDENT MANAGEMENT ROUTES
// ==========================================

// @route   GET /api/admin/students
// @desc    Get all students
// @access  Private/Admin
router.get('/students', async (req, res) => {
  try {
    const students = await User.find({ role: 'student' })
      .populate('session', 'name')
      .sort({ createdAt: -1 });
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/admin/students/:id/approve
// @desc    Approve/Reject student registration status
// @access  Private/Admin
router.put('/students/:id/approve', async (req, res) => {
  const { isApproved } = req.body;
  try {
    const student = await User.findById(req.params.id);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    student.isApproved = isApproved;
    await student.save();

    res.json({ message: `Student status updated. Approved: ${student.isApproved}`, student });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/admin/students/:id/session
// @desc    Assign a student to a different session
// @access  Private/Admin
router.put('/students/:id/session', async (req, res) => {
  const { sessionId } = req.body;
  try {
    const student = await User.findById(req.params.id);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    student.session = sessionId;
    await student.save();

    res.json({ message: `Student assigned to session ${session.name}`, student });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// ==========================================
// ATTENDANCE MANAGEMENT ROUTES
// ==========================================

// @route   GET /api/admin/attendance/pending
// @desc    Get all pending attendance records
// @access  Private/Admin
router.get('/attendance/pending', async (req, res) => {
  try {
    await runAutoCheckOut();

    const pendingLogs = await Attendance.find({ status: 'pending' })
      .populate('student', 'name email')
      .populate('session', 'name')
      .sort({ date: -1, createdAt: -1 });
    res.json(pendingLogs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/admin/attendance
// @desc    Get all attendance records (with filter)
// @access  Private/Admin
router.get('/attendance', async (req, res) => {
  try {
    await runAutoCheckOut();

    const { sessionId, studentId } = req.query;
    let query = {};
    if (sessionId) query.session = sessionId;
    if (studentId) query.student = studentId;

    const logs = await Attendance.find(query)
      .populate('student', 'name email')
      .populate('session', 'name')
      .sort({ date: -1, createdAt: -1 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/admin/attendance/:id/approve
// @desc    Approve/Reject attendance record status
// @access  Private/Admin
router.put('/attendance/:id/approve', async (req, res) => {
  const { status } = req.body; // 'approved' or 'rejected'
  try {
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid attendance status value' });
    }

    const log = await Attendance.findById(req.params.id).populate('student', 'name');
    if (!log) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    log.status = status;
    await log.save();

    res.json({ message: `Attendance for ${log.student.name} on ${log.date} has been ${status}.`, log });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/admin/attendance/:id/edit
// @desc    Edit details of an existing attendance record (date, in, out, status, lateReason, isLate, isAutoCheckOut)
// @access  Private/Admin
router.put('/attendance/:id/edit', async (req, res) => {
  const { date, checkIn, checkOut, status, isLate, lateReason, isAutoCheckOut } = req.body;
  try {
    const log = await Attendance.findById(req.params.id);
    if (!log) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    if (date) log.date = date;
    if (checkIn !== undefined) log.checkIn = checkIn;
    if (checkOut !== undefined) log.checkOut = checkOut;
    if (status) log.status = status;
    if (isLate !== undefined) log.isLate = Boolean(isLate);
    if (lateReason !== undefined) log.lateReason = lateReason ? lateReason.trim() : null;
    if (isAutoCheckOut !== undefined) log.isAutoCheckOut = Boolean(isAutoCheckOut);

    await log.save();
    res.json({ message: 'Attendance record updated successfully', log });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/admin/attendance/manual
// @desc    Manually add an attendance record
// @access  Private/Admin
router.post('/attendance/manual', async (req, res) => {
  const { studentId, sessionId, date, checkIn, checkOut, status, isLate, lateReason, isAutoCheckOut } = req.body;

  try {
    if (!studentId || !sessionId || !date) {
      return res.status(400).json({ message: 'Student ID, Session ID and Date are required.' });
    }

    // Check if record already exists for this student on this date
    const exists = await Attendance.findOne({ student: studentId, date });
    if (exists) {
      return res.status(400).json({ message: 'An attendance record already exists for this student on this date.' });
    }

    const log = await Attendance.create({
      student: studentId,
      session: sessionId,
      date,
      checkIn: checkIn || null,
      checkOut: checkOut || null,
      status: status || 'approved',
      isLate: Boolean(isLate),
      lateReason: lateReason ? lateReason.trim() : null,
      isAutoCheckOut: Boolean(isAutoCheckOut)
    });

    res.status(201).json({ message: 'Attendance record created manually', log });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// ==========================================
// EXCEL EXPORT ROUTE
// ==========================================

// @route   GET /api/admin/attendance/export
// @desc    Export attendance to Excel sheet
// @access  Private/Admin
router.get('/attendance/export', async (req, res) => {
  try {
    await runAutoCheckOut();

    const { sessionId } = req.query;
    let query = {};
    if (sessionId) {
      query.session = sessionId;
    }

    const logs = await Attendance.find(query)
      .populate('student', 'name email')
      .populate('session', 'name')
      .sort({ date: -1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Logs');

    worksheet.columns = [
      { header: 'Student Name', key: 'studentName', width: 22 },
      { header: 'Student Email', key: 'studentEmail', width: 25 },
      { header: 'Session', key: 'sessionName', width: 12 },
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Check In', key: 'checkIn', width: 12 },
      { header: 'Check Out', key: 'checkOut', width: 12 },
      { header: 'Late Check-In?', key: 'isLate', width: 14 },
      { header: 'Late Reason', key: 'lateReason', width: 30 },
      { header: 'Auto Check-Out?', key: 'isAutoCheckOut', width: 16 },
      { header: 'Status', key: 'status', width: 12 }
    ];

    logs.forEach(log => {
      worksheet.addRow({
        studentName: log.student ? log.student.name : 'Deleted Student',
        studentEmail: log.student ? log.student.email : 'N/A',
        sessionName: log.session ? log.session.name : 'Deleted Session',
        date: log.date,
        checkIn: log.checkIn || 'N/A',
        checkOut: log.checkOut || 'N/A',
        isLate: log.isLate ? 'Yes' : 'No',
        lateReason: log.lateReason || 'N/A',
        isAutoCheckOut: log.isAutoCheckOut ? 'Yes' : 'No',
        status: log.status
      });
    });

    // Style the header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' }, name: 'Segoe UI' };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4A5568' } // Cool slate gray
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Set Response Headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Attendance_Export_${new Date().toISOString().split('T')[0]}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating Excel file:', error);
    res.status(500).json({ message: 'Error generating report file' });
  }
});

module.exports = router;
