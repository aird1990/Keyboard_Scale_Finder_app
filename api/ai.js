// Vercel Serverless Function (CommonJS) - Supreme Diagnostic Version (Fixed Payload)
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

      // 4. バージョンに合わせたデータ構造の変換（重要！）
      let payload = {
        contents: contents
      };

      if (attempt.ver === "v1") {
        // v1 (Stable) 用の変換: snake_case を使用
        payload.generation_config = {};
        if (generationConfig) {
          if (generationConfig.responseMimeType) payload.generation_config.response_mime_type = generationConfig.responseMimeType;
          if (generationConfig.responseSchema) payload.generation_config.response_schema = generationConfig.responseSchema;
          if (generationConfig.temperature !== undefined) payload.generation_config.temperature = generationConfig.temperature;
        }
        if (systemInstruction) {
          payload.system_instruction = systemInstruction;
        }
      } else {
        // v1beta 用の変換: camelCase を使用
        payload.generationConfig = generationConfig || {};
        if (systemInstruction) {
          payload.systemInstruction = systemInstruction;
        }
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
          
          // APIキーが無効な場合は即停止
          if (data.error?.status === "UNAUTHENTICATED" || data.error?.message?.includes("API key not valid")) {
            console.error("[Critical] Google says the API KEY is NOT VALID.");
            return res.status(401).json({ error: "Invalid API Key", details: data.error.message });
          }
        }
      } catch (e) {
        console.error(`[Network Error] ${attempt.ver}/${attempt.model}:`, e.message);
      }
    }

    // すべて失敗した場合
    console.error("[Fatal] All diagnostic attempts failed.");
    res.status(500).json({
      error: "All models failed",
      google_response: lastFullError
    });

  } catch (error) {
    console.error("[Server Error]", error);
    res.status(500).json({ error: 'Server Error', details: error.message });
  }
};
