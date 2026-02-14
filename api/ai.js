// Vercel Serverless Function (CommonJS) - Ultimate Barebones (Multi-Model Fallback)
module.exports = async (req, res) => {
  // 1. CORSヘッダー
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = (process.env.GEMINI_API_KEY || "").replace(/['"]/g, '').trim();
  if (!apiKey) return res.status(500).json({ error: 'API Key missing.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { contents, systemInstruction } = req.body;
    
    // システム指示を文章の先頭に埋め込む（レガシー互換）
    let textToSend = "";
    if (systemInstruction && systemInstruction.parts && systemInstruction.parts[0]) {
      textToSend += `【指示】\n${systemInstruction.parts[0].text}\n\n`;
    }
    if (contents && contents[0] && contents[0].parts && contents[0].parts[0]) {
      textToSend += `【依頼】\n${contents[0].parts[0].text}`;
    }

    const minimalPayload = {
      contents: [{ role: "user", parts: [{ text: textToSend }] }]
    };

    // 試行するモデルの優先順位
    // 新しいアカウントで最も早く認識される可能性のある順に並べています
    const modelsToTry = [
      "gemini-1.5-flash",
      "gemini-pro", // 1.0の基本モデル（最も汎用的）
      "gemini-1.0-pro"
    ];

    let lastError = null;

    for (const model of modelsToTry) {
      console.log(`[Barebones] Attempting ${model}...`);
      
      // v1 エンドポイントで試行
      const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(minimalPayload)
        });

        const data = await response.json();

        if (response.ok) {
          console.log(`[Success!] Connected via ${model}`);
          return res.status(200).json(data);
        } else {
          console.warn(`[Fail] ${model}: ${data.error?.message}`);
          lastError = data;
          // 404 以外（認証エラー等）の場合は、ループを中断してエラーを返す
          if (response.status !== 404) break;
        }
      } catch (e) {
        console.error(`[Error] ${model}:`, e.message);
      }
    }

    // 全て失敗した場合は、待機を促すメッセージを返す
    res.status(500).json({ 
      error: "API準備中", 
      message: "Google側のAPI有効化を待機しています。24時間以内に利用可能になる予定です。",
      last_google_error: lastError 
    });

  } catch (error) {
    res.status(500).json({ error: 'Server Error', details: error.message });
  }
};
