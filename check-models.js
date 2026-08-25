require('dotenv').config();
const https = require('https');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("❌ לא נמצא מפתח API בקובץ .env");
  process.exit(1);
}

console.log("🔍 מתחבר לשרתי Google לבדיקת מודלים זמינים...");

https.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.models) {
        const embedModels = parsed.models.filter(m => 
          m.supportedGenerationMethods && m.supportedGenerationMethods.includes('embedContent')
        );
        
        console.log("\n🎯 מודלים תומכי וקטורים (Embeddings) הפתוחים למפתח שלך:");
        if (embedModels.length === 0) {
          console.log("לא נמצאו מודלים מתאימים! ייתכן שלמפתח יש הרשאות צ'אט בלבד.");
        } else {
          embedModels.forEach(m => console.log(`- ${m.name}`));
        }
      } else {
        console.log("❌ שגיאה בשליפת המודלים:", parsed);
      }
    } catch (e) {
      console.error("שגיאה בפענוח התשובה:", e.message);
    }
  });
}).on('error', (err) => {
  console.error("❌ שגיאת תקשורת:", err.message);
});