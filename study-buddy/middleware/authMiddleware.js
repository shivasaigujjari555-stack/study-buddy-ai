function requireAuth(req, res, next) {
  const user = req.session ? req.session.currentUser : null;
  if (!user) {
    if (req.originalUrl.startsWith("/api/")) {
      return res.status(401).json({
        success: false,
        message: "Not logged in. Please login first."
      });
    }
    return res.redirect("/login");
  }
  next();
}

function getCurrentUser(req) {
  return req.session ? req.session.currentUser : null;
}

module.exports = {
  requireAuth,
  getCurrentUser
};

