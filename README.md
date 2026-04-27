function doGet(e) {

  // ------------------------------
  // パラメータ安全化
  // ------------------------------
  e = e || {};
  e.parameter = e.parameter || {};

  const type   = e.parameter.type;
  const no     = e.parameter.no;
  const user   = e.parameter.user;
  const action = e.parameter.action; // rent / return

  const appUrl = ScriptApp.getService().getUrl();

  // ------------------------------
  // 表示用ラベル
  // ------------------------------
  let typeLabel = "";
  if (type === "battery")    typeLabel = "バッテリー";
  if (type === "Type-C")     typeLabel = "Type-Cケーブル";
  if (type === "lightning")  typeLabel = "ライトニングケーブル";

  // action → 表示用ラベル
  let actionLabel = "";
  if (action === "rent")   actionLabel = "貸出";
  if (action === "return") actionLabel = "返却";

  // ------------------------------
  // QR必須チェック
  // ------------------------------
  if (!type || !no || !typeLabel) {
    return HtmlService.createHtmlOutput("❌ QRコードから開いてください");
  }

  // ------------------------------
  // スプレッドシート
  // ------------------------------
  const ss = SpreadsheetApp.openById("1yG5Ljynb9wiaEqQwUr3R25OPsUlXZI88bCw8KiWnMIU");
  const ts = ss.getSheetByName("Transactions");

  const values = ts.getDataRange().getValues();

  // ------------------------------
  // 現在の貸出状態を判定（日本語）
  // ------------------------------
  let isRented = false;
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][0] === type && values[i][1] == no) {
      isRented = values[i][4] === "貸出";
      break;
    }
  }

  // ------------------------------
  // フォーム表示
  // ------------------------------
  if (!user || !action) {

    const actionButton = isRented
      ? `
        <button type="submit" name="action" value="return"
          style="
            width:100%;
            padding:18px;
            font-size:18px;
            border:none;
            border-radius:12px;
            background:#10b981;
            color:white;
            font-weight:bold;
          ">
          返却
        </button>
      `
      : `
        <button type="submit" name="action" value="rent"
          style="
            width:100%;
            padding:18px;
            font-size:18px;
            border:none;
            border-radius:12px;
            background:#3b82f6;
            color:white;
            font-weight:bold;
          ">
          貸出
        </button>
      `;

    return HtmlService.createHtmlOutput(`
<html>
  <body style="
    margin:0;
    min-height:100vh;
    display:flex;
    justify-content:center;
    align-items:flex-start;
    padding-top:40px;
    font-family:sans-serif;
    background:#f3f4f6;
  ">
    <div style="
      background:white;
      padding:32px 26px;
      border-radius:18px;
      box-shadow:0 12px 30px rgba(0,0,0,0.15);
      text-align:center;
      width:100%;
      max-width:480px;
      box-sizing:border-box;
    ">

      <h2 style="margin-top:0;font-size:24px;">
        🔋 ${typeLabel} ${no}
      </h2>

      <form method="get" action="${appUrl}">
        <input type="hidden" name="type" value="${type}">
        <input type="hidden" name="no" value="${no}">

        <p style="font-size:18px;">
          学籍番号<br>
          <input name="user" required
            style="
              width:100%;
              padding:18px;
              font-size:18px;
              border-radius:10px;
              border:1px solid #ccc;
              box-sizing:border-box;
              margin-top:10px;
            ">
        </p>

        ${actionButton}
      </form>

    </div>
  </body>
</html>
`);
  }

  // ------------------------------
  // 書き込み（日本語で保存）
  // ------------------------------
  ts.appendRow([
    type,
    no,
    user,
    new Date(),
    actionLabel
  ]);

  // ------------------------------
  // 完了画面
  // ------------------------------
  return HtmlService.createHtmlOutput(`
<html>
  <body style="
    font-family:sans-serif;
    text-align:center;
    padding:40px;
  ">
    <h2>✅ ${actionLabel} 完了</h2>
    <p>${typeLabel} ${no} を <b>${actionLabel}</b> しました</p>
    <p>学籍番号：${user}</p>
    <a href="${appUrl}?type=${type}&no=${no}">戻る</a>
  </body>
</html>
`);
}



