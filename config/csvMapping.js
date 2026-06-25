// config/csvMapping.js
module.exports = {
  // Map to the uploaded CSV headers from: data/Preksha users data.csv
  id: ["id", "ID"],
  fullName: ["sadhak_name", "Full Name"],
  registrationDate: ["post_date", "Registration Date", "Submit Time"],
  dateOfBirth: ["dob", "Date of Birth"],
  gender: ["gender", "Gender"],
  mobile: ["mobile", "Mobile", "Phone/Mobile"],
  email: ["email", "Email"],
  country: ["country", "Country"],
  city: ["city", "City"],

  // These columns do not exist in the uploaded CSV, so we keep empty arrays
  // or map to common alternatives if present.
  languages: ["preferred_language", "Language"],
  experience: ["experience"],
  purpose: ["purpose"],
  referredBy: ["referredBy", "Referred By"],

  // Your current backend logic expects these keys:
  // - campsAttended: a numeric text
  // - appPractice: YES/No style
  // - trainerGuidance: YES/No style
  // - completedPrograms / pastCampsFilter: free text
  campsAttended: ["attended_before", "campsAttended", "Number of camps attended ?"],
  appPractice: ["currently_practicing", "appPractice", "Practising via preksha application ?"],
  completedPrograms: ["completedPrograms", "Which programs have you completed?"],
  pastCampsFilter: ["pastCampsFilter", "Past camps - some useful filter"],
  trainerGuidance: ["attended_before", "trainerGuidance", "Would you like to receive guidance from a Preksha trainer/volunteer?"],
  supportOffer: ["supportOffer", "Support Offer - USE AI for smart report"]
};
