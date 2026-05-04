const fs = require('fs');
const path = require('path');

function findRecentCalendarLogs() {
  console.log('🔍 === חיפוש לוגים אחרונים של Calendar ===\n');
  
  try {
    const logPath = path.join(__dirname, 'logs', 'app.log');
    if (!fs.existsSync(logPath)) {
      console.log('❌ קובץ לוג לא נמצא');
      return;
    }
    
    const logs = fs.readFileSync(logPath, 'utf8');
    const lines = logs.split('\n').filter(line => line.trim());
    
    // חיפוש לוגים של calendar מהשעה האחרונה
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentLines = lines.filter(line => {
      try {
        const jsonLog = JSON.parse(line);
        const logTime = new Date(jsonLog.timestamp);
        return logTime > oneHourAgo && (
          jsonLog.message?.includes('DEBUG: First assignment structure') ||
          jsonLog.message?.includes('DEBUG: Sample assignment data') ||
          jsonLog.message?.includes('📅 Found rooms') ||
          jsonLog.message?.includes('📅 All active assignments')
        );
      } catch {
        return false;
      }
    });
    
    if (recentLines.length > 0) {
      console.log(`נמצאו ${recentLines.length} לוגים רלוונטיים מהשעה האחרונה:`);
      recentLines.forEach((line, index) => {
        try {
          const jsonLog = JSON.parse(line);
          console.log(`\n${index + 1}. ${jsonLog.timestamp}:`);
          console.log(`   ${jsonLog.message}`);
        } catch {
          console.log(`\n${index + 1}. ${line}`);
        }
      });
    } else {
      console.log('❌ לא נמצאו לוגים של calendar מהשעה האחרונה');
      console.log('💡 ייתכן שצריך לרענן את הדף כדי ליצור לוגים חדשים');
    }
    
    // חיפוש כללי של לוגי calendar
    console.log('\n🔍 === כל לוגי ה-calendar האחרונים ===');
    const allCalendarLines = lines.filter(line => {
      try {
        const jsonLog = JSON.parse(line);
        return jsonLog.message?.includes('📅') || 
               jsonLog.message?.includes('calendar') ||
               jsonLog.message?.includes('Calendar');
      } catch {
        return line.includes('📅') || line.includes('calendar');
      }
    });
    
    if (allCalendarLines.length > 0) {
      console.log(`נמצאו ${allCalendarLines.length} לוגי calendar סה"כ (מציג 10 אחרונים):`);
      allCalendarLines.slice(-10).forEach((line, index) => {
        try {
          const jsonLog = JSON.parse(line);
          console.log(`${index + 1}. ${jsonLog.timestamp}: ${jsonLog.message}`);
        } catch {
          console.log(`${index + 1}. ${line.substring(0, 200)}...`);
        }
      });
    } else {
      console.log('❌ לא נמצאו לוגי calendar כלל');
    }
    
  } catch (error) {
    console.error('❌ שגיאה:', error.message);
  }
}

findRecentCalendarLogs();
