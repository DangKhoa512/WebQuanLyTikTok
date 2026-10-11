const assert=require('assert');require('../../src/config/logger').silent=true;
process.env.NODE_ENV='production';delete process.env.JWT_SECRET;
assert.throws(()=>require('../../src/config/jwt').getJwtSecret(),/JWT_SECRET/,'Production must fail closed without secret');
console.log('PRODUCTION_JWT_OK');
