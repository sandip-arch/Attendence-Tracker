// Base API URL config
const API_BASE = '/api';

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

// Custom Fetch Wrapper with Token Auth
async function fetchAPI(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  // Handle Unauthorized / Session Expired
  if (response.status === 401) {
    localStorage.clear();
    window.location.href = 'index.html';
    return;
  }

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || 'Something went wrong');
    error.data = data;
    error.status = response.status;
    throw error;
  }

  return data;
}

// Show local status banners
function showAlert(alertId, message, type = 'success') {
  const alertEl = document.getElementById(alertId);
  if (!alertEl) return;
  
  alertEl.innerText = message;
  alertEl.className = `alert alert-${type}`;
  alertEl.style.display = 'block';
  
  setTimeout(() => {
    alertEl.style.display = 'none';
  }, 5000);
}

// Clean logout
function handleLogout() {
  localStorage.clear();
  window.location.href = 'index.html';
}

// Check roles and restrict access
function verifyUserRole(expectedRole) {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token || !role) {
    window.location.href = 'index.html';
    return;
  }

  if (role !== expectedRole) {
    if (role === 'admin') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'student.html';
    }
  }
}

// Modal control helpers
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
  }
}

// Close modals on clicking backdrop
window.onclick = function(event) {
  if (event.target.classList.contains('modal')) {
    event.target.style.display = 'none';
  }
};


// ==========================================
// AUTHENTICATION LOGIC (INDEX.HTML)
// ==========================================

async function loadSessionsDropdown() {
  const select = document.getElementById('register-session');
  if (!select) return;
  
  try {
    const sessions = await fetchAPI('/auth/sessions');
    select.innerHTML = '<option value="" disabled selected>Select session</option>';
    sessions.forEach(sess => {
      const option = document.createElement('option');
      option.value = sess._id;
      option.textContent = sess.name;
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Failed to load sessions:', err.message);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetchAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    localStorage.setItem('token', res.token);
    localStorage.setItem('role', res.user.role);
    localStorage.setItem('username', res.user.name);

    if (res.user.role === 'admin') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'student.html';
    }
  } catch (err) {
    showAlert('auth-alert-danger', err.message, 'danger');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('register-name').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const session = document.getElementById('register-session').value;

  try {
    const res = await fetchAPI('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, session })
    });

    showAlert('auth-alert-success', res.message, 'success');
    document.getElementById('register-form').reset();
    
    // Toggle back to login form after brief delay
    setTimeout(() => {
      if (typeof toggleDockerAuth === 'function') {
        toggleDockerAuth('login');
      }
    }, 2000);

  } catch (err) {
    showAlert('auth-alert-danger', err.message, 'danger');
  }
}

function toggleAuthMode(mode) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const toggleBtn = document.getElementById('toggle-auth-btn');

  if (mode === 'register') {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    toggleBtn.innerText = 'Already have an account? Sign In';
    toggleBtn.setAttribute('onclick', "toggleAuthMode('login')");
  } else {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    toggleBtn.innerText = "Don't have an account? Sign Up";
    toggleBtn.setAttribute('onclick', "toggleAuthMode('register')");
  }
}


// ==========================================
// GOOGLE AUTHENTICATION INTEGRATION
// ==========================================

let googleClientId = null;

// Initialize Google sign-in configuration & handle URL redirect parameters
async function initGoogleAuthSettings() {
  // 1. Parse redirect query parameters from the URL first (so they are cleared on refresh)
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const role = urlParams.get('role');
  const username = urlParams.get('username');
  const error = urlParams.get('error');
  const success = urlParams.get('success');

  if (token && role && username) {
    // Save credentials
    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
    localStorage.setItem('username', username);

    // Clean URL query parameters
    window.history.replaceState({}, document.title, window.location.pathname);

    // Direct user to correct dashboard
    if (role === 'admin') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'student.html';
    }
    return;
  }

  if (error) {
    showAlert('auth-alert-danger', error, 'danger');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (success) {
    showAlert('auth-alert-success', success, 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // 2. Fetch Google Client configuration if Google button is present
  const googleBtn = document.querySelector('.google-docker-btn');
  if (!googleBtn) return; // not on login page

  try {
    const res = await fetchAPI('/auth/google/client-id');
    googleClientId = res.clientId;
  } catch (err) {
    console.error('Failed to load Google Client configuration:', err.message);
  }
}

// Trigger Google sign-in redirect (or Mock Login if GOOGLE_CLIENT_ID is not configured)
async function triggerGoogleLogin() {
  if (googleClientId) {
    // Redirect to backend OAuth initiator
    window.location.href = '/api/auth/google/login';
  } else {
    // Fallback to Mock login for testing/local verification
    await runGoogleMockLogin();
  }
}

async function runGoogleMockLogin() {
  const email = prompt("Google Auth Demo Mode:\nEnter your Test Email address:", "student.demo@gmail.com");
  if (!email) return;

  const name = prompt("Google Auth Demo Mode:\nEnter your Full Name:", "Alex Mercer");
  if (!name) return;

  try {
    const res = await fetchAPI('/auth/google/mock', {
      method: 'POST',
      body: JSON.stringify({ email, name })
    });

    handleGoogleAuthSuccess(res);
  } catch (err) {
    showAlert('auth-alert-danger', err.message, 'danger');
  }
}

function handleGoogleAuthSuccess(res) {
  if (res.token) {
    // Success log in
    localStorage.setItem('token', res.token);
    localStorage.setItem('role', res.user.role);
    localStorage.setItem('username', res.user.name);

    if (res.user.role === 'admin') {
      window.location.href = 'admin.html';
    } else {
      window.location.href = 'student.html';
    }
  } else {
    // Successfully registered (201 state) - waiting for admin approval
    showAlert('auth-alert-success', res.message, 'success');
  }
}


// ==========================================
// STUDENT DASHBOARD LOGIC
// ==========================================

async function initStudentDashboard() {
  document.getElementById('student-name-display').innerText = localStorage.getItem('username') || 'Student';
  await refreshStudentData();
}

async function refreshStudentData() {
  try {
    const data = await fetchAPI('/student/dashboard');
    
    // Fill profile fields
    document.getElementById('student-session-display').innerText = data.student.sessionName;
    document.getElementById('student-email-display').innerText = data.student.email;

    // Fill schedule details
    if (data.schedule) {
      document.getElementById('schedule-days').innerText = data.schedule.days.join(', ') || 'Not Configured';
      document.getElementById('schedule-time').innerText = 
        data.schedule.timeStart && data.schedule.timeEnd
        ? `${data.schedule.timeStart} - ${data.schedule.timeEnd}`
        : 'Not Configured';
    } else {
      document.getElementById('schedule-days').innerText = 'Unassigned';
      document.getElementById('schedule-time').innerText = 'Unassigned';
    }

    // Configure check-in / check-out button states
    const btnIn = document.getElementById('btn-check-in');
    const btnOut = document.getElementById('btn-check-out');
    const statusText = document.getElementById('today-status-text');

    if (!data.todayAttendance) {
      statusText.innerText = 'Today status : NOT CHECKED IN';
      statusText.className = 'status-alert-badge'; // Warning yellow
      btnIn.disabled = false;
      btnOut.disabled = true;
    } else {
      const att = data.todayAttendance;
      if (att.checkIn && !att.checkOut) {
        statusText.innerText = `Today status : CHECKED IN (${att.status.toUpperCase()})${att.isLate ? ' [LATE]' : ''}`;
        statusText.className = att.status === 'approved' ? 'status-alert-badge badge-success' : 'status-alert-badge';
        btnIn.disabled = true;
        btnOut.disabled = false;
      } else if (att.checkIn && att.checkOut) {
        statusText.innerText = `Today status : COMPLETED (${att.status.toUpperCase()})${att.isAutoCheckOut ? ' [AUTO-CHECKOUT]' : ''}`;
        statusText.className = att.status === 'approved' ? 'status-alert-badge badge-success' : 'status-alert-badge';
        btnIn.disabled = true;
        btnOut.disabled = true;
      }
    }

    // Load History Table
    await loadStudentHistory();

  } catch (err) {
    showAlert('student-alert-danger', err.message, 'danger');
  }
}

async function loadStudentHistory() {
  const tbody = document.getElementById('student-history-tbody');
  if (!tbody) return;

  try {
    const logs = await fetchAPI('/student/history');
    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No attendance logged yet.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    logs.forEach(log => {
      let lateBadge = '<span style="color: #64748b; font-size: 0.8rem;">On Time</span>';
      if (log.isLate) {
        const reasonText = log.lateReason ? (log.lateReason.length > 25 ? log.lateReason.substring(0, 25) + '...' : log.lateReason) : 'Late';
        lateBadge = `<span class="badge-late" title="${(log.lateReason || '').replace(/"/g, '&quot;')}">⚠️ ${reasonText}</span>`;
      }

      let checkOutDisplay = log.checkOut || '--:--:--';
      if (log.isAutoCheckOut) {
        checkOutDisplay += ` <span class="badge-auto">Auto</span>`;
      }

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${log.date}</td>
        <td>${log.checkIn || '--:--:--'}</td>
        <td>${checkOutDisplay}</td>
        <td>${lateBadge}</td>
        <td><span class="badge badge-${log.status}">${log.status}</span></td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error('Failed to load history:', err.message);
  }
}

async function studentCheckIn() {
  try {
    const res = await fetchAPI('/student/check-in', {
      method: 'POST',
      body: JSON.stringify({})
    });
    showAlert('student-alert-success', res.message, 'success');
    await refreshStudentData();
  } catch (err) {
    // If backend reports student is late (>30 min), open late reason modal
    if (err.data && err.data.requiresReason) {
      document.getElementById('late-reason-input').value = '';
      openModal('late-reason-modal');
      setTimeout(() => {
        const input = document.getElementById('late-reason-input');
        if (input) input.focus();
      }, 100);
      return;
    }
    showAlert('student-alert-danger', err.message, 'danger');
  }
}

async function submitLateCheckIn(e) {
  e.preventDefault();
  const lateReason = document.getElementById('late-reason-input').value;
  if (!lateReason || lateReason.trim() === '') {
    alert('Please enter a valid reason for late check-in.');
    return;
  }

  try {
    const res = await fetchAPI('/student/check-in', {
      method: 'POST',
      body: JSON.stringify({ lateReason: lateReason.trim() })
    });
    closeModal('late-reason-modal');
    showAlert('student-alert-success', res.message, 'success');
    await refreshStudentData();
  } catch (err) {
    alert(err.message);
  }
}

async function studentCheckOut() {
  try {
    const res = await fetchAPI('/student/check-out', { method: 'POST' });
    showAlert('student-alert-success', res.message, 'success');
    await refreshStudentData();
  } catch (err) {
    showAlert('student-alert-danger', err.message, 'danger');
  }
}


// ==========================================
// ADMIN DASHBOARD LOGIC
// ==========================================

let activeAdminTab = 'pending';
let allSessionsCache = [];
let allStudentsCache = [];

function switchAdminTab(tab) {
  activeAdminTab = tab;
  
  // Hide all sections
  document.getElementById('section-pending').style.display = 'none';
  document.getElementById('section-logs').style.display = 'none';
  document.getElementById('section-students').style.display = 'none';
  document.getElementById('section-sessions').style.display = 'none';

  // Deactivate all tab btns
  document.getElementById('tab-btn-pending').classList.remove('active');
  document.getElementById('tab-btn-logs').classList.remove('active');
  document.getElementById('tab-btn-students').classList.remove('active');
  document.getElementById('tab-btn-sessions').classList.remove('active');

  // Activate selected tab & load section data
  if (tab === 'pending') {
    document.getElementById('section-pending').style.display = 'block';
    document.getElementById('tab-btn-pending').classList.add('active');
    loadPendingApprovals();
  } else if (tab === 'logs') {
    document.getElementById('section-logs').style.display = 'block';
    document.getElementById('tab-btn-logs').classList.add('active');
    loadAllLogs();
  } else if (tab === 'students') {
    document.getElementById('section-students').style.display = 'block';
    document.getElementById('tab-btn-students').classList.add('active');
    loadStudents();
  } else if (tab === 'sessions') {
    document.getElementById('section-sessions').style.display = 'block';
    document.getElementById('tab-btn-sessions').classList.add('active');
    loadSessions();
  }
}

async function initAdminDashboard() {
  // Prime essential dropdown data first
  try {
    allSessionsCache = await fetchAPI('/admin/sessions');
    allStudentsCache = await fetchAPI('/admin/students');
    
    // Fill session filter dropdown
    const filterSess = document.getElementById('filter-session');
    if (filterSess) {
      filterSess.innerHTML = '<option value="">All Sessions</option>';
      allSessionsCache.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s._id;
        opt.textContent = s.name;
        filterSess.appendChild(opt);
      });
    }

    // Fill student filter dropdown
    const filterStud = document.getElementById('filter-student');
    if (filterStud) {
      filterStud.innerHTML = '<option value="">All Students</option>';
      allStudentsCache.forEach(st => {
        const opt = document.createElement('option');
        opt.value = st._id;
        opt.textContent = `${st.name} (${st.email})`;
        filterStud.appendChild(opt);
      });
    }

    // Load initial tab
    await loadPendingApprovals();

  } catch (err) {
    showAlert('admin-alert-danger', err.message, 'danger');
  }
}

// ==========================================
// ADMIN: PENDING APPROVALS
// ==========================================

async function loadPendingApprovals() {
  const tbody = document.getElementById('pending-logs-tbody');
  if (!tbody) return;

  try {
    const logs = await fetchAPI('/admin/attendance/pending');
    
    // Update badge counter if exists
    const badge = document.getElementById('pending-approvals-count');
    if (badge) {
      if (logs.length > 0) {
        badge.innerText = logs.length;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }

    if (logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0V9a2 2 0 00-2-2H6a2 2 0 00-2 2v2m4 6h4v1.5a1.5 1.5 0 01-3 0V17h-1zm3 0h.01M9 17h.01" />
              </svg>
              <p>No pending attendance records to approve.</p>
            </div>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = '';
    logs.forEach(log => {
      const studentName = log.student ? log.student.name : 'Deleted Student';
      const sessionName = log.session ? log.session.name : 'N/A';
      
      let lateBadge = '<span style="color: #64748b; font-size: 0.8rem;">On Time</span>';
      if (log.isLate) {
        const safeReason = (log.lateReason || 'No reason provided').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeName = studentName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        lateBadge = `<button class="btn btn-secondary badge-late" style="cursor: pointer; padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="openReasonModal('${safeName}', '${log.date}', '${log.checkIn || ''}', '${safeReason}')">⚠️ View Reason</button>`;
      }

      let checkOutDisplay = log.checkOut || '--:--:--';
      if (log.isAutoCheckOut) {
        checkOutDisplay += `<br><span class="badge-auto">Auto Closed</span>`;
      }

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${studentName}</strong><br><span style="font-size:0.75rem; color: var(--text-muted);">${log.student ? log.student.email : ''}</span></td>
        <td><span class="badge badge-approved" style="background: rgba(139, 92, 246, 0.15); color: var(--accent-violet); border: 1px solid rgba(139, 92, 246, 0.3);">${sessionName}</span></td>
        <td>${log.date}</td>
        <td>${log.checkIn || '--:--:--'}</td>
        <td>${checkOutDisplay}</td>
        <td>${lateBadge}</td>
        <td><span class="badge badge-pending">pending</span></td>
        <td>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-emerald" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="approveAttendanceLog('${log._id}', 'approved')">
              Approve
            </button>
            <button class="btn btn-rose" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="approveAttendanceLog('${log._id}', 'rejected')">
              Reject
            </button>
            <button class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" 
              onclick="triggerEditLogModal('${log._id}', '${studentName.replace(/'/g, "\\'")}', '${log.date}', '${log.checkIn || ''}', '${log.checkOut || ''}', '${log.status}', ${Boolean(log.isLate)}, '${(log.lateReason || '').replace(/'/g, "\\'")}', ${Boolean(log.isAutoCheckOut)})">
              Edit
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    showAlert('admin-alert-danger', err.message, 'danger');
  }
}

async function approveAttendanceLog(logId, status) {
  try {
    const res = await fetchAPI(`/admin/attendance/${logId}/approve`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    showAlert('admin-alert-success', res.message, 'success');
    
    // Refresh current view
    if (activeAdminTab === 'pending') {
      await loadPendingApprovals();
    } else {
      await loadAllLogs();
    }
  } catch (err) {
    showAlert('admin-alert-danger', err.message, 'danger');
  }
}

async function loadAllLogs() {
  const tbody = document.getElementById('all-logs-tbody');
  if (!tbody) return;

  const sessionId = document.getElementById('filter-session').value;
  const studentId = document.getElementById('filter-student').value;

  let query = '?';
  if (sessionId) query += `sessionId=${sessionId}&`;
  if (studentId) query += `studentId=${studentId}&`;

  try {
    const logs = await fetchAPI(`/admin/attendance${query}`);
    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">No attendance records found.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    logs.forEach(log => {
      const studentName = log.student ? log.student.name : 'Deleted Student';
      const studentEmail = log.student ? log.student.email : 'N/A';
      const sessionName = log.session ? log.session.name : 'N/A';

      let lateBadge = '<span style="color: #64748b; font-size: 0.8rem;">On Time</span>';
      if (log.isLate) {
        const safeReason = (log.lateReason || 'No reason provided').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeName = studentName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        lateBadge = `<button class="btn btn-secondary badge-late" style="cursor: pointer; padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="openReasonModal('${safeName}', '${log.date}', '${log.checkIn || ''}', '${safeReason}')">⚠️ Reason</button>`;
      }

      let checkOutDisplay = log.checkOut || '--:--:--';
      if (log.isAutoCheckOut) {
        checkOutDisplay += ` <span class="badge-auto">Auto</span>`;
      }

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${studentName}</strong></td>
        <td>${studentEmail}</td>
        <td><span class="badge" style="background: rgba(139, 92, 246, 0.15); color: var(--accent-violet); border: 1px solid rgba(139, 92, 246, 0.3);">${sessionName}</span></td>
        <td>${log.date}</td>
        <td>${log.checkIn || '--:--:--'}</td>
        <td>${checkOutDisplay}</td>
        <td>${lateBadge}</td>
        <td><span class="badge badge-${log.status}">${log.status}</span></td>
        <td>
          <div style="display: flex; gap: 0.5rem;">
            ${log.status === 'pending' ? `
              <button class="btn btn-emerald" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" onclick="approveAttendanceLog('${log._id}', 'approved')">Approve</button>
              <button class="btn btn-rose" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" onclick="approveAttendanceLog('${log._id}', 'rejected')">Reject</button>
            ` : ''}
            <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" 
              onclick="triggerEditLogModal('${log._id}', '${studentName.replace(/'/g, "\\'")}', '${log.date}', '${log.checkIn || ''}', '${log.checkOut || ''}', '${log.status}', ${Boolean(log.isLate)}, '${(log.lateReason || '').replace(/'/g, "\\'")}', ${Boolean(log.isAutoCheckOut)})">
              Edit
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    showAlert('admin-alert-danger', err.message, 'danger');
  }
}

// Download Excel report sheet
function exportAttendanceToExcel() {
  const sessionId = document.getElementById('filter-session').value;
  const token = localStorage.getItem('token');
  
  let downloadUrl = `/api/admin/attendance/export?token=${token}`;
  if (sessionId) {
    downloadUrl += `&sessionId=${sessionId}`;
  }
  
  // Direct file browser prompt
  window.location.href = downloadUrl;
}

// ==========================================
// ADMIN: SESSIONS LOGIC
// ==========================================

async function loadSessions() {
  const tbody = document.getElementById('sessions-list-tbody');
  if (!tbody) return;

  try {
    const sessions = await fetchAPI('/admin/sessions');
    allSessionsCache = sessions; // refresh cache
    
    if (sessions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No sessions created yet.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    sessions.forEach(s => {
      const scheduleDays = s.schedule.days.join(', ') || 'No Schedule';
      const scheduleTime = s.schedule.timeStart && s.schedule.timeEnd 
        ? `${s.schedule.timeStart} - ${s.schedule.timeEnd}`
        : 'None';
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${s.name}</strong></td>
        <td><span style="font-size: 0.85rem;">${scheduleDays}</span></td>
        <td><span style="font-size: 0.85rem;">${scheduleTime}</span></td>
        <td><span class="badge badge-${s.status}">${s.status}</span></td>
        <td>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" 
              onclick="triggerEditScheduleModal('${s._id}', '${s.name}', '${s.schedule.days.join(',')}', '${s.schedule.timeStart}', '${s.schedule.timeEnd}')">
              Modify Schedule
            </button>
            <button class="btn ${s.status === 'blocked' ? 'btn-emerald' : 'btn-rose'}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" 
              onclick="toggleSessionStatus('${s._id}', '${s.status === 'blocked' ? 'active' : 'blocked'}')">
              ${s.status === 'blocked' ? 'Activate' : 'Block'}
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    showAlert('admin-alert-danger', err.message, 'danger');
  }
}

async function createSession(e) {
  e.preventDefault();
  const name = document.getElementById('new-session-name').value;
  const timeStart = document.getElementById('new-session-time-start').value;
  const timeEnd = document.getElementById('new-session-time-end').value;

  // Gather selected days
  const checkedDays = Array.from(document.querySelectorAll('input[name="session-days"]:checked'))
    .map(cb => cb.value);

  try {
    const res = await fetchAPI('/admin/sessions', {
      method: 'POST',
      body: JSON.stringify({
        name,
        days: checkedDays,
        timeStart,
        timeEnd
      })
    });

    showAlert('admin-alert-success', res.message, 'success');
    document.getElementById('create-session-form').reset();
    await loadSessions();
  } catch (err) {
    showAlert('admin-alert-danger', err.message, 'danger');
  }
}

async function toggleSessionStatus(sessionId, nextStatus) {
  try {
    const res = await fetchAPI(`/admin/sessions/${sessionId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: nextStatus })
    });
    showAlert('admin-alert-success', res.message, 'success');
    await loadSessions();
  } catch (err) {
    showAlert('admin-alert-danger', err.message, 'danger');
  }
}

function triggerEditScheduleModal(sessionId, name, daysCsv, timeStart, timeEnd) {
  document.getElementById('edit-schedule-id').value = sessionId;
  document.getElementById('edit-schedule-title').innerText = `Edit Schedule for Session: ${name}`;
  document.getElementById('edit-session-time-start').value = timeStart || '09:00';
  document.getElementById('edit-session-time-end').value = timeEnd || '17:00';

  const daysArr = daysCsv ? daysCsv.split(',') : [];
  document.querySelectorAll('input[name="edit-session-days"]').forEach(cb => {
    cb.checked = daysArr.includes(cb.value);
  });

  openModal('edit-schedule-modal');
}

async function submitEditSchedule(e) {
  e.preventDefault();
  const sessionId = document.getElementById('edit-schedule-id').value;
  const timeStart = document.getElementById('edit-session-time-start').value;
  const timeEnd = document.getElementById('edit-session-time-end').value;

  const checkedDays = Array.from(document.querySelectorAll('input[name="edit-session-days"]:checked'))
    .map(cb => cb.value);

  try {
    const res = await fetchAPI(`/admin/sessions/${sessionId}/schedule`, {
      method: 'PUT',
      body: JSON.stringify({
        days: checkedDays,
        timeStart,
        timeEnd
      })
    });

    showAlert('admin-alert-success', res.message, 'success');
    closeModal('edit-schedule-modal');
    await loadSessions();
  } catch (err) {
    showAlert('admin-alert-danger', err.message, 'danger');
  }
}


// ==========================================
// ADMIN: STUDENTS LOGIC
// ==========================================

async function loadStudents() {
  const pendingTbody = document.getElementById('pending-students-tbody');
  const allTbody = document.getElementById('all-students-tbody');
  if (!pendingTbody || !allTbody) return;

  try {
    const students = await fetchAPI('/admin/students');
    allStudentsCache = students; // refresh cache

    const pendingStudents = students.filter(s => !s.isApproved);
    const approvedStudents = students.filter(s => s.isApproved);

    // 1. Render Pending Registrations
    if (pendingStudents.length === 0) {
      pendingTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No pending student registrations.</td></tr>';
    } else {
      pendingTbody.innerHTML = '';
      pendingStudents.forEach(st => {
        const row = document.createElement('tr');
        
        let sessionSelectHTML = `<select id="assign-session-${st._id}" class="form-control" style="padding: 0.3rem 0.5rem; font-size: 0.85rem; width: 140px; display: inline-block;">`;
        allSessionsCache.forEach(sess => {
          const selected = st.session && st.session._id === sess._id ? 'selected' : '';
          sessionSelectHTML += `<option value="${sess._id}" ${selected}>${sess.name}</option>`;
        });
        sessionSelectHTML += '</select>';

        row.innerHTML = `
          <td><strong>${st.name}</strong></td>
          <td>${st.email}</td>
          <td>${sessionSelectHTML}</td>
          <td>${new Date(st.createdAt).toLocaleDateString()}</td>
          <td>
            <button class="btn btn-emerald" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;" onclick="approveStudentWithSession('${st._id}')">
              Assign & Approve
            </button>
          </td>
        `;
        pendingTbody.appendChild(row);
      });
    }

    // 2. Render All Registered Students
    if (approvedStudents.length === 0) {
      allTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No approved students found.</td></tr>';
    } else {
      allTbody.innerHTML = '';
      approvedStudents.forEach(st => {
        const currentSession = st.session ? st.session.name : 'Unassigned';
        const row = document.createElement('tr');

        let sessionDropdown = `<select class="form-control" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onchange="changeStudentSession('${st._id}', this.value)">`;
        allSessionsCache.forEach(sess => {
          const selected = st.session && st.session._id === sess._id ? 'selected' : '';
          sessionDropdown += `<option value="${sess._id}" ${selected}>${sess.name}</option>`;
        });
        sessionDropdown += '</select>';

        row.innerHTML = `
          <td><strong>${st.name}</strong></td>
          <td>${st.email}</td>
          <td><span class="badge" style="background: rgba(139, 92, 246, 0.15); color: var(--accent-violet); border: 1px solid rgba(139, 92, 246, 0.3);">${currentSession}</span></td>
          <td><span class="badge badge-approved">Approved</span></td>
          <td>${sessionDropdown}</td>
          <td>
            <button class="btn btn-rose" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" onclick="toggleStudentApproval('${st._id}', false)">
              Revoke Access
            </button>
          </td>
        `;
        allTbody.appendChild(row);
      });
    }

  } catch (err) {
    showAlert('admin-alert-danger', err.message, 'danger');
  }
}

async function approveStudentWithSession(studentId) {
  const select = document.getElementById(`assign-session-${studentId}`);
  const sessionId = select ? select.value : null;

  try {
    if (sessionId) {
      await fetchAPI(`/admin/students/${studentId}/session`, {
        method: 'PUT',
        body: JSON.stringify({ sessionId })
      });
    }

    const res = await fetchAPI(`/admin/students/${studentId}/approve`, {
      method: 'PUT',
      body: JSON.stringify({ isApproved: true })
    });

    showAlert('admin-alert-success', res.message, 'success');
    await loadStudents();
  } catch (err) {
    showAlert('admin-alert-danger', err.message, 'danger');
  }
}

async function toggleStudentApproval(studentId, isApproved) {
  try {
    const res = await fetchAPI(`/admin/students/${studentId}/approve`, {
      method: 'PUT',
      body: JSON.stringify({ isApproved })
    });
    showAlert('admin-alert-success', res.message, 'success');
    await loadStudents();
  } catch (err) {
    showAlert('admin-alert-danger', err.message, 'danger');
  }
}

async function changeStudentSession(studentId, sessionId) {
  try {
    const res = await fetchAPI(`/admin/students/${studentId}/session`, {
      method: 'PUT',
      body: JSON.stringify({ sessionId })
    });
    showAlert('admin-alert-success', res.message, 'success');
    await loadStudents();
  } catch (err) {
    showAlert('admin-alert-danger', err.message, 'danger');
  }
}


// ==========================================
// ADMIN: EDIT RECORD DIALOG
// ==========================================

function openReasonModal(studentName, date, checkIn, reason) {
  document.getElementById('reason-modal-student').innerText = studentName;
  document.getElementById('reason-modal-date-time').innerText = `${date} at ${checkIn || '--:--:--'}`;
  document.getElementById('reason-modal-text').innerText = reason || 'No reason provided.';
  openModal('view-reason-modal');
}

function triggerEditLogModal(logId, name, date, checkIn, checkOut, status, isLate, lateReason, isAutoCheckOut) {
  document.getElementById('edit-log-id').value = logId;
  document.getElementById('edit-log-student-name').value = name;
  document.getElementById('edit-log-date').value = date;
  document.getElementById('edit-log-checkin').value = checkIn;
  document.getElementById('edit-log-checkout').value = checkOut;
  document.getElementById('edit-log-status').value = status;
  document.getElementById('edit-log-is-late').value = isLate ? 'true' : 'false';
  document.getElementById('edit-log-late-reason').value = lateReason || '';
  document.getElementById('edit-log-is-auto').value = isAutoCheckOut ? 'true' : 'false';
  
  openModal('edit-log-modal');
}

async function submitEditLog(e) {
  e.preventDefault();
  const logId = document.getElementById('edit-log-id').value;
  const date = document.getElementById('edit-log-date').value;
  const checkIn = document.getElementById('edit-log-checkin').value || null;
  const checkOut = document.getElementById('edit-log-checkout').value || null;
  const status = document.getElementById('edit-log-status').value;
  const isLate = document.getElementById('edit-log-is-late').value === 'true';
  const lateReason = document.getElementById('edit-log-late-reason').value || null;
  const isAutoCheckOut = document.getElementById('edit-log-is-auto').value === 'true';

  try {
    const res = await fetchAPI(`/admin/attendance/${logId}/edit`, {
      method: 'PUT',
      body: JSON.stringify({ date, checkIn, checkOut, status, isLate, lateReason, isAutoCheckOut })
    });

    showAlert('admin-alert-success', res.message, 'success');
    closeModal('edit-log-modal');
    
    // Refresh current active view
    if (activeAdminTab === 'pending') {
      await loadPendingApprovals();
    } else {
      await loadAllLogs();
    }
  } catch (err) {
    showAlert('admin-alert-danger', err.message, 'danger');
  }
}


// ==========================================
// ADMIN: MANUAL LOG DIALOG
// ==========================================

async function openManualLogModal() {
  const studSelect = document.getElementById('manual-log-student');
  const sessSelect = document.getElementById('manual-log-session');

  // Fill Students Dropdown
  studSelect.innerHTML = '<option value="" disabled selected>Choose Approved Student</option>';
  allStudentsCache.forEach(st => {
    if (st.isApproved) {
      const opt = document.createElement('option');
      opt.value = st._id;
      opt.textContent = `${st.name} (${st.email})`;
      studSelect.appendChild(opt);
    }
  });

  // Fill Sessions Dropdown
  sessSelect.innerHTML = '<option value="" disabled selected>Choose Session</option>';
  allSessionsCache.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s._id;
    opt.textContent = s.name;
    sessSelect.appendChild(opt);
  });

  // Default date as today (IST)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  document.getElementById('manual-log-date').value = today;

  openModal('manual-log-modal');
}

async function submitManualLog(e) {
  e.preventDefault();
  const studentId = document.getElementById('manual-log-student').value;
  const sessionId = document.getElementById('manual-log-session').value;
  const date = document.getElementById('manual-log-date').value;
  const checkIn = document.getElementById('manual-log-checkin').value;
  const checkOut = document.getElementById('manual-log-checkout').value;

  // Format HH:MM to HH:MM:SS
  const formatTime = (timeStr) => {
    if (!timeStr) return null;
    if (timeStr.split(':').length === 2) return `${timeStr}:00`;
    return timeStr;
  };

  try {
    const res = await fetchAPI('/admin/attendance/manual', {
      method: 'POST',
      body: JSON.stringify({
        studentId,
        sessionId,
        date,
        checkIn: formatTime(checkIn),
        checkOut: formatTime(checkOut),
        status: 'approved' // Automatically approved when added manually by admin
      })
    });

    showAlert('admin-alert-success', res.message, 'success');
    closeModal('manual-log-modal');
    e.target.reset();
    await loadAllLogs();
  } catch (err) {
    showAlert('admin-alert-danger', err.message, 'danger');
  }
}
