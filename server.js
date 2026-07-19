const express = require("express");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const csvMapping = require("./config/csvMapping");

// Allow running CSV parsing even if the user provides a placeholder/HTML file as `preksha.sql`.
// The actual dataset used by this dashboard is still the CSV (data.csv / data/data.csv / data/sampleData.csv).

// NOTE: This project currently loads data from CSV because `preksha.sql` in this repo is not a valid SQL dump.
// The frontend expects the same API contract; backend will still provide it.

const app = express();
const PORT = process.env.PORT || 3003;
const PUBLIC_DIR = path.join(__dirname, "public");
const DASHBOARD_FILE = path.join(__dirname, "index.html");
const DATA_FILE_CANDIDATES = [
  // Primary target data file requested
  path.join(__dirname, "data", "Preksha users data.csv"),

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
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";

  const lowered = normalized.toLowerCase();
  if (lowered === "null" || lowered === "undefined" || normalized === "-") {
    return "";
  }

  return normalized;
}

function toTitleCase(value) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

const CITY_ALIASES = {
  ahemdabad: "Ahmedabad",
  ahmedabad: "Ahmedabad",
  aurangabad: "Chhatrapati Sambhajinagar",
  barpetaroad: "Barpeta Road",
  "barpeta road": "Barpeta Road",
  bangalore: "Bengaluru",
  banglore: "Bengaluru",
  bengaluru: "Bengaluru",
  beawar: "Beawar",
  beawer: "Beawar",
  bombay: "Mumbai",
  "chatrapati sambhajinagar": "Chhatrapati Sambhajinagar",
  "chhatrapati sambhaji nagar aurangabad": "Chhatrapati Sambhajinagar",
  mumbai: "Mumbai",
  gurgaon: "Gurugram",
  gurgoan: "Gurugram",
  gurugram: "Gurugram",
  guwahati: "Guwahati",
  guwhati: "Guwahati",
  kgf: "KGF",
  "k g f": "KGF",
  ladnu: "Ladnun",
  ladnun: "Ladnun",
  "navi mumbai": "Navi Mumbai",
  navimumbai: "Navi Mumbai",
  "new delhi": "Delhi",
  delhi: "Delhi",
  "sahib ganj": "Sahibganj",
  sahibganj: "Sahibganj",
  sardarshahar: "Sardarshahar",
  sardarshahr: "Sardarshahar",
  sardarshar: "Sardarshahar",
  sardrarshaahr: "Sardarshahar",
  shardarshar: "Sardarshahar",
  surat: "Surat",
  "surat sadulpur": "Rajgarh, Churu",
  "thane bhiwandi": "Thane",
  thane: "Thane",
  "vasai west": "Vasai West",
  "sri ganganagar": "Sri Ganganagar",
  sriganganagar: "Sri Ganganagar",
  walajabad: "Walajabad",
  walajahbad: "Walajabad"
};

const COUNTRY_ALIASES = {
  in: "India",
  ind: "India",
  indian: "India",
  india: "India",
  "india bharat": "India",
  usa: "United States",
  us: "United States",
  "united states of america": "United States",
  uae: "United Arab Emirates",
  uk: "United Kingdom",
  "uk kenya": "United Kingdom / Kenya",
  espana: "Spain",
  peru: "Peru"
};

const INVALID_COUNTRY_KEYS = new Set([
  "mumbai",
  "maharashtra",
  "gujarat",
  "madhya pradesh",
  "punjab",
  "110068",
  "520002"
]);

function normalizeLocationKey(value) {
  return normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[().-]/g, " ")
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function canonicalizeLocationName(rawValue) {
  const cleaned = normalizeText(rawValue)
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\.+$/g, "");

  if (!cleaned || cleaned.toLowerCase() === "null") {
    return "";
  }

  const normalizedKey = normalizeLocationKey(cleaned);
  if (CITY_ALIASES[normalizedKey]) {
    return CITY_ALIASES[normalizedKey];
  }

  return cleaned
    .split(",")
    .map((part) => toTitleCase(part))
    .join(", ");
}

function canonicalizeCountryName(rawValue) {
  const cleaned = normalizeText(rawValue)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  const lowerCleaned = cleaned.toLowerCase();
  if (/^\+?\d[\d\s-]{6,}$/.test(cleaned)) {
    return "";
  }

  const normalizedKey = lowerCleaned
    .replace(/[.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (INVALID_COUNTRY_KEYS.has(normalizedKey)) {
    return "";
  }

  if (COUNTRY_ALIASES[normalizedKey]) {
    return COUNTRY_ALIASES[normalizedKey];
  }

  if (cleaned.includes("/")) {
    return cleaned
      .split("/")
      .map((part) => {
        const normalizedPart = part.trim().toLowerCase();
        return COUNTRY_ALIASES[normalizedPart] || toTitleCase(part.trim());
      })
      .join(" / ");
  }

  return toTitleCase(cleaned);
}

function buildUniqueCanonicalCities(cityValues) {
  const uniqueCities = new Map();

  cityValues.forEach((value) => {
    const canonicalCity = canonicalizeLocationName(value);
    if (!canonicalCity) return;

    const normalizedKey = normalizeLocationKey(canonicalCity);
    if (!normalizedKey || uniqueCities.has(normalizedKey)) return;
    uniqueCities.set(normalizedKey, canonicalCity);
  });

  return [...uniqueCities.values()].sort((left, right) => left.localeCompare(right));
}

function buildUniqueCanonicalCountries(countryValues) {
  const uniqueCountries = new Map();

  countryValues.forEach((value) => {
    const canonicalCountry = canonicalizeCountryName(value);
    if (!canonicalCountry) return;

    const normalizedKey = canonicalCountry.toLowerCase();
    if (!normalizedKey || uniqueCountries.has(normalizedKey)) return;
    uniqueCountries.set(normalizedKey, canonicalCountry);
  });

  return [...uniqueCountries.values()].sort((left, right) => left.localeCompare(right));
}

function isDuplicateCityName(existingCities, candidateCity) {
  const normalizedCandidate = canonicalizeLocationName(candidateCity);
  if (!normalizedCandidate) return false;
  return existingCities.some((city) => canonicalizeLocationName(city) === normalizedCandidate);
}

function parsePracticeStatus(rawValue) {
  const normalized = normalizeText(rawValue).toLowerCase();
  if (!normalized || normalized === "null") {
    return "unknown";
  }
  if (normalized.startsWith("yes")) {
    if (normalized.includes("sometimes")) return "sometimes";
    return "regularly";
  }
  if (normalized.includes("restart")) {
    return "restart";
  }
  if (normalized === "no") {
    return "no";
  }
  return "unknown";
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
  const aliases = csvMapping[key] || [key];
  const matchedAlias = matchColumn(row, aliases);
  if (!matchedAlias) return normalizeText(row[key]);
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
  if (/^https?:\/\//i.test(fileName)) {
    return fileName;
  }
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

function buildFullName(row) {
  const firstName = getMappedValue(row, "firstName");
  const lastName = getMappedValue(row, "lastName");

  if (!firstName && !lastName) {
    return getMappedValue(row, "fullName");
  }

  if (firstName && lastName) {
    const normalizedFirst = firstName.toLowerCase();
    const normalizedLast = lastName.toLowerCase();

    if (normalizedFirst === normalizedLast) {
      return firstName;
    }

    if (normalizedFirst.endsWith(` ${normalizedLast}`)) {
      return firstName;
    }

    return `${firstName} ${lastName}`;
  }

  return firstName || lastName;
}

function countAttendedCamps(rawValue, attendedBefore) {
  const campsData = normalizeText(rawValue);
  if (campsData) {
    const matches = campsData.match(/camp\s*\d+/gi);
    if (matches && matches.length) {
      return String(Math.min(matches.length, 4));
    }

    return "1";
  }

  return normalizeText(attendedBefore).toLowerCase() === "yes" ? "1" : "";
}

function parseInterestFlags(rawValue) {
  const normalized = normalizeText(rawValue).toLowerCase();
  return {
    volunteer: normalized.includes("volunteer"),
    facilitator: normalized.includes("facilitator"),
    trainer: normalized.includes("trainer")
  };
}

function parsePreferenceFlags(rawValue) {
  const normalized = normalizeText(rawValue).toLowerCase();
  return {
    online: normalized.includes("online"),
    offline: normalized.includes("offline"),
    residential: normalized.includes("residential"),
    app: normalized.includes("app")
  };
}

function normalizeOptionValue(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[–-]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSelectedOptions(rawValue, options) {
  const normalizedRaw = normalizeOptionValue(rawValue);
  if (!normalizedRaw) return [];

  const matched = options.filter((option) => normalizedRaw.includes(normalizeOptionValue(option)));
  if (matched.length) return matched;

  return ["Other"].filter((option) => options.includes(option));
}

const PROGRAM_OPTIONS = [
  "Introductory session",
  "1-day workshop",
  "2-day workshop",
  "8-day residential camp",
  "Online course",
  "Facilitator training",
  "Trainer training",
  "Other"
];

const PRACTICE_TYPE_OPTIONS = [
  "Kayotsarg",
  "Sharir Preksha",
  "Mantra Preksha",
  "Samtaal Shvas Preksha",
  "Chaitanya Kendra Preksha",
  "Anupreksha",
  "Dirgh Shvas Preksha",
  "Leshya Dhyan",
  "Asana / Pranayama",
  "Other"
];

const NEXT_GOAL_OPTIONS = [
  "Restart daily practice",
  "Attend online workshop",
  "Attend residential camp",
  "Become volunteer",
  "Become facilitator",
  "Become trainer",
  "Help organize local sessions"
];

const PREFERRED_MODE_OPTIONS = [
  "Online",
  "Offline in my city",
  "Residential camp",
  "App-based practice"
];

function normalizePracticeDuration(rawValue) {
  const normalized = normalizeOptionValue(rawValue);
  if (!normalized) return "";
  if (normalized.includes("less than 10")) return "Less than 10 minutes";
  if (normalized.includes("10 - 30") || normalized.includes("10-30")) return "10–30 minutes";
  if (normalized.includes("31 - 60") || normalized.includes("31-60")) return "31–60 minutes";
  if (normalized.includes("1 - 3") || normalized.includes("1-3")) return "1–3 hours";
  if (normalized.includes("3+")) return "3+ hours";
  return normalizeText(rawValue);
}

function normalizePracticeDays(rawValue) {
  const normalized = normalizeOptionValue(rawValue);
  if (!normalized) return "";
  if (normalized.includes("1-9")) return "1–9 days";
  if (normalized.includes("10-19")) return "10–19 days";
  if (normalized.includes("20-24")) return "20–24 days";
  if (normalized.includes("25+")) return "25+ days";
  return normalizeText(rawValue);
}

function practiceStatusLabel(key) {
  return {
    regularly: "Yes, regularly",
    sometimes: "Yes, sometimes",
    no: "No",
    restart: "I want to restart",
    unknown: ""
  }[key] || "";
}

function normalizeUser(row, index) {
  const fullName = buildFullName(row);
  const guidanceText = normalizeText(getMappedValue(row, "trainerGuidance")).toLowerCase();
  const attendedBefore = normalizeText(getMappedValue(row, "attendedBefore")).toLowerCase();
  const currentlyPracticing = normalizeText(getMappedValue(row, "currentlyPracticing"));
  const vahiniMember = getMappedValue(row, "vahiniMember");
  const practiceDays = normalizePracticeDays(getMappedValue(row, "practiceDays"));
  const practiceDuration = normalizePracticeDuration(getMappedValue(row, "practiceDuration"));
  const completedPrograms = extractSelectedOptions(getMappedValue(row, "completedPrograms"), PROGRAM_OPTIONS);
  const practiceTypes = extractSelectedOptions(getMappedValue(row, "practiceTypes"), PRACTICE_TYPE_OPTIONS);
  const nextAction = getMappedValue(row, "nextAction");
  const preferredMode = getMappedValue(row, "preferredMode");
  const nextGoals = extractSelectedOptions(nextAction, NEXT_GOAL_OPTIONS);
  const preferredModes = extractSelectedOptions(preferredMode, PREFERRED_MODE_OPTIONS);
  const interests = parseInterestFlags(nextAction);
  const preferences = parsePreferenceFlags(preferredMode);
  const practiceKey = parsePracticeStatus(currentlyPracticing);
  const firstTimeAttendee = attendedBefore === "no";
  const activePractitioner = practiceKey === "regularly" || practiceKey === "sometimes";
  const campsAttended = countAttendedCamps(getMappedValue(row, "campsData"), attendedBefore);
  const becomeVolunteer = interests.volunteer;
  const needGuidance = guidanceText === "yes";

  return {
    id: getMappedValue(row, "id") || String(index + 1),
    fullName,
    registrationDate: getMappedValue(row, "registrationDate"),
    dateOfBirth: getMappedValue(row, "dateOfBirth"),
    age: calculateAge(getMappedValue(row, "dateOfBirth")),
    gender: getMappedValue(row, "gender"),
    mobile: getMappedValue(row, "mobile"),
    email: getMappedValue(row, "email"),
    country: canonicalizeCountryName(getMappedValue(row, "country")),
    city: canonicalizeLocationName(getMappedValue(row, "city")),
    state: getMappedValue(row, "state"),
    address: getMappedValue(row, "address"),
    pincode: getMappedValue(row, "pincode"),
    languages: getMappedValue(row, "languages"),
    education: getMappedValue(row, "education"),
    profession: getMappedValue(row, "profession"),
    profilePhoto: resolveProfilePhoto(getMappedValue(row, "profilePhoto")),
    profilePhotoName: getMappedValue(row, "profilePhoto"),
    
    practiceKey,
    attendedProgram: attendedBefore === "yes" ? "Yes" : attendedBefore === "no" ? "No" : "",
    isVahiniMember: vahiniMember,
    practiceStatus: practiceStatusLabel(practiceKey),
    practiceDays,
    practiceDuration,
    practiceTypes,
    usesMeditationApp: getMappedValue(row, "appPractice"),
    nextGoals,
    needsGuidance: getMappedValue(row, "trainerGuidance"),
    preferredModes,
    becomeVolunteer,
    needGuidance,
    facilitatorInterested: interests.facilitator,
    trainerInterested: interests.trainer,
    firstTimeAttendee,
    activePractitioner,
    seekerType: firstTimeAttendee ? "First Time Attendee" : "Existing Practitioner",
    meditationStatus: practiceLabel(practiceKey),
    initials: fullName.split(" ").filter(Boolean).map(n => n[0]).join("").toUpperCase() || "P",

    campsAttended,
    appPractice: getMappedValue(row, "appPractice"),
    completedPrograms,
    completedProgramsText: completedPrograms.join(", "),
    pastCampsFilter: getMappedValue(row, "pastCampsFilter"),
    trainerGuidance: getMappedValue(row, "trainerGuidance"),
    nextAction,
    preferredMode,
    supportOffer: getMappedValue(row, "supportOffer"),
    preferenceOnline: preferences.online,
    preferenceOffline: preferences.offline,
    preferenceResidential: preferences.residential,
    preferenceApp: preferences.app
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
    if (user.activePractitioner) stats.activePractitioners += 1;
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
    else existing += 1;
    if (user.becomeVolunteer === true) volunteer += 1;
    if (user.facilitatorInterested === true) facilitator += 1;
    if (user.trainerInterested === true) trainer += 1;
    if (user.preferenceOnline === true) prefOnline += 1;
    if (user.preferenceOffline === true) prefOffline += 1;
    if (user.preferenceResidential === true) prefResidential += 1;
    if (user.preferenceApp === true) prefApp += 1;
  });

  return {
    practitionerSplit: { firstTime, existing },
    practiceStatus,
    interestSplit: { volunteer, facilitator, trainer },
    cityParticipation: summarizeParticipation(collectCounts(users, "city"), 10),
    stateParticipation: summarizeParticipation(collectCounts(users, "country"), 10),
    programPreferences: { online: prefOnline, offline: prefOffline, residential: prefResidential, app: prefApp }
  };
}

function loadCsvData() {
  return new Promise((resolve, reject) => {
    const dataFile = resolveDataFile();

    if (!fs.existsSync(dataFile)) {
      reject(new Error(`CSV file not found. Checked: ${dataFile}`));
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

  const multiValueMatch = (field, value) => {
    if (!value || value === "all") return true;
    const selectedValues = Array.isArray(value) ? value : [value];
    const userValues = Array.isArray(user[field]) ? user[field].map((item) => normalizeText(item).toLowerCase()) : [];
    return selectedValues.every((selectedValue) => userValues.includes(normalizeText(selectedValue).toLowerCase()));
  };

  const booleanMatch = (field, value) => {
    if (!value || value === "all") return true;
    const normalized = value.toLowerCase();
    if (normalized === "yes") return user[field] === true || String(user[field]).toLowerCase() === 'yes';
    if (normalized === "no") return user[field] === false || String(user[field]).toLowerCase() === 'no';
    return true;
  };

  const queryCityNormalized = query.city && query.city !== "all" ? canonicalizeLocationName(query.city) : null;
  const cityMatch = !queryCityNormalized || user.city === queryCityNormalized;

  const searchMatch = !searchTerm || [user.fullName, user.email, user.city, user.country].join(" ").toLowerCase().includes(searchTerm);

  return (
    searchMatch &&
    exactMatch("gender", query.gender) &&
    cityMatch &&
    exactMatch("country", query.country) &&
    exactMatch("attendedProgram", query.attendedProgram) &&
    multiValueMatch("completedPrograms", query.completedPrograms) &&
    exactMatch("isVahiniMember", query.isVahiniMember) &&
    exactMatch("practiceStatus", query.practiceStatus) &&
    exactMatch("practiceDays", query.practiceDays) &&
    exactMatch("practiceDuration", query.practiceDuration) &&
    multiValueMatch("practiceTypes", query.practiceTypes) &&
    exactMatch("usesMeditationApp", query.usesMeditationApp) &&
    multiValueMatch("nextGoals", query.nextGoals) &&
    exactMatch("needsGuidance", query.needsGuidance) &&
    multiValueMatch("preferredModes", query.preferredModes) &&
    exactMatch("campsAttended", query.campsAttended) &&
    exactMatch("appPractice", query.appPractice) &&
    partialMatch("completedProgramsText", query.completedProgramsText) &&
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
    const cities = buildUniqueCanonicalCities(data.users.map((u) => u.city));
    res.json(cities);
  } catch (error) {
    res.status(500).json([]);
  }
});

app.get("/api/cities/validate", async (req, res) => {
  try {
    const data = await loadCsvData();
    const inputCity = normalizeText(req.query.city);
    const existingCities = data.users.map((user) => user.city);
    const canonicalCity = canonicalizeLocationName(inputCity);

    res.json({
      inputCity,
      canonicalCity,
      duplicate: isDuplicateCityName(existingCities, inputCity)
    });
  } catch (error) {
    res.status(500).json({ inputCity: "", canonicalCity: "", duplicate: false });
  }
});

app.get("/api/countries", async (req, res) => {
  try {
    const data = await loadCsvData();
    const countries = buildUniqueCanonicalCountries(data.users.map((u) => u.country));
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
