const state = {
  users: [],
  filteredUsers: [],
  stats: {},
  analytics: {},
  filters: {
    gender: "all",
    city: "all",
    state: "all",
    practiceStatus: "all",
    volunteer: "all",
    guidance: "all"
  },
  search: "",
  sort: "fullName-asc",
  page: 1,
  pageSize: 6,
  charts: {}
};

const elements = {
  dataSourceText: document.getElementById("dataSourceText"),
  globalSearch: document.getElementById("globalSearch"),
  filtersForm: document.getElementById("filtersForm"),
  sortSelect: document.getElementById("sortSelect"),
  usersTableBody: document.getElementById("usersTableBody"),
  tableSummary: document.getElementById("tableSummary"),
  pageIndicator: document.getElementById("pageIndicator"),
  prevPage: document.getElementById("prevPage"),
  nextPage: document.getElementById("nextPage"),
  exportCsv: document.getElementById("exportCsv"),
  downloadReport: document.getElementById("downloadReport"),
  profileModal: document.getElementById("profileModal"),
  modalContent: document.getElementById("modalContent"),
  closeModal: document.getElementById("closeModal"),
  heroTotalRegistrations: document.getElementById("heroTotalRegistrations"),
  heroFirstTimeAttendees: document.getElementById("heroFirstTimeAttendees"),
  heroActivePractitioners: document.getElementById("heroActivePractitioners"),
  kpiTotalRegistrations: document.getElementById("kpiTotalRegistrations"),
  kpiFirstTimeAttendees: document.getElementById("kpiFirstTimeAttendees"),
  kpiActivePractitioners: document.getElementById("kpiActivePractitioners")
};

const chartPalette = {
  maroon: "#A32929",
  darkMaroon: "#7A1C1C",
  saffron: "#D68C1F",
  gold: "#C9A063",
  cream: "#F2E8D8",
  green: "#58724f"
};

function boolLabel(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "";
}

function statusClass(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

function toQueryString() {
  const params = new URLSearchParams();
  Object.entries(state.filters).forEach(([key, value]) => {
    if (value !== "all") {
      params.set(key, value);
    }
  });
  if (state.search.trim()) {
    params.set("search", state.search.trim());
  }
  params.set("sort", state.sort);
  return `?${params.toString()}`;
}

function avatarMarkup(user, className) {
  if (user.profilePhoto) {
    return `<div class="${className}"><img src="${user.profilePhoto}" alt="${user.fullName}" /></div>`;
  }
  return `<div class="${className}">${user.initials}</div>`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed for ${url}`);
  }
  return payload;
}

function populateSelect(id, values, placeholder) {
  const select = document.getElementById(id);
  const name = select.name;
  select.innerHTML = [`<option value="all">${placeholder}</option>`]
    .concat(values.map((value) => `<option value="${value}">${value}</option>`))
    .join("");
  select.value = state.filters[name];
}

function renderStats() {
  const stats = state.stats;
  elements.heroTotalRegistrations.textContent = stats.totalRegistrations;
  elements.heroFirstTimeAttendees.textContent = stats.firstTimeAttendees;
  elements.heroActivePractitioners.textContent = stats.activePractitioners;
  elements.kpiTotalRegistrations.textContent = stats.totalRegistrations;
  elements.kpiFirstTimeAttendees.textContent = stats.firstTimeAttendees;
  elements.kpiActivePractitioners.textContent = stats.activePractitioners;
}

function sortFilteredUsers() {
  const [field, direction] = state.sort.split("-");
  state.filteredUsers = [...state.users].sort((left, right) => {
    const first = String(left[field] || "").toLowerCase();
    const second = String(right[field] || "").toLowerCase();
    const result = first.localeCompare(second, undefined, { numeric: true });
    return direction === "desc" ? -result : result;
  });
}

function paginatedRows() {
  const start = (state.page - 1) * state.pageSize;
  return state.filteredUsers.slice(start, start + state.pageSize);
}

function renderTable() {
  sortFilteredUsers();
  const pageRows = paginatedRows();
  if (!pageRows.length) {
    elements.usersTableBody.innerHTML = `<tr><td colspan="10">No users match the current filters.</td></tr>`;
  } else {
    elements.usersTableBody.innerHTML = pageRows
      .map(
        (user) => `
          <tr class="fade-in">
            <td>${avatarMarkup(user, "table-avatar")}</td>
            <td>
              <div class="table-name">
                <div>
                  <strong>${user.fullName}</strong>
                  <small>${user.email}</small>
                </div>
              </div>
            </td>
            <td>${user.gender}</td>
            <td>${user.city}</td>
            <td>${user.state}</td>
            <td>${user.profession}</td>
            <td><span class="status-badge">${user.meditationStatus}</span></td>
            <td><span class="status-badge ${statusClass(user.becomeVolunteer)}">${boolLabel(user.becomeVolunteer)}</span></td>
            <td><span class="status-badge ${statusClass(user.needGuidance)}">${boolLabel(user.needGuidance)}</span></td>
            <td><button type="button" class="profile-button" data-user-id="${user.id}">View Profile</button></td>
          </tr>
        `
      )
      .join("");
  }

  const totalPages = Math.max(1, Math.ceil(state.filteredUsers.length / state.pageSize));
  elements.tableSummary.textContent = `${state.filteredUsers.length} records`;
  elements.pageIndicator.textContent = `Page ${state.page} of ${totalPages}`;
  elements.prevPage.disabled = state.page <= 1;
  elements.nextPage.disabled = state.page >= totalPages;
}

function destroyCharts() {
  Object.values(state.charts).forEach((chart) => chart.destroy());
  state.charts = {};
}

function chartOptions(horizontal = false) {
  return {
    indexAxis: horizontal ? "y" : "x",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: "#2B2B2B",
          font: {
            family: "Manrope"
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: "#675849"
        },
        grid: {
          color: "#efe3d1"
        }
      },
      y: {
        ticks: {
          color: "#675849"
        },
        grid: {
          color: "#efe3d1"
        }
      }
    }
  };
}

function renderCharts() {
  destroyCharts();
  const analytics = state.analytics;

  state.charts.practitionerSplit = new Chart(document.getElementById("practitionerSplitChart"), {
    type: "pie",
    data: {
      labels: ["First Time", "Existing"],
      datasets: [
        {
          data: [analytics.practitionerSplit.firstTime, analytics.practitionerSplit.existing],
          backgroundColor: [chartPalette.saffron, chartPalette.maroon]
        }
      ]
    },
    options: chartOptions()
  });

  state.charts.practiceStatus = new Chart(document.getElementById("practiceStatusChart"), {
    type: "doughnut",
    data: {
      labels: ["Regularly", "Sometimes", "No", "Want Restart"],
      datasets: [
        {
          data: [
            analytics.practiceStatus.regularly,
            analytics.practiceStatus.sometimes,
            analytics.practiceStatus.no,
            analytics.practiceStatus.restart
          ],
          backgroundColor: [chartPalette.maroon, chartPalette.gold, chartPalette.cream, chartPalette.saffron]
        }
      ]
    },
    options: chartOptions()
  });

  state.charts.interest = new Chart(document.getElementById("interestChart"), {
    type: "bar",
    data: {
      labels: ["Volunteer", "Facilitator", "Trainer"],
      datasets: [
        {
          label: "Interest Count",
          data: [
            analytics.interestSplit.volunteer,
            analytics.interestSplit.facilitator,
            analytics.interestSplit.trainer
          ],
          backgroundColor: [chartPalette.maroon, chartPalette.gold, chartPalette.saffron],
          borderRadius: 10
        }
      ]
    },
    options: chartOptions()
  });

  state.charts.city = new Chart(document.getElementById("cityChart"), {
    type: "bar",
    data: {
      labels: analytics.cityParticipation.map((item) => item.label),
      datasets: [
        {
          label: "Users",
          data: analytics.cityParticipation.map((item) => item.count),
          backgroundColor: chartPalette.maroon,
          borderRadius: 10
        }
      ]
    },
    options: chartOptions(true)
  });

  state.charts.state = new Chart(document.getElementById("stateChart"), {
    type: "bar",
    data: {
      labels: analytics.stateParticipation.map((item) => item.label),
      datasets: [
        {
          label: "Users",
          data: analytics.stateParticipation.map((item) => item.count),
          backgroundColor: chartPalette.gold,
          borderRadius: 10
        }
      ]
    },
    options: chartOptions()
  });
}

async function renderModal(userId) {
  const user = await fetchJson(`/api/users/${userId}`);
  elements.modalContent.innerHTML = `
    <div class="featured-header">
      ${avatarMarkup(user, "modal-avatar")}
      <div>
        <p class="section-kicker">User Profile</p>
        <h3>${user.fullName}</h3>
        <p class="detail-label">${user.city}, ${user.state}, ${user.country}</p>
      </div>
    </div>

    <section class="modal-section">
      <h4>Complete Profile</h4>
      <div class="modal-grid">
        ${[
          ["Age", user.age || ""],
          ["Gender", user.gender],
          ["Mobile", user.mobile],
          ["Email", user.email],
          ["Country", user.country],
          ["State", user.state],
          ["City", user.city],
          ["Address", user.address],
          ["Pincode", user.pincode],
          ["Languages", user.languages],
          ["Education", user.education],
          ["Profession", user.profession]
        ]
          .map(
            ([label, value]) => `
              <div class="detail-card">
                <span class="detail-label">${label}</span>
                <strong>${value}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </section>

  `;
  elements.profileModal.classList.remove("hidden");
}

function closeModal() {
  elements.profileModal.classList.add("hidden");
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCurrentCsv() {
  const headers = ["Full Name", "Gender", "City", "State", "Profession", "Practice Status", "Volunteer", "Guidance"];
  const rows = state.filteredUsers.map((user) => [
    user.fullName,
    user.gender,
    user.city,
    user.state,
    user.profession,
    user.meditationStatus,
    boolLabel(user.becomeVolunteer),
    boolLabel(user.needGuidance)
  ]);
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  downloadBlob("preksha-users-export.csv", csvContent, "text/csv;charset=utf-8");
}

function downloadAnalyticsReport() {
  const analytics = state.analytics;
  const stats = state.stats;
  const report = [
    "Preksha Meditation Dashboard Report",
    `Generated: ${new Date().toLocaleString()}`,
    "",
    `Total Registrations: ${stats.totalRegistrations}`,
    `First Time Attendees: ${stats.firstTimeAttendees}`,
    `Active Practitioners: ${stats.activePractitioners}`,
    `Want To Restart: ${stats.wantToRestart}`,
    `Volunteer Interested: ${stats.volunteerInterested}`,
    `Need Guidance: ${stats.needGuidance}`,
    "",
    `First Time Practitioners: ${analytics.practitionerSplit.firstTime}`,
    `Existing Practitioners: ${analytics.practitionerSplit.existing}`,
    `Program Preferences: Online ${analytics.programPreferences.online}, Offline ${analytics.programPreferences.offline}, Residential ${analytics.programPreferences.residential}, App ${analytics.programPreferences.app}`
  ].join("\n");
  downloadBlob("preksha-analytics-report.txt", report, "text/plain;charset=utf-8");
}

async function loadReferenceFilters() {
  const [cities, states] = await Promise.all([fetchJson("/api/cities"), fetchJson("/api/states")]);
  const genders = [...new Set(state.users.map((user) => user.gender).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  populateSelect("filterGender", genders, "All Genders");
  populateSelect("filterCity", cities, "All Cities");
  populateSelect("filterState", states, "All States");
}

async function loadDashboard() {
  const query = toQueryString();
  const [usersPayload, statsPayload, analyticsPayload] = await Promise.all([
    fetchJson(`/api/users${query}`),
    fetchJson(`/api/stats${query}`),
    fetchJson(`/api/analytics${query}`)
  ]);

  state.users = usersPayload.rows;
  state.filteredUsers = usersPayload.rows;
  state.stats = statsPayload.stats;
  state.analytics = analyticsPayload.analytics;
  state.page = Math.min(state.page, Math.max(1, Math.ceil(state.users.length / state.pageSize)));

  elements.dataSourceText.textContent = `${usersPayload.source} • ${usersPayload.total} records`;
  renderStats();
  renderTable();
  renderCharts();
}

function bindEvents() {
  elements.globalSearch.addEventListener("input", async (event) => {
    state.search = event.target.value;
    state.page = 1;
    await loadDashboard();
  });

  elements.filtersForm.addEventListener("change", async (event) => {
    state.filters[event.target.name] = event.target.value;
    state.page = 1;
    await loadDashboard();
  });

  elements.sortSelect.addEventListener("change", async (event) => {
    state.sort = event.target.value;
    state.page = 1;
    await loadDashboard();
  });

  elements.prevPage.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      renderTable();
    }
  });

  elements.nextPage.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(state.filteredUsers.length / state.pageSize));
    if (state.page < totalPages) {
      state.page += 1;
      renderTable();
    }
  });

  elements.usersTableBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-user-id]");
    if (button) {
      await renderModal(button.dataset.userId);
    }
  });

  elements.exportCsv.addEventListener("click", exportCurrentCsv);
  elements.downloadReport.addEventListener("click", downloadAnalyticsReport);
  elements.closeModal.addEventListener("click", closeModal);
  document.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal='true']")) {
      closeModal();
    }
  });
}

async function initialize() {
  bindEvents();
  await loadDashboard();
  await loadReferenceFilters();
}

initialize().catch((error) => {
  console.error(error);
  elements.dataSourceText.textContent = error.message;
});

