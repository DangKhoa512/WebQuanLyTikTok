const normalizeOwner = (value) => (value || '').toString().trim().toLowerCase();

const defaultOwner = () => normalizeOwner(process.env.ADMIN_USER || 'admin');

const requestedOwner = (req) =>
  normalizeOwner(req.api_owner_username || req.body?.user || req.body?.owner_username || req.query?.user || '');

const ownerFromRequest = (req) => requestedOwner(req) || defaultOwner();

const ownerFromAdmin = (req) => {
  if (!req.admin) return defaultOwner();
  return normalizeOwner(req.admin.username);
};

const scopedWhere = (req, extra = {}) => {
  return { ...extra, owner_username: ownerFromAdmin(req) };
};

module.exports = {
  defaultOwner,
  ownerFromRequest,
  ownerFromAdmin,
  scopedWhere,
  normalizeOwner,
};
