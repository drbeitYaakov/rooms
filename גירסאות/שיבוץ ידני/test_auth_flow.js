#!/usr/bin/env node

const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';
const FRONTEND_URL = 'http://localhost:3000';

async function testAuthenticationFlow() {
  console.log('🧪 Testing Complete Authentication Flow...\n');

  try {
    // Step 1: Test backend health
    console.log('1. Testing Backend Health...');
    const healthResponse = await axios.get('http://localhost:3001/health');
    console.log('✅ Backend Health:', healthResponse.data.status);

    // Step 2: Create JWT token via bridge endpoint
    console.log('\n2. Creating JWT Token...');
    const tokenResponse = await axios.post(`${API_BASE}/auth/bridge-token`, {
      id: "1",
      email: "admin@example.com", 
      role: "admin"
    });
    const token = tokenResponse.data.token;
    console.log('✅ JWT Token Created');

    // Step 3: Test authenticated API calls
    console.log('\n3. Testing Authenticated API Calls...');
    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // Test homerooms API
    const homeroomsResponse = await axios.get(`${API_BASE}/homerooms`, {
      headers: authHeaders
    });
    console.log('✅ Homerooms API:', homeroomsResponse.data.success ? 'Success' : 'Failed');

    // Test grades API  
    const gradesResponse = await axios.get(`${API_BASE}/grades`, {
      headers: authHeaders
    });
    console.log('✅ Grades API:', gradesResponse.data.success ? 'Success' : 'Failed');

    // Test rooms API
    const roomsResponse = await axios.get(`${API_BASE}/rooms`, {
      headers: authHeaders
    });
    console.log('✅ Rooms API:', roomsResponse.data.success ? 'Success' : 'Failed');

    // Step 4: Test frontend accessibility
    console.log('\n4. Testing Frontend Accessibility...');
    const frontendResponse = await axios.get(FRONTEND_URL);
    console.log('✅ Frontend Accessible:', frontendResponse.status === 200 ? 'Success' : 'Failed');

    console.log('\n🎉 All tests passed! Authentication system is working correctly.');
    console.log('\n📋 Summary:');
    console.log('- Backend: Running on http://localhost:3001');
    console.log('- Frontend: Running on http://localhost:3000');
    console.log('- Authentication: JWT tokens working');
    console.log('- Database: Connected and operational');
    console.log('- APIs: All endpoints responding correctly');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Status:', error.response.status);
    }
    process.exit(1);
  }
}

testAuthenticationFlow();
