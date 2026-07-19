let chartInstances = {};
let allUserData = [];
let currentPage = 1;
const recordsPerPage = 50;

const filters = {
  attendedProgram: "",
  completedPrograms: [],
  isVahiniMember: "",
  practiceStatus: "",
  practiceDays: "",
  practiceDuration: "",
  practiceTypes: [],
  usesMeditationApp: "",
  nextGoals: [],
  needsGuidance: "",
  preferredModes: []
};

const multiSelectControls = new Map();

function displayValue(value, fallback = "-") {
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : fallback;
  }

  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.toLowerCase() === "null" || normalized.toLowerCase() === "undefined" || normalized === "-") {
    return fallback;
  }
  return normalized;
}

window.addEventListener("DOMContentLoaded", () => {
  initializeFilterDropdowns();
  initializeMultiSelects();
  bindFilterEvents();
  updateConditionalFilters();
  fetchDashboardDataset();

  document.getElementById("sortSelect").addEventListener("change", () => {
    currentPage = 1;
    fetchDashboardDataset();
  });

  document.getElementById("globalSearch").addEventListener("input", debounce(() => {
    currentPage = 1;
    fetchDashboardDataset();
  }, 300));

  document.getElementById("prevPage").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      renderTablePage();
    }
  });

  document.getElementById("nextPage").addEventListener("click", () => {
    if (currentPage * recordsPerPage < allUserData.length) {
      currentPage += 1;
      renderTablePage();
    }
  });

  document.getElementById("resetFilters").addEventListener("click", resetFilters);
  document.getElementById("exportCsv").addEventListener("click", exportToCsvFile);
  document.getElementById("closeModal").addEventListener("click", () => document.getElementById("profileModal").classList.add("hidden"));
  document.querySelector(".modal-overlay").addEventListener("click", () => document.getElementById("profileModal").classList.add("hidden"));

  document.addEventListener("click", (event) => {
    multiSelectControls.forEach((control, key) => {
      if (!control.element.contains(event.target)) {
        closeMultiSelect(key);
      }
    });
  });
});

function bindFilterEvents() {
  const form = document.getElementById("filtersForm");

  form.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }

    if (target.type === "radio" && Object.prototype.hasOwnProperty.call(filters, target.name)) {
      filters[target.name] = target.checked ? target.value : "";
      updateConditionalFilters();
    }

    if (target.tagName === "SELECT" && Object.prototype.hasOwnProperty.call(filters, target.name)) {
      filters[target.name] = target.value === "all" ? "" : target.value;
      updateConditionalFilters();
    }

    currentPage = 1;
    fetchDashboardDataset();
  });
}

function getFilterParams() {
  const form = document.getElementById("filtersForm");
  const formData = new FormData(form);
  const params = new URLSearchParams();

  for (const [key, value] of formData.entries()) {
    if (!Object.prototype.hasOwnProperty.call(filters, key) && value !== "all" && value !== "") {
      params.append(key, value);
    }
  }

  Object.entries(filters).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
      return;
    }

    if (value) {
      params.append(key, value);
    }
  });

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

    if (!key || seen.has(key)) return;
    seen.set(key, cleaned);
  });

  return [...seen.values()].sort((left, right) => left.localeCompare(right));
}

async function initializeFilterDropdowns() {
  try {
    const [citiesRes, countriesRes] = await Promise.all([
      fetch("/api/cities"),
      fetch("/api/countries")
    ]);

    if (!citiesRes.ok || !countriesRes.ok) return;

    const cities = dedupeLocationOptions(await citiesRes.json());
    const countries = dedupeLocationOptions(await countriesRes.json());

    const citySel = document.getElementById("filterCity");
    if (citySel) {
      citySel.innerHTML = '<option value="all">All Cities</option>';
      cities.forEach((city) => citySel.insertAdjacentHTML("beforeend", `<option value="${city}">${city}</option>`));
    }

    const countrySel = document.getElementById("filterCountry");
    if (countrySel) {
      countrySel.innerHTML = '<option value="all">All Countries</option>';
      countries.forEach((country) => countrySel.insertAdjacentHTML("beforeend", `<option value="${country}">${country}</option>`));
    }
  } catch (err) {
    console.error("Failed to populate dropdown items gracefully:", err);
  }
}

function initializeMultiSelects() {
  document.querySelectorAll(".multi-select-dropdown").forEach((element) => {
    const key = element.dataset.filterKey;
    const options = JSON.parse(element.dataset.options || "[]");
    const placeholder = element.dataset.placeholder || "Select";

    element.innerHTML = `
      <button type="button" class="multi-select-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
      <div class="multi-select-panel" role="listbox" tabindex="-1" aria-multiselectable="true"></div>
    `;

    const trigger = element.querySelector(".multi-select-trigger");
    const panel = element.querySelector(".multi-select-panel");

    options.forEach((option, index) => {
      const optionButton = document.createElement("button");
      optionButton.type = "button";
      optionButton.className = "multi-select-option";
      optionButton.setAttribute("role", "option");
      optionButton.dataset.value = option;
      optionButton.dataset.index = String(index);
      optionButton.textContent = option;
      optionButton.addEventListener("click", () => toggleMultiSelectValue(key, option));
      panel.appendChild(optionButton);
    });

    trigger.addEventListener("click", () => toggleMultiSelect(key));
    trigger.addEventListener("keydown", (event) => handleMultiSelectTriggerKeydown(event, key));
    panel.addEventListener("keydown", (event) => handleMultiSelectPanelKeydown(event, key));

    multiSelectControls.set(key, {
      element,
      trigger,
      panel,
      options,
      placeholder,
      activeIndex: 0
    });

    renderMultiSelect(key);
  });
}

function handleMultiSelectTriggerKeydown(event, key) {
  if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openMultiSelect(key);
    focusMultiSelectOption(key, multiSelectControls.get(key).activeIndex || 0);
    return;
  }

  if (event.key === "Backspace" && filters[key].length) {
    event.preventDefault();
    filters[key] = filters[key].slice(0, -1);
    renderMultiSelect(key);
    currentPage = 1;
    fetchDashboardDataset();
  }
}

function handleMultiSelectPanelKeydown(event, key) {
  const control = multiSelectControls.get(key);
  if (!control) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeMultiSelect(key);
    control.trigger.focus();
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusMultiSelectOption(key, Math.min(control.activeIndex + 1, control.options.length - 1));
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    focusMultiSelectOption(key, Math.max(control.activeIndex - 1, 0));
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    const activeOption = control.panel.querySelector(`.multi-select-option[data-index="${control.activeIndex}"]`);
    if (activeOption) {
      event.preventDefault();
      toggleMultiSelectValue(key, activeOption.dataset.value);
    }
  }
}

function toggleMultiSelect(key) {
  const control = multiSelectControls.get(key);
  if (!control) return;

  if (control.element.classList.contains("is-open")) {
    closeMultiSelect(key);
  } else {
    openMultiSelect(key);
  }
}

function openMultiSelect(key) {
  multiSelectControls.forEach((_, currentKey) => {
    if (currentKey !== key) closeMultiSelect(currentKey);
  });

  const control = multiSelectControls.get(key);
  if (!control) return;
  control.element.classList.add("is-open");
  control.trigger.setAttribute("aria-expanded", "true");
}

function closeMultiSelect(key) {
  const control = multiSelectControls.get(key);
  if (!control) return;
  control.element.classList.remove("is-open");
  control.trigger.setAttribute("aria-expanded", "false");
}

function focusMultiSelectOption(key, index) {
  const control = multiSelectControls.get(key);
  if (!control) return;
  control.activeIndex = index;
  const option = control.panel.querySelector(`.multi-select-option[data-index="${index}"]`);
  if (option) option.focus();
}

function toggleMultiSelectValue(key, value) {
  const currentValues = new Set(filters[key]);
  if (currentValues.has(value)) currentValues.delete(value);
  else currentValues.add(value);

  filters[key] = [...currentValues];
  renderMultiSelect(key);
  currentPage = 1;
  fetchDashboardDataset();
}

function renderMultiSelect(key) {
  const control = multiSelectControls.get(key);
  if (!control) return;

  const selectedValues = filters[key];
  const triggerContent = selectedValues.length
    ? selectedValues.map((value) => `
        <span class="multi-select-tag">
          <span class="multi-select-tag-label">${value}</span>
          <button type="button" class="multi-select-tag-remove" aria-label="Remove ${value}" data-value="${value}">&times;</button>
        </span>
      `).join("")
    : `<span class="multi-select-placeholder">${control.placeholder}</span>`;

  control.trigger.innerHTML = triggerContent;

  control.trigger.querySelectorAll(".multi-select-tag-remove").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleMultiSelectValue(key, button.dataset.value);
    });
  });

  control.panel.querySelectorAll(".multi-select-option").forEach((option) => {
    const selected = selectedValues.includes(option.dataset.value);
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-selected", selected ? "true" : "false");
  });
}

function updateConditionalFilters() {
  const attendedProgramsVisible = filters.attendedProgram === "Yes";
  toggleConditionalField("completedProgramsField", attendedProgramsVisible, () => clearMultiSelectFilter("completedPrograms"));

  const showPracticeDetails = filters.practiceStatus === "Yes, regularly" || filters.practiceStatus === "Yes, sometimes";
  toggleConditionalField("practiceDaysField", showPracticeDetails, () => resetSelectFilter("practiceDays", "filterPracticeDays"));
  toggleConditionalField("practiceDurationField", showPracticeDetails, () => resetSelectFilter("practiceDuration", "filterPracticeDuration"));
  toggleConditionalField("practiceTypesField", showPracticeDetails, () => clearMultiSelectFilter("practiceTypes"));
}

function toggleConditionalField(fieldId, shouldShow, resetFn) {
  const element = document.getElementById(fieldId);
  if (!element) return;

  if (shouldShow) {
    element.classList.remove("hidden-filter-group");
    return;
  }

  element.classList.add("hidden-filter-group");
  resetFn();
}

function clearMultiSelectFilter(key) {
  if (!filters[key].length) return;
  filters[key] = [];
  renderMultiSelect(key);
}

function resetSelectFilter(key, elementId) {
  if (filters[key]) {
    filters[key] = "";
  }
  const element = document.getElementById(elementId);
  if (element) {
    element.value = "all";
  }
}

function resetFilters() {
  const form = document.getElementById("filtersForm");
  form.reset();

  Object.keys(filters).forEach((key) => {
    filters[key] = Array.isArray(filters[key]) ? [] : "";
  });

  document.getElementById("filterGender").value = "all";
  document.getElementById("filterCity").value = "all";
  document.getElementById("filterCountry").value = "all";
  document.getElementById("filterVolunteer").value = "all";
  document.getElementById("filterPracticeDays").value = "all";
  document.getElementById("filterPracticeDuration").value = "all";

  multiSelectControls.forEach((_, key) => renderMultiSelect(key));
  updateConditionalFilters();

  document.getElementById("globalSearch").value = "";
  document.getElementById("sortSelect").value = "fullName-asc";

  currentPage = 1;
  fetchDashboardDataset();
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
  const totalPages = Math.max(1, Math.ceil(allUserData.length / recordsPerPage));
  currentPage = Math.min(currentPage, totalPages);

  document.getElementById("tableSummary").innerText = `${allUserData.length} records found`;
  document.getElementById("pageIndicator").innerText = `Page ${currentPage} of ${totalPages}`;

  if (allUserData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:var(--muted);">No matching profiles located.</td></tr>`;
    document.getElementById("prevPage").disabled = true;
    document.getElementById("nextPage").disabled = true;
    return;
  }

  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = Math.min(startIndex + recordsPerPage, allUserData.length);
  const paginatedSlice = allUserData.slice(startIndex, endIndex);

  paginatedSlice.forEach((user) => {
    const photoMarkup = user.profilePhoto
      ? `<img src="${user.profilePhoto}" alt="Avatar" class="table-avatar"/>`
      : `<div class="table-avatar">${user.initials}</div>`;

    const appText = displayValue(user.usesMeditationApp || user.appPractice, "No");
    const guidanceText = displayValue(user.needsGuidance || user.trainerGuidance, "No");

    const rowHtml = `
      <tr class="fade-in">
        <td>${photoMarkup}</td>
        <td><strong>${displayValue(user.fullName)}</strong></td>
        <td>${displayValue(user.email)}</td>
        <td>${displayValue(user.mobile)}</td>
        <td>${displayValue(user.country)}</td>
        <td>${displayValue(user.city)}</td>
        <td>${displayValue(user.languages)}</td>
        <td><span class="status-badge ${String(appText).toLowerCase() === "yes" ? "yes" : "no"}">${appText}</span></td>
        <td><span class="status-badge ${String(guidanceText).toLowerCase() === "yes" ? "yes" : "no"}">${guidanceText}</span></td>
        <td><button class="profile-button" onclick="launchUserProfileModal('${user.id}')">View</button></td>
      </tr>
    `;
    tbody.insertAdjacentHTML("beforeend", rowHtml);
  });

  document.getElementById("prevPage").disabled = currentPage <= 1;
  document.getElementById("nextPage").disabled = currentPage >= totalPages;
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
          <p class="brand-kicker">${user.seekerType || "Community Member"}</p>
          <h3>${displayValue(user.fullName)}</h3>
          <p style="margin:4px 0 0; color:var(--muted);">${displayValue(user.email)} | ${displayValue(user.city)}, ${displayValue(user.country)}</p>
        </div>
      </div>

      <div class="modal-section">
        <h4>Core Contact Information</h4>
        <div class="modal-grid">
          <div class="detail-card"><span>Submission ID</span><strong>${user.id || "-"}</strong></div>
          <div class="detail-card"><span>Full Name</span><strong>${displayValue(user.fullName)}</strong></div>
          <div class="detail-card"><span>Email Address</span><strong>${displayValue(user.email)}</strong></div>
          <div class="detail-card"><span>Phone/Mobile</span><strong>${displayValue(user.mobile)}</strong></div>
          <div class="detail-card"><span>Country</span><strong>${displayValue(user.country)}</strong></div>
          <div class="detail-card"><span>City</span><strong>${displayValue(user.city)}</strong></div>
          <div class="detail-card"><span>State</span><strong>${displayValue(user.state)}</strong></div>
          <div class="detail-card"><span>Language</span><strong>${displayValue(user.languages)}</strong></div>
        </div>
      </div>

      <div class="modal-section">
        <h4>Survey Response Details</h4>
        <div class="modal-grid">
          <div class="detail-card"><span>Attended Program</span><strong>${displayValue(user.attendedProgram, "No")}</strong></div>
          <div class="detail-card"><span>Completed Programs</span><strong>${displayValue(user.completedPrograms, "None Specified")}</strong></div>
          <div class="detail-card"><span>Preksha Vahini Member</span><strong>${displayValue(user.isVahiniMember, "No")}</strong></div>
          <div class="detail-card"><span>Practice Status</span><strong>${displayValue(user.practiceStatus, "No")}</strong></div>
          <div class="detail-card"><span>Practice Days</span><strong>${displayValue(user.practiceDays, "Not Specified")}</strong></div>
          <div class="detail-card"><span>Practice Duration</span><strong>${displayValue(user.practiceDuration, "Not Specified")}</strong></div>
          <div class="detail-card"><span>Practice Types</span><strong>${displayValue(user.practiceTypes, "Not Specified")}</strong></div>
          <div class="detail-card"><span>Uses Meditation App</span><strong>${displayValue(user.usesMeditationApp, "No")}</strong></div>
          <div class="detail-card"><span>Next Goals</span><strong>${displayValue(user.nextGoals, "Not Specified")}</strong></div>
          <div class="detail-card"><span>Needs Guidance</span><strong>${displayValue(user.needsGuidance, "No")}</strong></div>
          <div class="detail-card"><span>Preferred Modes</span><strong>${displayValue(user.preferredModes, "Not Specified")}</strong></div>
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
  if (!analytics || typeof Chart === "undefined") return;

  const practitionerSplitChart = document.getElementById("practitionerSplitChart");
  const practiceStatusChart = document.getElementById("practiceStatusChart");
  const interestChart = document.getElementById("interestChart");
  const cityChart = document.getElementById("cityChart");
  const stateChart = document.getElementById("stateChart");

  if (!practitionerSplitChart || !practiceStatusChart || !interestChart || !cityChart || !stateChart) {
    return;
  }

  safeDestroyChart("practitionerSplit");
  chartInstances.practitionerSplit = new Chart(practitionerSplitChart, {
    type: "doughnut",
    data: {
      labels: ["First Time Attendees", "Existing Practitioners"],
      datasets: [{
        data: [analytics.practitionerSplit?.firstTime ?? 0, analytics.practitionerSplit?.existing ?? 0],
        backgroundColor: ["#d4a14a", "#8f2520"]
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  safeDestroyChart("practiceStatus");
  const pStatus = analytics.practiceStatus || {};
  chartInstances.practiceStatus = new Chart(practiceStatusChart, {
    type: "bar",
    data: {
      labels: ["Regularly", "Sometimes", "Want Restart", "No", "Unknown"],
      datasets: [{
        label: "Practitioners Count",
        data: [pStatus.regularly ?? 0, pStatus.sometimes ?? 0, pStatus.restart ?? 0, pStatus.no ?? 0, pStatus.unknown ?? 0],
        backgroundColor: ["#5e1817", "#8f2520", "#d4a14a", "#766255", "#e6d5b7"]
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  safeDestroyChart("interestSplit");
  const iSplit = analytics.interestSplit || {};
  chartInstances.interestSplit = new Chart(interestChart, {
    type: "pie",
    data: {
      labels: ["Volunteers", "Facilitators", "Trainers"],
      datasets: [{
        data: [iSplit.volunteer ?? 0, iSplit.facilitator ?? 0, iSplit.trainer ?? 0],
        backgroundColor: ["#3d6b3d", "#c8a46b", "#8f2520"]
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  safeDestroyChart("cityParticipation");
  const citiesData = analytics.cityParticipation || [];
  chartInstances.cityParticipation = new Chart(cityChart, {
    type: "bar",
    data: {
      labels: citiesData.map((city) => city.label),
      datasets: [{
        label: "Seekers Count",
        data: citiesData.map((city) => city.count),
        backgroundColor: "#d4a14a"
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false } } }
  });

  safeDestroyChart("stateParticipation");
  const countriesData = analytics.stateParticipation || [];
  chartInstances.stateParticipation = new Chart(stateChart, {
    type: "polarArea",
    data: {
      labels: countriesData.map((country) => country.label),
      datasets: [{
        label: "Countries Count",
        data: countriesData.map((country) => country.count),
        backgroundColor: ["#8f2520", "#d4a14a", "#5e1817", "#c8a46b", "#766255"]
      }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function exportToCsvFile() {
  if (!allUserData.length) {
    alert("No available rows to trigger export.");
    return;
  }

  const columnHeaders = ["Submission ID", "Full Name", "Email", "Phone/Mobile", "Country", "City", "State", "Language", "Submit Time"];
  const outputRows = [columnHeaders.join(",")];

  allUserData.forEach((user) => {
    const serializedRow = [
      `"${displayValue(user.id, "").replace(/"/g, "\"\"")}"`,
      `"${displayValue(user.fullName, "").replace(/"/g, "\"\"")}"`,
      `"${displayValue(user.email, "").replace(/"/g, "\"\"")}"`,
      `"${displayValue(user.mobile, "").replace(/"/g, "\"\"")}"`,
      `"${displayValue(user.country, "").replace(/"/g, "\"\"")}"`,
      `"${displayValue(user.city, "").replace(/"/g, "\"\"")}"`,
      `"${displayValue(user.state, "").replace(/"/g, "\"\"")}"`,
      `"${displayValue(user.languages, "").replace(/"/g, "\"\"")}"`,
      `"${displayValue(user.registrationDate, "").replace(/"/g, "\"\"")}"`
    ];
    outputRows.push(serializedRow.join(","));
  });

  const csvBlob = new Blob([outputRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const downloadLink = document.createElement("a");
  downloadLink.href = URL.createObjectURL(csvBlob);
  downloadLink.setAttribute("download", `Preksha_Community_Report_${new Date().toISOString().slice(0, 10)}.csv`);
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
