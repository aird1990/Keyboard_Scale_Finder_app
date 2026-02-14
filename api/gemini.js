  export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  // 最新のモデル名を使用（利用可能なものに変更）
  const modelName = "gemini-1.5-flash"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!apiKey) {
    return res.status(500).json({ error: 'API Key is missing in Vercel settings' });
  }

  try {
    const { contents, systemInstruction, generationConfig } = req.body;

    // Google Gemini API の期待する厳密な構造に再構成
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
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Server Error', details: error.message });
  }
}
