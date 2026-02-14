// Vercel Serverless Function (CommonJS) - Ultimate Robust Version
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

  // 2. APIキーの徹底的なクリーニング
  const rawKey = process.env.GEMINI_API_KEY || "";
  // 空白削除だけでなく、ダブルクォート(")、シングルクォート(')も全て削除
  const apiKey = rawKey.replace(/['"]/g, '').trim();

  // 診断ログ（キーの先頭4文字と、長さ、文字種チェック）
  console.log(`[Debug] Processing Request. Key Length: ${apiKey.length}`);
  if (apiKey.length > 4) {
    console.log(`[Debug] Key starts with: ${apiKey.substring(0, 4)}...`);
  }

  if (!apiKey) {
    console.error("[Error] API Key is empty after trimming.");
    return res.status(500).json({ error: 'API Key is missing or invalid in Vercel settings.' });
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

    // 3. 試行するモデルのリスト
    const modelsToTry = [
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-pro",
      "gemini-1.0-pro"
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
          // エラー詳細をログに出す
          const errorMsg = data.error?.message || "Unknown error";
          console.warn(`[Failed] ${modelName}: ${errorMsg}`);
          lastError = data;
          
          // 404 (モデルなし) 以外、または PERMISSION_DENIED などの場合は次を試す
          // ※ 特定のキーで特定モデルが禁止されている場合があるため、403でも次を試すように変更
          if (response.status !== 404 && response.status !== 403) {
             // 400 Bad Request (JSON形式ミスなど) はリトライしても無駄なので中断
             if(response.status === 400) break;
          }
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
      console.error("[Fatal] All models failed. Last error:", JSON.stringify(lastError));
      res.status(500).json(lastError || { error: "All models failed." });
    }

  } catch (error) {
    console.error("Server Internal Error:", error);
    res.status(500).json({ error: 'Server Internal Error', details: error.message });
  }
};
