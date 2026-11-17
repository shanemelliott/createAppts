/**
 * Show All Lists - Diagnostic Tool
 * Lists all clinic lists in the system to help find them
 */

import axios from 'axios';
import https from 'https';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:4010';

const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
});

async function getAllLists() {
  const response = await axios({
    method: 'POST',
    url: `${API_BASE}/api/clinic-lists/search`,
    headers: { 'Content-Type': 'application/json' },
    data: {}, // Empty search = get all
    httpsAgent,
    timeout: 30000
  });
  return response.data.lists || [];
}

async function run() {
  console.log('\n📋 Fetching all clinic lists...\n');
  
  try {
    const lists = await getAllLists();
    
    console.log(`Found ${lists.length} total lists\n`);
    
    if (lists.length === 0) {
      console.log('⚠️  No lists found. This might mean:');
      console.log('   - The API is filtering by your JWT user ID');
      console.log('   - Test lists were created under a different user');
      console.log('   - Lists need to be searched in the browser while logged in');
      return;
    }
    
    // Group by station
    const byStation = lists.reduce((acc, list) => {
      const station = list.stationId || 'Unknown';
      if (!acc[station]) acc[station] = [];
      acc[station].push(list);
      return acc;
    }, {});
    
    // Display by station
    Object.keys(byStation).sort().forEach(stationId => {
      const stationLists = byStation[stationId];
      const defaultCount = stationLists.filter(l => l.userDefault).length;
      
      console.log(`\n📍 Station ${stationId} (${stationLists.length} lists, ${defaultCount} default):`);
      console.log('─'.repeat(70));
      
      stationLists.forEach(list => {
        const defaultTag = list.userDefault ? ' ⭐ DEFAULT' : '';
        console.log(`  ID: ${list.id.toString().padEnd(8)} | ${list.name}${defaultTag}`);
        console.log(`       Role: ${list.role || 'N/A'} | User: ${list.userId || 'N/A'}`);
      });
    });
    
    // Summary table
    console.log('\n\n📊 Summary Table:');
    console.log('─'.repeat(80));
    console.table(lists.map(l => ({
      ID: l.id,
      Name: l.name.substring(0, 40),
      Station: l.stationId,
      Default: l.userDefault ? '✅' : '❌',
      Role: l.role || '',
      UserID: l.userId || ''
    })));
    
    // Recently created test lists
    const testLists = lists.filter(l => 
      l.name.includes('Default for Station') || 
      l.name.includes('Test Default')
    );
    
    if (testLists.length > 0) {
      console.log('\n\n🧪 Test Lists Found:');
      console.log('─'.repeat(80));
      testLists.forEach(l => {
        console.log(`  ${l.id}: ${l.name} (Station ${l.stationId}) ${l.userDefault ? '⭐' : ''}`);
      });
    }
    
    // Look for the specific station 530 list
    const station530Lists = lists.filter(l => l.stationId === '530');
    if (station530Lists.length > 0) {
      console.log('\n\n✅ Station 530 Lists FOUND:');
      console.log('─'.repeat(80));
      station530Lists.forEach(l => {
        console.log(`  ID: ${l.id}`);
        console.log(`  Name: ${l.name}`);
        console.log(`  Default: ${l.userDefault ? 'YES ⭐' : 'NO'}`);
        console.log(`  User: ${l.userId}`);
        console.log('');
      });
    } else {
      console.log('\n\n❌ No Station 530 lists found');
      console.log('   This could mean the list was created under a different user account');
    }
    
  } catch (error) {
    console.error('\n❌ Error fetching lists:', error.message);
    if (error.response?.data) {
      console.error('Response:', error.response.data);
    }
  }
}

run()
  .then(() => console.log('\n✅ Done\n'))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
