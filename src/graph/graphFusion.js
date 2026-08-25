const path = require('path');
const { cosineSimilarity } = require('../semantic/vectorDb');

function fuseGraphData(fileAnalyses, chunksWithVectors = []) {
  const nodes = fileAnalyses.map(file => ({
    id: file.filePath,
    name: file.name,
    complexity: file.complexity,
    color: file.color,
    lines: file.lines,
    size: file.size,
    functions: file.functions,
    classes: file.classes
  }));

  // נשתמש ב-Map כדי למנוע כפילויות ולאפשר חיבור משקלים של קשרים חופפים
  const linksMap = new Map();

  // פונקציית עזר להוספה או עדכון של קשר כולל הוספת משקל (Weight)
  const addOrUpdateLink = (source, target, type, weight, color) => {
    if (source === target) return;
    const key = [source, target].sort().join('---');
    
    if (!linksMap.has(key)) {
      linksMap.set(key, { source, target, type, weight, color });
    } else {
      // אם הקשר כבר קיים (למשל גם מבני וגם סמנטי), נחבר את המשקלים
      const existing = linksMap.get(key);
      existing.weight += weight;
      existing.type = 'hybrid'; // הקשר הופך למשולב
    }
  };

  // 1. קשרי Import / Require מבניים (משקל גבוה קשיח = 1.0)
  fileAnalyses.forEach(file => {
    file.imports.forEach(imp => {
      const impBaseName = path.basename(imp, path.extname(imp));
      fileAnalyses.forEach(targetFile => {
        const targetBaseName = path.basename(targetFile.name, path.extname(targetFile.name));
        if (file.filePath !== targetFile.filePath && impBaseName === targetBaseName) {
          addOrUpdateLink(file.filePath, targetFile.filePath, 'structural', 1.0, '#00f0ff');
        }
      });
    });

    // 2. קשר מבני לקבצים השייכים לאותה תת-תיקייה (משקל נמוך = 0.3)
    fileAnalyses.forEach(targetFile => {
      if (file.filePath !== targetFile.filePath) {
        const dirA = path.dirname(file.filePath);
        const dirB = path.dirname(targetFile.filePath);
        if (dirA === dirB && dirA !== process.cwd()) {
          addOrUpdateLink(file.filePath, targetFile.filePath, 'folder', 0.3, '#ffb700');
        }
      }
    });
  });

  // 3. קשרים סמנטיים (Vector Similarity) - חוק "החברים הכי טובים" (Top-K)
  const fileVectors = new Map();
  chunksWithVectors.forEach(chunk => {
    if (chunk.type === 'file' && chunk.vector) {
      fileVectors.set(chunk.filePath, chunk.vector);
    }
  });

  const SEMANTIC_THRESHOLD = 0.72; 
  const SEMANTIC_WEIGHT_MULTIPLIER = 0.8; 
  const MAX_SEMANTIC_LINKS_PER_FILE = 2; // 🆕 המקסימום המותר לכל קובץ כדי למנוע "כדור שיער"

  const fileArray = Array.from(fileVectors.entries());
  
  for (let i = 0; i < fileArray.length; i++) {
    const [pathA, vecA] = fileArray[i];
    const potentialLinks = [];
    
    // אוספים את כל הקשרים האפשריים לקובץ הזה
    for (let j = 0; j < fileArray.length; j++) {
      if (i === j) continue;
      const [pathB, vecB] = fileArray[j];
      const sim = cosineSimilarity(vecA, vecB);
      
      if (sim > SEMANTIC_THRESHOLD) {
        potentialLinks.push({ pathB, sim });
      }
    }
    
    // ממיינים מהקשר החזק לחלש, ולוקחים רק את ה-2 החזקים ביותר!
    potentialLinks.sort((a, b) => b.sim - a.sim);
    const topLinks = potentialLinks.slice(0, MAX_SEMANTIC_LINKS_PER_FILE);
    
    topLinks.forEach(link => {
      const semanticWeight = link.sim * SEMANTIC_WEIGHT_MULTIPLIER;
      addOrUpdateLink(pathA, link.pathB, 'semantic', semanticWeight, '#ff00ff');
    });
  }

  // 4. סינון סופי: הסרת קשרים חלשים מדי כדי למנוע עומס ויזואלי ("קערת ספגטי")
  const MIN_TOTAL_WEIGHT = 0.45;
  const links = Array.from(linksMap.values()).filter(link => link.weight >= MIN_TOTAL_WEIGHT);

  return { nodes, links };
}

module.exports = { fuseGraphData };