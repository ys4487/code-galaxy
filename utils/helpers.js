// קובץ בדיקה עם סיבוכיות גבוהה
function checkUserAccess(user, role, permission, isExpired) {
  if (user) {
    if (role === 'admin') {
      if (permission === 'full' && !isExpired) {
        return true;
      } else if (permission === 'read') {
        return true;
      } else {
        return false;
      }
    } else if (role === 'editor') {
      if (permission !== 'delete') {
        return true;
      }
    } else {
      return false;
    }
  }
  return false;
}

module.exports = { checkUserAccess };