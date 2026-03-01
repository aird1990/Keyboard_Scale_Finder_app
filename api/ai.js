// Vercel Serverless Function (CommonJS) - Final Clean Version
module.exports = async (req, res) => {
  // CORS設定（ブラウザからのアクセス許可）
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // APIキーの取得と不要な記号の削除
  const apiKey = (process.env.GEMINI_API_KEY || "").replace(/['"]/g, '').trim();
  
  if (!apiKey) {
    return res.status(500).json({ error: 'API Key is missing in Vercel.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { contents, systemInstruction, generationConfig } = req.body;
    
    // 現在最も高速で安定している最新モデルを指定
    const modelName = "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // 送信データの組み立て
    const payload = { contents };
    if (systemInstruction) payload.systemInstruction = systemInstruction;
    if (generationConfig) payload.generationConfig = generationConfig;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok) {
      return res.status(200).json(data);
    } else {
      console.error("[Gemini API Error]", JSON.stringify(data));
      return res.status(response.status).json(data);
    }

  } catch (error) {
    console.error("[Server Error]", error);
    res.status(500).json({ error: 'Server Error', details: error.message });
  }
};
