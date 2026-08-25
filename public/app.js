// --- 🚀 ניהול חלון הפתיחה וטעינת פרויקטים ---
    function showLoadingStatus(text) {
      const statusDiv = document.getElementById('loading-status');
      statusDiv.style.display = 'block';
      statusDiv.innerText = text;
    }

    function hideModal() {
      document.getElementById('project-modal').style.display = 'none';
      document.getElementById('global-chat-btn').style.display = 'block';
    }

    function showModal() {
      // מציג חזרה את חלון הפרויקטים
      document.getElementById('project-modal').style.display = 'flex';
      // מסתיר את כפתור הצ'אט הגלובלי כדי שלא יפריע
      document.getElementById('global-chat-btn').style.display = 'none';
      
      // סוגר את חלון הצ'אט המרחף במידה והושאר פתוח!
      const chatWindow = document.getElementById('global-chat-window');
      if (chatWindow) chatWindow.classList.remove('open');
      
      // סוגר חלוניות צדדיות אם הן נשארו פתוחות
      closeSidebar();
      if (typeof closeEditor === 'function') closeEditor();

      // 🆕 פצצת אטום: מחיקה מוחלטת של הגלקסיה כדי לשחרר 100% מהזיכרון וה-GPU!
      if (Graph) {
        Graph.graphData({ nodes: [], links: [] });
      }
    }

    async function handleLocalFiles(event) {
      const files = event.target.files;
      if (!files || files.length === 0) return;
      
      const allowedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.dart', '.py', '.java', '.cs', '.go', '.c', '.cpp', '.h', '.hpp', '.html', '.css', '.json'];
      const filesToSend = [];

      for (const file of files) {
        const path = file.webkitRelativePath || file.name;
        
        // סינון חכם שחוסם את תיקיות הבילד ואת קובץ הנעילה הכבד
        if (path.includes('node_modules') || path.includes('.git') || path.includes('dist') || path.includes('build') || path.includes('data') || file.name === 'package-lock.json' || file.name === 'yarn.lock') {
          continue;
        }

        if (file.size > 500 * 1024) {
          continue;
        }

        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        
        if (allowedExtensions.includes(ext)) {
          const content = await file.text();
          filesToSend.push({ path: path, content: content });
        }
      }

      event.target.value = ''; // איפוס כדי שיהיה אפשר לבחור שוב את אותו קובץ במידת הצורך
      
      if (filesToSend.length === 0) {
        alert('לא נמצאו קבצי קוד נתמכים בבחירה שלך.');
        return;
      }

      // 🆕 העברה לחלונית האישור (במקום שליחה ישירה לשרת)
      showConfirmOverlay(filesToSend);
    }

    async function loadFromGithub() {
      const url = document.getElementById('github-url').value.trim();
      if (!url) return alert('נא להדביק קישור חוקי לגיטהאב');
      
      showLoadingStatus('⏳ מוריד ומנתח את הפרויקט מגיטהאב... זה עשוי לקחת קצת זמן 🚀');
      
      try {
        const res = await fetch('/api/analyze-github', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoUrl: url })
        });
        
        const data = await res.json();
        
        if (data.error) {
          alert('❌ שגיאה: ' + data.error);
          document.getElementById('loading-status').style.display = 'none';
          return;
        }
        
        Graph.graphData(data); // טעינת הנתונים החדשים למנוע התלת-ממד
        hideModal(); // הסתרת חלון הפתיחה
        
      } catch (err) {
        alert('❌ שגיאת תקשורת עם השרת');
        document.getElementById('loading-status').style.display = 'none';
      }
    }

    let currentSelectedFile = '';
    let Graph;
    let lastClickTime = 0;
    let lastClickedNodeId = null;

    // שמירה וטעינה של המפתח בדפדפן
    document.addEventListener('DOMContentLoaded', () => {
      initGraph();
    });

    function initGraph() {
      Graph = ForceGraph3D()(document.getElementById('3d-graph'))
        // 🚀 1. אופטימיזציית פוליגונים: ירידה מ-32 ל-8 חוסכת המון משאבי GPU
        .nodeResolution(32) 
        .nodeLabel('name')
        .nodeColor('color')
        .nodeVal(node => Math.max((node.lines || 10) / 4, 4))
        
        .linkColor(link => link.color || '#00f0ff')
        // 🆕 שליטה חיה בהצגת הקשרים הסמנטיים (סגולים) לפי מצב המתג
        .linkVisibility(link => {
          if (link.type === 'semantic') {
            const toggle = document.getElementById('semantic-toggle');
            return toggle ? toggle.checked : true;
          }
          return true; // קשרים מסוג אחר (מבניים) תמיד יוצגו
        })
        // 🚀 2. עובי דינמי: קשרים חזקים (משקל גבוה) יהיו עבים ובולטים יותר
        .linkWidth(link => link.weight ? Math.max(0.5, link.weight * 1.5) : 1) 
        .linkOpacity(0.5)
        .linkCurvature(0.15)
        
        // 🚀 3. מניעת עומס אפקטים: חלקיקי אור ירוצו *רק* על קשרים חזקים מאוד
        .linkDirectionalParticles(link => (link.weight && link.weight > 0.8) ? 2 : 0) 
        .linkDirectionalParticleWidth(1.2)
        .linkDirectionalParticleSpeed(0.006)
        
        .onNodeClick(node => {
          const currentTime = new Date().getTime();
          const clickDeltatime = currentTime - lastClickTime;

          // 🖱️ זיהוי לחיצה כפולה (Double Click) לפרישת תת-ישויות
          if (clickDeltatime < 300 && lastClickedNodeId === node.id) {
            toggleSubEntities(node.id);
          } else {
            // לחיצה בודדת - בחירת קובץ וטיסת מצלמה
            currentSelectedFile = node.id;
            document.getElementById('file-title').innerText = node.name;
            document.getElementById('file-path').innerText = node.id;
            document.getElementById('file-lines').innerText = node.lines || 0;
            document.getElementById('file-complexity').innerText = node.complexity || 0;
            document.getElementById('sidebar').classList.add('open');
            openEditor(node.id, node.name);

            // 🆕 מעבר למצב מקומי (קובץ): עדכון כותרת, ניקוי צ'אט, ופתיחה אוטומטית!
            const chatTitle = document.getElementById('chat-title');
            if (chatTitle) chatTitle.innerText = `עוזר AI: ${node.name} 📄`;
            document.getElementById('global-chat-messages').innerHTML = `
              <div class="msg ai" style="margin-bottom: 5px;"><span>היי! עברנו לקובץ ${node.name}. תשאל אותי משהו עליו או לחץ על כפתור ה-Refactor!</span></div>
            `;
            document.getElementById('global-chat-window').classList.add('open');

            const distance = 40;
            const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
            Graph.cameraPosition(
              { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
              node, 1500
            );
          }

          lastClickTime = currentTime;
          lastClickedNodeId = node.id;
        });

      // 🌌 דחייה פיזיקלית (Gravity Tweaks): מרווח את הגלקסיה
      Graph.d3Force('charge').strength(-350); // דחייה מגנטית חזקה פי 3.5 כדי לרווח עומס
      Graph.d3Force('link').distance(65); // אורך "קפיץ" המינימלי לקשרים בין כוכבים
    }

    async function loadGalaxy() {
      const res = await fetch('/api/galaxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) 
      });
      const data = await res.json();
      Graph.graphData(data);
    }

    function closeSidebar() {
      document.getElementById('sidebar').classList.remove('open');
      const searchInput = document.getElementById('search-input');
      const searchResults = document.getElementById('search-results');
      if (searchInput) searchInput.value = '';
      if (searchResults) searchResults.style.display = 'none';
      
      // 🆕 איפוס קונטקסט: חזרה למצב גלובלי
      currentSelectedFile = ''; 
      const chatTitle = document.getElementById('chat-title');
      if (chatTitle) chatTitle.innerText = 'עוזר AI גלובלי 🌍';
      
      // מנקה את ההיסטוריה לקראת שיחה חדשה
      document.getElementById('global-chat-messages').innerHTML = `
        <div class="msg ai" style="margin-bottom: 5px;"><span>היי! אני רואה את כל הפרויקט. מה תרצה לדעת?</span></div>
      `;
    }

    async function openInEditor() {
      if (!currentSelectedFile) return;
      await fetch('/api/open-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: currentSelectedFile })
      });
    }

    // --- 🔍 מנגנון חיפוש, סינון וטיסת מצלמה (Fly-To) ---
    function handleSearch() {
      const query = document.getElementById('search-input').value.trim().toLowerCase();
      const resultsDiv = document.getElementById('search-results');

      if (!query) {
        resultsDiv.style.display = 'none';
        resultsDiv.innerHTML = '';
        return;
      }

      const { nodes } = Graph.graphData();
      const matches = nodes.filter(n => 
        (n.name && n.name.toLowerCase().includes(query)) || 
        (n.id && n.id.toLowerCase().includes(query))
      );

      if (matches.length === 0) {
        resultsDiv.innerHTML = '<div class="search-item" style="color: #888;">לא נמצאו קבצים מתאימים</div>';
        resultsDiv.style.display = 'block';
        return;
      }

      resultsDiv.innerHTML = matches.map(node => `
        <div class="search-item" onclick="flyToNode('${node.id.replace(/\\/g, '\\\\')}')">
          <div>
            <div style="font-weight: bold;">${node.name}</div>
            <div class="search-item-path">${node.id}</div>
          </div>
          <span style="font-size: 10px; color: #00f0ff;">${node.lines} שורות</span>
        </div>
      `).join('');

      resultsDiv.style.display = 'block';
    }

    function flyToNode(nodeId) {
      const { nodes } = Graph.graphData();
      const targetNode = nodes.find(n => n.id === nodeId);
      if (!targetNode) return;

      // סגירת רשימת התיבה ועדכון שדה החלטה
      document.getElementById('search-results').style.display = 'none';
      document.getElementById('search-input').value = targetNode.name;

      // פתיחת סרגל הצד עם נתוני הקובץ
      currentSelectedFile = targetNode.id;
      document.getElementById('file-title').innerText = targetNode.name;
      document.getElementById('file-path').innerText = targetNode.id;
      document.getElementById('file-lines').innerText = targetNode.lines;
      document.getElementById('file-complexity').innerText = targetNode.complexity;
      document.getElementById('chat-messages').innerHTML = '';
      document.getElementById('sidebar').classList.add('open');

      // טיסת המצלמה (Camera Fly-To) בזווית מעודנת מול הצומת שנבחר
      const distance = 40;
      const distRatio = 1 + distance / Math.hypot(targetNode.x || 1, targetNode.y || 1, targetNode.z || 1);
      Graph.cameraPosition(
        { x: targetNode.x * distRatio, y: targetNode.y * distRatio, z: targetNode.z * distRatio },
        targetNode,
        1500
      );
    }

    // סגירה אוטומטית של תפריט הטיפות בעת לחיצה מחוץ לתיבת החיפוש
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#search-box')) {
        document.getElementById('search-results').style.display = 'none';
      }
    });

    function requestRefactor() {
      const input = document.getElementById('global-chat-input');
      input.value = `זהה בעיה או שדרוג בקוד. החזר **רק** את הבלוק הנקודתי שדרש שינוי בפורמט המדויק הבא:
      <<<<<<< SEARCH
      // הקוד הקיים שכדאי להחליף
      =======
      // הקוד החדש והמשופר
      >>>>>>> REPLACE`;
      document.getElementById('global-chat-window').classList.add('open');
      sendUnifiedMessage();
    }

    async function applyCodeChanges(newCode) {
      if (!currentSelectedFile) return;
      if (!confirm('האם אתה בטוח שברצונך לשכתב את הקובץ בדיסק המקומי?')) return;

      try {
        const res = await fetch('/api/save-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: currentSelectedFile, content: newCode })
        });

        const data = await res.json();
        if (data.success) {
          alert('✅ הקובץ עודכן בהצלחה בדיסק!');
          loadGalaxy(); // רענון הגלקסיה וה-AST בלייב
          openEditor(currentSelectedFile, document.getElementById('editor-title').innerText);
        } else {
          alert('❌ שגיאה בשמירת הקובץ: ' + data.error);
        }
      } catch (err) {
        alert('❌ שגיאת תקשורת: ' + err.message);
      }
    }

    async function applyBlockChanges(searchBlock, replaceBlock) {
      if (!currentSelectedFile) return;

      try {
        const res = await fetch('/api/apply-block-change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filePath: currentSelectedFile,
            searchBlock,
            replaceBlock
          })
        });

        const data = await res.json();
        if (data.success) {
          alert(`✅ השינוי הנקודתי יושם בהצלחה! (${data.method === 'fuzzy' ? 'התאמה גמישה' : 'התאמה מדויקת'})`);
          loadGalaxy();
          openEditor(currentSelectedFile, document.getElementById('editor-title').innerText);
        } else {
          alert('❌ לא ניתן היה לעדכן את הבלוק: ' + data.error);
        }
      } catch (err) {
        alert('❌ שגיאת תקשורת: ' + err.message);
      }
    }

    // ערכה לניהול קבצים מורחבים
    const expandedNodes = new Set();

    // 🪐 פרישה/צמצום של תת-ישויות (פונקציות ומחלקות)
    function toggleSubEntities(nodeId = currentSelectedFile) {
      if (!nodeId) return;

      const currentData = Graph.graphData();
      const parentNode = currentData.nodes.find(n => n.id === nodeId);
      if (!parentNode) return;

      // בדיקה אם הקובץ כבר מורחב בגלקסיה
      if (expandedNodes.has(nodeId)) {
        // --- 1. צמצום: הסרת תת-הישויות והקשרים שלהן ---
        expandedNodes.delete(nodeId);
        
        const newNodes = currentData.nodes.filter(n => n.parentId !== nodeId);
        const newLinks = currentData.links.filter(l => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
          const targetId = typeof l.target === 'object' ? l.target.id : l.target;
          return !sourceId.startsWith(`${nodeId}::`) && !targetId.startsWith(`${nodeId}::`);
        });

        Graph.graphData({ nodes: newNodes, links: newLinks });
      } else {
        // --- 2. פרישה: יצירת כוכבי משנה עבור פונקציות ומחלקות ---
        expandedNodes.add(nodeId);

        const subNodes = [];
        const subLinks = [];

        // א. יצירת צומתי פונקציות (סגול)
        if (Array.isArray(parentNode.functions)) {
          parentNode.functions.forEach((fnName, idx) => {
            const subId = `${nodeId}::fn::${fnName}`;
            subNodes.push({
              id: subId,
              name: `ƒ ${fnName}()`,
              color: '#a855f7',
              val: 1.5,
              parentId: nodeId,
              lines: 1,
              complexity: 1
            });
            subLinks.push({
              source: nodeId,
              target: subId,
              color: '#a855f788',
              curvature: 0.2
            });
          });
        }

        // ב. יצירת צומתי מחלקות (זהב/כתום)
        if (Array.isArray(parentNode.classes)) {
          parentNode.classes.forEach((className, idx) => {
            const subId = `${nodeId}::cls::${className}`;
            subNodes.push({
              id: subId,
              name: `◈ ${className}`,
              color: '#f59e0b',
              val: 2.2,
              parentId: nodeId,
              lines: 1,
              complexity: 1
            });
            subLinks.push({
              source: nodeId,
              target: subId,
              color: '#f59e0b88',
              curvature: 0.2
            });
          });
        }

        if (subNodes.length === 0) {
          alert('לא נמצאו פונקציות או מחלקות מפורשות בקובץ זה.');
          expandedNodes.delete(nodeId);
          return;
        }

        // עדכון הגרף עם תת-הישויות החדשות
        Graph.graphData({
          nodes: [...currentData.nodes, ...subNodes],
          links: [...currentData.links, ...subLinks]
        });
      }
    }
    // --- 📝 ניהול העורך הימני ומנגנון גרירה (Resizing) ---
    let currentFileContent = ''; // 🆕 משתנה גלובלי לשמירת קוד הקובץ הפתוח

    async function openEditor(filePath, fileName) {
      const panel = document.getElementById('editor-panel');
      const title = document.getElementById('editor-title');
      const contentBox = document.getElementById('editor-content');
      
      title.innerText = fileName;
      contentBox.innerText = 'טוען קוד... ⏳';
      panel.classList.add('open');

      try {
        const res = await fetch('/api/file-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath })
        });
        const data = await res.json();
        
        if (data.error) {
          contentBox.innerText = '❌ שגיאה בטעינת הקובץ: ' + data.error;
        } else {
          currentFileContent = data.content; // 🆕 שומרים בזיכרון
          contentBox.innerText = currentFileContent; // מציגים בעורך
        }
      } catch (err) {
        contentBox.innerText = '❌ שגיאת תקשורת';
      }
    }

    function closeEditor() {
      document.getElementById('editor-panel').classList.remove('open');
    }

    // מנגנון גרירה ימינה ושמאלה
    const resizer = document.getElementById('editor-resizer');
    const panel = document.getElementById('editor-panel');
    let isResizing = false;

    if (resizer) {
      resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'ew-resize';
      });

      document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        // מחשבים את הרוחב החדש (מרחק העכבר מהקצה הימני של המסך)
        const newWidth = window.innerWidth - e.clientX;
        // מגבילים את הרוחב כדי שהחלון לא יהיה קטן מדי או יסתיר הכל
        if (newWidth > 300 && newWidth < window.innerWidth - 400) {
          panel.style.width = newWidth + 'px';
        }
      });

      document.addEventListener('mouseup', () => {
        isResizing = false;
        document.body.style.cursor = 'default';
      });
    }

    // פונקציית עזר למניעת שבירת HTML
    function escapeHtml(text) {
      return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // פונקציית הציור (Diff)
    function previewDiffInEditor(searchBlock, replaceBlock) {
      if (!currentFileContent) return;
      
      const contentBox = document.getElementById('editor-content');
      document.getElementById('editor-panel').classList.add('open');

      // השוואת טקסט מדויקת ככל האפשר
      const content = currentFileContent.replace(/\r\n/g, '\n');
      const search = searchBlock.replace(/\r\n/g, '\n');
      const replace = replaceBlock.replace(/\r\n/g, '\n');

      if (!content.includes(search)) {
          console.warn('לא נמצאה התאמה מדויקת. מוצג ללא הדגשה.');
          return;
      }

      // חלוקת הטקסט ל-3 חלקים: לפני, הקוד שנמחק, ואחרי
      const parts = content.split(search);
      const safeBefore = escapeHtml(parts[0]);
      const safeSearch = escapeHtml(search);
      const safeReplace = escapeHtml(replace);
      const safeAfter = escapeHtml(parts.slice(1).join(search)); 

      // הזרקת ה-HTML המעוצב לתוך העורך
      contentBox.innerHTML = `
        ${safeBefore}
        <div class="diff-remove">${safeSearch}</div>
        <div class="diff-add">${safeReplace}</div>
        ${safeAfter}
      `;
      
      // גלילה אוטומטית למקום השינוי בעורך הימני
      setTimeout(() => {
          const diffElement = contentBox.querySelector('.diff-remove');
          if (diffElement) diffElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }

    // --- 📋 העתקת תוכן העורך הימני ללוח ---
    function copyEditorContent() {
      const contentBox = document.getElementById('editor-content');
      // נשתמש בטקסט הנקי או בתוכן שנמצא בעורך
      const textToCopy = contentBox.innerText;

      navigator.clipboard.writeText(textToCopy).then(() => {
        const btn = document.querySelector('.copy-editor-btn');
        const originalText = btn.innerText;
        btn.innerText = '✔ הועתק בהצלחה!';
        btn.style.borderColor = '#33ff33';
        btn.style.color = '#33ff33';

        setTimeout(() => {
          btn.innerText = originalText;
          btn.style.borderColor = '#00f0ff88';
          btn.style.color = '#00f0ff';
        }, 2000);
      }).catch(err => {
        alert('❌ שגיאה בהעתקת הטקסט ללוח');
      });
    }

    // --- 🌍 מנגנון הצ'אט הגלובלי ---
    function toggleGlobalChat() {
      const chatWindow = document.getElementById('global-chat-window');
      chatWindow.classList.toggle('open');
    }

    // --- 🤖 הצ'אט המאוחד (Context-Aware) ---
    async function sendUnifiedMessage() {
      const input = document.getElementById('global-chat-input');
      const question = input.value.trim();
      if (!question) return;

      const msgsDiv = document.getElementById('global-chat-messages');
      
      // 1. הוספת הודעת המשתמש
      const userMsg = document.createElement('div');
      userMsg.className = 'msg user';
      userMsg.innerText = question;
      msgsDiv.appendChild(userMsg);
      input.value = '';

      // 2. הוספת הודעת ה-AI הממתינה (עם כפתור העתקה מעוצב)
      const aiMsgDiv = document.createElement('div');
      aiMsgDiv.className = 'msg ai';
      
      const contentSpan = document.createElement('span');
      contentSpan.innerText = 'מחשב מסלול בגלקסיה... ⏳';
      aiMsgDiv.appendChild(contentSpan);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.innerText = '📋 העתק';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(contentSpan.innerText);
        copyBtn.innerText = '✔ הועתק!';
        setTimeout(() => copyBtn.innerText = '📋 העתק', 2000);
      };
      aiMsgDiv.appendChild(copyBtn);
      
      msgsDiv.appendChild(aiMsgDiv);
      msgsDiv.scrollTop = msgsDiv.scrollHeight;

      try {
        const response = await fetch('/api/chat-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // 🧠 השטיק האמיתי: שיגור הנתיב אם נבחר קובץ, או null אם אנחנו במצב גלובלי
          body: JSON.stringify({ filePath: currentSelectedFile || 'null', question }) 
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullText = '';
        let buffer = ''; 

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); 

          lines.forEach(line => {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              if (dataStr === '[DONE]') return;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.text) {
                  if (fullText === '') contentSpan.innerText = '';
                  fullText += parsed.text;
                  contentSpan.innerText = fullText;
                  msgsDiv.scrollTop = msgsDiv.scrollHeight;
                }
              } catch (e) {}
            }
          });
        }
        
        if (!fullText) {
          contentSpan.innerText = '⚠️ השרת לא החזיר תשובה. בדוק את הטרמינל לפרטים.';
          return;
        }

        // --- ✂️ תמיכה ב-Smart Split (פעיל רק במצב קובץ מקומי) ---
        if (currentSelectedFile && fullText.includes('<<<<<<< CREATE')) {
          const splitBtn = document.createElement('button');
          splitBtn.innerHTML = '✂️ לחץ לתצוגה מקדימה של הפיצול';
          splitBtn.style.cssText = 'background: #a855f7; color: #fff; border: none; padding: 8px 12px; border-radius: 6px; margin-top: 10px; cursor: pointer; width: 100%; font-weight: bold; transition: 0.2s;';
          splitBtn.onmouseover = () => splitBtn.style.background = '#9333ea';
          splitBtn.onmouseout = () => splitBtn.style.background = '#a855f7';
          splitBtn.onclick = () => detectAndShowSplit(fullText, currentSelectedFile);
          
          aiMsgDiv.appendChild(splitBtn);
          msgsDiv.scrollTop = msgsDiv.scrollHeight;
        }

        // --- ⚡ תמיכה בתיקונים נקודתיים או שכתוב מלא ---
        const blockMatch = fullText.match(/^<<<<<<< SEARCH\r?\n([\s\S]*?)^=======\r?\n([\s\S]*?)^>>>>>>> REPLACE/m);
        if (currentSelectedFile && blockMatch && blockMatch[1] && blockMatch[2]) {
          const searchBlock = blockMatch[1];
          const replaceBlock = blockMatch[2];

          const applyBtn = document.createElement('button');
          applyBtn.className = 'apply-code-btn';
          applyBtn.innerText = '⚡ החל תיקון נקודתי';
          applyBtn.onclick = () => applyBlockChanges(searchBlock, replaceBlock);
          aiMsgDiv.appendChild(applyBtn);

          applyBtn.scrollIntoView({ behavior: 'smooth', block: 'end' });
          previewDiffInEditor(searchBlock, replaceBlock);
        } else if (currentSelectedFile) {
          const codeMatch = fullText.match(/```(?:javascript|js)?[\r\n]+([\s\S]*?)```/i);
          if (codeMatch && codeMatch[1] && codeMatch[1].trim().length > 10) {
            const extractedCode = codeMatch[1].trim();
            const applyBtn = document.createElement('button');
            applyBtn.className = 'apply-code-btn';
            applyBtn.innerText = '💾 החל שינויים בקובץ';
            applyBtn.onclick = () => applyCodeChanges(extractedCode);
            aiMsgDiv.appendChild(applyBtn);
            applyBtn.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        }
      } catch (err) {
        contentSpan.innerText = '❌ שגיאת תקשורת: ' + err.message;
      }
    }

    // --- ✂️ מנגנון פיצול קבצים חכם (Smart Split) ---

    function detectAndShowSplit(aiText, currentFilePath) {
      // 🆕 Regex חסין-כדורים שיודע להתמודד עם בלוקים ריקים לחלוטין
      const createRegex = /^<<<<<<< CREATE \[(.*?)\]\r?\n([\s\S]*?)^>>>>>>> END_CREATE/m;
      const createMatch = aiText.match(createRegex);
      
      const searchReplaceRegex = /^<<<<<<< SEARCH\r?\n([\s\S]*?)^=======\r?\n([\s\S]*?)^>>>>>>> REPLACE/m;
      const srMatch = aiText.match(searchReplaceRegex);

      if (createMatch && srMatch) {
        const newFileName = createMatch[1].trim();
        const newFileContent = createMatch[2].trim();
        const searchCode = srMatch[1].replace(/^\n/, ''); 
        const replaceCode = srMatch[2].replace(/^\n/, '');

        // פתיחת העורך הימני בתצוגה מפוצלת
        document.getElementById('editor-panel').classList.add('open');
        document.getElementById('editor-title').innerText = '✂️ תצוגה מקדימה לפיצול קובץ';
        
        const editorBody = document.getElementById('editor-body');
        
        // בניית ה-HTML של התצוגה המפוצלת (אדום לישן, ירוק לחדש)
        editorBody.innerHTML = `
          <div style="padding: 15px; background: rgba(0,0,0,0.4); border-radius: 8px; margin-bottom: 20px;">
            <h4 style="color: #ff4444; margin-top: 0;">1. יוסר מהקובץ המקורי (${currentFilePath.split('/').pop()}):</h4>
            <pre style="background: rgba(255, 0, 0, 0.1); text-decoration: line-through; padding: 10px; border-left: 4px solid #ff4444; overflow-x: auto; direction: ltr;"><code>${escapeHTML(searchCode)}</code></pre>
            
            <h4 style="color: #33ff33;">יוחלף ב (לרוב קריאה לקובץ החדש):</h4>
            <pre style="background: rgba(0, 255, 0, 0.1); padding: 10px; border-left: 4px solid #33ff33; overflow-x: auto; direction: ltr;"><code>${escapeHTML(replaceCode)}</code></pre>
          </div>

          <div style="padding: 15px; background: rgba(0,0,0,0.4); border-radius: 8px; margin-bottom: 20px;">
            <h4 style="color: #00f0ff; margin-top: 0;">2. ייווצר קובץ חדש (${newFileName}):</h4>
            <pre style="background: rgba(0, 240, 255, 0.15); padding: 10px; border-left: 4px solid #00f0ff; overflow-x: auto; direction: ltr;"><code>${escapeHTML(newFileContent)}</code></pre>
          </div>

          <button id="confirm-split-btn" style="width: 100%; background: linear-gradient(135deg, #33ff33, #00f0ff); color: #000; font-weight: bold; font-size: 16px; padding: 15px; border: none; border-radius: 8px; cursor: pointer; transition: transform 0.2s;">
            ✨ אשר ביצוע: פצל את הקוד וצור כוכב חדש!
          </button>
        `;

        // חיבור הכפתור לפעולת הביצוע בפועל
        document.getElementById('confirm-split-btn').onclick = () => {
          executeSplit(currentFilePath, searchCode, replaceCode, newFileName, newFileContent);
        };
      } else {
        alert("לא זוהה פורמט פיצול מלא בתשובת ה-AI.");
      }
    }

    async function executeSplit(oldFilePath, searchStr, replaceStr, newFileName, newContent) {
       const btn = document.getElementById('confirm-split-btn');
       btn.innerText = 'מבצע קסמים... ⏳';
       
       try {
         // פעולה 1: מחיקת הקוד מהקובץ הישן (דרך ה-API הקיים שלנו)
         await fetch('/api/apply-block-change', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: oldFilePath, searchStr, replaceStr })
         });

         // חישוב הנתיב של הקובץ החדש (שומרים אותו באותה תיקייה של הקובץ הישן)
         const dirPath = oldFilePath.substring(0, oldFilePath.lastIndexOf('/'));
         const fullNewFilePath = dirPath ? (dirPath + '/' + newFileName) : newFileName;

         // פעולה 2: יצירת הקובץ החדש
         await fetch('/api/create-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: fullNewFilePath, content: newContent })
         });

         btn.innerText = '✔ בוצע בהצלחה!';
         btn.style.background = '#33ff33';
         
         setTimeout(() => {
            closeEditor();
            alert('הקובץ נוצר בהצלחה! סגור את חלון הפרויקט (רענון הדף) וטען אותו מחדש כדי לראות את הכוכב החדש צץ בגלקסיה 🌌');
         }, 2500);

       } catch (err) {
         alert('❌ שגיאה בביצוע הפיצול: ' + err.message);
         btn.innerText = 'שגיאה';
       }
    }

    // פונקציית עזר למניעת שבירת HTML של קוד בדפדפן
    function escapeHTML(str) {
      return str.replace(/[&<>'"]/g, tag => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag));
    }

    // --- 📂 טיפול בגרירה ושחרור (Drag & Drop) לחלונית המאוחדת ---
    async function handleDrop(event) {
      event.preventDefault();
      document.getElementById('drop-zone-box').classList.remove('dragover');
      
      const items = event.dataTransfer.items;
      if (!items || items.length === 0) return;
      
      const allowedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.dart', '.py', '.java', '.cs', '.go', '.c', '.cpp', '.h', '.hpp', '.html', '.css', '.json'];
      const filesToSend = [];

      // פונקציה רקורסיבית לסריקת תיקיות שנסחבו
      async function traverseFileTree(item, path = '') {
        if (item.isFile) {
          return new Promise((resolve) => {
            item.file(async file => {
              if (file.size > 500 * 1024) {
                resolve();
                return;
              }
              const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
              if (allowedExtensions.includes(ext) && !file.name.includes('node_modules') && !file.name.includes('.git')) {
                const content = await file.text();
                filesToSend.push({ path: path + file.name, content: content });
              }
              resolve();
            });
          });
        } else if (item.isDirectory) {
          const dirReader = item.createReader();
          return new Promise((resolve) => {
            dirReader.readEntries(async entries => {
              for (const entry of entries) {
                // יישור קו עם השרת: סינון חסין
                if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'data' && entry.name !== 'dist' && entry.name !== 'build' && entry.name !== 'package-lock.json' && entry.name !== 'yarn.lock') {
                  await traverseFileTree(entry, path + item.name + '/');
                }
              }
              resolve();
            });
          });
        }
      }

      // ⚠️ זו הלולאה שכנראה נמחקה בטעות בעדכון הקודם. היא מפעילה את מנוע הסריקה!
      for (let i = 0; i < items.length; i++) {
        const item = items[i].webkitGetAsEntry();
        if (item) {
          await traverseFileTree(item);
        }
      }

      if (filesToSend.length === 0) {
        alert('לא נמצאו קבצי קוד נתמכים בגרירה.');
        return;
      }

      // העברה לחלונית האישור שלנו
      showConfirmOverlay(filesToSend);
    }

    // --- 🛡️ חלונית אישור לפני טעינה ונעילת מסך ---
    function showConfirmOverlay(filesToSend) {
      const overlay = document.getElementById('confirm-loading-overlay');
      const confirmStep = document.getElementById('confirm-step');
      const loadingStep = document.getElementById('loading-step');
      
      // אתחול התצוגה למצב "בקשת אישור"
      confirmStep.style.display = 'block';
      loadingStep.style.display = 'none';
      overlay.style.display = 'flex'; // z-index 200 נועל את כל מה שמתחתיו!
      
      document.getElementById('confirm-message').innerText = `זיהינו ${filesToSend.length} קבצי קוד נתמכים בפרויקט. האם תרצה להתחיל לנתח אותם?`;

      // 1. אם המשתמש התחרט (ביטול)
      document.getElementById('cancel-scan-btn').onclick = () => {
        overlay.style.display = 'none';
      };

      // 2. אם המשתמש מאשר את הסריקה (החלק העיקרי)
      document.getElementById('approve-scan-btn').onclick = async () => {
        confirmStep.style.display = 'none';
        loadingStep.style.display = 'block';
        
        document.getElementById('loading-message').innerText = `מכין ${filesToSend.length} קבצים לניתוח...`;

        const progressFill = document.getElementById('progress-bar-fill');
        const progressText = document.getElementById('progress-text');
        
        // 🆕 יצירת מזהה ייחודי לסריקה כדי לשאול את השרת עליה
        const scanId = 'scan_' + Date.now();
        
        // 🚀 מנגנון תשאול חכם (Polling) - כל חצי שנייה שואל את השרת מה המצב האמיתי
        const progressInterval = setInterval(async () => {
          try {
            const progressRes = await fetch(`/api/scan-progress?id=${scanId}`);
            const progressData = await progressRes.json();
            
            if (progressData.total > 0) {
              const current = progressData.current;
              const total = progressData.total;
              const pct = Math.floor((current / total) * 100);
              
              progressFill.style.width = `${pct}%`;
              progressText.innerText = `${pct}%`;
              document.getElementById('loading-message').innerText = `מנתח קובץ ${current} מתוך ${total}... נא לא לסגור את החלון.`;
            }
          } catch (e) {
            // התעלם משגיאות רשת זמניות
          }
        }, 500);

        try {
          const res = await fetch('/api/analyze-local-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // 🆕 שליחת המזהה לשרת ביחד עם הקבצים
            body: JSON.stringify({ files: filesToSend, scanId: scanId })
          });
          
          const data = await res.json();
          
          // 💯 הבקשה סיימה!
          clearInterval(progressInterval);
          progressFill.style.width = '100%';
          progressText.innerText = '100%';
          document.getElementById('loading-message').innerText = `הניתוח הושלם בהצלחה! מסדר את הגלקסיה...`;

          if (data.error) {
            setTimeout(() => {
              alert('❌ שגיאה: ' + data.error);
              overlay.style.display = 'none';
            }, 500);
          } else {
            setTimeout(() => {
              Graph.graphData(data); // טעינת הגלקסיה
              hideModal(); 
              overlay.style.display = 'none';
            }, 800);
          }
        } catch (err) {
          clearInterval(progressInterval);
          alert('❌ שגיאת תקשורת עם השרת');
          overlay.style.display = 'none';
        }
      };
    }

    // --- 🕒 מנגנון היסטוריית פרויקטים ---
    async function loadRecentProjects() {
      try {
        const res = await fetch('/api/history');
        const history = await res.json();
        
        const section = document.getElementById('recent-projects-section');
        const list = document.getElementById('recent-projects-list');
        
        if (history.length === 0) {
          section.style.display = 'none';
          return;
        }
        
        section.style.display = 'block';
        list.innerHTML = '';
        
        history.forEach(proj => {
          const date = new Date(proj.lastAccessed);
          const timeString = `${date.getDate()}/${date.getMonth()+1} - ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
          const icon = proj.type === 'github' ? '🌐' : '📁';
          
          const card = document.createElement('div');
          card.className = 'project-card';
          card.onclick = () => loadProjectFromHistory(proj.id);
          
          card.innerHTML = `
            <div class="project-card-title">${icon} ${proj.name}</div>
            <div class="project-card-time">עודכן: ${timeString}</div>
            <button class="project-card-delete" onclick="deleteProjectFromHistory('${proj.id}', event)" title="מחק פרויקט">🗑️</button>
          `;
          list.appendChild(card);
        });
      } catch (e) {
        console.error('שגיאה בטעינת היסטוריה:', e);
      }
    }

    async function deleteProjectFromHistory(id, event) {
      event.stopPropagation(); // מונע מלחיצה על הפח להפעיל גם את פתיחת הפרויקט!
      if (!confirm('האם אתה בטוח שברצונך למחוק פרויקט זה מהזיכרון? (זה יפנה מקום בשרת)')) return;
      
      await fetch(`/api/history/${id}`, { method: 'DELETE' });
      loadRecentProjects(); // רענון מהיר של הרשימה
    }

    async function loadProjectFromHistory(id) {
      const overlay = document.getElementById('confirm-loading-overlay');
      const confirmStep = document.getElementById('confirm-step');
      const loadingStep = document.getElementById('loading-step');
      
      // מדלג על בקשת האישור וישר מציג טעינה מהירה
      confirmStep.style.display = 'none';
      loadingStep.style.display = 'block';
      overlay.style.display = 'flex';
      
      document.getElementById('loading-message').innerText = 'שולף את הגלקסיה מהזיכרון... ✨';
      document.getElementById('progress-bar-fill').style.width = '100%';
      document.getElementById('progress-text').innerText = '🚀';

      try {
        const res = await fetch(`/api/load-project/${id}`);
        if (!res.ok) throw new Error('הפרויקט לא נמצא. ייתכן שנמחק ידנית.');
        
        const data = await res.json();
        
        setTimeout(() => {
          Graph.graphData(data);
          hideModal(); 
          overlay.style.display = 'none';
        }, 600); // השהיה קטנטנה בשביל חוויית משתמש חלקה
      } catch (err) {
        alert('❌ שגיאה: ' + err.message);
        overlay.style.display = 'none';
      }
    }

    // קריאה ראשונית בעת טעינת הדף
    window.addEventListener('DOMContentLoaded', loadRecentProjects);

    // --- 🔘 הפעלה וכיבוי של קשרי ה-AI במנוע התלת-ממד ---
    function toggleSemanticLinks() {
      if (Graph) {
        // מרענן למנוע הפיזיקה את חוקי התצוגה, והוא ידליק/יכבה אוטומטית!
        Graph.linkVisibility(link => {
          if (link.type === 'semantic') {
            return document.getElementById('semantic-toggle').checked;
          }
          return true;
        });
      }
    }

    // --- 📖 פונקציות פתיחה וסגירה של מרכז המידע ---
    function openInfoModal(sectionId) {
      const modal = document.getElementById('info-modal');
      modal.style.display = 'flex';
      
      // מחכה שהחלון יופיע ויקבל מידות, ואז גולש לאזור המתאים
      setTimeout(() => {
        const targetSection = document.getElementById(sectionId);
        const scrollArea = document.getElementById('info-scroll-area');
        
        if (targetSection && scrollArea) {
          // חישוב המרחק של הפסקה מהחלק העליון של אזור הגלילה
          const topPosition = targetSection.offsetTop - scrollArea.offsetTop;
          
          scrollArea.scrollTo({
            top: topPosition,
            behavior: 'smooth'
          });
          
          // 💡 אפקט "הארה" (Highlight) שמסמן למשתמש על מה הוא לחץ!
          targetSection.style.transition = 'background 0.5s ease';
          targetSection.style.background = 'rgba(0, 240, 255, 0.15)';
          
          // מכבה את ההארה בעדינות אחרי שנייה וחצי
          setTimeout(() => {
            targetSection.style.background = 'transparent';
          }, 1500);
        }
      }, 50);
    }

    function closeInfoModal() {
      document.getElementById('info-modal').style.display = 'none';
    }