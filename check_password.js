
require('dotenv').config({ path: '.env.local' });
console.log('Parsed Password:', process.env.ADMIN_PASSWORD);
console.log('Length:', process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.length : 0);
console.log('Contains #:', process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.includes('#') : false);
