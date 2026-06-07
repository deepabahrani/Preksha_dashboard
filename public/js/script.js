let chartInstances = {};
let allUserData = [];
let currentPage = 1;
const recordsPerPage = 10;

window.addEventListener("DOMContentLoaded", () => {
  initializeFilterDropdowns();
  fetchDashboardDataset();

  document.getElementById("filtersForm").addEventListener("change", () => { currentPage = 1; fetchDashboardDataset(); });
  document.getElementById("sortSelect").addEventListener("change", () => { currentPage = 1; fetchDashboardDataset(); });
  document.getElementById("globalSearch").addEventListener("input", debounce(() => { currentPage = 1; fetchDashboardDataset(); }, 300));
  
  document.getElementById("prevPage").addEventListener("click", () => { if (currentPage > 1) { currentPage--; renderTablePage(); } });
  document.getElementById("nextPage").addEventListener("click", () => { if (currentPage * recordsPerPage < allUserData.length) { currentPage++; renderTablePage(); } });
  
  document.getElementById("exportCsv").addEventListener("click", exportToCsvFile);
  document.getElementById("closeModal").addEventListener("click", () => document.getElementById("profileModal").classList.add("hidden"));
  document.querySelector(".modal-overlay").addEventListener("click", () => document.getElementById("profileModal").classList.add("hidden"));
});

function getFilterParams() {
  const form = document.getElementById("filtersForm");
  const formData = new FormData(form);
  const params = new URLSearchParams();
  
  for (const [key, val] of formData.entries()) {
    if (val !== "all") params.append(key, val);
  }
  
  const searchVal = document.getElementById("globalSearch").value.trim();
  if (searchVal) params.append("search", searchVal);
  
  const sortVal = document.getElementById("sortSelect").value;
  if (sortVal) params.append("sort", sortVal);

  return params.toString();
}

async function initializeFilterDropdowns() {
  try {
    const [citiesRes, statesRes] = await Promise.all([fetch('/api/cities'), fetch('/api/states')]);
    const cities = await citiesRes.json();
    const states = await statesRes.json();

    const citySel = document.getElementById("filterCity");
    cities.forEach(c => citySel.insertAdjacentHTML('beforeend', `<option value="${c}">${c}</option>`));

    const stateSel = document.getElementById("filterState");
    states.forEach(s => stateSel.insertAdjacentHTML('beforeend', `<option value="${s}">${s}</option>`));
  } catch (err) {
    console.error("Failed to populate dropdown items:", err);
  }
}

async function fetchDashboardDataset() {
  try {
    const queryString = getFilterParams();
    
    const [usersRes, statsRes, analyticsRes] = await Promise.all([
      fetch(`/api/users?${queryString}`),
      fetch(`/api/stats?${queryString}`),
      fetch(`/api/analytics?${queryString}`)
    ]);

    const usersData = await usersRes.json();
    const statsData = await statsRes.json();
    const analyticsData = await analyticsRes.json();

    allUserData = usersData.rows || [];

    updateMetricCounters(statsData.stats);
    renderTablePage();
    renderAnalyticsVisualizationCharts(analyticsData.analytics);
  } catch (err) {
    console.error("Express synchronization pipeline loading issue:", err);
  }
}

function updateMetricCounters(stats) {
  if (!stats) return;
  document.getElementById("heroTotalRegistrations").innerText = stats.totalRegistrations ?? 0;
  document.getElementById("heroFirstTimeAttendees").innerText = stats.firstTimeAttendees ?? 0;
  document.getElementById("heroActivePractitioners").innerText = stats.activePractitioners ?? 0;
  document.getElementById("heroWantRestart").innerText = stats.wantToRestart ?? 0;
  document.getElementById("heroVolunteerInterested").innerText = stats.volunteerInterested ?? 0;
  document.getElementById("heroNeedGuidance").innerText = stats.needGuidance ?? 0;
}

function renderTablePage() {
  const tbody = document.getElementById("usersTableBody");
  tbody.innerHTML = "";

  document.getElementById("tableSummary").innerText = `${allUserData.length} records found`;
  document.getElementById("pageIndicator").innerText = `Page ${currentPage}`;

  if (allUserData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--muted);">No matching community database profiles located.</td></tr>`;
    return;
  }

  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = Math.min(startIndex + recordsPerPage, allUserData.length);
  const paginatedSlice = allUserData.slice(startIndex, endIndex);

  paginatedSlice.forEach(user => {
    const photoMarkup = user.profilePhoto 
      ? `<img src="${user.profilePhoto}" alt="Avatar" class="table-avatar"/>`
      : `<div class="table-avatar">${user.initials}</div>`;

    const rowHtml = `
      <tr class="fade-in">
        <td>${photoMarkup}</td>
        <td><strong>${user.fullName}</strong></td>
        <td>${user.gender || '-'}</td>
        <td>${user.city || '-'}</td>
        <td>${user.state || '-'}</td>
        <td>${user.profession || '-'}</td>
        <td><span class="status-badge">${user.meditationStatus}</span></td>
        <td><span class="status-badge ${user.becomeVolunteer ? 'yes' : 'no'}">${user.becomeVolunteer ? 'Yes' : 'No'}</span></td>
        <td><span class="status-badge ${user.needGuidance ? 'yes' : 'no'}">${user.needGuidance ? 'Yes' : 'No'}</span></td>
        <td><button class="profile-button" onclick="launchUserProfileModal('${user.id}')">View</button></td>
      </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', rowHtml);
  });
}

async function launchUserProfileModal(userId) {
  try {
    const res = await fetch(`/api/users/${userId}`);
    if (!res.ok) return;
    const user = await res.json();

    const avatarMarkup = user.profilePhoto 
      ? `<img src="${user.profilePhoto}" alt="Avatar"/>` 
      : `<span>${user.initials}</span>`;

    let interestsListMarkup = user.interests.map(i => `
      <div class="detail-card">
        <span class="chip-label">${i.label}</span>
        <strong style="color: ${i.active ? '#3d6b3d' : 'var(--muted)'}">${i.active ? 'Yes' : 'No'}</strong>
      </div>
    `).join('');

    let prefListMarkup = user.programPreferences.map(p => `
      <div class="detail-card">
        <span class="chip-label">${p.label} Preference</span>
        <strong style="color: ${p.active ? 'var(--maroon)' : 'var(--muted)'}">${p.active ? 'Active' : 'Not Selected'}</strong>
      </div>
    `).join('');

    document.getElementById("modalContent").innerHTML = `
      <div class="featured-header" style="margin-bottom: 20px;">
        <div class="modal-avatar">${avatarMarkup}</div>
        <div>
          <p class="brand-kicker">${user.seekerType}</p>
          <h3>${user.fullName}</h3>
          <p style="margin:4px 0 0; color:var(--muted);">${user.profession || 'Profession Unspecified'} | ${user.city}, ${user.state}</p>
        </div>
      </div>
      <div class="modal-grid">
        <div class="detail-card"><span>Email Address</span>strong>${user.email || '-'}</strong></div>
        <div class="detail-card"><span>Mobile Number</span><strong>${user.mobile || '-'}</strong></div>
        <div class="detail-card"><span>Gender</span><strong>${user.gender || '-'}</strong></div>
        <div class="detail-card"><span>Age / Date of Birth</span><strong>${user.age ? user.age + ' Years' : '-'} (${user.dateOfBirth || '-'})</strong></div>
        <div class="detail-card"><span>Current Practice Level</span><strong>${user.meditationStatus}</strong></div>
        <div class="detail-card"><span>Languages Known</span><strong>${user.languages || '-'}</strong></div>
      </div>
      <div class="modal-section">
        <h4>Community Engagement Interests</h4>
        <div class="modal-grid">${interestsListMarkup}</div>
      </div>
      <div class="modal-section">
        <h4>Program Delivery Platform Preferences</h4>
        <div class="modal-grid">${prefListMarkup}</div>
      </div>
      ${user.supportMessage ? `
        <div class="modal-section">
          <h4>Message / Support Notes</h4>
          <div class="support-card">${user.supportMessage}</div>
        </div>
      ` : ''}
    `;
    document.getElementById("profileModal").classList.remove("hidden");
  } catch (err) {
    console.error("Modal mapping template error:", err);
  }
}

function safeDestroyChart(chartKey) {
  if (chartInstances[chartKey]) {
    chartInstances[chartKey].destroy();
    delete chartInstances[chartKey];
  }
}

function renderAnalyticsVisualizationCharts(analytics) {
  if (!analytics) return;

  safeDestroyChart("practitionerSplit");
  chartInstances["practitionerSplit"] = new Chart(document.getElementById("practitionerSplitChart"), {
    type: 'doughnut',
    data: {
      labels: ['First Time Attendees', 'Existing Practitioners'],
      datasets: [{
        data: [analytics.practitionerSplit?.firstTime ?? 0, analytics.practitionerSplit?.existing ?? 0],
        backgroundColor: ['#d4a14a', '#8f2520']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  safeDestroyChart("practiceStatus");
  const pStatus = analytics.practiceStatus || {};
  chartInstances["practiceStatus"] = new Chart(document.getElementById("practiceStatusChart"), {
    type: 'bar',
    data: {
      labels: ['Regularly', 'Sometimes', 'Want Restart', 'No', 'Unknown'],
      datasets: [{
        label: 'Practitioners Count',
        data: [pStatus.regularly ?? 0, pStatus.sometimes ?? 0, pStatus.restart ?? 0, pStatus.no ?? 0, pStatus.unknown ?? 0],
        backgroundColor: ['#5e1817', '#8f2520', '#d4a14a', '#766255', '#e6d5b7']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  safeDestroyChart("interestSplit");
  const iSplit = analytics.interestSplit || {};
  chartInstances["interestSplit"] = new Chart(document.getElementById("interestChart"), {
    type: 'pie',
    data: {
      labels: ['Volunteers', 'Facilitators', 'Trainers'],
      datasets: [{
        data: [iSplit.volunteer ?? 0, iSplit.facilitator ?? 0, iSplit.trainer ?? 0],
        backgroundColor: ['#3d6b3d', '#c8a46b', '#8f2520']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  safeDestroyChart("cityParticipation");
  const citiesData = analytics.cityParticipation || [];
  chartInstances["cityParticipation"] = new Chart(document.getElementById("cityChart"), {
    type: 'bar',
    data: {
      labels: citiesData.map(c => c.label),
      datasets: [{
        label: 'Seekers Count',
        data: citiesData.map(c => c.count),
        backgroundColor: '#d4a14a'
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } } }
  });

  safeDestroyChart("stateParticipation");
  const statesData = analytics.stateParticipation || [];
  chartInstances["stateParticipation"] = new Chart(document.getElementById("stateChart"), {
    type: 'polarArea',
    data: {
      labels: statesData.map(s => s.label),
      datasets: [{
        data: statesData.map(s => s.count),
        backgroundColor: ['rgba(143,37,32,0.85)', 'rgba(212,161,74,0.85)', 'rgba(94,24,23,0.85)', 'rgba(200,164,107,0.85)', 'rgba(118,98,85,0.85)']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function exportToCsvFile() {
  if (!allUserData.length) return alert("No available metadata rows to trigger export.");
  
  const columnHeaders = ["Full Name", "Gender", "City", "State", "Profession", "Practice Status", "Volunteer Interest", "Guidance Status"];
  const outputRows = [columnHeaders.join(",")];

  allUserData.forEach(u => {
    const serializedRow = [
      `"${u.fullName.replace(/"/g, '""')}"`,
      `"${(u.gender || '').replace(/"/g, '""')}"`,
      `"${(u.city || '').replace(/"/g, '""')}"`,
      `"${(u.state || '').replace(/"/g, '""')}"`,
      `"${(u.profession || '').replace(/"/g, '""')}"`,
      `"${u.meditationStatus}"`,
      `"${u.becomeVolunteer ? 'Yes' : 'No'}"`,
      `"${u.needGuidance ? 'Yes' : 'No'}"`
    ];
    outputRows.push(serializedRow.join(","));
  });

  const csvBlob = new Blob([outputRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
  const downloadLink = document.createElement("a");
  downloadLink.href = URL.createObjectURL(csvBlob);
  downloadLink.setAttribute("download", `Preksha_Community_Report_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

function debounce(fn, executionDelay) {
  let activeTimeoutId;
  return function (...args) {
    clearTimeout(activeTimeoutId);
    activeTimeoutId = setTimeout(() => fn.apply(this, args), executionDelay);
  };
}