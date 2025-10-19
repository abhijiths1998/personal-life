/**
 * Ronaldo25 Reflection Collector
 * - Appends each submission to a monthly sheet (YYYY-MM).
 * - Also logs an entry in "AllResponses".
 * - Updates basic Analytics sheet with summary formulas.
 *
 * After pasting, Deploy -> New deployment -> Web app.
 * Access: Anyone (even anonymous) if you want no auth friction.
 */

const SHEET_ID = 'PASTE_YOUR_SHEET_ID_HERE'; // <-- Replace after creating sheet

function doPost(e) {
  // Allow OPTIONS preflight
  if (e && e.postData && e.postData.type === "application/json") {
    try {
      const params = JSON.parse(e.postData.contents);
      const timestamp = new Date();

      // Build row fields in the required order
      const row = [
        timestamp,
        getDateString(timestamp),                      // Date
        params.workout || "",
        params.meal || "",
        params.water || "",
        params.winddown || "",
        params.energy || "",
        params.mood || "",
        params.performance || "",
        params.soreness || "",
        params.win || "",
        params.improve || "",
        params.quote || ""
      ];

      const ss = SpreadsheetApp.openById(SHEET_ID);

      // 1) Append to AllResponses
      const allSheet = ss.getSheetByName("AllResponses");
      if (!allSheet) {
        // create with header if missing
        const sh = ss.insertSheet("AllResponses");
        sh.appendRow(["Timestamp","Date","Workout Completed","Meal Plan Followed","Water Intake (3-4L)",
                      "Winding Down by 10:30 PM","Energy Level (1-10)","Mood Today",
                      "Workout Performance","Soreness/Pain","One Win Today","Improvement for Tomorrow","Quote/Mindset"]);
        sh.appendRow(row);
      } else {
        allSheet.appendRow(row);
      }

      // 2) Append to monthly sheet YYYY-MM
      const mmName = getMonthSheetName(timestamp);
      let monthSheet = ss.getSheetByName(mmName);
      if (!monthSheet) {
        monthSheet = ss.insertSheet(mmName);
        // header row
        monthSheet.appendRow(["Timestamp","Date","Workout Completed","Meal Plan Followed","Water Intake (3-4L)",
                              "Winding Down by 10:30 PM","Energy Level (1-10)","Mood Today",
                              "Workout Performance","Soreness/Pain","One Win Today","Improvement for Tomorrow","Quote/Mindset"]);
      }
      monthSheet.appendRow(row);

      // 3) Update Analytics sheet (basic summary)
      updateAnalytics(ss);

      return jsonResponse({result: "success", message: "Saved", date: getDateString(timestamp)});
    } catch (err) {
      return jsonResponse({result: "error", message: err.toString()}, 500);
    }
  } else {
    // options or other content-type
    return jsonResponse({result: "ok", message: "Send JSON POST"}, 200);
  }
}

/** Utility: return YYYY-MM */
function getMonthSheetName(d) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

/** Utility: return yyyy-mm-dd */
function getDateString(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone() || "GMT", "yyyy-MM-dd");
}

/** Build JSON response with CORS headers */
function jsonResponse(obj, statusCode) {
  statusCode = statusCode || 200;
  const json = JSON.stringify(obj);
  const resp = ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  // Apps Script can't directly set headers via ContentService, but we can use HtmlService to set headers in doGet/doPost responses
  // The client should accept the response. For CORS preflight, we'll also respond to OPTIONS separately below.
  return resp;
}

/** Update Analytics sheet with simple formulas */
function updateAnalytics(ss) {
  const sheetName = "Analytics";
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // create basic layout
    const headers = [
      ["Metric", "Value"],
      ["Total Entries", ""],
      ["Entries This Month", ""],
      ["Average Energy (Last 30 days)", ""],
      ["% Workouts Done (Last 30 days)", ""],
    ];
    sheet.getRange(1,1,headers.length,2).setValues(headers);
  }

  const allName = "AllResponses";
  const allSheet = ss.getSheetByName(allName);
  if (!allSheet) return;

  const lastRow = allSheet.getLastRow();
  // Total entries
  sheet.getRange("B2").setFormula(`=COUNTA('${allName}'!A2:A)`);

  // Entries this month
  const mmName = getMonthSheetName(new Date());
  // If month sheet exists:
  const monthSheet = ss.getSheetByName(mmName);
  if (monthSheet) {
    sheet.getRange("B3").setFormula(`=COUNTA('${mmName}'!A2:A)`);
  } else {
    sheet.getRange("B3").setValue(0);
  }

  // Average energy last 30 days (column G = Energy Level) - we compute using AllResponses with filter on dates
  // Place a helper formula into the sheet to compute average energy for last 30 days
  const tz = Session.getScriptTimeZone() || "GMT";
  const today = new Date();
  const todayStr = Utilities.formatDate(today, tz, "yyyy-MM-dd");
  // Build formula that averages column G where Date >= TODAY()-30
  // Note: Column B in AllResponses is Date (yyyy-mm-dd)
  const avgEnergyFormula = `=IFERROR(AVERAGE(FILTER(VALUE('${allName}'!G2:G), '--' <> '${allName}'!G2:G, DATEVALUE('${allName}'!B2:B) >= (TODAY()-30))), "—")`;
  sheet.getRange("B4").setFormula(avgEnergyFormula);

  // % Workouts Done (last 30 days) - count rows in last 30 days where Workout = "Yes"
  const pctWorkoutFormula = `=IFERROR(  SUM(  IF(  (DATEVALUE('${allName}'!B2:B) >= (TODAY()-30)) * ('${allName}'!C2:C="Yes"), 1, 0) ) / MAX(1, SUM( IF( DATEVALUE('${allName}'!B2:B) >= (TODAY()-30), 1, 0) ) ), "—")`;
  sheet.getRange("B5").setFormula(pctWorkoutFormula);

  // Force spreadsheet recalc
  SpreadsheetApp.flush();
}

/** Respond to preflight CORS. In web app, preflight hits doGet if OPTIONS not handled.
 * Apps Script web apps don't expose headers easily — client-side fetch must not require credentials.
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({status: "ok"})).setMimeType(ContentService.MimeType.JSON);
}
