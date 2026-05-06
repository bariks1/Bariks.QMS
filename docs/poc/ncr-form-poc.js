/**
 * מערכת אוטומטית ליצירת דוחות NCR באמצעות Gemini API
 * גרסה מאובטחת - Production
 */

const FOLDER_ID = 'הכנס_כאן_את_מזהה_התיקייה_של_הדוחות'; // ID של תיקיית היעד ב-Drive
const QUALITY_MANAGER_EMAIL = 'quality@yourcompany.com'; // אימייל מנהל/ת איכות

/**
 * Helper Function: משיכת המודל העדכני עם טיפול בשגיאות
 */
function getLatestModelPath() {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) throw new Error("API Key is missing in Script Properties.");

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    
    if (response.getResponseCode() !== 200) {
      throw new Error("Failed to fetch models list.");
    }
    
    const data = JSON.parse(response.getContentText());
    const availableModels = data.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent") && m.name.includes("gemini"));
    let selectedModel = availableModels.find(m => m.name.includes("flash")) || availableModels[0];
    
    return selectedModel.name;
  } catch (error) {
    console.warn('Error fetching model, using default: ' + error.message);
    return "models/gemini-1.5-flash"; // Fallback model
  }
}

/**
 * Main Function: רצה בעת שליחת טופס
 */
function onFormSubmit(e) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    const dynamicModelPath = getLatestModelPath();
    const itemResponses = e.response.getItemResponses();
    const reporterName = itemResponses[0].getResponse();
    const rawDescription = itemResponses[2].getResponse(); 

    // Prompt משופר
    const prompt = `אתה מהנדס איכות מומחה (ISO 13485) בחברת מכשור רפואי המפתחת תא לחץ נייד (HBOT - Portable Hyperbaric Oxygen Chamber). 
    הפוך את הדיווח הגולמי הבא לדוח NCR רשמי בעברית.
    
    שם המדווח: ${reporterName}
    תיאור האירוע: "${rawDescription}"
    
    דרישות פורמט ותוכן קריטיות:
    1. החזר אך ורק קוד HTML מלא (כולל תגיות style, body, html). אל תכלול שום טקסט מקדים או מסכם.
    2. הגדר dir="rtl" ועיצוב טבלאות עם גבולות (border: 1px solid black) וצבע רקע לכותרות.
    3. אל תשתמש בסימני Markdown.
    4. כלול כותרות h1, h2 וניתוח סיכונים ראשוני בטבלה.
    5. חובה: שלב את "שם המדווח" המדויק בתוך טבלת פרטי ה-NCR.
    6. חובה: ציין במפורש שהמוצר הוא "תא לחץ נייד (HBOT)". התאם את התיאור ההנדסי, ה-CAPA וניתוח הסיכונים לסביבת טיפול של תא לחץ (דליפות חמצן, סכנת התלקחות, אילוצי חלל, בטיחות המטופל בתא).`;
        
    const url = `https://generativelanguage.googleapis.com/v1beta/${dynamicModelPath}:generateContent?key=${apiKey}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const options = { 
      method: 'post', 
      contentType: 'application/json', 
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    let aiHtml = JSON.parse(response.getContentText()).candidates[0].content.parts[0].text;
    
    // ניקוי תגיות
    aiHtml = aiHtml.replace(/```html/g, '').replace(/```/g, '').trim();

    // יצירת המסמך
    const docName = `NCR_${new Date().toISOString().split('T')[0]}_${reporterName}`;
    const blob = Utilities.newBlob(aiHtml, MimeType.HTML);
    
    const resource = {
      name: docName,
      mimeType: MimeType.GOOGLE_DOCS,
      parents: [FOLDER_ID] // שמירה בתיקייה הייעודית
    };
    
    const file = Drive.Files.create(resource, blob); 
    const docUrl = 'https://docs.google.com/document/d/' + file.id + '/edit';
    console.log('Success! Document created: ' + docUrl);

    // שליחת התראה במייל
    MailApp.sendEmail({
      to: QUALITY_MANAGER_EMAIL,
      subject: "⚠️ דוח NCR חדש במערכת: " + docName,
      htmlBody: `
        <h2 dir="rtl">התראת איכות - תא לחץ נייד (HBOT)</h2>
        <p dir="rtl">שלום,</p>
        <p dir="rtl">דוח <b>NCR</b> חדש נוצר במערכת על ידי <b>${reporterName}</b>.</p>
        <p dir="rtl">תיאור מקורי: <i>"${rawDescription}"</i></p>
        <p dir="rtl"><a href="${docUrl}">לחץ כאן למעבר לדוח המלא לצורך סקירה ואישור</a></p>
      `
    });

  } catch (error) {
    console.error('Error during execution: ' + error.toString());
  }
}

function forcePermissions() {
  FormApp.getActiveForm();
  DriveApp.getRootFolder();
  MailApp.getRemainingDailyQuota();
}