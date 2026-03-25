// clear-logs.js
const { database } = require('./src/database/initializeDatabase');

async function clearLogs() {
  try {
    console.log('🗑️ Clearing all activity logs...');
    const logs = database.get('activity_logs');
    const allLogs = await logs.query().fetch();
    
    await database.write(async () => {
      for (const log of allLogs) {
        await log.destroyPermanently();
      }
    });
    
    console.log(`✅ Cleared ${allLogs.length} activity logs`);
  } catch (error) {
    console.error('❌ Error clearing activity logs:', error);
  }
}

clearLogs();
