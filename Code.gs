const SHEET_PLAYERS = 'Players';
const SHEET_VERSION_VOTES = 'VersionVotes';
const SHEET_VERSION_RESULTS = 'VersionResults';
const SHEET_VERSION_STATUS_LOG = 'VersionStatusLog';
const SHEET_RATING_CODES = 'RatingCodes';
const BACKEND_BUILD = 'ratings-local-time-display-2026-05-03';
const CODE_EXPIRY_HOURS = 24;
const CODE_RESEND_COOLDOWN_MINUTES = 2;
const ADMIN_RECEIPT_EMAILS = [
  'dxb99.clan@gmail.com',
  'arshadfahim@gmail.com'
];

function isValidAdmin(password){
  return password === "UT4L!FE";
}

function isRatingsLocked(){
  return PropertiesService
    .getScriptProperties()
    .getProperty("RATINGS_LOCKED") === "true";
}

function setRatingsLockedValue(locked){
  PropertiesService
    .getScriptProperties()
    .setProperty("RATINGS_LOCKED", locked ? "true" : "false");
}

function doGet(){
  return json({ ok:true });
}

function doPost(e){
  const data = JSON.parse(e.postData.contents);
  const action = data.action;

  if(action === "getInitialData") return json(getInitialData());
  if(action === "getResults"){
    refreshAllVersionResults();
    return json({
      ok:true,
      backendBuild:BACKEND_BUILD,
      ratingsLocked:isRatingsLocked(),
      results:getComparisonResults()
    });
  }
  if(action === "getRaterSubmission") return json(getRaterSubmission(data));
  if(action === "getStatus") return json({
    ok:true,
    ratingsLocked:isRatingsLocked(),
    status:getStatusRows()
  });
  if(action === "getRaterVerificationStatus") return json(getRaterVerificationStatus(data));
  if(action === "requestRatingCode") return json(requestRatingCode(data));
  if(action === "verifyRatingCode") return json(verifyRatingCode(data));
  if(action === "clearVersionSubmission") return json(clearVersionSubmission(data));
  if(action === "submitVersionRatings") return json(submitVersionRatings(data));
  if(action === "setRatingsLock") return json(setRatingsLock(data));
  if(action === "applyFinalRatingsToPlayers") return json(applyFinalRatingsToPlayers(data));
  if(action === "setupSheets") return json(setupSheets());

  return json({ ok:false, error:"Unknown action" });
}

function json(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name){
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function getOrCreateSheet(name, headers){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);

  if(!sheet){
    sheet = ss.insertSheet(name);
  }

  if(headers && headers.length){
    if(sheet.getLastRow() === 0){
      sheet.appendRow(headers);
    }else{
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  return sheet;
}

function formatDateColumns(){
  const dateTimeFormat = "m/d/yyyy h:mm:ss AM/PM";
  const players = getSheet(SHEET_PLAYERS);
  const votes = getSheet(SHEET_VERSION_VOTES);
  const results = getSheet(SHEET_VERSION_RESULTS);
  const statusLog = getSheet(SHEET_VERSION_STATUS_LOG);
  const ratingCodes = getSheet(SHEET_RATING_CODES);

  if(players && players.getLastRow() > 1){
    players.getRange(2, 13, players.getLastRow() - 1, 1).setNumberFormat(dateTimeFormat);
  }

  if(votes && votes.getLastRow() > 1){
    votes.getRange(2, 1, votes.getLastRow() - 1, 1).setNumberFormat(dateTimeFormat);
  }

  if(results && results.getLastRow() > 1){
    results.getRange(2, 7, results.getLastRow() - 1, 1).setNumberFormat(dateTimeFormat);
  }

  if(statusLog && statusLog.getLastRow() > 1){
    statusLog.getRange(2, 1, statusLog.getLastRow() - 1, 1).setNumberFormat(dateTimeFormat);
  }

  if(ratingCodes && ratingCodes.getLastRow() > 1){
    ratingCodes.getRange(2, 4, ratingCodes.getLastRow() - 1, 4).setNumberFormat(dateTimeFormat);
  }
}

function getVoteHeaders(){
  return [
    "Timestamp",
    "Version",
    "Rater",
    "RatedPlayer",
    "Overall",
    "Elimination",
    "Blitz",
    "CTF",
    "Combat",
    "Communication",
    "Decision",
    "Awareness",
    "Movement",
    "Impact",
    "FinalRating"
  ];
}

function getResultHeaders(){
  return [
    "Version",
    "Player",
    "AverageRating",
    "MedianRating",
    "VoteCount",
    "WeightedScore",
    "UpdatedAt"
  ];
}

function getStatusLogHeaders(){
  return [
    "Timestamp",
    "Version",
    "Rater",
    "Action"
  ];
}

function getRatingCodeHeaders(){
  return [
    "PlayerName",
    "Email",
    "Code",
    "CreatedAt",
    "ExpiresAt",
    "LastSentAt",
    "VerifiedAt"
  ];
}

function getPlayerHeaders(){
  return [
    "Name",
    "Skill",
    "Active",
    "FinalRatingMethod",
    "FinalRating",
    "V1Average",
    "V1Median",
    "V2Average",
    "V2Median",
    "V3Average",
    "V3Median",
    "V3Weighted",
    "RatingsAppliedAt",
    "Email"
  ];
}

function setupSheets(){
  getOrCreateSheet(SHEET_PLAYERS, getPlayerHeaders());
  getOrCreateSheet(SHEET_VERSION_VOTES, getVoteHeaders());
  getOrCreateSheet(SHEET_VERSION_RESULTS, getResultHeaders());
  getOrCreateSheet(SHEET_VERSION_STATUS_LOG, getStatusLogHeaders());
  getOrCreateSheet(SHEET_RATING_CODES, getRatingCodeHeaders());
  formatDateColumns();

  return {
    ok:true,
    sheets:[SHEET_PLAYERS, SHEET_VERSION_VOTES, SHEET_VERSION_RESULTS, SHEET_RATING_CODES]
  };
}

function getPlayers(){
  const sheet = getSheet(SHEET_PLAYERS);

  if(!sheet || sheet.getLastRow() < 2){
    return [];
  }

  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), getPlayerHeaders().length))
    .getValues();

  return rows
    .filter(row => row[0] && row[2] !== false)
    .map(row => ({
      name: row[0].toString().trim(),
      skill: Number(row[1]) || 0,
      hasEmail: !!row[13],
      maskedEmail: maskEmail(row[13])
    }));
}

function getPlayerRecord(name){
  const cleanName = name ? name.toString().trim() : "";
  const sheet = getSheet(SHEET_PLAYERS);

  if(!cleanName || !sheet || sheet.getLastRow() < 2){
    return null;
  }

  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), getPlayerHeaders().length))
    .getValues();

  for(let i = 0; i < rows.length; i++){
    const rowName = rows[i][0] ? rows[i][0].toString().trim() : "";
    const active = rows[i][2] !== false;

    if(active && rowName.toLowerCase() === cleanName.toLowerCase()){
      return {
        name: rowName,
        email: rows[i][13] ? rows[i][13].toString().trim() : ""
      };
    }
  }

  return null;
}

function maskEmail(email){
  const clean = email ? email.toString().trim() : "";
  const parts = clean.split("@");

  if(parts.length !== 2 || !parts[0] || !parts[1]){
    return "";
  }

  const name = parts[0];
  const first = name.charAt(0);
  const last = name.length > 1 ? name.charAt(name.length - 1) : "";
  const maskedName = first + "****" + last;

  return maskedName + "@" + parts[1];
}

function normalizeEmail(email){
  return email ? email.toString().trim().toLowerCase() : "";
}

function generateRatingCode(){
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getActiveCodeRow(playerName){
  const sheet = getOrCreateSheet(SHEET_RATING_CODES, getRatingCodeHeaders());

  if(sheet.getLastRow() < 2){
    return null;
  }

  const now = new Date();
  const normalizedPlayer = playerName.toString().trim().toLowerCase();
  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, getRatingCodeHeaders().length)
    .getValues();

  for(let i = rows.length - 1; i >= 0; i--){
    const row = rows[i];
    const rowPlayer = row[0] ? row[0].toString().trim().toLowerCase() : "";
    const expiresAt = row[4] instanceof Date ? row[4] : new Date(row[4]);

    if(rowPlayer === normalizedPlayer && !isNaN(expiresAt.getTime()) && expiresAt > now){
      return {
        rowNumber: i + 2,
        playerName: row[0],
        email: row[1],
        code: row[2] ? row[2].toString().trim() : "",
        createdAt: row[3],
        expiresAt: expiresAt,
        lastSentAt: row[5] instanceof Date ? row[5] : new Date(row[5]),
        verifiedAt: row[6]
      };
    }
  }

  return null;
}

function getRaterVerificationStatus(data){
  const playerName = data.playerName ? data.playerName.toString().trim() : "";
  const player = getPlayerRecord(playerName);

  if(!player){
    return { ok:false, error:"Select a valid player." };
  }

  if(!player.email){
    return {
      ok:true,
      playerName:player.name,
      hasEmail:false,
      maskedEmail:"",
      hasActiveCode:false,
      canResend:false,
      resendSecondsRemaining:0,
      message:"No registered email found for this player. Contact admin."
    };
  }

  const foundCode = getActiveCodeRow(player.name);
  const activeCode = foundCode && normalizeEmail(foundCode.email) === normalizeEmail(player.email)
    ? foundCode
    : null;
  const now = new Date();
  let canResend = false;
  let resendSecondsRemaining = 0;

  if(activeCode){
    const lastSent = activeCode.lastSentAt instanceof Date && !isNaN(activeCode.lastSentAt.getTime())
      ? activeCode.lastSentAt
      : activeCode.createdAt;
    const nextAllowed = new Date(lastSent.getTime() + CODE_RESEND_COOLDOWN_MINUTES * 60000);

    canResend = now >= nextAllowed;
    resendSecondsRemaining = canResend ? 0 : Math.ceil((nextAllowed - now) / 1000);
  }

  return {
    ok:true,
    playerName:player.name,
    hasEmail:true,
    maskedEmail:maskEmail(player.email),
    hasActiveCode:!!activeCode,
    expiresAt:activeCode ? activeCode.expiresAt : "",
    canResend:!!activeCode && canResend,
    resendSecondsRemaining:resendSecondsRemaining
  };
}

function sendRatingCodeEmail(email, code){
  const body =
    "Your DXB99 verification code is:\n\n" +
    code + "\n\n" +
    "This code expires in 24 hours.\n\n" +
    "Your vote helps keep the teams fair and balanced for everyone.";

  MailApp.sendEmail({
    to: email,
    subject: "DXB99 Verification Code",
    body: body,
    name: "DXB99"
  });
}

function formatReceiptDate(dateValue){
  return Utilities.formatDate(
    dateValue,
    Session.getScriptTimeZone(),
    "M/d/yyyy h:mm:ss a"
  );
}

function getReceiptVersionTitle(version){
  if(Number(version) === 1) return "Version 1";
  if(Number(version) === 2) return "Version 2";
  return "Version 3";
}

function buildSubmissionReceiptBody(options){
  const version = Number(options.version);
  const actionLabel = options.action === "update" ? "Update" : "Submit";
  const audience = options.audience || "player";
  const rows = options.rows || [];

  let body = "";

  if(audience === "admin"){
    body += "A DXB99 rating submission was saved.\n\n";
  }else{
    body += "Your DXB99 " + getReceiptVersionTitle(version) + " ratings were saved successfully.\n\n";
  }

  body += "Rater: " + options.rater + "\n";

  if(audience === "admin" && options.raterEmail){
    body += "Rater Email: " + options.raterEmail + "\n";
  }

  body += "Version: " + version + "\n";
  body += "Action: " + actionLabel + "\n";
  body += "Submitted at: " + formatReceiptDate(options.submittedAt) + "\n\n";
  body += "Ratings submitted:\n\n";

  rows.forEach(row => {
    body += row[3] + "\n";

    if(version === 1){
      body += "Overall: " + row[4] + "\n";
    }

    if(version === 2){
      body += "Elimination: " + row[5] + "\n";
      body += "Blitz: " + row[6] + "\n";
      body += "CTF: " + row[7] + "\n";
    }

    if(version === 3){
      body += "Combat Skills: " + row[8] + "\n";
      body += "Communication / Status Updates: " + row[9] + "\n";
      body += "Decision Making: " + row[10] + "\n";
      body += "Map Awareness: " + row[11] + "\n";
      body += "Movement / Speed: " + row[12] + "\n";
      body += "Team Impact: " + row[13] + "\n";
    }

    body += "Final Rating: " + row[14] + "\n\n";
  });

  if(audience !== "admin"){
    body += "Your submission has been recorded.";
  }

  return body;
}

function sendSubmissionReceiptEmails(options){
  const result = {
    playerEmailSent:false,
    adminEmailSent:false
  };

  const versionTitle = getReceiptVersionTitle(options.version);
  const actionLabel = options.action === "update" ? "Update" : "Submit";

  if(options.emailPlayerCopy && options.raterEmail){
    try{
      MailApp.sendEmail({
        to: options.raterEmail,
        subject: "DXB99 Ratings Saved - " + versionTitle,
        body: buildSubmissionReceiptBody({
          version: options.version,
          action: options.action,
          rater: options.rater,
          raterEmail: options.raterEmail,
          submittedAt: options.submittedAt,
          rows: options.rows,
          audience: "player"
        }),
        name: "DXB99"
      });

      result.playerEmailSent = true;
    }catch(err){
      result.playerEmailError = err.message || "Player receipt email failed";
    }
  }

  const adminEmails = ADMIN_RECEIPT_EMAILS.filter(email => email && email.indexOf("@") !== -1);

  if(adminEmails.length){
    try{
      MailApp.sendEmail({
        to: adminEmails.join(","),
        subject: "DXB99 Ratings " + actionLabel + " - " + versionTitle + " - " + options.rater,
        body: buildSubmissionReceiptBody({
          version: options.version,
          action: options.action,
          rater: options.rater,
          raterEmail: options.raterEmail,
          submittedAt: options.submittedAt,
          rows: options.rows,
          audience: "admin"
        }),
        name: "DXB99"
      });

      result.adminEmailSent = true;
    }catch(err){
      result.adminEmailError = err.message || "Admin receipt email failed";
    }
  }

  return result;
}

function requestRatingCode(data){
  const playerName = data.playerName ? data.playerName.toString().trim() : "";
  const player = getPlayerRecord(playerName);

  if(!player){
    return { ok:false, error:"Select a valid player." };
  }

  if(!player.email){
    return { ok:false, error:"No registered email found for this player. Contact admin." };
  }

  const sheet = getOrCreateSheet(SHEET_RATING_CODES, getRatingCodeHeaders());
  const now = new Date();
  let activeCode = getActiveCodeRow(player.name);

  if(activeCode && normalizeEmail(activeCode.email) !== normalizeEmail(player.email)){
    activeCode = null;
  }

  if(activeCode){
    const lastSent = activeCode.lastSentAt instanceof Date && !isNaN(activeCode.lastSentAt.getTime())
      ? activeCode.lastSentAt
      : activeCode.createdAt;
    const nextAllowed = new Date(lastSent.getTime() + CODE_RESEND_COOLDOWN_MINUTES * 60000);

    if(now < nextAllowed){
      return {
        ok:false,
        error:"A code was already sent recently. Please wait before resending.",
        resendSecondsRemaining:Math.ceil((nextAllowed - now) / 1000)
      };
    }

    sendRatingCodeEmail(player.email, activeCode.code);
    sheet.getRange(activeCode.rowNumber, 6).setValue(now);
    formatDateColumns();

    return {
      ok:true,
      resent:true,
      maskedEmail:maskEmail(player.email),
      expiresAt:activeCode.expiresAt,
      message:"Verification code resent."
    };
  }

  const code = generateRatingCode();
  const expiresAt = new Date(now.getTime() + CODE_EXPIRY_HOURS * 60 * 60000);

  sheet.appendRow([
    player.name,
    player.email,
    code,
    now,
    expiresAt,
    now,
    ""
  ]);

  sendRatingCodeEmail(player.email, code);
  formatDateColumns();

  return {
    ok:true,
    resent:false,
    maskedEmail:maskEmail(player.email),
    expiresAt:expiresAt,
    message:"Verification code sent."
  };
}

function verifyRatingCode(data){
  const playerName = data.playerName ? data.playerName.toString().trim() : "";
  const code = data.code ? data.code.toString().trim() : "";
  const player = getPlayerRecord(playerName);

  if(!player){
    return { ok:false, error:"Select a valid player." };
  }

  if(!code){
    return { ok:false, error:"Enter your verification code." };
  }

  const activeCode = getActiveCodeRow(player.name);

  if(!activeCode || normalizeEmail(activeCode.email) !== normalizeEmail(player.email)){
    return { ok:false, error:"No active verification code found. Request a code first." };
  }

  if(activeCode.code !== code){
    return { ok:false, error:"Invalid verification code." };
  }

  const sheet = getOrCreateSheet(SHEET_RATING_CODES, getRatingCodeHeaders());
  sheet.getRange(activeCode.rowNumber, 7).setValue(new Date());
  formatDateColumns();

  return {
    ok:true,
    playerName:player.name,
    maskedEmail:maskEmail(player.email),
    expiresAt:activeCode.expiresAt
  };
}

function validateRaterCode(playerName, code){
  const player = getPlayerRecord(playerName);

  if(!player){
    return { ok:false, error:"Select a valid player." };
  }

  if(!player.email){
    return { ok:false, error:"No registered email found for this player. Contact admin." };
  }

  if(!code){
    return { ok:false, error:"Verify your email code before saving ratings." };
  }

  const activeCode = getActiveCodeRow(player.name);

  if(!activeCode || normalizeEmail(activeCode.email) !== normalizeEmail(player.email)){
    return { ok:false, error:"No active verification code found. Request a code first." };
  }

  if(activeCode.code !== code.toString().trim()){
    return { ok:false, error:"Invalid verification code." };
  }

  return { ok:true };
}

function getFinalRatingMethodLabel(method){
  const labels = {
    v1Avg: "Version 1 Average",
    v1Med: "Version 1 Median",
    v2Avg: "Version 2 Average",
    v2Med: "Version 2 Median",
    v3Avg: "Version 3 Average",
    v3Med: "Version 3 Median",
    weighted: "Version 3 Weighted"
  };

  return labels[method] || "";
}

function getRatingMethodValue(row, method){
  if(!row) return null;

  const map = {
    v1Avg: row.v1Avg,
    v1Med: row.v1Med,
    v2Avg: row.v2Avg,
    v2Med: row.v2Med,
    v3Avg: row.v3Avg,
    v3Med: row.v3Med,
    weighted: row.weighted
  };

  return normalizeNumber(map[method]);
}

function createPlayersBackup(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const source = getOrCreateSheet(SHEET_PLAYERS, getPlayerHeaders());
  const stamp = Utilities
    .formatDate(new Date(), ss.getSpreadsheetTimeZone(), "MMMMyyyy")
    .toUpperCase();
  const baseName = "PlayersBackup_" + stamp;
  let backupName = baseName;
  let suffix = 2;

  while(ss.getSheetByName(backupName)){
    backupName = baseName + "_" + suffix;
    suffix++;
  }

  source.copyTo(ss).setName(backupName);

  return backupName;
}

function buildResultRowsForPlayers(){
  const comparison = getComparisonResults();
  const byVersion = {
    1: comparison.version1 || [],
    2: comparison.version2 || [],
    3: comparison.version3 || []
  };
  const rowsByPlayer = {};

  getPlayers().forEach(player => {
    const v1 = byVersion[1].filter(item => item.player === player.name)[0] || null;
    const v2 = byVersion[2].filter(item => item.player === player.name)[0] || null;
    const v3 = byVersion[3].filter(item => item.player === player.name)[0] || null;

    rowsByPlayer[player.name] = {
      v1Avg: v1 ? normalizeNumber(v1.averageRating) : null,
      v1Med: v1 ? normalizeNumber(v1.medianRating) : null,
      v2Avg: v2 ? normalizeNumber(v2.averageRating) : null,
      v2Med: v2 ? normalizeNumber(v2.medianRating) : null,
      v3Avg: v3 ? normalizeNumber(v3.averageRating) : null,
      v3Med: v3 ? normalizeNumber(v3.medianRating) : null,
      weighted: v3 ? normalizeNumber(v3.weightedScore) : null
    };
  });

  return rowsByPlayer;
}

function applyFinalRatingsToPlayers(data){
  const pass = data.password;

  if(!isValidAdmin(pass)){
    return { ok:false, error:"Wrong admin password" };
  }

  setupSheets();
  refreshAllVersionResults();

  const method = data.method ? data.method.toString().trim() : "";
  const methodLabel = getFinalRatingMethodLabel(method);

  if(!methodLabel){
    return { ok:false, error:"Invalid final rating method" };
  }

  const sheet = getOrCreateSheet(SHEET_PLAYERS, getPlayerHeaders());

  if(sheet.getLastRow() < 2){
    return { ok:false, error:"No players found" };
  }

  const backupName = createPlayersBackup();
  const headers = getPlayerHeaders();
  const existingRows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), headers.length))
    .getValues();
  const ratingsByPlayer = buildResultRowsForPlayers();
  const appliedAt = new Date();
  let updatedCount = 0;

  const output = existingRows
    .filter(row => row[0])
    .map(row => {
      const name = row[0].toString().trim();
      const active = row[2] === false ? false : true;
      const ratings = ratingsByPlayer[name] || {};
      const finalRating = getRatingMethodValue(ratings, method);

      if(finalRating !== null){
        updatedCount++;
      }

      return [
        name,
        finalRating !== null ? finalRating : row[1],
        active,
        methodLabel,
        finalRating !== null ? finalRating : "",
        ratings.v1Avg !== null && typeof ratings.v1Avg !== "undefined" ? ratings.v1Avg : "",
        ratings.v1Med !== null && typeof ratings.v1Med !== "undefined" ? ratings.v1Med : "",
        ratings.v2Avg !== null && typeof ratings.v2Avg !== "undefined" ? ratings.v2Avg : "",
        ratings.v2Med !== null && typeof ratings.v2Med !== "undefined" ? ratings.v2Med : "",
        ratings.v3Avg !== null && typeof ratings.v3Avg !== "undefined" ? ratings.v3Avg : "",
        ratings.v3Med !== null && typeof ratings.v3Med !== "undefined" ? ratings.v3Med : "",
        ratings.weighted !== null && typeof ratings.weighted !== "undefined" ? ratings.weighted : "",
        appliedAt,
        row[13] || ""
      ];
    });

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, headers.length).clearContent();

  if(output.length){
    sheet.getRange(2, 1, output.length, headers.length).setValues(output);
  }

  formatDateColumns();

  return {
    ok:true,
    method:method,
    methodLabel:methodLabel,
    backupSheet:backupName,
    updatedCount:updatedCount,
    ratingsLocked:isRatingsLocked(),
    players:getPlayers(),
    results:getComparisonResults(),
    status:getStatusRows()
  };
}

function setRatingsLock(data){
  const pass = data.password;

  if(!isValidAdmin(pass)){
    return { ok:false, error:"Wrong admin password" };
  }

  const locked = data.locked === true;
  setRatingsLockedValue(locked);

  return {
    ok:true,
    ratingsLocked:locked
  };
}

function getInitialData(){
  setupSheets();
  refreshAllVersionResults();

  return {
    ok:true,
    backendBuild:BACKEND_BUILD,
    ratingsLocked:isRatingsLocked(),
    players:getPlayers(),
    results:getComparisonResults(),
    status:getStatusRows()
  };
}

function normalizeNumber(value){
  if(value === "" || value === null || typeof value === "undefined"){
    return null;
  }

  const numberValue = Number(value);

  if(isNaN(numberValue)){
    return null;
  }

  return Math.max(0, Math.min(10, numberValue));
}

function normalizeSubmittedRating(value){
  const numeric = normalizeNumber(value);
  if(numeric === null) return null;
  return Math.round(numeric);
}

function average(values){
  const cleaned = values
    .map(value => Number(value))
    .filter(value => !isNaN(value));

  if(!cleaned.length){
    return null;
  }

  return Math.round((cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length) * 10) / 10;
}

function median(values){
  const cleaned = values
    .map(value => Number(value))
    .filter(value => !isNaN(value))
    .sort((a, b) => a - b);

  if(!cleaned.length){
    return null;
  }

  const middle = Math.floor(cleaned.length / 2);

  if(cleaned.length % 2){
    return Math.round(cleaned[middle] * 10) / 10;
  }

  return Math.round(((cleaned[middle - 1] + cleaned[middle]) / 2) * 10) / 10;
}

function calculateVersion3WeightedScoreFromRow(row){
  const weights = {
    combat: 0.22,
    communication: 0.10,
    decision: 0.17,
    awareness: 0.18,
    movement: 0.18,
    impact: 0.15
  };

  const values = {
    combat: normalizeSubmittedRating(row[8]),
    communication: normalizeSubmittedRating(row[9]),
    decision: normalizeSubmittedRating(row[10]),
    awareness: normalizeSubmittedRating(row[11]),
    movement: normalizeSubmittedRating(row[12]),
    impact: normalizeSubmittedRating(row[13])
  };

  const missing = Object.keys(values).some(key => values[key] === null);

  if(missing){
    return null;
  }

  const weighted =
    values.combat * weights.combat +
    values.communication * weights.communication +
    values.decision * weights.decision +
    values.awareness * weights.awareness +
    values.movement * weights.movement +
    values.impact * weights.impact;

  return Math.round(weighted * 10) / 10;
}

function calculateFinalRating(version, rating){
  if(version === 1){
    return normalizeSubmittedRating(rating.overall);
  }

  if(version === 2){
    return average([
      normalizeSubmittedRating(rating.elimination),
      normalizeSubmittedRating(rating.blitz),
      normalizeSubmittedRating(rating.ctf)
    ]);
  }

  if(version === 3){
    return average([
      normalizeSubmittedRating(rating.combat),
      normalizeSubmittedRating(rating.communication),
      normalizeSubmittedRating(rating.decision),
      normalizeSubmittedRating(rating.awareness),
      normalizeSubmittedRating(rating.movement),
      normalizeSubmittedRating(rating.impact)
    ]);
  }

  return null;
}

function getActivePlayerSet(){
  const players = {};

  getPlayers().forEach(player => {
    players[player.name] = true;
  });

  return players;
}

function getRaterSubmission(data){
  const version = Number(data.version);
  const rater = data.rater ? data.rater.toString().trim() : "";

  if([1, 2, 3].indexOf(version) === -1){
    return { ok:false, error:"Invalid version" };
  }

  if(!rater){
    return { ok:false, error:"Missing rater" };
  }

  const sheet = getOrCreateSheet(SHEET_VERSION_VOTES, getVoteHeaders());

  if(sheet.getLastRow() < 2){
    return { ok:true, version:version, rater:rater, ratings:[] };
  }

  const normalizedRater = rater.toString().trim().toLowerCase();
  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, getVoteHeaders().length)
    .getValues()
    .filter(row => Number(row[1]) === version && row[2] && row[2].toString().trim().toLowerCase() === normalizedRater);

  return {
    ok:true,
    version:version,
    rater:rater,
    ratings:rows.map(row => ({
      ratedPlayer: row[3],
      overall: row[4],
      elimination: row[5],
      blitz: row[6],
      ctf: row[7],
      combat: row[8],
      communication: row[9],
      decision: row[10],
      awareness: row[11],
      movement: row[12],
      impact: row[13],
      finalRating: row[14]
    }))
  };
}

function hasExistingSubmission(version, rater){
  const sheet = getOrCreateSheet(SHEET_VERSION_VOTES, getVoteHeaders());

  if(sheet.getLastRow() < 2){
    return false;
  }

  const normalizedRater = rater.toString().trim().toLowerCase();
  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, getVoteHeaders().length)
    .getValues();

  return rows.some(row =>
    Number(row[1]) === Number(version) &&
    row[2] &&
    row[2].toString().trim().toLowerCase() === normalizedRater
  );
}

function logVersionAction(version, rater, action){
  const sheet = getOrCreateSheet(SHEET_VERSION_STATUS_LOG, getStatusLogHeaders());

  sheet.appendRow([
    new Date(),
    Number(version),
    rater,
    action
  ]);

  formatDateColumns();
}

function submitVersionRatings(data){
  if(isRatingsLocked()){
    return { ok:false, error:"Ratings are currently locked" };
  }

  const version = Number(data.version);
  const rater = data.rater ? data.rater.toString().trim() : "";
  const ratings = Array.isArray(data.ratings) ? data.ratings : [];
  const emailPlayerCopy = data.emailCopy !== false;
  const activePlayers = getActivePlayerSet();

  if([1, 2, 3].indexOf(version) === -1){
    return { ok:false, error:"Invalid version" };
  }

  if(!rater || !activePlayers[rater]){
    return { ok:false, error:"Select a valid rater" };
  }

  const verification = validateRaterCode(rater, data.verificationCode);
  if(!verification.ok){
    return verification;
  }

  if(!ratings.length){
    return { ok:false, error:"No ratings submitted" };
  }

  const now = new Date();
  const cleanedRows = [];
  const seenPlayers = {};

  ratings.forEach(rating => {
    const ratedPlayer = rating && rating.ratedPlayer
      ? rating.ratedPlayer.toString().trim()
      : "";

    if(!ratedPlayer || ratedPlayer === rater || !activePlayers[ratedPlayer] || seenPlayers[ratedPlayer]){
      return;
    }

    const finalRating = calculateFinalRating(version, rating);

    if(finalRating === null){
      return;
    }

    seenPlayers[ratedPlayer] = true;

    cleanedRows.push([
      now,
      version,
      rater,
      ratedPlayer,
      version === 1 ? normalizeSubmittedRating(rating.overall) : "",
      version === 2 ? normalizeSubmittedRating(rating.elimination) : "",
      version === 2 ? normalizeSubmittedRating(rating.blitz) : "",
      version === 2 ? normalizeSubmittedRating(rating.ctf) : "",
      version === 3 ? normalizeSubmittedRating(rating.combat) : "",
      version === 3 ? normalizeSubmittedRating(rating.communication) : "",
      version === 3 ? normalizeSubmittedRating(rating.decision) : "",
      version === 3 ? normalizeSubmittedRating(rating.awareness) : "",
      version === 3 ? normalizeSubmittedRating(rating.movement) : "",
      version === 3 ? normalizeSubmittedRating(rating.impact) : "",
      finalRating
    ]);
  });

  if(!cleanedRows.length){
    return { ok:false, error:"No valid ratings submitted" };
  }

  const votesSheet = getOrCreateSheet(SHEET_VERSION_VOTES, getVoteHeaders());
  const hadExistingSubmission = hasExistingSubmission(version, rater);

  deleteExistingSubmission(version, rater);

  votesSheet
    .getRange(votesSheet.getLastRow() + 1, 1, cleanedRows.length, getVoteHeaders().length)
    .setValues(cleanedRows);

  recalculateVersionResults(version);
  const action = hadExistingSubmission ? "update" : "submit";
  logVersionAction(version, rater, action);
  formatDateColumns();
  
  const raterRecord = getPlayerRecord(rater);
  const emailResult = sendSubmissionReceiptEmails({
    version:version,
    action:action,
    rater:rater,
    raterEmail:raterRecord ? raterRecord.email : "",
    submittedAt:now,
    rows:cleanedRows,
    emailPlayerCopy:emailPlayerCopy
  });

  return {
    ok:true,
    version:version,
    rater:rater,
    submittedCount:cleanedRows.length,
    playerEmailSent:emailResult.playerEmailSent,
    playerEmailError:emailResult.playerEmailError || "",
    adminEmailSent:emailResult.adminEmailSent,
    ratingsLocked:isRatingsLocked(),
    results:getComparisonResults(),
    status:getStatusRows()
  };
}

function deleteExistingSubmission(version, rater){
  const sheet = getOrCreateSheet(SHEET_VERSION_VOTES, getVoteHeaders());

  if(sheet.getLastRow() < 2){
    return;
  }

  const normalizedRater = rater.toString().trim().toLowerCase();
  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, getVoteHeaders().length)
    .getValues();

  for(let i = rows.length - 1; i >= 0; i--){
    const row = rows[i];
    const rowVersion = Number(row[1]);
    const rowRater = row[2] ? row[2].toString().trim().toLowerCase() : "";

    if(rowVersion === Number(version) && rowRater === normalizedRater){
      sheet.deleteRow(i + 2);
    }
  }
}

function clearVersionSubmission(data){
  if(isRatingsLocked()){
    return { ok:false, error:"Ratings are currently locked" };
  }

  const version = Number(data.version);
  const rater = data.rater ? data.rater.toString().trim() : "";

  if([1, 2, 3].indexOf(version) === -1){
    return { ok:false, error:"Invalid version" };
  }

  if(!rater){
    return { ok:false, error:"Missing rater" };
  }

  const verification = validateRaterCode(rater, data.verificationCode);
  if(!verification.ok){
    return verification;
  }

  deleteExistingSubmission(version, rater);
  recalculateVersionResults(version);
  logVersionAction(version, rater, "clear");

  return {
    ok:true,
    version:version,
    rater:rater,
    ratingsLocked:isRatingsLocked(),
    results:getComparisonResults(),
    status:getStatusRows()
  };
}

function recalculateVersionResults(version){
  const votesSheet = getOrCreateSheet(SHEET_VERSION_VOTES, getVoteHeaders());
  const resultsSheet = getOrCreateSheet(SHEET_VERSION_RESULTS, getResultHeaders());

  if(votesSheet.getLastRow() < 2){
    clearVersionResults(version);
    return [];
  }

  const voteRows = votesSheet
    .getRange(2, 1, votesSheet.getLastRow() - 1, getVoteHeaders().length)
    .getValues()
    .filter(row => Number(row[1]) === Number(version));

  const grouped = {};

  voteRows.forEach(row => {
    const player = row[3] ? row[3].toString().trim() : "";
    const finalRating = Number(version) === 3
      ? average([
        normalizeSubmittedRating(row[8]),
        normalizeSubmittedRating(row[9]),
        normalizeSubmittedRating(row[10]),
        normalizeSubmittedRating(row[11]),
        normalizeSubmittedRating(row[12]),
        normalizeSubmittedRating(row[13])
      ])
      : normalizeNumber(row[14]);
    const votedAt = row[0] instanceof Date ? row[0] : new Date(row[0]);

    if(!player || finalRating === null){
      return;
    }

    if(!grouped[player]){
      grouped[player] = {
        finalRatings: [],
        weightedScores: [],
        latestVoteAt: null
      };
    }

    grouped[player].finalRatings.push(finalRating);

    if(!isNaN(votedAt.getTime())){
      if(!grouped[player].latestVoteAt || votedAt > grouped[player].latestVoteAt){
        grouped[player].latestVoteAt = votedAt;
      }
    }

    if(Number(version) === 3){
      const weightedScore = calculateVersion3WeightedScoreFromRow(row);

      if(weightedScore !== null){
        grouped[player].weightedScores.push(weightedScore);
      }
    }
  });

  const output = Object.keys(grouped)
    .sort()
    .map(player => [
      version,
      player,
      average(grouped[player].finalRatings),
      median(grouped[player].finalRatings),
      grouped[player].finalRatings.length,
      Number(version) === 3 ? average(grouped[player].weightedScores) : "",
      grouped[player].latestVoteAt || ""
    ]);

  let existingRows = [];

  if(resultsSheet.getLastRow() > 1){
    existingRows = resultsSheet
      .getRange(2, 1, resultsSheet.getLastRow() - 1, getResultHeaders().length)
      .getValues()
      .filter(row => Number(row[0]) !== Number(version));

    resultsSheet
      .getRange(2, 1, resultsSheet.getLastRow() - 1, getResultHeaders().length)
      .clearContent();
  }

  const rowsToWrite = existingRows.concat(output);

  if(rowsToWrite.length){
    resultsSheet
      .getRange(2, 1, rowsToWrite.length, getResultHeaders().length)
      .setValues(rowsToWrite);

    resultsSheet.getRange(2, 5, rowsToWrite.length, 1).setNumberFormat("0");
    resultsSheet.getRange(2, 7, rowsToWrite.length, 1).setNumberFormat("m/d/yyyy h:mm:ss AM/PM");
  }

  return output;
}

function clearVersionResults(version){
  const resultsSheet = getOrCreateSheet(SHEET_VERSION_RESULTS, getResultHeaders());

  if(resultsSheet.getLastRow() < 2){
    return;
  }

  const existingRows = resultsSheet
    .getRange(2, 1, resultsSheet.getLastRow() - 1, getResultHeaders().length)
    .getValues()
    .filter(row => Number(row[0]) !== Number(version));

  resultsSheet
    .getRange(2, 1, resultsSheet.getLastRow() - 1, getResultHeaders().length)
    .clearContent();

  if(existingRows.length){
    resultsSheet
      .getRange(2, 1, existingRows.length, getResultHeaders().length)
      .setValues(existingRows);
  }
}

function refreshAllVersionResults(){
  [1, 2, 3].forEach(version => {
    recalculateVersionResults(version);
  });
}

function getDefaultStatus(player){
  return {
    player: player.name,
    v1Voted: false,
    v1Updates: 0,
    v1Clears: 0,
    v2Voted: false,
    v2Updates: 0,
    v2Clears: 0,
    v3Voted: false,
    v3Updates: 0,
    v3Clears: 0,
    votedVersions: "None"
  };
}

function getStatusRows(){
  setupSheets();

  const players = getPlayers();
  const statusByPlayer = {};

  players.forEach(player => {
    statusByPlayer[player.name] = getDefaultStatus(player);
  });

  const votesSheet = getOrCreateSheet(SHEET_VERSION_VOTES, getVoteHeaders());

  if(votesSheet.getLastRow() >= 2){
    const voteRows = votesSheet
      .getRange(2, 1, votesSheet.getLastRow() - 1, getVoteHeaders().length)
      .getValues();

    voteRows.forEach(row => {
      const version = Number(row[1]);
      const rater = row[2] ? row[2].toString().trim() : "";

      if(!statusByPlayer[rater]){
        return;
      }

      if(version === 1) statusByPlayer[rater].v1Voted = true;
      if(version === 2) statusByPlayer[rater].v2Voted = true;
      if(version === 3) statusByPlayer[rater].v3Voted = true;
    });
  }

  const logSheet = getOrCreateSheet(SHEET_VERSION_STATUS_LOG, getStatusLogHeaders());

  if(logSheet.getLastRow() >= 2){
    const logRows = logSheet
      .getRange(2, 1, logSheet.getLastRow() - 1, getStatusLogHeaders().length)
      .getValues();

    logRows.forEach(row => {
      const version = Number(row[1]);
      const rater = row[2] ? row[2].toString().trim() : "";
      const action = row[3] ? row[3].toString().trim().toLowerCase() : "";

      if(!statusByPlayer[rater]){
        return;
      }

      if(action === "update"){
        if(version === 1) statusByPlayer[rater].v1Updates++;
        if(version === 2) statusByPlayer[rater].v2Updates++;
        if(version === 3) statusByPlayer[rater].v3Updates++;
      }

      if(action === "clear"){
        if(version === 1) statusByPlayer[rater].v1Clears++;
        if(version === 2) statusByPlayer[rater].v2Clears++;
        if(version === 3) statusByPlayer[rater].v3Clears++;
      }
    });
  }

  return players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(player => {
      const status = statusByPlayer[player.name];
      const voted = [];

      if(status.v1Voted) voted.push("V1");
      if(status.v2Voted) voted.push("V2");
      if(status.v3Voted) voted.push("V3");

      status.votedVersions = voted.length ? voted.join(", ") : "None";

      return status;
    });
}

function getComparisonResults(){
  const results = {
    version1: [],
    version2: [],
    version3: []
  };

  const votesSheet = getOrCreateSheet(SHEET_VERSION_VOTES, getVoteHeaders());

  if(votesSheet.getLastRow() < 2){
    return results;
  }

  const rows = votesSheet
    .getRange(2, 1, votesSheet.getLastRow() - 1, getVoteHeaders().length)
    .getValues();
  const grouped = {};

  rows.forEach(row => {
    const version = Number(row[1]);
    const player = row[3] ? row[3].toString().trim() : "";
    const finalRating = normalizeNumber(row[14]);

    if([1, 2, 3].indexOf(version) === -1 || !player || finalRating === null){
      return;
    }

    const key = version + "||" + player;

    if(!grouped[key]){
      grouped[key] = {
        version: version,
        player: player,
        finalRatings: [],
        weightedScores: []
      };
    }

    grouped[key].finalRatings.push(finalRating);

    if(version === 3){
      const weightedScore = calculateVersion3WeightedScoreFromRow(row);

      if(weightedScore !== null){
        grouped[key].weightedScores.push(weightedScore);
      }
    }
  });

  Object.keys(grouped).forEach(key => {
    const group = grouped[key];
    const item = {
      player: group.player,
      finalRating: average(group.finalRatings),
      averageRating: average(group.finalRatings),
      medianRating: median(group.finalRatings),
      voteCount: group.finalRatings.length,
      weightedScore: group.version === 3 ? average(group.weightedScores) : null
    };

    if(group.version === 1) results.version1.push(item);
    if(group.version === 2) results.version2.push(item);
    if(group.version === 3) results.version3.push(item);
  });

  Object.keys(results).forEach(key => {
    results[key].sort((a, b) => a.player.localeCompare(b.player));
  });

  return results;
}
