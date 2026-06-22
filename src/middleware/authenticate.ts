import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { loadConfig } from '../config/config';
import { UserRole } from '../modules/user/user.model';

interface JwtPayload {
  id: string;
  role: UserRole;
}

/**
 * Extracts Bearer token from the Authorization header, verifies its
 * signature and expiry using JWT_ACCESS_SECRET, then attaches the
 * decoded { id, role } payload to req.user.
 *
 * Returns 401 if:
 *  - The Authorization header is missing or not in `Bearer <token>` format
 *  - The token signature is invalid or the token is expired
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export const authenticate: RequestHandler = (req, res, next): void => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ status: 401, message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const config = loadConfig();
    const decoded = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;

    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch {
    res.status(401).json({ status: 401, message: 'Invalid or expired access token' });
  }
};
