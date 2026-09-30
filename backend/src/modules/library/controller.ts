import { toPublicUrl } from '../../middlewares/upload';
import { badRequest } from '../../utils/errors';
import { sendFile, sendReport } from '../../utils/export';
import type { Ctx, idParams } from '../../utils/router';
import type * as s from './schema';
import * as service from './service';

type Id = { params: typeof idParams };
type ReportQ = { query: typeof s.reportQuery };

export const listCategories = () => service.listCategories();
export const createCategory = ({ body, req }: Ctx<{ body: typeof s.categoryBody }>) =>
  service.createCategory(body, req);
export const updateCategory = ({ params, body, req }: Ctx<Id & { body: typeof s.categoryUpdateBody }>) =>
  service.updateCategory(params.id, body, req);
export const deleteCategory = ({ params, req }: Ctx<Id>) => service.deleteCategory(params.id, req);

export async function listBooks({ query, res }: Ctx<{ query: typeof s.bookListQuery }>) {
  if (query.format === 'json') return service.listBooks(query);
  return sendReport(res, await service.booksReport(query), query.format);
}
export const getBook = ({ params }: Ctx<Id>) => service.getBook(params.id);
export const createBook = ({ body, req }: Ctx<{ body: typeof s.bookBody }>) => service.createBook(body, req);
export const updateBook = ({ params, body, req }: Ctx<Id & { body: typeof s.bookUpdateBody }>) =>
  service.updateBook(params.id, body, req);
export const deleteBook = ({ params, query, req, user }: Ctx<Id & { query: typeof s.deleteQuery }>) => {
  if (query.hard && user.role !== 'SUPER_ADMIN')
    throw badRequest('Only a super admin can permanently delete records');
  return service.deleteBook(params.id, query.hard ?? false, req);
};
export async function uploadCover({ params, req }: Ctx<Id>) {
  if (!req.file) throw badRequest('No file uploaded');
  return service.setCover(params.id, toPublicUrl('books', req.file), req);
}
export const addCopies = ({ params, body, req }: Ctx<Id & { body: typeof s.addCopiesBody }>) =>
  service.addCopies(params.id, body, req);
export async function labels({ params, query, res }: Ctx<Id & { query: typeof s.labelsQuery }>) {
  const ids = query.copyIds?.split(',').map(Number);
  sendFile(res, await service.labelsPdf(params.id, ids), `labels-book-${params.id}.pdf`, 'application/pdf');
}
export const searchCopies = ({ query }: Ctx<{ query: typeof s.copySearchQuery }>) =>
  service.searchCopies(query);
export const updateCopy = ({ params, body, req }: Ctx<Id & { body: typeof s.copyUpdateBody }>) =>
  service.updateCopy(params.id, body, req);
export const deleteCopy = ({ params, req }: Ctx<Id>) => service.deleteCopy(params.id, req);

export async function listLoans({ query, res }: Ctx<{ query: typeof s.loanListQuery }>) {
  if (query.format === 'json') return service.listLoans(query);
  return sendReport(res, await service.loansReport(query), query.format);
}
export const issue = ({ body, req }: Ctx<{ body: typeof s.issueBody }>) => service.issue(body, req);
export const returnBook = ({ params, body, req }: Ctx<Id & { body: typeof s.returnBody }>) =>
  service.returnBook(params.id, body, req);
export const markLost = ({ params, body, req }: Ctx<Id & { body: typeof s.lostBody }>) =>
  service.markLost(params.id, body, req);
export const setFinePaid = ({ params, body, req }: Ctx<Id & { body: typeof s.finePaidBody }>) =>
  service.setFinePaid(params.id, body.finePaid, req);

export const mostBorrowed = async ({ query, res }: Ctx<ReportQ>) =>
  sendReport(res, await service.mostBorrowedReport(query), query.format);
export const byClass = async ({ query, res }: Ctx<ReportQ>) =>
  sendReport(res, await service.loansByClassReport(query), query.format);
export const overdue = async ({ query, res }: Ctx<ReportQ>) =>
  sendReport(res, await service.overdueReport(query), query.format);
