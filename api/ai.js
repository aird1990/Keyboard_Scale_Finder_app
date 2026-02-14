// Vercel Serverless Function (CommonJS) - Supreme Diagnostic Version
module.exports = async (req, res) => {
  // 1. CORSヘッダーの設定
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. APIキーの取得（徹底クリーニング）
  const rawKey = process.env.GEMINI_API_KEY || "";
  const apiKey = rawKey.replace(/['"]/g, '').trim();

  if (!apiKey) {
    console.error("[Fatal] GEMINI_API_KEY is completely empty.");
    return res.status(500).json({ error: 'API Key is missing.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { contents, systemInstruction, generationConfig } = req.body;
    
    // 3. 試行パターンの定義 (Endpoint Version x Model Name)
    // v1 と v1beta の両方を試します
    const attempts = [
      { ver: "v1beta", model: "gemini-1.5-flash" },
      { ver: "v1",     model: "gemini-1.5-flash" },
      { ver: "v1beta", model: "gemini-1.5-pro" },
      { ver: "v1",     model: "gemini-1.5-pro" },
      { ver: "v1beta", model: "gemini-pro" }
    ];

    let lastFullError = null;

    for (const attempt of attempts) {
      console.log(`[Diagnostic] Trying ${attempt.ver} with ${attempt.model}...`);
      
      const url = `https://generativelanguage.googleapis.com/${attempt.ver}/models/${attempt.model}:generateContent?key=${apiKey}`;

      const payload = {
        contents: contents,
        generationConfig: generationConfig || {}
      };

      // v1 では systemInstruction の扱いが厳しい場合があるため、存在する時のみ追加
      if (systemInstruction) {
        payload.systemInstruction = systemInstruction;
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
          console.log(`[Success!] Connection established using ${attempt.ver}/${attempt.model}`);
          return res.status(200).json(data);
        } else {
          console.warn(`[Fail] ${attempt.ver}/${attempt.model} -> HTTP ${response.status}: ${data.error?.message || "No message"}`);
          lastFullError = data;
          
          // もし「APIキーが無効」と言われたら、他のモデルを試しても無駄なので即停止
          if (data.error?.status === "UNAUTHENTICATED" || data.error?.message?.includes("API key not valid")) {
            console.error("[Critical] Google says the API KEY is NOT VALID.");
            return res.status(401).json({ error: "Invalid API Key", details: data.error.message });
          }
        }
      } catch (e) {
        console.error(`[Network Error] ${attempt.ver}/${attempt.model}:`, e.message);
      }
    }

    // 4. すべて失敗した場合
    console.error("[Fatal] All diagnostic attempts failed.");
    console.error("Last Error from Google:", JSON.stringify(lastFullError));
    
    res.status(500).json({
      error: "All models failed",
      google_response: lastFullError
    });

  } catch (error) {
    console.error("[Server Error]", error);
    res.status(500).json({ error: 'Server Error', details: error.message });
  }
};
