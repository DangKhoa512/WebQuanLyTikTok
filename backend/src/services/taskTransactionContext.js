// Scope inheritance is active only during dispatcher/reservation callbacks.
const { AsyncLocalStorage } = require('async_hooks');
const db = require('../config/database');
const context = new AsyncLocalStorage();
const query = db.query.bind(db), transaction = db.transaction.bind(db);
db.query = (sql, options = {}) => {
 const parent = context.getStore();
 return query(sql, parent && options.transaction == null ? { ...options, transaction: parent } : options);
};
db.transaction = (options, callback) => {
 const parent = context.getStore();
 if (!parent) return transaction(options, callback);
 if (typeof options === 'function') return transaction({ transaction: parent }, options);
 return transaction({ ...(options || {}), transaction: options?.transaction ?? parent }, callback);
};
module.exports = { withTaskTransaction: (transaction, fn) => context.run(transaction, fn) };
