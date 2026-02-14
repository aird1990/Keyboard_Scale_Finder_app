// Vercel Serverless Function (CommonJS) - Robust Version
module.exports = async (req, res) => {
  // 1. CORSヘッダーの設定
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. APIキーの取得と整形
  const rawKey = process.env.GEMINI_API_KEY || "";
  const apiKey = rawKey.trim();

  // 診断用ログ（キーの先頭4文字だけ表示）
  if (apiKey) {
    console.log(`[Debug] API Key loaded. Starts with: ${apiKey.substring(0, 4)}...`);
  } else {
    console.error("[Error] API Key is empty.");
    return res.status(500).json({ error: 'API Key is missing in Vercel settings.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { contents, systemInstruction, generationConfig } = req.body;
    const payload = {
      contents: contents,
      generationConfig: generationConfig || {}
    };
    if (systemInstruction) {
      payload.systemInstruction = systemInstruction;
    }

    // 3. 試行するモデルのリスト（Flash -> Pro -> 1.0）
    const modelsToTry = [
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-1.0-pro",
      "gemini-pro"
    ];

    let lastError = null;
    let successData = null;

    // 4. 自動フォールバック接続
    for (const modelName of modelsToTry) {
      console.log(`[Attempt] Connecting to ${modelName}...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
          console.log(`[Success] Connected to ${modelName}`);
          successData = data;
          break; 
        } else {
          console.warn(`[Failed] ${modelName}: ${data.error?.message}`);
          lastError = data;
          // 404エラー（モデルが見つからない）以外は中断
          if (response.status !== 404) break;
        }
      } catch (e) {
        console.error(`[Network Error] ${modelName}:`, e);
        lastError = { error: { message: e.message } };
      }
    }

    // 5. 結果の返却
    if (successData) {
      res.status(200).json(successData);
    } else {
      console.error("[Fatal] All models failed.");
      res.status(500).json(lastError || { error: "All models failed." });
    }

  } catch (error) {
    console.error("Server Internal Error:", error);
    res.status(500).json({ error: 'Server Internal Error', details: error.message });
  }
};
