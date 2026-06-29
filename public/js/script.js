let chartInstances = {};
let allUserData = [];
let currentPage = 1;
const recordsPerPage = 10;

window.addEventListener("DOMContentLoaded", () => {
  initializeFilterDropdowns();
  fetchDashboardDataset();

  // Unified select configuration triggers
  document.getElementById("filtersForm").addEventListener("change", (e) => {
    if (e.target.id !== "filterCompletedPrograms") {
      currentPage = 1; 
      fetchDashboardDataset();
    }
  });

  // Manual program text typing entries observer
  const programInput = document.getElementById("filterCompletedPrograms");
  if (programInput) {
    programInput.addEventListener("input", debounce(() => {
      currentPage = 1;
      fetchDashboardDataset();
    }, 400));
  }

  document.getElementById("sortSelect").addEventListener("change", () => { currentPage = 1; fetchDashboardDataset(); });
  document.getElementById("globalSearch").addEventListener("input", debounce(() => { currentPage = 1; fetchDashboardDataset(); }, 300));
  
  // FIXED PAGINATION ROUTINE: Isolated to run precisely once per manual click action
  document.getElementById("prevPage").addEventListener("click", () => { 
    if (currentPage > 1) { 
      currentPage--; 
      renderTablePage(); 
    } 
  });
  
  document.getElementById("nextPage").addEventListener("click", () => { 
    if (currentPage * recordsPerPage < allUserData.length) { 
      currentPage++; 
      renderTablePage(); 
    } 
  });
  
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

function dedupeLocationOptions(values) {
  const seen = new Map();

  values.forEach((value) => {
    const cleaned = String(value ?? "").trim();
    if (!cleaned) return;
    const key = cleaned
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[().-]/g, " ")
      .replace(/\s*,\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    if (!key) return;

    if (!seen.has(key)) {
      seen.set(key, cleaned);
    }
  });

  return [...seen.values()].sort((left, right) => left.localeCompare(right));
}

async function initializeFilterDropdowns() {
  try {
    const [citiesRes, countriesRes] = await Promise.all([
      fetch('/api/cities'),
      fetch('/api/countries')
    ]);

    if (citiesRes.ok && countriesRes.ok) {
      const cities = dedupeLocationOptions(await citiesRes.json());
      const countries = dedupeLocationOptions(await countriesRes.json());

      const citySel = document.getElementById("filterCity");
      if (citySel) {
        citySel.innerHTML = '<option value="all">All Cities</option>';
        cities.forEach(c => citySel.insertAdjacentHTML('beforeend', `<option value="${c}">${c}</option>`));
      }

      const countrySel = document.getElementById("filterCountry");
      if (countrySel) {
        countrySel.innerHTML = '<option value="all">All Countries</option>';
        countries.forEach(co => countrySel.insertAdjacentHTML('beforeend', `<option value="${co}">${co}</option>`));
      }
    }
  } catch (err) {
    console.error("Failed to populate dropdown items gracefully:", err);
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
    console.error("Express data synchronization engine problem:", err);
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
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--muted);">No matching profiles located.</td></tr>`;
    return;
  }

  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = Math.min(startIndex + recordsPerPage, allUserData.length);
  const paginatedSlice = allUserData.slice(startIndex, endIndex);

  paginatedSlice.forEach(user => {
    const photoMarkup = user.profilePhoto 
      ? `<img src="${user.profilePhoto}" alt="Avatar" class="table-avatar"/>`
      : `<div class="table-avatar">${user.initials}</div>`;

    const appText = user.appPractice ? user.appPractice : 'No';
    const guidanceText = user.trainerGuidance ? user.trainerGuidance : 'No';

    const rowHtml = `
      <tr class="fade-in">
        <td>${photoMarkup}</td>
        <td><strong>${user.fullName}</strong></td>
        <td>${user.email || '-'}</td>
        <td>${user.mobile || '-'}</td>
        <td>${user.country || '-'}</td>
        <td>${user.city || '-'}</td>
        <td>${user.languages || '-'}</td>
        <td><span class="status-badge ${user.activePractitioner ? 'yes' : 'no'}">${appText}</span></td>
        <td><span class="status-badge ${String(guidanceText).toLowerCase() === 'yes' ? 'yes' : 'no'}">${guidanceText}</span></td>
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

    document.getElementById("modalContent").innerHTML = `
      <div class="featured-header" style="margin-bottom: 20px;">
        <div class="modal-avatar">${avatarMarkup}</div>
        <div>
          <p class="brand-kicker">${user.seekerType || 'Community Member'}</p>
          <h3>${user.fullName}</h3>
          <p style="margin:4px 0 0; color:var(--muted);">${user.email} | ${user.city}, ${user.country}</p>
        </div>
      </div>
      
      <div class="modal-section">
        <h4>Core Contact Information</h4>
        <div class="modal-grid">
          <div class="detail-card"><span>Submission ID</span><strong>${user.id || '-'}</strong></div>
          <div class="detail-card"><span>Full Name</span><strong>${user.fullName || '-'}</strong></div>
          <div class="detail-card"><span>Email Address</span><strong>${user.email || '-'}</strong></div>
          <div class="detail-card"><span>Phone/Mobile</span><strong>${user.mobile || '-'}</strong></div>
          <div class="detail-card"><span>Country</span><strong>${user.country || '-'}</strong></div>
          <div class="detail-card"><span>City</span><strong>${user.city || '-'}</strong></div>
          <div class="detail-card"><span>State</span><strong>${user.state || '-'}</strong></div>
          <div class="detail-card"><span>Language</span><strong>${user.languages || '-'}</strong></div>
        </div>
      </div>

      <div class="modal-section">
        <h4>Survey Response Details</h4>
        <div class="modal-grid">
          <div class="detail-card"><span>Number of camps attended ?</span><strong>${user.campsAttended || '0'}</strong></div>
          <div class="detail-card"><span>Practising via APP - Yes or No</span><strong>${user.appPractice || 'No'}</strong></div>
          <div class="detail-card"><span>Which programs have you completed?</span><strong>${user.completedPrograms || 'None Specified'}</strong></div>
          <div class="detail-card"><span>Past camps - some useful filter</span><strong>${user.pastCampsFilter || 'None Specified'}</strong></div>
          <div class="detail-card"><span>Would you like to receive guidance from a Preksha trainer/volunteer?</span><strong>${user.trainerGuidance || 'No'}</strong></div>
        </div>
      </div>
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

  // Country Participation visual rendering configuration block replacement
  safeDestroyChart("stateParticipation");
  const countriesData = analytics.stateParticipation || [];
  
  const stateCardHeading = document.querySelector("#reports h4");
  if (stateCardHeading) {
    stateCardHeading.innerText = "Country Participation";
  }

  chartInstances["stateParticipation"] = new Chart(document.getElementById("stateChart"), {
    type: 'polarArea',
    data: {
      labels: countriesData.map(c => c.label),
      datasets: [{
        label: 'Countries Count',
        data: countriesData.map(c => c.count),
        backgroundColor: ['#8f2520', '#d4a14a', '#5e1817', '#c8a46b', '#766255']
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function exportToCsvFile() {
  if (!allUserData.length) return alert("No available rows to trigger export.");
  
  const columnHeaders = ["Submission ID", "Full Name", "Email", "Phone/Mobile", "Country", "City", "State", "Language", "Submit Time"];
  const outputRows = [columnHeaders.join(",")];

  allUserData.forEach(u => {
    const serializedRow = [
      `"${u.id}"`,
      `"${u.fullName.replace(/"/g, '""')}"`,
      `"${(u.email || '').replace(/"/g, '""')}"`,
      `"${(u.mobile || '').replace(/"/g, '""')}"`,
      `"${(u.country || '').replace(/"/g, '""')}"`,
      `"${(u.city || '').replace(/"/g, '""')}"`,
      `"${(u.state || '').replace(/"/g, '""')}"`,
      `"${(u.languages || '').replace(/"/g, '""')}"`,
      `"${u.registrationDate || ''}"`
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
