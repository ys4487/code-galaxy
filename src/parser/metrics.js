/**
 * חישוב סיבוכיות ציקלומטית מתוך AST
 */
function calculateCyclomaticComplexity(ast, traverse) {
  let complexity = 1; // בסיס

  traverse(ast, {
    enter(path) {
      const type = path.node.type;
      
      // ספירת צומתי החלטה בלוגיקה
      if (
        type === 'IfStatement' ||
        type === 'ForStatement' ||
        type === 'ForInStatement' ||
        type === 'ForOfStatement' ||
        type === 'WhileStatement' ||
        type === 'DoWhileStatement' ||
        type === 'CaseClause' ||
        type === 'CatchClause' ||
        type === 'ConditionalExpression' // ternary operator (?)
      ) {
        complexity++;
      }

      // ספירת אופרטורים לוגיים (&&, ||)
      if (type === 'LogicalExpression' && (path.node.operator === '&&' || path.node.operator === '||')) {
        complexity++;
      }
    }
  });

  return complexity;
}

function getComplexityColor(complexity) {
  if (complexity > 10) return '#ff0055'; // אדום - מסובך
  if (complexity > 4) return '#ffb700';  // צהוב - בינוני
  return '#00f0ff';                       // טורקיז - פשוט
}

module.exports = {
  calculateCyclomaticComplexity,
  getComplexityColor
};