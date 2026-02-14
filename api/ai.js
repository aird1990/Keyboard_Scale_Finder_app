// Vercel Serverless Function (CommonJS) - Auto-Discovery Robust Version
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
    const { contents, systemInstruction } = req.body;
    
    // 1. [探索ステップ] このAPIキーで使えるモデルの一覧をGoogleに問い合わせる
    console.log("[Discovery] Fetching available models for this API key...");
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    let availableModels = [];
    
    try {
      const listResponse = await fetch(listUrl);
      const listData = await listResponse.json();
      if (listData.models) {
        // "gemini" を含むモデル名を抽出して優先順に並べる
        availableModels = listData.models
          .map(m => m.name.replace('models/', ''))
          .filter(name => name.includes('gemini'));
        console.log("[Discovery] Found Gemini models:", availableModels.join(', '));
      }
    } catch (e) {
      console.error("[Discovery Error] Failed to list models:", e.message);
    }

    // 2. もしリスト取得に失敗した場合の予備リスト（レガシーから最新まで）
    const fallbackList = [
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-pro",
      "gemini-1.0-pro"
    ];

    // 探索で見つかったモデルを優先し、なければ予備リストを使う
    const modelsToTry = availableModels.length > 0 ? availableModels : fallbackList;

    let lastError = null;

    // 3. 使えるモデルが見つかるまで順番に試行
    for (const modelName of modelsToTry) {
      // プレビュー版や実験的モデルはスキップ（安定性を優先）
      if (modelName.includes('vision') || modelName.includes('tuning')) continue;

      console.log(`[Attempt] Connecting to: ${modelName}...`);
      
      // Googleが「知らない」と言っている設定を排除した、最も原始的なデータ構造
      const legacyContents = JSON.parse(JSON.stringify(contents));
      if (systemInstruction) {
        const systemText = systemInstruction.parts?.[0]?.text || "";
        if (legacyContents[0]?.parts?.[0]) {
          legacyContents[0].parts[0].text = `[Instructions]\n${systemText}\n\n[User Request]\n${legacyContents[0].parts[0].text}`;
        }
      }

      // v1beta を優先的に使用
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: legacyContents })
        });

        const data = await response.json();

        if (response.ok) {
          console.log(`[Success!] Valid model found and connected: ${modelName}`);
          return res.status(200).json(data);
        } else {
          console.warn(`[Fail] ${modelName} returned HTTP ${response.status}: ${data.error?.message}`);
          lastError = data;
          // キー自体が無効な場合はリトライを停止
          if (response.status === 401) break;
        }
      } catch (e) {
        console.error(`[Network Error] ${modelName}:`, e.message);
      }
    }

    // 全て失敗した場合、診断情報を返却
    res.status(500).json({ 
      error: "All attempts failed", 
      message: "利用可能なGeminiモデルが見つかりませんでした。Google AI Studioで新しいAPIキーを 'New Project' として作成し直すことを強く推奨します。",
      debug_models_tried: modelsToTry,
      last_google_error: lastError 
    });

  } catch (error) {
    res.status(500).json({ error: 'Server Error', details: error.message });
  }
};
