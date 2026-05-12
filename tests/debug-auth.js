// Debug script for Auth behavior
const { loadCore } = require('./tests/setup/loader');
const { createDbMock } = require('./tests/setup/db-mock');
require('./tests/setup/gas-globals');
loadCore();

console.log('Auth type:', typeof Auth);
console.log('Auth.reset type:', typeof Auth.reset);

// Test 1: ghost user
Auth.reset();
const db1 = createDbMock();
Jdbc._setMockConnection(db1.connection);
Session._setEmail('ghost@example.com');
try {
  const u = Auth.getCurrentUser();
  console.log('TEST1 FAIL - got user:', JSON.stringify(u));
} catch(e) {
  console.log('TEST1 PASS - threw:', e.message);
}

// Test 2: employee should fail quality role
Auth.reset();
const db2 = createDbMock();
Jdbc._setMockConnection(db2.connection);
Session._setEmail('emp@example.com');
db2.setQueryResult('is_active FROM users WHERE email', [
  { id: 2, email: 'emp@example.com', name: 'Emp', role: 'employee', is_active: 1 }
]);
try {
  Auth.requireRole('quality');
  console.log('TEST2 FAIL - did not throw');
} catch(e) {
  if (e.message.includes('Access denied')) {
    console.log('TEST2 PASS - threw:', e.message);
  } else {
    console.log('TEST2 FAIL - wrong error:', e.message);
  }
}
