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
    // 1. v1beta (最新機能あり) 
    // 2. v1 (最新機能あり)
    // 3. v1 (レガシー構成: システム指示を使わない) ← これが本命
    const attempts = [
      { ver: "v1beta", mode: "modern", model: "gemini-1.5-flash" },
      { ver: "v1",     mode: "modern", model: "gemini-1.5-flash" },
      { ver: "v1",     mode: "legacy", model: "gemini-1.5-flash" },
      { ver: "v1",     mode: "legacy", model: "gemini-pro" }
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
        if (generationConfig?.responseMimeType) config[isV1 ? "response_mime_type" : "responseMimeType"] = generationConfig.responseMimeType;
        if (generationConfig?.responseSchema)   config[isV1 ? "response_schema" : "responseSchema"] = generationConfig.responseSchema;
        if (generationConfig?.temperature)      config.temperature = generationConfig.temperature;
        
        payload[isV1 ? "generation_config" : "generationConfig"] = config;
        if (systemInstruction) payload[isV1 ? "system_instruction" : "systemInstruction"] = systemInstruction;
      } else {
        // ★レガシー構成：システム指示を使わず、メッセージの先頭に指示を埋め込む
        // 400エラー（Unknown name）を回避するための唯一の方法
        const legacyContents = JSON.parse(JSON.stringify(contents)); // ディープコピー
        if (systemInstruction) {
          const systemText = systemInstruction.parts?.[0]?.text || "";
          if (legacyContents[0]) {
            legacyContents[0].parts[0].text = `Instructions: ${systemText}\n\nUser Request: ${legacyContents[0].parts[0].text}`;
          }
        }
        payload = { 
          contents: legacyContents,
          generationConfig: { temperature: generationConfig?.temperature || 0.7 } 
        };
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
          console.log(`[Success!] Connected via ${attempt.ver} ${attempt.mode}`);
          return res.status(200).json(data);
        } else {
          console.warn(`[Fail] ${attempt.ver}/${attempt.mode}: ${data.error?.message}`);
          lastError = data;
        }
      } catch (e) {
        console.error(`[Error] ${attempt.ver}/${attempt.mode}:`, e.message);
      }
    }

    res.status(500).json({ error: "All attempts failed", last_google_error: lastError });
  } catch (error) {
    res.status(500).json({ error: 'Server Error', details: error.message });
  }
};
