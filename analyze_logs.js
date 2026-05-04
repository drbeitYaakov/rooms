const fs = require('fs');
const path = require('path');

// קריאת הלוגים מהקובץ
const logPath = path.join(__dirname, 'logs', 'app.log');
const errorLogPath = path.join(__dirname, 'logs', 'error.log');

function analyzeLogs() {
  console.log('🔍 === ניתוח לוגים ===\n');
  
  try {
    // קריאת לוגים רגילים
    let logs = '';
    if (fs.existsSync(logPath)) {
      logs = fs.readFileSync(logPath, 'utf8');
    }
    
    // קריאת לוגי שגיאות
    let errorLogs = '';
    if (fs.existsSync(errorLogPath)) {
      errorLogs = fs.readFileSync(errorLogPath, 'utf8');
    }
    
    const allLogs = logs + '\n' + errorLogs;
    const lines = allLogs.split('\n').filter(line => line.trim());
    
    // פילטור לוגים רק מהיום האחרון
    const today = new Date().toISOString().split('T')[0];
    const todayLines = lines.filter(line => line.includes(today));
    
    console.log(`📅 לוגים מהיום (${today}): ${todayLines.length} שורות`);
    
    // 1. חיפוש לוגים של DEBUG
    console.log('\n� === לוגי DEBUG ===');
    const debugLines = todayLines.filter(line => 
      line.includes('DEBUG') || 
      line.includes('🔍') || 
      line.includes('📊') ||
      line.includes('🎯') ||
      line.includes('✅') ||
      line.includes('🚫')
    );
    
    if (debugLines.length > 0) {
      console.log(`נמצאו ${debugLines.length} לוגי DEBUG:`);
      debugLines.slice(-20).forEach((line, index) => {
        // ניסיון לפרסר JSON
        try {
          const jsonLog = JSON.parse(line);
          if (jsonLog.message) {
            console.log(`${index + 1}. ${jsonLog.message}`);
          }
        } catch {
          // אם זה לא JSON, נציג את זה כמו שזה
          console.log(`${index + 1}. ${line.substring(0, 200)}...`);
        }
      });
    } else {
      console.log('❌ לא נמצאו לוגי DEBUG מהיום');
    }
    
    // 2. חיפוש לוגים של שיבוצים
    console.log('\n� === לוגים של שיבוצים ===');
    const assignmentLines = todayLines.filter(line => 
      line.includes('assignment') || 
      line.includes('Assignment') ||
      line.includes('room') ||
      line.includes('Room')
    );
    
    if (assignmentLines.length > 0) {
      console.log(`נמצאו ${assignmentLines.length} לוגים של שיבוצים:`);
      assignmentLines.slice(-15).forEach((line, index) => {
        try {
          const jsonLog = JSON.parse(line);
          if (jsonLog.message && (jsonLog.message.includes('assignment') || jsonLog.message.includes('room'))) {
            console.log(`${index + 1}. ${jsonLog.message}`);
          }
        } catch {
          if (line.includes('assignment') || line.includes('room')) {
            console.log(`${index + 1}. ${line.substring(0, 200)}...`);
          }
        }
      });
    } else {
      console.log('❌ לא נמצאו לוגים של שיבוצים מהיום');
    }
    
    // 3. חיפוש שגיאות רלוונטיות
    console.log('\n� === שגיאות רלוונטיות ===');
    const relevantErrors = todayLines.filter(line => 
      line.includes('409') || 
      line.includes('conflict') ||
      line.includes('duplicate') ||
      line.includes('BLOCKING') ||
      line.includes('ECONNREFUSED')
    );
    
    if (relevantErrors.length > 0) {
      console.log(`נמצאו ${relevantErrors.length} שגיאות רלוונטיות:`);
      relevantErrors.forEach((line, index) => {
        try {
          const jsonLog = JSON.parse(line);
          console.log(`${index + 1}. ${jsonLog.message || jsonLog.error}`);
        } catch {
          console.log(`${index + 1}. ${line.substring(0, 300)}...`);
        }
      });
    } else {
      console.log('✅ לא נמצאו שגיאות רלוונטיות');
    }
    
    // 4. חיפוש בקשות API
    console.log('\n🌐 === בקשות API ===');
    const apiLines = todayLines.filter(line => 
      line.includes('POST') || 
      line.includes('GET') ||
      line.includes('/api/') ||
      line.includes('assignments')
    );
    
    if (apiLines.length > 0) {
      console.log(`נמצאו ${apiLines.length} בקשות API:`);
      apiLines.slice(-10).forEach((line, index) => {
        try {
          const jsonLog = JSON.parse(line);
          if (jsonLog.message && jsonLog.message.includes('/api/')) {
            console.log(`${index + 1}. ${jsonLog.message}`);
          }
        } catch {
          if (line.includes('/api/') || line.includes('POST') || line.includes('GET')) {
            console.log(`${index + 1}. ${line.substring(0, 200)}...`);
          }
        }
      });
    } else {
      console.log('❌ לא נמצאו בקשות API מהיום');
    }
    
    // 5. סיכום
    console.log('\n📈 === סיכום ===');
    console.log(`סך הכל שורות בלוג: ${lines.length}`);
    console.log(`שורות מהיום: ${todayLines.length}`);
    console.log(`לוגי DEBUG מהיום: ${debugLines.length}`);
    console.log(`לוגי שיבוצים מהיום: ${assignmentLines.length}`);
    console.log(`שגיאות רלוונטיות מהיום: ${relevantErrors.length}`);
    
    // 6. המלצות
    console.log('\n💡 === המלצות ===');
    if (debugLines.length === 0) {
      console.log('❌ אין לוגי DEBUG מהיום - ייתכן שהשרת לא הופעל עם הקוד החדש');
      console.log('🔄 נא להפעיל מחדש את השרת ולרענן את הדף');
    }
    
    if (relevantErrors.length > 0) {
      console.log('⚠️ יש שגיאות רלוונטיות - כדאי לבדוק אותן');
    }
    
    if (assignmentLines.length === 0) {
      console.log('❌ אין לוגים של שיבוצים - ייתכן שלא בוצעו פעולות שיבוץ');
    }
    
  } catch (error) {
    console.error('❌ שגיאה בקריאת לוגים:', error.message);
  }
}

analyzeLogs();
