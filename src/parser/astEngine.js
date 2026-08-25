const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const { calculateCyclomaticComplexity, getComplexityColor } = require('./metrics');

// ==========================================
// 🔌 מנועי פענוח לשפות שונות (Adapters)
// ==========================================

// 1. מתאם JavaScript / TypeScript (מבוסס Babel המקורי)
function parseJS(content) {
  let ast;
  try {
    ast = parser.parse(content, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  } catch (err) {
    try { ast = parser.parse(content, { sourceType: 'script' }); } 
    catch (e) { return null; }
  }

  const imports = [];
  const functions = [];
  const classes = [];

  traverse(ast, {
    ImportDeclaration(pathNode) { imports.push(pathNode.node.source.value); },
    CallExpression(pathNode) {
      if (pathNode.node.callee.name === 'require' && pathNode.node.arguments[0]?.value) {
        imports.push(pathNode.node.arguments[0].value);
      }
    },
    FunctionDeclaration(pathNode) { if (pathNode.node.id) functions.push(pathNode.node.id.name); },
    ClassDeclaration(pathNode) { if (pathNode.node.id) classes.push(pathNode.node.id.name); }
  });

  const complexity = calculateCyclomaticComplexity(ast, traverse);
  return { imports, functions, classes, complexity };
}

// 2. מתאם Dart / Flutter (מבוסס Regex מהיר)
function parseDart(content) {
  const imports = [...content.matchAll(/import\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
  const classes = [...content.matchAll(/class\s+([A-Za-z0-9_]+)/g)].map(m => m[1]);
  
  // זיהוי פונקציות בסיסי (מתעלם ממילות מפתח)
  const functions = [...content.matchAll(/(?:[A-Za-z0-9_<>]+\s+)?([A-Za-z0-9_]+)\s*\([^)]*\)\s*[{=>]/g)]
                     .map(m => m[1])
                     .filter(f => !['if', 'for', 'while', 'switch', 'catch'].includes(f) && !classes.includes(f));
  
  // הערכת סיבוכיות בסיסית לפי תנאים ולולאות
  const complexity = 1 + (content.match(/if\s*\(|for\s*\(|while\s*\(|case\s+|\|\||&&/g) || []).length;
  
  return { imports, functions, classes, complexity };
}

// 3. מתאם Python (מבוסס Regex מהיר)
function parsePython(content) {
  const imports = [...content.matchAll(/(?:^|\n)(?:import|from)\s+([A-Za-z0-9_.]+)/g)].map(m => m[1]);
  const classes = [...content.matchAll(/(?:^|\n)class\s+([A-Za-z0-9_]+)/g)].map(m => m[1]);
  const functions = [...content.matchAll(/(?:^|\n)def\s+([A-Za-z0-9_]+)/g)].map(m => m[1]);
  
  const complexity = 1 + (content.match(/(?:^|\n)\s*(if|elif|for|while)\s|(\s+and\s+|\s+or\s+)/g) || []).length;
  
  return { imports, functions, classes, complexity };
}

// 4. מתאם Java
function parseJava(content) {
  const imports = [...content.matchAll(/import\s+([\w.]+);/g)].map(m => m[1]);
  const classes = [...content.matchAll(/class\s+([A-Za-z0-9_]+)/g)].map(m => m[1]);
  const functions = [...content.matchAll(/(?:public|private|protected|static|final|\s)+[\w<>]+\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\{/g)]
                     .map(m => m[1])
                     .filter(f => !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(f));
  
  const complexity = 1 + (content.match(/if\s*\(|for\s*\(|while\s*\(|case\s+|\|\||&&/g) || []).length;
  return { imports, functions, classes, complexity };
}

// 5. מתאם C#
function parseCSharp(content) {
  const imports = [...content.matchAll(/using\s+([\w.]+);/g)].map(m => m[1]);
  const classes = [...content.matchAll(/(?:class|struct|record)\s+([A-Za-z0-9_]+)/g)].map(m => m[1]);
  const functions = [...content.matchAll(/(?:public|private|protected|internal|static|async|override|virtual|\s)+[\w<>]+\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/g)]
                     .map(m => m[1])
                     .filter(f => !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(f));
  
  const complexity = 1 + (content.match(/if\s*\(|for\s*\(|while\s*\(|case\s+|\|\||&&|\?\?/g) || []).length;
  return { imports, functions, classes, complexity };
}

// 6. מתאם Go
function parseGo(content) {
  // ב-Go ייבוא יכול להיות בשורה או בלוק, נתפוס מחרוזות ייבוא גלובליות בצורה פשוטה
  const imports = [...content.matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(i => i && !i.includes(' ')); 
  const classes = [...content.matchAll(/type\s+([A-Za-z0-9_]+)\s+(?:struct|interface)/g)].map(m => m[1]);
  const functions = [...content.matchAll(/func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(/g)].map(m => m[1]);
  
  const complexity = 1 + (content.match(/if\s+|for\s+|case\s+|\|\||&&/g) || []).length;
  return { imports, functions, classes, complexity };
}

// 7. מתאם C / C++
function parseCpp(content) {
  const imports = [...content.matchAll(/#include\s*[<"]([^>"]+)[>"]/g)].map(m => m[1]);
  const classes = [...content.matchAll(/(?:class|struct)\s+([A-Za-z0-9_]+)/g)].map(m => m[1]);
  const functions = [...content.matchAll(/(?:[\w<>:]+\s+)+([A-Za-z0-9_:]+)\s*\([^)]*\)\s*(?:const)?\s*\{/g)]
                     .map(m => m[1])
                     .filter(f => !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(f) && !f.includes('return'));
  
  const complexity = 1 + (content.match(/if\s*\(|for\s*\(|while\s*\(|case\s+|\|\||&&/g) || []).length;
  return { imports, functions, classes, complexity };
}

function analyzeFileAST(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').length;
  const size = fs.statSync(filePath).size;
  const ext = path.extname(filePath).toLowerCase();

  let parsedData = null;

  // ניתוב למתאם (Adapter) הנכון לפי סיומת הקובץ
  if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
    parsedData = parseJS(content);
  } else if (ext === '.dart') {
    parsedData = parseDart(content);
  } else if (ext === '.py') {
    parsedData = parsePython(content);
  } else if (ext === '.java') {
    parsedData = parseJava(content);
  } else if (ext === '.cs') {
    parsedData = parseCSharp(content);
  } else if (ext === '.go') {
    parsedData = parseGo(content);
  } else if (['.c', '.cpp', '.h', '.hpp'].includes(ext)) {
    parsedData = parseCpp(content);
  } else {
    // שפות לא נתמכות יקבלו ניתוח בסיסי של שורות וגודל בלבד
    parsedData = { imports: [], functions: [], classes: [], complexity: 1 };
  }

  if (!parsedData) return null; // אם הקובץ שבור לחלוטין

  // 🏗️ החזרת אובייקט מנורמל (Unified Schema) ששאר המערכת מכירה
  return {
    filePath: filePath.replace(/\\/g, '/'),
    name: path.basename(filePath),
    lines,
    size,
    complexity: parsedData.complexity,
    color: getComplexityColor(parsedData.complexity),
    imports: parsedData.imports,
    functions: parsedData.functions,
    classes: parsedData.classes
  };
}

module.exports = { analyzeFileAST };