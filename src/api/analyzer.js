const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { analyzeFileAST } = require('../parser/astEngine');
const { createCodeChunks } = require('../semantic/chunker');
const { generateEmbedding } = require('../semantic/embedder');
const { storeChunksWithVectors } = require('../semantic/vectorDb');
const { fuseGraphData } = require('../graph/graphFusion');

// --- 💾 מנגנון מטמון (Caching) ---
const CACHE_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'build_cache.json');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function getFileHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch (e) {
    console.warn('⚠️ שגיאה בטעינת קובץ המטמון, מתחיל מחדש.', e.message);
  }
  return {};
}

function saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (e) {
    console.warn('⚠️ שגיאה בשמירת המטמון.', e.message);
  }
}

// סריקת תיקייה רקורסיבית
function scanDirectory(dirPath, fileList = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    
    // 🆕 העדכון שלנו: הוספנו את dist ו-build, והסרנו את public כדי ליישר קו עם הדפדפן
    // הוספנו את package-lock.json ו-yarn.lock לסינון!
    if (file === 'node_modules' || file === '.git' || file === 'data' || file === 'dist' || file === 'build' || file === 'package-lock.json' || file === 'yarn.lock') return;
    
    if (fs.statSync(filePath).isDirectory()) {
      scanDirectory(filePath, fileList);
    } else if (/\.(js|ts|jsx|tsx|dart|py|java|cs|go|cpp|c|h|html|css|json)$/i.test(file)) {
      // 🆕 חסימת גודל בצד השרת: מוודאים שהקובץ שוקל פחות מ-500KB
      const stat = fs.statSync(filePath);
      if (stat.size < 500 * 1024) {
        fileList.push(filePath);
      } else {
        console.log(`⚠️ סינון חכם: מדלג על הקובץ "${file}" כי הוא כבד מדי (${Math.round(stat.size / 1024)}KB) וכנראה מכיל רק דאטה.`);
      }
    }
  });
  return fileList;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🚀 יצירת הגלקסיה (מקבלת נתיב לפרויקט ספציפי ופונקציית דיווח התקדמות)
async function buildGalaxyData(targetDirectory, onProgress = () => {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const filePaths = scanDirectory(targetDirectory);
  const totalFiles = filePaths.length;
  let processedFiles = 0; 

  const fileAnalyses = [];
  const allChunksWithVectors = [];
  
  const cache = loadCache();
  let cacheUpdated = false;

  for (const fp of filePaths) {
    const content = fs.readFileSync(fp, 'utf-8');
    const hash = getFileHash(content);

    // 🆕 1. מפתח חכם למטמון: נתיב יחסי שחסין לשינויי אותיות כונן או סביבה!
    const cacheKey = path.relative(process.cwd(), fp);

    let analysis;
    let chunks;

    if (cache[cacheKey] && cache[cacheKey].hash === hash) {
      analysis = cache[cacheKey].analysis;
      chunks = cache[cacheKey].chunks;
    } else {
      console.log(`🔄 מנתח קובץ מחדש (AST): ${path.basename(fp)}`);
      analysis = analyzeFileAST(fp);
      if (analysis) {
        chunks = createCodeChunks(analysis, content);
        cache[cacheKey] = { hash, analysis, chunks };
        cacheUpdated = true;
      }
    }

    if (analysis) {
      fileAnalyses.push(analysis);

      if (apiKey) {
        for (const chunk of chunks) {
          // 🆕 2. בדיקה כפולה: אל תנסה שוב אם גוגל כבר סירבה בעבר (vectorFailed)
          if (!chunk.vector && !chunk.vectorFailed) {
            console.log(`🧠 מייצר Embedding לוגי עבור: ${chunk.id}`);
            const vector = await generateEmbedding(chunk.text, apiKey);
            
            if (vector) {
              chunk.vector = vector;
            } else {
              // 🛑 גוגל סירבה. מסמנים כנכשל כדי שהמערכת לא תיתקע עליו בהעלאה הבאה!
              chunk.vectorFailed = true; 
            }
            
            cacheUpdated = true;
            await sleep(4200); 
          }
          
          if (chunk.vector) {
            allChunksWithVectors.push(chunk);
          }
        }
      }
    }
    
    processedFiles++;
    onProgress(processedFiles, totalFiles);
  }

  if (cacheUpdated) {
    saveCache(cache);
  }

  if (apiKey && allChunksWithVectors.length > 0) {
    await storeChunksWithVectors(allChunksWithVectors);
  }

  return fuseGraphData(fileAnalyses, allChunksWithVectors);
}

module.exports = { buildGalaxyData, loadCache };