import { Request, Response, NextFunction } from 'express';

// Placeholder global error handler — full implementation in task 3.5
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  res.status(500).json({ message: err.message });
}
