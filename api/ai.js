// Vercel Serverless Function (CommonJS) - Universal Legacy Compatibility Version
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = (process.env.GEMINI_API_KEY || "").replace(/['"]/g, '').trim();
  if (!apiKey) return res.status(500).json({ error: 'API Key missing.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { contents, systemInstruction, generationConfig } = req.body;
    
    // 試行パターンの定義
    // 優先順位を整理し、より多くの組み合わせを試します
    const attempts = [
      { ver: "v1beta", mode: "modern", model: "gemini-1.5-flash" },
      { ver: "v1",     mode: "modern", model: "gemini-1.5-flash" },
      { ver: "v1beta", mode: "legacy", model: "gemini-1.5-flash" },
      { ver: "v1",     mode: "legacy", model: "gemini-1.5-flash" },
      { ver: "v1beta", mode: "legacy", model: "gemini-pro" },
      { ver: "v1",     mode: "legacy", model: "gemini-pro" },
      { ver: "v1",     mode: "legacy", model: "gemini-1.0-pro" }
    ];

    let lastError = null;

    for (const attempt of attempts) {
      console.log(`[Attempt] ${attempt.ver} (${attempt.mode}) with ${attempt.model}...`);
      
      const url = `https://generativelanguage.googleapis.com/${attempt.ver}/models/${attempt.model}:generateContent?key=${apiKey}`;

      let payload = {};

      if (attempt.mode === "modern") {
        // 最新の書き方
        payload = { contents };
        const isV1 = attempt.ver === "v1";
        const config = {};
        
        // 400エラーの原因となる可能性のあるフィールドを個別にチェックして追加
        if (generationConfig?.responseMimeType) {
          config[isV1 ? "response_mime_type" : "responseMimeType"] = generationConfig.responseMimeType;
        }
        if (generationConfig?.responseSchema) {
          config[isV1 ? "response_schema" : "responseSchema"] = generationConfig.responseSchema;
        }
        if (generationConfig?.temperature !== undefined) {
          config.temperature = generationConfig.temperature;
        }
        
        if (Object.keys(config).length > 0) {
          payload[isV1 ? "generation_config" : "generationConfig"] = config;
        }
        
        if (systemInstruction) {
          payload[isV1 ? "system_instruction" : "systemInstruction"] = systemInstruction;
        }
      } else {
        // ★超・安全モード（レガシー）：Googleが「知らない」と言っているフィールドを一切含めない
        const legacyContents = JSON.parse(JSON.stringify(contents));
        
        // システム指示をユーザープロンプトに統合
        if (systemInstruction) {
          const systemText = systemInstruction.parts?.[0]?.text || "";
          if (legacyContents[0] && legacyContents[0].parts && legacyContents[0].parts[0]) {
            legacyContents[0].parts[0].text = `[System Instructions]\n${systemText}\n\n[User Request]\n${legacyContents[0].parts[0].text}`;
          }
        }
        
        // 400エラーを回避するため、generationConfigすら含めない最小構成
        payload = { contents: legacyContents };
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
          console.log(`[Success!] Connected via ${attempt.ver} ${attempt.mode} with ${attempt.model}`);
          return res.status(200).json(data);
        } else {
          // 詳細なエラーをログに出力
          const errorMsg = data.error?.message || "No message";
          console.warn(`[Fail] ${attempt.ver}/${attempt.mode}/${attempt.model} -> HTTP ${response.status}: ${errorMsg}`);
          lastError = data;
          
          // APIキー自体が無効な場合は即座に終了
          if (response.status === 401 || (data.error?.status === "UNAUTHENTICATED")) {
            console.error("[Fatal] API Key is invalid.");
            return res.status(401).json(data);
          }
        }
      } catch (e) {
        console.error(`[Network Error] ${attempt.ver}/${attempt.mode}:`, e.message);
      }
    }

    console.error("[Fatal] All attempts failed. Final diagnostic information sent to client.");
    res.status(500).json({ 
      error: "All attempts failed", 
      diagnostic: "Please check Vercel Runtime Logs for full details.",
      last_google_error: lastError 
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};
