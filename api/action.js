const { google } = require("googleapis");

const SHEET_ID = "1fsOj6XCDsv56lVNQeXcwXtvqd7ieI9BL_zJS0xNP48g";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { type, no, user, action } = req.body;

  if (!type || !no || !user || !action) {
    return res.status(400).json({ ok: false, message: "❌ パラメータ不足" });
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const txRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Transactions!A:E",
  });

  const rows = txRes.data.values || [];
  let isRented = false;

  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === type && rows[i][1] === no) {
      isRented = rows[i][4] === "貸出";
      break;
    }
  }

  if (action === "rent" && isRented)   return res.json({ ok: false, message: "⚠️ 既に貸出中です" });
  if (action === "return" && !isRented) return res.json({ ok: false, message: "⚠️ 既に返却済みです" });

  const actionLabel = action === "rent" ? "貸出" : "返却";
  const now = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Transactions!A:E",
    valueInputOption: "RAW",
    requestBody: { values: [[type, no, user, now, actionLabel]] },
  });

  const statusRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Status!A:F",
  });

  const statusRows = statusRes.data.values || [];
  for (let i = 1; i < statusRows.length; i++) {
    if (statusRows[i][0] === type && statusRows[i][1] === no) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Status!D${i + 1}:F${i + 1}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [[
            action === "rent" ? "貸出中" : "返却済",
            action === "rent" ? user : "",
            action === "rent" ? now : ""
          ]]
        },
      });
      break;
    }
  }

  return res.json({ ok: true, message: `✅ ${actionLabel}完了！` });
}
