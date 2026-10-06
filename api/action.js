const { google } = require("googleapis");

const SHEET_ID = "1fsOj6XCDsv56lVNQeXcwXtvqd7ieI9BL_zJS0xNP48g";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { type, no, user, action } = req.body;

  if (!type || !no || !user || !action) {
    return res.status(400).json({
      ok: false,
      message: "❌ パラメータ不足"
    });
  }

  // Google Sheetsへの認証
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({
    version: "v4",
    auth
  });

  // ========================================
  // ① 貸出履歴を取得
  // ========================================

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

  // ========================================
  // ② 貸出時：ペナルティ確認
  // ========================================

  if (action === "rent") {

    const penaltyRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "Penalty!A:D",
    });

    const penaltyRows = penaltyRes.data.values || [];

    const now = new Date();

    for (let i = 1; i < penaltyRows.length; i++) {

      const penaltyUser = penaltyRows[i][0];
      const endDate = penaltyRows[i][2];

      if (penaltyUser === user && endDate) {

        const end = new Date(`${endDate}T23:59:59+09:00`);

        if (now <= end) {

          return res.json({
            ok: false,
            message:
              `⛔ 現在、貸出停止中です。\n` +
              `貸出可能日：${endDate}`
          });
        }
      }
    }
  }

  // ========================================
  // ③ 貸出・返却状態チェック
  // ========================================

  if (action === "rent" && isRented) {
    return res.json({
      ok: false,
      message: "⚠️ 既に貸出中です"
    });
  }

  if (action === "return" && !isRented) {
    return res.json({
      ok: false,
      message: "⚠️ 既に返却済みです"
    });
  }

  // ========================================
  // ④ 現在時刻（日本時間）
  // ========================================

  const nowDate = new Date();

  const now = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(nowDate);

  const actionLabel = action === "rent" ? "貸出" : "返却";

  // ========================================
  // ⑤ Transactionsに記録
  // ========================================

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Transactions!A:E",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        type,
        no,
        user,
        now,
        actionLabel
      ]]
    },
  });

  // ========================================
  // ⑥ Statusを更新
  // ========================================

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

  // ========================================
  // ⑦ 返却遅れ判定
  //    月〜金の17:50を過ぎていたら
  //    7日間貸出禁止
  // ========================================

  if (action === "return") {

    // 日本時間に変換
    const japanTime = new Date(
      nowDate.toLocaleString("en-US", {
        timeZone: "Asia/Tokyo"
      })
    );

    const day = japanTime.getDay();

    // 0 = 日曜日
    // 6 = 土曜日
    const isWeekday = day >= 1 && day <= 5;

    const hour = japanTime.getHours();
    const minute = japanTime.getMinutes();

    const isLate =
      isWeekday &&
      (
        hour > 17 ||
        (hour === 17 && minute >= 51)
      );

    if (isLate) {

      // 今日から7日後
      const penaltyEnd = new Date(japanTime);
      penaltyEnd.setDate(penaltyEnd.getDate() + 7);

      const startDate =
        `${japanTime.getFullYear()}-` +
        `${String(japanTime.getMonth() + 1).padStart(2, "0")}-` +
        `${String(japanTime.getDate()).padStart(2, "0")}`;

      const endDate =
        `${penaltyEnd.getFullYear()}-` +
        `${String(penaltyEnd.getMonth() + 1).padStart(2, "0")}-` +
        `${String(penaltyEnd.getDate()).padStart(2, "0")}`;

      // Penaltyシートに登録
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: "Penalty!A:D",
        valueInputOption: "RAW",
        requestBody: {
          values: [[
            user,
            startDate,
            endDate,
            "返却遅れ"
          ]]
        }
      });

      return res.json({
        ok: true,
        message:
          `⚠️ 返却が遅れています。\n` +
          `7日間、貸出禁止となります。\n` +
          `貸出可能日：${endDate}`
      });
    }
  }

  // ========================================
  // ⑧ 通常の完了メッセージ
  // ========================================

  return res.json({
    ok: true,
    message: `✅ ${actionLabel}完了！`
  });
}
