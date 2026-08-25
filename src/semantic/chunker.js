/**
 * מפרק קוד לחלקים לוגיים משמעותיים (Chunks) עבור יצירת וקטורים
 */
function createCodeChunks(fileAnalysis, fileContent) {
  const chunks = [];
  const { filePath, functions, classes } = fileAnalysis;

  // 1. Chunk ברמת הקובץ המלא
  chunks.push({
    id: `${filePath}#full`,
    filePath,
    type: 'file',
    text: `File: ${filePath}\nFunctions: ${functions.join(', ')}\nClasses: ${classes.join(', ')}`
  });

  // 2. Chunks ברמת מקטעי קוד פנימיים
  if (fileContent) {
    const lines = fileContent.split('\n');
    for (let i = 0; i < lines.length; i += 30) {
      const slice = lines.slice(i, i + 35).join('\n');
      if (slice.trim().length > 0) {
        chunks.push({
          id: `${filePath}#chunk_${i}`,
          filePath,
          type: 'code_block',
          text: `File: ${filePath}\nLines ${i + 1}-${Math.min(i + 35, lines.length)}:\n${slice}`
        });
      }
    }
  }

  return chunks;
}

module.exports = { createCodeChunks };