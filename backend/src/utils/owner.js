const defaultOwner = () => process.env.ADMIN_USER || 'admin';

const requestedOwner = (req) =>
  (req.body?.user || req.body?.owner_username || req.query?.user || '').toString().trim();

const ownerFromRequest = (req) => requestedOwner(req) || defaultOwner();

const ownerFromAdmin = (req) => {
  if (!req.admin) return defaultOwner();
  if (req.admin.role === 'admin') return requestedOwner(req) || req.admin.username || defaultOwner();
  return req.admin.username;
};

const scopedWhere = (req, extra = {}) => {
  if (req.admin?.role === 'admin' && !requestedOwner(req)) return { ...extra };
  return { ...extra, owner_username: ownerFromAdmin(req) };
};

module.exports = {
  defaultOwner,
  ownerFromRequest,
  ownerFromAdmin,
  scopedWhere,
};
