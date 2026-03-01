const http = require('http');

const putReq = http.request({
  hostname: 'localhost',
  port: 8001,
  path: '/api/inventory/product',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => process.stdout.write(d));
});

putReq.on('error', (e) => console.error(`problem with request: ${e.message}`));
putReq.write(JSON.stringify({ 
  id: "27", // Test with an existing product from screenshot
  name: 'Updated Product Script', 
  category: 0, // Test empty category
  price: 9.99 
}));
putReq.end();
