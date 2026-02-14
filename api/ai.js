// Vercel Serverless Function (CommonJS) - Barebones Minimal Version
module.exports = async (req, res) => {
  // 1. CORSヘッダー（必須）
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 2. APIキーの取得
  const rawKey = process.env.GEMINI_API_KEY || "";
  const apiKey = rawKey.replace(/['"]/g, '').trim();

  if (!apiKey) return res.status(500).json({ error: 'API Key missing.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { contents, systemInstruction } = req.body;
    
    // 3. 【重要】システム指示を「ユーザーの質問の最初」に力ずくで埋め込む
    // Googleが「system_instruction」という名前の設定を拒否しているため、この方法しかありません
    let textToSend = "";
    if (systemInstruction && systemInstruction.parts && systemInstruction.parts[0]) {
      textToSend += `【重要指示】\n${systemInstruction.parts[0].text}\n\n`;
    }
    if (contents && contents[0] && contents[0].parts && contents[0].parts[0]) {
      textToSend += `【ユーザーの依頼】\n${contents[0].parts[0].text}`;
    }

    // 4. 極限まで削ぎ落とした最小のデータ構造
    // generationConfigも responseMimeTypeも一切含めません
    const minimalPayload = {
      contents: [{
        role: "user",
        parts: [{ text: textToSend }]
      }]
    };

    // 5. 接続先を「もっとも汎用的な v1」に固定
    const modelName = "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;

    console.log(`[Barebones] Sending minimal request to ${modelName}...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(minimalPayload)
    });

    const data = await response.json();

    if (response.ok) {
      console.log("[Success!] Barebones request succeeded.");
      return res.status(200).json(data);
    } else {
      console.error(`[Fail] HTTP ${response.status}: ${JSON.stringify(data)}`);
      // もし v1 がダメなら、最後のあがきで v1beta に同じ最小構成で投げる
      const retryUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const retryResponse = await fetch(retryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(minimalPayload)
      });
      const retryData = await retryResponse.json();
      if (retryResponse.ok) return res.status(200).json(retryData);
      
      return res.status(response.status).json(retryData);
    }

  } catch (error) {
    res.status(500).json({ error: 'Server Error', details: error.message });
  }
};
