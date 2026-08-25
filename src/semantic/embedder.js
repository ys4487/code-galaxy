const https = require('https');

/**
 * מפיק Embedding (וקטור) מטקסט באמצעות המודל הייעודי שפתוח בחשבון
 */
function generateEmbedding(text, apiKey) {
  return new Promise((resolve) => {
    if (!apiKey) {
      return resolve(null);
    }

    const postData = JSON.stringify({
      model: "models/gemini-embedding-2", // 🆕 המודל המדויק שפתוח למפתח שלך!
      content: {
        parts: [{ text: text.substring(0, 2000) }] 
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`, // 🆕 עדכון הנתיב בהתאמה
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.embedding && parsed.embedding.values) {
            resolve(parsed.embedding.values);
          } else {
            console.error("⚠️ גוגל סירבה לייצר וקטור. סיבה:", parsed.error ? parsed.error.message : data);
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.write(postData);
    req.end();
  });
}

module.exports = { generateEmbedding };