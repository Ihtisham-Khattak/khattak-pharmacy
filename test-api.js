const http = require('http');

const options = {
  hostname: 'localhost',
  port: 8001,
  path: '/api/categories/category',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => process.stdout.write(d));
});
req.on('error', (e) => console.error(`problem with request: ${e.message}`));
req.write(JSON.stringify({ name: 'Test Category' }));
req.end();
