require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { exec } = require('child_process');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// 🆕 אתחול החיבור למסד הנתונים (תחביר מודרני)
let db;
try {
  const serviceAccount = require('./firebase-key.json');
  initializeApp({
    credential: cert(serviceAccount)
  });
  db = getFirestore();
  console.log("🔥 מחובר בהצלחה ל-Firebase Firestore!");
} catch (error) {
  console.error("❌ שגיאה בחיבור לפיירבייס:", error.message);
}

// ייבוא המודולים החדשים שלנו
const { buildGalaxyData } = require('./src/api/analyzer');
const { handleChatStream } = require('./src/api/chat');
// 🆕 מאגר גלובלי לשמירת התקדמות הסריקה
const scanProgressMap = {};

// --- 🕒 מנגנון היסטוריית פרויקטים (מחובר ל-Firebase בענן!) ---

async function getHistory() {
  if (!db) return [];
  try {
    // שולף מהענן את 10 הפרויקטים האחרונים מסודרים לפי תאריך
    const snapshot = await db.collection('history').orderBy('lastAccessed', 'desc').limit(10).get();
    const history = [];
    snapshot.forEach(doc => history.push(doc.data()));
    return history;
  } catch (e) {
    console.error("Error getting history:", e);
    return [];
  }
}

async function upsertProjectToHistory(id, type, name, repoUrl = null) {
  if (!db) return;
  try {
    const now = new Date().toISOString();
    const data = { id, type, name, lastAccessed: now };
    // 🆕 אם קיבלנו קישור לגיטהאב, נוסיף אותו למידע שנשמר בענן
    if (repoUrl) {
      data.repoUrl = repoUrl;
    }
    await db.collection('history').doc(id).set(data);
  } catch (e) {
    console.error("Error saving history:", e);
  }
}

async function deleteProjectFromHistory(id) {
  if (!db) return;
  try {
    await db.collection('history').doc(id).delete();
  } catch (e) {
    console.error("Error deleting history:", e);
  }
}

const server = http.createServer((req, res) => {
  // 1. הגשת קבצים סטאטיים (HTML, CSS, JS)
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  if (req.method === 'GET' && req.url === '/style.css') {
    res.writeHead(200, { 'Content-Type': 'text/css' });
    return res.end(fs.readFileSync(path.join(__dirname, 'public', 'style.css')));
  }

  if (req.method === 'GET' && req.url === '/app.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    return res.end(fs.readFileSync(path.join(__dirname, 'public', 'app.js')));
  }

  // 🌟 הגשת האייקונים ותעודת הזהות של האפליקציה (PWA)
  const urlPath = req.url.split('?')[0]; // מנקה פרמטרים כמו ?v=4 כדי למצוא את הקובץ
  if (req.method === 'GET' && (urlPath === '/icon.png' || urlPath === '/icon.svg' || urlPath === '/manifest.json')) {
    const filePath = path.join(__dirname, 'public', urlPath);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      const contentType = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : 'application/json';
      res.writeHead(200, { 'Content-Type': contentType });
      return res.end(fs.readFileSync(filePath));
    }
  }

  // 📥 קליטת פרויקט מגיטהאב, ניתוח ומחיקה
  if (req.method === 'POST' && req.url === '/api/analyze-github') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { repoUrl, scanId } = JSON.parse(body); // 🆕 קליטת scanId
        // 🆕 מאשרים את שלושת הענקים!
        const isValidRepo = repoUrl.includes('github.com') || repoUrl.includes('gitlab.com') || repoUrl.includes('bitbucket.org');
        if (!repoUrl || !isValidRepo) {
          res.writeHead(400); return res.end(JSON.stringify({ error: 'קישור לא תקין. נדרש קישור מ-GitHub, GitLab או Bitbucket.' }));
        }

        const repoName = repoUrl.split('/').pop().replace('.git', '');
        const projectId = 'repo_' + repoName;
        const tempPath = path.join(process.cwd(), 'data', projectId);

        if (fs.existsSync(tempPath)) {
          fs.rmSync(tempPath, { recursive: true, force: true });
        }

        console.log(`📥 מתחיל הורדה מגיטהאב: ${repoUrl}`);
        exec(`git clone --depth 1 ${repoUrl} ${tempPath}`, async (error) => {
          if (error) {
            console.error(error);
            res.writeHead(500); return res.end(JSON.stringify({ error: 'שגיאה בהורדת הפרויקט מגיטהאב.' }));
          }
          
          console.log(`🚀 מנתח את הפרויקט שירד: ${projectId}`);
          try {
            if (scanId) scanProgressMap[scanId] = { current: 0, total: 1 }; // אתחול התקדמות
            
            // 🆕 חיבור הדיווח לשרת בדיוק כמו בתיקייה מקומית
            const graphData = await buildGalaxyData(tempPath, (current, total) => {
               if (scanId) scanProgressMap[scanId] = { current, total };
            });
            
            upsertProjectToHistory(projectId, 'github', repoName, repoUrl);
            zlib.gzip(JSON.stringify(graphData), (err, buffer) => {
              res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
              res.end(buffer);
            });
            
            if (scanId) delete scanProgressMap[scanId]; // ניקוי בסיום
          } catch (analyzeErr) {
            res.writeHead(500); res.end(JSON.stringify({ error: 'שגיאה בניתוח הקוד: ' + analyzeErr.message }));
          }
        });
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 📦 קליטת פרויקט מקובץ ZIP (קישור ישיר)
  if (req.method === 'POST' && req.url === '/api/analyze-zip-url') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { zipUrl, scanId } = JSON.parse(body);
        if (!zipUrl) {
          res.writeHead(400); return res.end(JSON.stringify({ error: 'קישור חסר.' }));
        }

        const projectId = 'zip_' + Date.now();
        const tempPath = path.join(process.cwd(), 'data', projectId);
        const zipFilePath = path.join(process.cwd(), 'data', `${projectId}.zip`);

        if (scanId) scanProgressMap[scanId] = { current: 0, total: 1 };
        console.log(`📥 מוריד קובץ ZIP: ${zipUrl}`);

        // 1. הורדת הקובץ מהאינטרנט
        const response = await axios({ url: zipUrl, method: 'GET', responseType: 'arraybuffer' });
        fs.writeFileSync(zipFilePath, response.data);

        // 2. חילוץ הקובץ (Unzip)
        console.log(`📦 מחלץ את ה-ZIP...`);
        const zip = new AdmZip(zipFilePath);
        zip.extractAllTo(tempPath, true);
        fs.unlinkSync(zipFilePath); // מחיקת ה-ZIP לאחר החילוץ כדי לחסוך מקום בשרת

        console.log(`🚀 מנתח פרויקט מ-ZIP: ${projectId}`);
        const graphData = await buildGalaxyData(tempPath, (current, total) => {
           if (scanId) scanProgressMap[scanId] = { current, total };
        });

        upsertProjectToHistory(projectId, 'zip', 'פרויקט ZIP', zipUrl);

        zlib.gzip(JSON.stringify(graphData), (err, buffer) => {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
          res.end(buffer);
        });
        
        if (scanId) delete scanProgressMap[scanId];

      } catch (e) {
        console.error(e);
        res.writeHead(500); res.end(JSON.stringify({ error: 'שגיאה בהורדת ה-ZIP. ודא שזהו קישור ישיר תקין.' }));
      }
    });
    return;
  }

  // 🚀 קליטת פרויקט מספריית NPM
  if (req.method === 'POST' && req.url === '/api/analyze-npm') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { packageName, scanId } = JSON.parse(body);
        if (!packageName) return res.writeHead(400).end(JSON.stringify({ error: 'שם חבילה חסר.' }));

        // ניקוי הקידומת 'npm:' כדי לקבל את השם האמיתי
        const cleanName = packageName.replace(/^npm:/i, '').trim();
        const projectId = 'npm_' + cleanName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const tempPath = path.join(process.cwd(), 'data', projectId);
        
        fs.mkdirSync(tempPath, { recursive: true });
        if (scanId) scanProgressMap[scanId] = { current: 0, total: 1 };
        console.log(`📥 מתקין חבילת NPM לתצוגה: ${cleanName}`);

        // הורדת החבילה ללא שמירה לפרויקט שלנו הראשי
        exec(`npm install ${cleanName} --prefix "${tempPath}" --no-save --no-package-lock`, async (error) => {
          if (error) {
            console.error(error);
            res.writeHead(500); return res.end(JSON.stringify({ error: 'שגיאה בהורדת החבילה מ-NPM. ודא שהשם נכון.' }));
          }
          
          // מתמגנטים אך ורק לקוד המקור של החבילה עצמה!
          const packageCodePath = path.join(tempPath, 'node_modules', cleanName);
          console.log(`🚀 מנתח חבילת NPM: ${cleanName}`);
          
          try {
            const graphData = await buildGalaxyData(packageCodePath, (current, total) => {
               if (scanId) scanProgressMap[scanId] = { current, total };
            });

            upsertProjectToHistory(projectId, 'npm', `NPM: ${cleanName}`, `npm:${cleanName}`);
            zlib.gzip(JSON.stringify(graphData), (err, buffer) => {
              res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
              res.end(buffer);
            });
            if (scanId) delete scanProgressMap[scanId];
          } catch (analyzeErr) {
            res.writeHead(500); res.end(JSON.stringify({ error: 'שגיאה בניתוח הקוד: ' + analyzeErr.message }));
          }
        });
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 📂 קליטת פרויקט מקומי (תיקייה), ניתוח ומחיקה
  if (req.method === 'POST' && req.url === '/api/analyze-local-folder') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { files, scanId } = JSON.parse(body);
        if (!files || files.length === 0) {
          res.writeHead(400); return res.end(JSON.stringify({ error: 'לא נשלחו קבצים' }));
        }

        // 🆕 התיקון: תיקייה קבועה לפי שם הפרויקט ולא לפי שעון!
        const projectName = files[0].path.split('/')[0] || 'local_project';
        const projectId = 'local_' + projectName;
        const tempPath = path.join(process.cwd(), 'data', projectId);

        // 🧹 ניקוי שאריות מהעלאות קודמות
        if (fs.existsSync(tempPath)) {
          fs.rmSync(tempPath, { recursive: true, force: true });
        }

        if (scanId) scanProgressMap[scanId] = { current: 0, total: files.length };

        for (const file of files) {
          const fullFilePath = path.join(tempPath, file.path);
          const dir = path.dirname(fullFilePath);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fullFilePath, file.content, 'utf-8');
        }

        console.log(`🚀 מנתח פרויקט מקומי: ${projectId}`);
        
        const graphData = await buildGalaxyData(tempPath, (current, total) => {
           if (scanId) scanProgressMap[scanId] = { current, total };
        });

        upsertProjectToHistory(projectId, 'local', projectName);

        zlib.gzip(JSON.stringify(graphData), (err, buffer) => {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
          res.end(buffer);
        });
        
        if (scanId) delete scanProgressMap[scanId];

      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 🕒 ראוט: שליפת היסטוריית פרויקטים (מהענן)
  if (req.method === 'GET' && req.url === '/api/history') {
    (async () => {
      const history = await getHistory();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(history));
    })();
    return;
  }

  // 🗑️ ראוט: מחיקת פרויקט מההיסטוריה (מהענן) ומהדיסק
  if (req.method === 'DELETE' && req.url.startsWith('/api/history/')) {
    (async () => {
      const id = req.url.split('/').pop();
      await deleteProjectFromHistory(id);
      
      const projectDir = path.join(process.cwd(), 'data', id);
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
      
      res.writeHead(200); res.end(JSON.stringify({ success: true }));
    })();
    return;
  }

  // ⚡ ראוט: טעינת פרויקט מהיר מהזיכרון (או ריפוי עצמי מגיטהאב!)
  if (req.method === 'GET' && req.url.startsWith('/api/load-project/')) {
    (async () => {
      const id = req.url.split('/').pop();
      const projectPath = path.join(process.cwd(), 'data', id);
      
      // מצב א': הקבצים נמצאים בשרת (Render עוד לא מחק אותם) - טעינה מהירה
      if (fs.existsSync(projectPath)) {
        try {
          console.log(`⚡ טוען פרויקט קיים מהזיכרון: ${id}`);
          const graphData = await buildGalaxyData(projectPath);
          
          const history = await getHistory();
          const proj = history.find(p => p.id === id);
          upsertProjectToHistory(id, proj ? proj.type : 'local', proj ? proj.name : id, proj ? proj.repoUrl : null);

          zlib.gzip(JSON.stringify(graphData), (err, buffer) => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
            res.end(buffer);
          });
        } catch (e) {
          res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
        }
        return; // סיימנו בהצלחה
      }

      // מצב ב': התיקייה נמחקה! 🦸‍♂️ מפעילים ריפוי עצמי מהענן!
      const history = await getHistory();
      const projectMeta = history.find(p => p.id === id);

      // בודקים אם זה פרויקט גיטהאב ויש לנו את הקישור שלו שמור בפיירבייס
      if (projectMeta && projectMeta.type === 'github' && projectMeta.repoUrl) {
        console.log(`🦸‍♂️ מפעיל ריפוי עצמי (שחזור אוטומטי מגיטהאב) לפרויקט: ${projectMeta.name}`);
        
        exec(`git clone --depth 1 ${projectMeta.repoUrl} ${projectPath}`, async (error) => {
          if (error) {
            res.writeHead(500); return res.end(JSON.stringify({ error: 'שגיאה בשחזור הפרויקט מגיטהאב.' }));
          }
          try {
            const graphData = await buildGalaxyData(projectPath);
            upsertProjectToHistory(id, 'github', projectMeta.name, projectMeta.repoUrl); // מעדכנים תאריך
            
            zlib.gzip(JSON.stringify(graphData), (err, buffer) => {
              res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
              res.end(buffer);
            });
          } catch (analyzeErr) {
            res.writeHead(500); res.end(JSON.stringify({ error: 'שגיאה בניתוח הקוד בשחזור.' }));
          }
        });
      } else if (projectMeta && projectMeta.type === 'zip' && projectMeta.repoUrl) {
        // הריפוי העצמי של פרויקטי ZIP!
        console.log(`🦸‍♂️ מפעיל ריפוי עצמי מ-ZIP לפרויקט: ${projectMeta.name}`);
        const zipFilePath = path.join(process.cwd(), 'data', `${id}.zip`);
        try {
            const response = await axios({ url: projectMeta.repoUrl, method: 'GET', responseType: 'arraybuffer' });
            fs.writeFileSync(zipFilePath, response.data);
            const zip = new AdmZip(zipFilePath);
            zip.extractAllTo(projectPath, true);
            fs.unlinkSync(zipFilePath);
            
            const graphData = await buildGalaxyData(projectPath);
            upsertProjectToHistory(id, 'zip', projectMeta.name, projectMeta.repoUrl); 
            zlib.gzip(JSON.stringify(graphData), (err, buffer) => {
              res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
              res.end(buffer);
            });
        } catch (err) {
            res.writeHead(500); res.end(JSON.stringify({ error: 'שגיאה בשחזור ה-ZIP מהרשת.' }));
        }
      } else if (projectMeta && projectMeta.type === 'npm' && projectMeta.repoUrl) {
        // הריפוי העצמי של NPM!
        console.log(`🦸‍♂️ מפעיל ריפוי עצמי ל-NPM: ${projectMeta.name}`);
        const cleanName = projectMeta.repoUrl.replace(/^npm:/i, '').trim();
        fs.mkdirSync(projectPath, { recursive: true });
        
        exec(`npm install ${cleanName} --prefix "${projectPath}" --no-save --no-package-lock`, async (error) => {
          if (error) {
             res.writeHead(500); return res.end(JSON.stringify({ error: 'שגיאה בשחזור ה-NPM.' }));
          }
          try {
            const packageCodePath = path.join(projectPath, 'node_modules', cleanName);
            const graphData = await buildGalaxyData(packageCodePath);
            upsertProjectToHistory(id, 'npm', projectMeta.name, projectMeta.repoUrl); 
            zlib.gzip(JSON.stringify(graphData), (err, buffer) => {
              res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
              res.end(buffer);
            });
          } catch (analyzeErr) {
             res.writeHead(500); res.end(JSON.stringify({ error: 'שגיאה בניתוח השחזור.' }));
          }
        });  
      } else {
        // מצב ג': הפרויקט נמחק וזה קוד מקומי מהמחשב שלך (לא נוכל לשחזר לבד)
        res.writeHead(404); res.end(JSON.stringify({ error: 'הפרויקט המקומי נמחק מהשרת. אנא פתח אותו מחדש על ידי גרירת התיקייה.' }));
      }
    })();
    return;
  }

  // 📊 ראוט חדש: שליפת התקדמות בזמן אמת מהשרת
  if (req.method === 'GET' && req.url.startsWith('/api/scan-progress')) {
    const scanId = req.url.split('?id=')[1];
    const progress = scanProgressMap[scanId] || { current: 0, total: 0 };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(progress));
  }

  // פתיחת קובץ בעורך הקוד
  if (req.method === 'POST' && req.url === '/api/open-file') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filePath } = JSON.parse(body);
        const absolutePath = path.resolve(filePath);
        const cmd = process.platform === 'win32' ? `code "${absolutePath}"` : `code "${absolutePath}"`;
        exec(cmd, (err) => {
          if (err) {
            const fallbackCmd = process.platform === 'win32' ? `start "" "${absolutePath}"` : `open "${absolutePath}"`;
            exec(fallbackCmd);
          }
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // עדכון ושמירת קובץ בדיסק המקומי
  if (req.method === 'POST' && req.url === '/api/save-file') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filePath, content } = JSON.parse(body);
        if (!filePath || content === undefined) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'נתיב או תוכן חסרים' }));
        }
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`✅ הקובץ עודכן בהצלחה בדיסק: ${filePath}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error("❌ שגיאה בשמירת הקובץ:", err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 📄 קריאת תוכן קובץ להצגה בעורך הקוד הימני
  if (req.method === 'POST' && req.url === '/api/file-content') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filePath } = JSON.parse(body);
        if (!fs.existsSync(filePath)) {
          res.writeHead(404); return res.end(JSON.stringify({ error: 'קובץ לא נמצא' }));
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content }));
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ⚡ קבלת תיקון נקודתי מה-AI ושמירתו בקובץ (Search & Replace)
  if (req.method === 'POST' && req.url === '/api/apply-block-change') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filePath, searchBlock, replaceBlock } = JSON.parse(body);
        if (!fs.existsSync(filePath)) {
          res.writeHead(404); return res.end(JSON.stringify({ error: 'קובץ לא נמצא' }));
        }

        const originalContent = fs.readFileSync(filePath, 'utf-8');

        // מנגנון חיפוש והחלפה חכם שמתעלם מרווחים מיותרים
        function applyFuzzyReplace(content, search, replace) {
          // 1. ניסיון החלפה מדויקת (100% Exact Match)
          if (content.includes(search)) {
            return { success: true, newContent: content.replace(search, replace), method: 'exact' };
          }

          // 2. התאמה גמישה (Fuzzy) אם יש הבדל של רווחים או ירידות שורה
          const originalLines = content.split(/\r?\n/);
          const searchLines = search.split(/\r?\n/).filter(line => line.trim() !== '');
          if (searchLines.length === 0) return { success: false, error: 'בלוק ריק' };
          
          const normalize = str => str.replace(/\s+/g, ' ').trim();
          const normSearch = searchLines.map(normalize);
          
          for (let i = 0; i <= originalLines.length - normSearch.length; i++) {
            let isMatch = true;
            for (let j = 0; j < normSearch.length; j++) {
              if (normalize(originalLines[i + j]) !== normSearch[j]) { isMatch = false; break; }
            }
            if (isMatch) {
              const replaceLines = replace.split(/\r?\n/);
              originalLines.splice(i, normSearch.length, ...replaceLines);
              return { success: true, newContent: originalLines.join('\n'), method: 'fuzzy' };
            }
          }
          return { success: false, error: 'לא נמצאה התאמה לבלוק הקוד' };
        }

        const result = applyFuzzyReplace(originalContent, searchBlock, replaceBlock);
        
        if (result.success) {
          fs.writeFileSync(filePath, result.newContent, 'utf-8');
          console.log(`✅ בוצע תיקון נקודתי בקובץ: ${filePath}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, method: result.method }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ⚡ יצירת קובץ חדש (Smart File Splitting)
  if (req.method === 'POST' && req.url === '/api/create-file') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filePath, content } = JSON.parse(body);
        
        // יצירת התיקייה במידה והיא לא קיימת
        const path = require('path');
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        // כתיבת הקובץ החדש
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`✅ קובץ חדש נוצר בהצלחה: ${filePath}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 🤖 ראוט: תקשורת מול ג'מיני (צ'אט)
  if (req.method === 'POST' && req.url === '/api/chat-stream') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      // מעביר את הבקשה לפונקציה החכמה שיצרנו בקובץ chat.js
      handleChatStream(req, res, body);
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Code-Galaxy 3D AI רץ בהצלחה בכתובת: http://localhost:${PORT}`);
});