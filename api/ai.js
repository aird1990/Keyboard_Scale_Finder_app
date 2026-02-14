// Vercel Serverless Function (CommonJS) - Robust Debug Version
module.exports = async (req, res) => {
  // 1. CORSヘッダーの設定（ブラウザからのアクセスを許可）
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // プリフライトリクエスト（OPTIONS）への応答
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. APIキーの診断と取得
  const rawKey = process.env.GEMINI_API_KEY || "";
  const apiKey = rawKey.trim(); // 余分なスペースを削除

  // 診断ログ: キーの状態を確認（セキュリティのためキーそのものは表示しません）
  console.log(`[Debug] API Key Length: ${apiKey.length}`);
  console.log(`[Debug] API Key Starts With: ${apiKey.substring(0, 4)}...`);

  if (!apiKey) {
    console.error("[Error] API Key is empty.");
    return res.status(500).json({ error: 'API Key is missing in Vercel settings.' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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

    // 3. 試行するモデルのリスト（優先順位順）
    // 1.5-flash (最新・高速) -> 1.5-pro (高性能) -> 1.0-pro (旧安定版)
    const modelsToTry = [
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-1.0-pro",
      "gemini-pro"
    ];

    let lastError = null;
    let successData = null;

    // 4. モデルを順番に試すループ（フォールバック処理）
    for (const modelName of modelsToTry) {
      console.log(`[Attempt] Trying model: ${modelName}...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
          console.log(`[Success] Connected to ${modelName}!`);
          successData = data;
          break; // 成功したらループを抜ける
        } else {
          console.warn(`[Failed] ${modelName} returned error:`, data.error?.message);
          lastError = data;
          // 404 (Not Found) の場合のみ次のモデルを試す。それ以外（認証エラーなど）は停止
          if (response.status !== 404) {
            break;
          }
        }
      } catch (e) {
        console.error(`[Network Error] ${modelName}:`, e);
        lastError = { error: { message: e.message } };
      }
    }

    // 5. 結果の返却
    if (successData) {
      res.status(200).json(successData);
    } else {
      console.error("[Fatal] All models failed.");
      // 最後のエラーをクライアントに返す
      res.status(500).json(lastError || { error: "All models failed to respond." });
    }

  } catch (error) {
    console.error("Server Internal Error:", error);
    res.status(500).json({ error: 'Server Internal Error', details: error.message });
  }
};
```

### 手順 2: 保存して完了

1. **Commit changes** を押して保存します。
2. Vercelの **Logs** タブを開きながら、再デプロイを待ちます。
3. アプリでAI生成ボタンを押します。

**解説:**
このコードは、まず最新の `gemini-1.5-flash` を試し、ダメなら `gemini-1.5-pro`、それでもダメなら `gemini-1.0-pro`... と自動で切り替えます。
また、ログに `[Debug] API Key Starts With: AIza...` と表示されるので、Vercelが正しいキーを読み込めているかも一目で確認できます。
