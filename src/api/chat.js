const https = require('https');
const fs = require('fs');
const { generateEmbedding } = require('../semantic/embedder');
const { cosineSimilarity } = require('../semantic/vectorDb');
const { loadCache } = require('./analyzer');

async function handleChatStream(req, res, body) {
  try {
    const { filePath, question } = JSON.parse(body);
    const apiKey = process.env.GEMINI_API_KEY;
    
    let codeContent = '';
    let structuralContext = '';
    let globalContext = '';
    
    const cache = loadCache();

    // --- א. קונטקסט מקומי ומבני ---
    if (filePath && filePath !== 'null' && fs.existsSync(filePath)) {
      codeContent = fs.readFileSync(filePath, 'utf-8');
      const fileMeta = cache[filePath]?.analysis;
      
      if (fileMeta) {
        const imports = fileMeta.imports?.length ? fileMeta.imports.join(', ') : 'ללא תלויות';
        const functions = fileMeta.functions?.length ? fileMeta.functions.join(', ') : 'אין';
        const classes = fileMeta.classes?.length ? fileMeta.classes.join(', ') : 'אין';
        
        structuralContext = `
📌 **קונטקסט ארכיטקטוני מקומי (AST):**
- פונקציות בקובץ: ${functions}
- מחלקות בקובץ: ${classes}
- תלויות (Imports): ${imports}
- סיבוכיות: ${fileMeta.complexity}
        `;
      }
    }

    // --- ב. קונטקסט גלובלי סמנטי ---
    if (!filePath || filePath === 'null') {
      try {
        console.log(`\n🔍 [צ'אט גלובלי] בונה קונטקסט חכם עבור: "${question}"`);
        
        // 1. תמיד נבנה מפה גלובלית (שמות קבצים והפונקציות המרכזיות שלהם מה-AST)
        const filesSummary = Object.values(cache).map(file => {
           const name = file.analysis?.name || 'קובץ לא ידוע';
           const funcs = file.analysis?.functions?.slice(0, 4).join(', ') || 'ללא פונקציות בולטות';
           return `- ${name} (יכולות מרכזיות בקובץ: ${funcs})`;
        }).join('\n');

        let semanticContext = '';

        // 2. ננסה להביא מקטעי קוד ספציפיים בעזרת חיפוש וקטורי
        const questionVector = await generateEmbedding(question, apiKey);
        if (questionVector) {
          let allChunks = [];
          for (const fp in cache) {
            if (cache[fp].chunks) {
              allChunks.push(...cache[fp].chunks.filter(c => c.vector));
            }
          }

          allChunks.forEach(chunk => {
            chunk.similarity = cosineSimilarity(questionVector, chunk.vector);
          });

          // התיקון: לוקחים את ה-3 הכי רלוונטיים, בלי קשר לסף נוקשה, כדי שתמיד יהיה לו בסיס
          allChunks.sort((a, b) => b.similarity - a.similarity);
          const topChunks = allChunks.slice(0, 3);

          if (topChunks.length > 0) {
            semanticContext = `
📌 **מקטעי קוד לדוגמה מהפרויקט (קשורים לשאלה):**
${topChunks.map((c, i) => `--- מתוך ${c.filePath} ---\n${c.text}`).join('\n\n')}
            `;
          }
        }
        
        // חיבור הכל יחד - ג'מיני מקבל עכשיו תמונה ענקית וברורה
        globalContext = `
🌍 **מפת הפרויקט (קבצים ויכולות):**
${filesSummary}

${semanticContext}
        `;
        
      } catch (err) {
        console.error("❌ שגיאה בשליפת קונטקסט גלובלי:", err.message);
      }
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // --- בניית הפרומפט הדינמי ---
    let systemPrompt = '';

    if (filePath && filePath !== 'null') {
      systemPrompt = `אתה עוזר פיתוח קוד מקצועי השולט בארכיטקטורת תוכנה. ענה בעברית בצורה מועילה ותמציתית. 

אם אתה מציע תיקון רגיל לקובץ הנוכחי, החזר אך ורק את הבלוק הספציפי שדורש שינוי:
<<<<<<< SEARCH
הקוד הישן כפי שהוא מופיע בדיוק
=======
הקוד החדש והמתוקן
>>>>>>> REPLACE

אם אתה ממליץ לפצל קוד ולהוציא אותו לקובץ חדש, עליך לבצע את **שתי הפעולות הבאות יחד באותה תשובה**:
1. החזר בלוק SEARCH ו-REPLACE שמסיר את הקוד (הפונקציות) מהקובץ הנוכחי.
2. החזר בלוק CREATE שמכיל את הקוד המלא שיועבר לקובץ החדש, בפורמט הזה בדיוק:
<<<<<<< CREATE [שם_הקובץ_החדש.js]
הקוד המלא שילך לקובץ החדש
>>>>>>> END_CREATE

${structuralContext}
${globalContext}

הנה תוכן הקוד המלא של הקובץ הנוכחי (${filePath}):
\`\`\`javascript
${codeContent}
\`\`\`
`;
    } else {
      // 🆕 פקודות חדשות לג'מיני שיכריחו אותו להשתמש בהיגיון ולא להתחמק
      systemPrompt = `אתה ארכיטקט תוכנה בכיר שמנתח פרויקט שלם. ענה בעברית בצורה מועילה, זורמת ותמציתית.
המשתמש ישאל שאלות כלליות על הפרויקט. במקום לבקש קובצי README, עליך להסיק את מטרת הפרויקט והארכיטקטורה שלו מתוך "מפת הפרויקט" שסופקה לך למטה (הכוללת את שמות כל הקבצים ורשימת הפונקציות המרכזיות שלהם).
* לעולם אל תגיד "לא סופק קונטקסט" או תבקש קבצים נוספים. השתמש במפת הפרויקט המפורטת כדי לספק את הניתוח הטוב והחכם ביותר שאתה יכול. ציון שמות הקבצים והיכולות שלהם בהסבר שלך יתקבל בברכה.

${globalContext}
`;
    }

    const postData = JSON.stringify({
      contents: [{
        parts: [{ text: `${systemPrompt}\n\nשאלה ממשתמש: ${question}` }]
      }]
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/gemini-3.6-flash:streamGenerateContent?key=${apiKey}&alt=sse`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const geminiReq = https.request(options, (geminiRes) => {
      // 1. טיפול חסין בשגיאות של גוגל (כמו Rate Limit)
      if (geminiRes.statusCode !== 200) {
        let errorBody = '';
        geminiRes.on('data', chunk => errorBody += chunk.toString());
        geminiRes.on('end', () => {
           console.error(`❌ שגיאה מגוגל (קוד ${geminiRes.statusCode}):`, errorBody);
           res.write(`data: ${JSON.stringify({ text: `⚠️ השרת של גוגל דחה את הבקשה (קוד ${geminiRes.statusCode}). זה קורה בדרך כלל בגלל עומס בקשות. המתן דקה ונסה שוב.` })}\n\n`);
           res.write('data: [DONE]\n\n');
           res.end();
        });
        return;
      }

      let buffer = '';
      let receivedAnything = false;

      // 2. קריאת הזרם עם זיכרון למניעת קטיעת מילים
      geminiRes.on('data', (chunk) => {
        buffer += chunk.toString();
        let lines = buffer.split('\n');
        buffer = lines.pop(); // 🆕 שומר את השורה הלא-גמורה לפעם הבאה

        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') return;
            try {
              const parsed = JSON.parse(dataStr);
              const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textChunk) {
                receivedAnything = true;
                res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
              }
            } catch (e) {} // התעלם מ-JSON שבור
          }
        });
      });

      geminiRes.on('end', () => {
        if (!receivedAnything) {
           res.write(`data: ${JSON.stringify({ text: "⚠️ השרת סיים את התשובה מבלי להחזיר טקסט. ייתכן שהשאלה נחסמה (Safety)." })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });

    geminiReq.on('error', (e) => {
      console.error("❌ שגיאת תקשורת עם Gemini:", e);
      res.write(`data: ${JSON.stringify({ text: "שגיאת תקשורת עם שרתי Google: " + e.message })}\n\n`);
      res.end();
    });

    geminiReq.write(postData);
    geminiReq.end();

  } catch (e) {
    console.error("🔥 שגיאה קריטית בצ'אט השרת:", e);
    res.writeHead(500);
    res.end();
  }
}


module.exports = { handleChatStream };