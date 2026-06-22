import { RequestHandler } from 'express';
import { UserRole } from '../modules/user/user.model';

/**
 * RBAC middleware factory. Returns a middleware that allows the request to
 * proceed only when `req.user.role` is one of the supplied `roles`.
 *
 * Returns 403 when:
 *  - `req.user` is not populated (i.e. `authenticate` was not run first)
 *  - The authenticated user's role is not in the allowed list
 *
 * Requirements: 4.1
 */
export const checkRole = (roles: UserRole[]): RequestHandler =>
  (req, res, next): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ status: 403, message: 'Forbidden' });
      return;
    }
    next();
  };
