// Simple test to check if the assignments API is working
async function testAssignmentsAPI() {
  try {
    console.log('🔍 Testing assignments API...');
    
    // Try without auth first
    console.log('Testing without auth...');
    const response1 = await fetch('https://rooms-ma9h.onrender.com/api/assignments');
    console.log('Response status:', response1.status);
    console.log('Response headers:', response1.headers);
    
    if (response1.ok) {
      const data = await response1.json();
      console.log('✅ Success! Found assignments:', data.length);
      console.log('Sample assignments:', data.slice(0, 3));
    } else {
      console.log('❌ Failed with status:', response1.status);
      const errorText = await response1.text();
      console.log('Error text:', errorText);
    }
    
    // Try with basic auth
    console.log('\nTesting with basic auth...');
    const response2 = await fetch('https://rooms-ma9h.onrender.com/api/assignments', {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    console.log('Response status:', response2.status);
    
    if (response2.ok) {
      const data = await response2.json();
      console.log('✅ Success with auth! Found assignments:', data.length);
    } else {
      console.log('❌ Failed with auth');
      const errorText = await response2.text();
      console.log('Error text:', errorText);
    }
    
  } catch (error) {
    console.error('❌ Network error:', error);
  }
}

testAssignmentsAPI();
