const express = require("express");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const csvMapping = require("./config/csvMapping");

const app = express();
const PORT = process.env.PORT || 3003;
const PUBLIC_DIR = path.join(__dirname, "public");
const DASHBOARD_FILE = path.join(__dirname, "index.html");
const DATA_FILE_CANDIDATES = [
  path.join(__dirname, "data.csv"),
  path.join(__dirname, "data", "data.csv"),
  path.join(__dirname, "data", "sampleData.csv")
];

const TRUE_VALUES = new Set(["yes", "1", "true"]);
const FALSE_VALUES = new Set(["no", "0", "false"]);

let store = {
  users: [],
  columns: [],
  stats: null,
  analytics: null,
  mtimeMs: null,
  loadedAt: null,
  sourcePath: null
};

function resolveDataFile() {
  return DATA_FILE_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || DATA_FILE_CANDIDATES[0];
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeBoolean(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
}

function matchColumn(row, aliases = []) {
  const rowKeys = Object.keys(row);
  return (
    aliases.find((alias) => rowKeys.find((key) => key.trim().toLowerCase() === alias.trim().toLowerCase())) || null
  );
}

function getMappedValue(row, key) {
  const aliases = csvMapping[key] || [];
  const matchedAlias = matchColumn(row, aliases);
  if (!matchedAlias) return "";
  const actualKey = Object.keys(row).find(
    (column) => column.trim().toLowerCase() === matchedAlias.trim().toLowerCase()
  );
  return normalizeText(row[actualKey]);
}

function calculateAge(dateOfBirth) {
  const normalizedDob = normalizeText(dateOfBirth);
  if (!normalizedDob) return null;
  const dob = new Date(normalizedDob);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

function practiceLabel(key) {
  return {
    regularly: "Regularly",
    sometimes: "Sometimes",
    restart: "Want Restart",
    no: "No",
    unknown: "Unknown"
  }[key];
}

function resolveProfilePhoto(rawPhoto) {
  const fileName = normalizeText(rawPhoto);
  if (!fileName) return "";
  const candidates = [
    path.join(PUBLIC_DIR, "assets", fileName),
    path.join(__dirname, fileName),
    path.join(__dirname, "assets", fileName)
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  if (!existing) return "";
  if (existing.startsWith(path.join(PUBLIC_DIR, "assets"))) {
    return `/public/assets/${path.basename(existing)}`;
  }
  return "";
}

function normalizeUser(row, index) {
  const fullName = getMappedValue(row, "fullName");
  const campsText = getMappedValue(row, "campsAttended");
  const campsCount = parseInt(campsText, 10);
  
  const appPracticeText = normalizeText(getMappedValue(row, "appPractice")).toLowerCase();
  const guidanceText = normalizeText(getMappedValue(row, "trainerGuidance")).toLowerCase();
  
  const firstTimeAttendee = (!isNaN(campsCount) && campsCount === 0) || campsText === "0" || campsText.includes("0");
  const existingPractitioner = !firstTimeAttendee && campsText !== "";

  let practiceKey = "unknown";
  if (appPracticeText === "yes") {
    practiceKey = "regularly";
  } else if (appPracticeText === "no" && !firstTimeAttendee) {
    practiceKey = "restart";
  } else if (appPracticeText === "no") {
    practiceKey = "no";
  }

  const becomeVolunteer = guidanceText === "yes";
  const needGuidance = guidanceText === "yes";

  return {
    id: getMappedValue(row, "id") || String(index + 1),
    fullName,
    dateOfBirth: getMappedValue(row, "dateOfBirth"),
    age: calculateAge(getMappedValue(row, "dateOfBirth")),
    gender: getMappedValue(row, "gender"),
    mobile: getMappedValue(row, "mobile"),
    email: getMappedValue(row, "email"),
    country: getMappedValue(row, "country"),
    city: getMappedValue(row, "city"),
    state: getMappedValue(row, "state"),
    address: getMappedValue(row, "address"),
    pincode: getMappedValue(row, "pincode"),
    languages: getMappedValue(row, "languages"),
    education: getMappedValue(row, "education"),
    profession: getMappedValue(row, "profession"),
    profilePhoto: resolveProfilePhoto(getMappedValue(row, "profilePhoto")),
    profilePhotoName: getMappedValue(row, "profilePhoto"),
    
    practiceKey,
    becomeVolunteer,
    needGuidance,
    firstTimeAttendee,
    existingPractitioner,
    seekerType: firstTimeAttendee ? "First Time Attendee" : "Existing Practitioner",
    meditationStatus: practiceLabel(practiceKey),
    initials: fullName.split(" ").filter(Boolean).map(n => n[0]).join("").toUpperCase() || "P",
    
    campsAttended: campsText,
    appPractice: getMappedValue(row, "appPractice"),
    completedPrograms: getMappedValue(row, "completedPrograms"),
    pastCampsFilter: getMappedValue(row, "pastCampsFilter"),
    trainerGuidance: getMappedValue(row, "trainerGuidance"),

    interests: [
      { label: "Restart Practice", active: practiceKey === "restart" },
      { label: "Become Volunteer", active: becomeVolunteer === true }
    ],
    programPreferences: [
      { label: "App Practice", active: appPracticeText === "yes" }
    ]
  };
}

function collectCounts(users, field) {
  return users.reduce((accumulator, user) => {
    const value = normalizeText(user[field]);
    if (!value) return accumulator;
    accumulator[value] = (accumulator[value] || 0) + 1;
    return accumulator;
  }, {});
}

function summarizeParticipation(counts, limit = 8) {
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function generateStats(users) {
  const stats = {
    totalRegistrations: users.length,
    firstTimeAttendees: 0,
    activePractitioners: 0,
    wantToRestart: 0,
    volunteerInterested: 0,
    needGuidance: 0
  };

  users.forEach((user) => {
    if (user.firstTimeAttendee) stats.firstTimeAttendees += 1;
    if (user.practiceKey === "regularly") stats.activePractitioners += 1;
    if (user.practiceKey === "restart") stats.wantToRestart += 1;
    if (user.becomeVolunteer === true) stats.volunteerInterested += 1;
    if (user.needGuidance === true) stats.needGuidance += 1;
  });

  return stats;
}

function generateAnalytics(users) {
  const practiceStatus = { regularly: 0, sometimes: 0, no: 0, restart: 0, unknown: 0 };
  let firstTime = 0;
  let existing = 0;
  let volunteer = 0;
  let facilitator = 0;
  let trainer = 0;
  let prefOnline = 0;
  let prefOffline = 0;
  let prefResidential = 0;
  let prefApp = 0;

  users.forEach((user) => {
    practiceStatus[user.practiceKey] = (practiceStatus[user.practiceKey] || 0) + 1;
    if (user.firstTimeAttendee) firstTime += 1;
    if (user.existingPractitioner) existing += 1;
    if (user.becomeVolunteer === true) volunteer += 1;
    if (user.practiceKey === "regularly") prefApp += 1;
  });

  return {
    practitionerSplit: { firstTime, existing },
    practiceStatus,
    interestSplit: { volunteer, facilitator, trainer },
    cityParticipation: summarizeParticipation(collectCounts(users, "city"), 10),
    stateParticipation: summarizeParticipation(collectCounts(users, "state"), 10),
    programPreferences: { online: prefOnline, offline: prefOffline, residential: prefResidential, app: prefApp }
  };
}

function loadCsvData() {
  return new Promise((resolve, reject) => {
    const dataFile = resolveDataFile();

    if (!fs.existsSync(dataFile)) {
      reject(new Error("CSV file not found."));
      return;
    }

    const fileStat = fs.statSync(dataFile);
    if (store.mtimeMs === fileStat.mtimeMs && store.users.length && store.sourcePath === dataFile) {
      resolve(store);
      return;
    }

    const rows = [];
    let columns = [];

    fs.createReadStream(dataFile)
      .pipe(csv())
      .on("headers", (headers) => { columns = headers; })
      .on("data", (row) => { rows.push(row); })
      .on("end", () => {
        const users = rows.map((row, index) => normalizeUser(row, index));
        const stats = generateStats(users);
        const analytics = generateAnalytics(users);

        store = {
          users,
          columns,
          stats,
          analytics,
          mtimeMs: fileStat.mtimeMs,
          loadedAt: new Date().toISOString(),
          sourcePath: dataFile
        };
        resolve(store);
      })
      .on("error", (error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      });
  });
}

function matchesQuery(user, query) {
  const searchTerm = normalizeText(query.search).toLowerCase();
  
  const exactMatch = (field, value) => {
    if (!value || value === "all") return true;
    return normalizeText(user[field]).toLowerCase() === normalizeText(value).toLowerCase();
  };

  const partialMatch = (field, value) => {
    if (!value || value === "all") return true;
    return normalizeText(user[field]).toLowerCase().includes(normalizeText(value).toLowerCase());
  };

  const booleanMatch = (field, value) => {
    if (!value || value === "all") return true;
    const normalized = value.toLowerCase();
    if (normalized === "yes") return user[field] === true || String(user[field]).toLowerCase() === 'yes';
    if (normalized === "no") return user[field] === false || String(user[field]).toLowerCase() === 'no';
    return true;
  };

  const searchMatch = !searchTerm || [user.fullName, user.email, user.city, user.country].join(" ").toLowerCase().includes(searchTerm);

  return (
    searchMatch &&
    exactMatch("gender", query.gender) &&
    exactMatch("city", query.city) &&
    exactMatch("country", query.country) &&
    exactMatch("campsAttended", query.campsAttended) &&
    exactMatch("appPractice", query.appPractice) &&
    partialMatch("completedPrograms", query.completedPrograms) &&
    booleanMatch("becomeVolunteer", query.volunteer) &&
    booleanMatch("needGuidance", query.guidance)
  );
}

function sortUsers(users, sortKey = "fullName-asc") {
  const [field, direction] = normalizeText(sortKey).split("-");
  const multiplier = direction === "desc" ? -1 : 1;
  return [...users].sort((left, right) => {
    const a = normalizeText(left[field]).toLowerCase();
    const b = normalizeText(right[field]).toLowerCase();
    return a.localeCompare(b, undefined, { numeric: true }) * multiplier;
  });
}

function safeUser(user) { return { ...user }; }

app.use("/public", express.static(PUBLIC_DIR));
app.get("/", (req, res) => { res.sendFile(DASHBOARD_FILE); });

app.get("/api/users", async (req, res) => {
  try {
    const data = await loadCsvData();
    const filtered = sortUsers(data.users.filter((user) => matchesQuery(user, req.query)), req.query.sort);
    res.json({ rows: filtered.map(safeUser), total: filtered.length });
  } catch (error) {
    res.status(500).json({ error: error.message, rows: [], total: 0 });
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const data = await loadCsvData();
    const user = data.users.find((entry) => String(entry.id) === String(req.params.id));
    if (!user) return res.status(404).json({ error: "Not found" });
    res.json(safeUser(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const data = await loadCsvData();
    const users = data.users.filter((user) => matchesQuery(user, req.query));
    res.json({ stats: generateStats(users) });
  } catch (error) {
    res.status(500).json({ error: error.message, stats: {} });
  }
});

app.get("/api/cities", async (req, res) => {
  try {
    const data = await loadCsvData();
    const cities = [...new Set(data.users.map((u) => normalizeText(u.city)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    res.json(cities);
  } catch (error) {
    res.status(500).json([]);
  }
});

app.get("/api/countries", async (req, res) => {
  try {
    const data = await loadCsvData();
    const countries = [...new Set(data.users.map((u) => normalizeText(u.country)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    res.json(countries);
  } catch (error) {
    res.status(500).json([]);
  }
});

app.get("/api/analytics", async (req, res) => {
  try {
    const data = await loadCsvData();
    const users = data.users.filter((user) => matchesQuery(user, req.query));
    res.json({ analytics: generateAnalytics(users) });
  } catch (error) {
    res.status(500).json({ error: error.message, analytics: {} });
  }
});

function startServer(portToListen) {
  const serverInstance = app.listen(portToListen, () => {
    console.log(`[Preksha Dashboard] Server running on http://localhost:${portToListen}`);
  });

  serverInstance.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.log(`Port ${portToListen} is busy. Trying port ${portToListen + 1}...`);
      startServer(portToListen + 1);
    } else {
      console.error(`Unexpected server error:`, error);
    }
  });
}

loadCsvData()
  .then(() => { startServer(PORT); })
  .catch((error) => { console.error(`Startup initial verification failed: ${error.message}`); });