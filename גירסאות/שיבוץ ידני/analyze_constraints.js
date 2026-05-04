const fs = require('fs');
const path = require('path');

// קריאת הלוגים מהקובץ
const logPath = path.join(__dirname, 'logs', 'app.log');

function analyzeConstraints() {
  console.log('🔍 === ניתוח שגיאות Constraint ===\n');
  
  try {
    let logs = '';
    if (fs.existsSync(logPath)) {
      logs = fs.readFileSync(logPath, 'utf8');
    }
    
    const lines = logs.split('\n').filter(line => line.trim());
    const today = new Date().toISOString().split('T')[0];
    const todayLines = lines.filter(line => line.includes(today));
    
    // חיפוש שגיאות constraint
    console.log('🚨 === שגיאות Constraint ===');
    const constraintErrors = todayLines.filter(line => 
      line.includes('violates check constraint') ||
      line.includes('assignments_assignable_type_check') ||
      line.includes('assignments_type_check')
    );
    
    if (constraintErrors.length > 0) {
      console.log(`נמצאו ${constraintErrors.length} שגיאות constraint:`);
      constraintErrors.forEach((line, index) => {
        try {
          const jsonLog = JSON.parse(line);
          console.log(`\n${index + 1}. שגיאת constraint:`);
          console.log(`   ${jsonLog.message || jsonLog.error}`);
        } catch {
          console.log(`\n${index + 1}. שגיאת constraint:`);
          console.log(`   ${line.substring(0, 500)}...`);
        }
      });
    } else {
      console.log('❌ לא נמצאו שגיאות constraint מהיום');
    }
    
    // חיפוש שגיאות סוג נתונים
    console.log('\n🔤 === שגיאות סוג נתונים ===');
    const typeErrors = todayLines.filter(line => 
      line.includes('is of type') && line.includes('but expression is of type')
    );
    
    if (typeErrors.length > 0) {
      console.log(`נמצאו ${typeErrors.length} שגיאות סוג נתונים:`);
      typeErrors.forEach((line, index) => {
        try {
          const jsonLog = JSON.parse(line);
          console.log(`\n${index + 1}. שגיאת סוג נתונים:`);
          console.log(`   ${jsonLog.message || jsonLog.error}`);
        } catch {
          console.log(`\n${index + 1}. שגיאת סוג נתונים:`);
          console.log(`   ${line.substring(0, 500)}...`);
        }
      });
    } else {
      console.log('❌ לא נמצאו שגיאות סוג נתונים מהיום');
    }
    
    // חיפוש ניסיונות יצירת שיבוצים
    console.log('\n✋ === ניסיונות יצירת שיבוצים ===');
    const creationAttempts = todayLines.filter(line => 
      line.includes('Assignment created:') ||
      line.includes('POST /assignments') ||
      line.includes('insert into "assignments"')
    );
    
    if (creationAttempts.length > 0) {
      console.log(`נמצאו ${creationAttempts.length} ניסיונות יצירת שיבוצים:`);
      creationAttempts.forEach((line, index) => {
        try {
          const jsonLog = JSON.parse(line);
          if (jsonLog.message) {
            console.log(`\n${index + 1}. ${jsonLog.message}`);
          }
        } catch {
          if (line.includes('Assignment created:')) {
            console.log(`\n${index + 1}. ${line}`);
          } else if (line.includes('insert into "assignments"')) {
            console.log(`\n${index + 1}. ניסיון הכנסה למסד נתונים:`);
            console.log(`   ${line.substring(0, 300)}...`);
          }
        }
      });
    } else {
      console.log('❌ לא נמצאו ניסיונות יצירת שיבוצים מהיום');
    }
    
    // סיכום הבעיות
    console.log('\n📋 === סיכום הבעיות שנמצאו ===');
    
    if (constraintErrors.length > 0) {
      console.log('⚠️ בעיית Constraint:');
      console.log('   - הקוד מנסה להכניס ערכים שלא תואמים את ה-check constraints');
      console.log('   - סביר להניח שהבעיה היא בשדות type או assignable_type');
    }
    
    if (typeErrors.length > 0) {
      console.log('⚠️ בעיית סוג נתונים:');
      console.log('   - הקוד מנסה להכניס סוג נתונים לא נכון (למשל integer במקום UUID)');
      console.log('   - סביר להניח שהבעיה היא בשדה created_by');
    }
    
    console.log('\n💡 === פתרונות מוצעים ===');
    console.log('1. לבדוק את הערכים המוכנסים לשדות type ו-assignable_type');
    console.log('2. לוודא ש-created_by הוא UUID ולא integer');
    console.log('3. להתאים את הקוד ל-constraints של הטבלה');
    
  } catch (error) {
    console.error('❌ שגיאה בקריאת לוגים:', error.message);
  }
}

analyzeConstraints();
