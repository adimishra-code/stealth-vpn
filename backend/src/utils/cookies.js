const REFRESH_COOKIE = 'sv_refresh';

function setRefreshCookie(res, token) {
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: maxAgeMs,
    path: '/api/auth',
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

function getRefreshCookie(req) {
  return req.cookies && req.cookies[REFRESH_COOKIE];
}

module.exports = { setRefreshCookie, clearRefreshCookie, getRefreshCookie, REFRESH_COOKIE };