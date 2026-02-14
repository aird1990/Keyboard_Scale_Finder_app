// Vercel Serverless Function (CommonJS)
// ファイル名変更によるキャッシュクリア対策版
module.exports = async (req, res) => {
  // CORS設定
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // プリフライトリクエストの処理
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  // Gemini 1.5 Flash (最新かつ高速)
  const modelName = "gemini-1.5-flash"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  // メソッドチェック
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // APIキーチェック
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY is not set.");
    return res.status(500).json({ error: 'API Key is missing in Vercel settings' });
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

    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error:", data);
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ error: 'Server Error', details: error.message });
  }
};
