import { AppError } from './AppError.js';
export const validate = (schema, source = 'body', target = 'input') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) throw new AppError(422, 'VALIDATION_ERROR', 'Vui lòng kiểm tra dữ liệu.',
    { fields: Object.fromEntries(result.error.issues.map(issue => [issue.path[0] ?? 'form', issue.message])) });
  req[target] = result.data; next();
};
