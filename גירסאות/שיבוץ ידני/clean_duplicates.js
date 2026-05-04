import { db } from './src/backend/config/database.js';

async function cleanDuplicates() {
  try {
    console.log('Finding duplicate assignments...');
    
    // Find duplicates by grouping by room_id, date, start_time, end_time
    const duplicates = await db('assignments')
      .select('room_id', 'date', 'start_time', 'end_time')
      .count('* as count')
      .where('status', 'active')
      .groupBy('room_id', 'date', 'start_time', 'end_time')
      .having('count', '>', 1);
    
    console.log(`Found ${duplicates.length} groups of duplicates`);
    
    for (const duplicate of duplicates) {
      console.log(`Processing duplicates for room ${duplicate.room_id} on ${duplicate.date} ${duplicate.start_time}-${duplicate.end_time}`);
      
      // Get all assignments for this group, ordered by created_at (keep the first one)
      const assignments = await db('assignments')
        .where({
          room_id: duplicate.room_id,
          date: duplicate.date,
          start_time: duplicate.start_time,
          end_time: duplicate.end_time,
          status: 'active'
        })
        .orderBy('created_at', 'asc');
      
      // Keep the first one, delete the rest
      const toKeep = assignments[0];
      const toDelete = assignments.slice(1);
      
      console.log(`Keeping assignment ${toKeep.id}, deleting ${toDelete.length} duplicates`);
      
      if (toDelete.length > 0) {
        await db('assignments')
          .whereIn('id', toDelete.map(a => a.id))
          .del();
        
        console.log(`Deleted ${toDelete.length} duplicate assignments`);
      }
    }
    
    console.log('Duplicate cleanup completed!');
    
    // Show final count
    const totalAssignments = await db('assignments').where('status', 'active').count('* as total');
    console.log(`Total active assignments: ${totalAssignments[0].total}`);
    
  } catch (error) {
    console.error('Error cleaning duplicates:', error);
  } finally {
    process.exit(0);
  }
}

cleanDuplicates();
