const path = require('path');
const lancedb = require('@lancedb/lancedb');

let dbInstance = null;
let tableInstance = null;

/**
 * אתחול מסד נתונים וקטורי מקומי בתיקיית data/lancedb
 */
async function initVectorDb() {
  if (tableInstance) return tableInstance;

  try {
    const dbPath = path.join(process.cwd(), 'data', 'lancedb');
    dbInstance = await lancedb.connect(dbPath);
    
    const tables = await dbInstance.tableNames();
    if (!tables.includes('code_vectors')) {
      tableInstance = await dbInstance.createTable('code_vectors', [
        { id: 'init', filePath: 'init', text: 'init', vector: new Array(768).fill(0) }
      ]);
    } else {
      tableInstance = await dbInstance.openTable('code_vectors');
    }
    return tableInstance;
  } catch (err) {
    console.warn('⚠️ אתחול LanceDB נכשל, המערכת תפעל במנגנון זיכרון חינמי מקומי:', err.message);
    return null;
  }
}

/**
 * שמירת Chunks וקטוריים במסד הנתונים
 */
async function storeChunksWithVectors(chunksWithVectors) {
  const table = await initVectorDb();
  if (!table || chunksWithVectors.length === 0) return;

  const validData = chunksWithVectors
    .filter(item => item.vector && item.vector.length === 768)
    .map(item => ({
      id: item.id,
      filePath: item.filePath,
      text: item.text,
      vector: item.vector
    }));

  if (validData.length > 0) {
    try {
      await table.add(validData);
    } catch (e) {
      console.warn('⚠️ שגיאה בשמירת וקטורים ל-LanceDB:', e.message);
    }
  }
}

/**
 * חישוב Cosine Similarity בין שני וקטורים
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecA[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = {
  initVectorDb,
  storeChunksWithVectors,
  cosineSimilarity
};