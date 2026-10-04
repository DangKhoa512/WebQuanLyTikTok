const assert = require('assert');
const { parseFacebookLine } = require('../src/controllers/facebookController');

const sample = parseFacebookLine('61593857108301|FISHERjacqueline|IJG63XIYNATYQNR7U2OPB5ZSKU6ZUHJR');
assert.strictEqual(sample.uid, '61593857108301');
assert.strictEqual(sample.password, 'FISHERjacqueline');
assert.strictEqual(sample.two_fa, 'IJG63XIYNATYQNR7U2OPB5ZSKU6ZUHJR');

const oldTwoField = parseFacebookLine('61593857108302|JBSWY3DPEHPK3PXP');
assert.strictEqual(oldTwoField.password, null);
assert.strictEqual(oldTwoField.two_fa, 'JBSWY3DPEHPK3PXP');

const normal = parseFacebookLine('61593857108303|pass123|JBSWY3DPEHPK3PXP');
assert.strictEqual(normal.password, 'pass123');
assert.strictEqual(normal.two_fa, 'JBSWY3DPEHPK3PXP');

console.log('FACEBOOK_IMPORT_PARSER_OK');
