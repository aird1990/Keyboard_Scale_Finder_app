// Vercel Serverless Function (CommonJS) - Auto-Fallback Version
module.exports = async (req, res) => {
  // CORS設定
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // APIキーの取得とクリーンアップ
  const apiKey = (process.env.GEMINI_API_KEY || "").replace(/['"]/g, '').trim();
  
  if (!apiKey) {
    return res.status(500).json({ error: { message: 'API Key is missing in Vercel.' } });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const { contents, systemInstruction, generationConfig } = req.body;
    
    const payload = { contents };
    if (systemInstruction) payload.systemInstruction = systemInstruction;
    if (generationConfig) payload.generationConfig = generationConfig;

    // ★ 404エラー対策：Googleが受け付けてくれるモデル名を順番に試すリスト
    const modelsToTry = [
      "gemini-2.5-flash",
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro",
      "gemini-pro"
    ];

    let lastError = null;

    for (const modelName of modelsToTry) {
      console.log(`[Attempt] Trying model: ${modelName}`);
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
          return res.status(200).json(data);
        } else {
          lastError = data;
          // 404エラー（モデルが見つからない）の場合は次のモデルを試す。それ以外は終了
          if (response.status !== 404) {
            break;
          }
        }
      } catch (e) {
        lastError = { error: { message: e.message } };
        break;
      }
    }

    // 全てのモデルで失敗した場合
    return res.status(lastError?.error?.code || 500).json(lastError);

  } catch (error) {
    console.error("[Server Error]", error);
    res.status(500).json({ error: { message: 'Server Error', details: error.message } });
  }
};
