import { uploadImage } from '../../middlewares/upload';
import { ApiRouter, idParams } from '../../utils/router';
import * as c from './controller';
import * as s from './schema';

const r = new ApiRouter('/library', 'Library');
r.get('/categories', { summary: 'List book categories' }, c.listCategories);
r.post(
  '/categories',
  { summary: 'Create book category', status: 201, schemas: { body: s.categoryBody } },
  c.createCategory,
);
r.patch(
  '/categories/:id',
  { summary: 'Update book category', schemas: { params: idParams, body: s.categoryUpdateBody } },
  c.updateCategory,
);
r.delete(
  '/categories/:id',
  { summary: 'Delete an empty book category', schemas: { params: idParams } },
  c.deleteCategory,
);

r.get('/books', { summary: 'Catalogue search / export', schemas: { query: s.bookListQuery } }, c.listBooks);
r.post(
  '/books',
  { summary: 'Add a book with N copies', status: 201, schemas: { body: s.bookBody } },
  c.createBook,
);
r.get(
  '/books/:id',
  { summary: 'Book details with copies and loan history', schemas: { params: idParams } },
  c.getBook,
);
r.patch(
  '/books/:id',
  { summary: 'Update book', schemas: { params: idParams, body: s.bookUpdateBody } },
  c.updateBook,
);
r.delete(
  '/books/:id',
  {
    summary: 'Delete book (soft; ?hard=true super admin only)',
    schemas: { params: idParams, query: s.deleteQuery },
  },
  c.deleteBook,
);
r.post(
  '/books/:id/cover',
  {
    summary: 'Upload cover image',
    pre: [uploadImage('books')],
    multipart: { file: 'file' },
    schemas: { params: idParams },
  },
  c.uploadCover,
);
r.post(
  '/books/:id/copies',
  { summary: 'Generate more copies', schemas: { params: idParams, body: s.addCopiesBody } },
  c.addCopies,
);
r.get(
  '/books/:id/labels',
  {
    summary: 'Printable copy labels (PDF)',
    produces: ['application/pdf'],
    schemas: { params: idParams, query: s.labelsQuery },
  },
  c.labels,
);

r.get(
  '/copies',
  { summary: 'Search copies by code / title', schemas: { query: s.copySearchQuery } },
  c.searchCopies,
);
r.patch(
  '/copies/:id',
  { summary: 'Update copy condition / status', schemas: { params: idParams, body: s.copyUpdateBody } },
  c.updateCopy,
);
r.delete('/copies/:id', { summary: 'Remove a copy', schemas: { params: idParams } }, c.deleteCopy);

r.get(
  '/loans',
  { summary: 'List / export loans (status=ACTIVE for current)', schemas: { query: s.loanListQuery } },
  c.listLoans,
);
r.post('/loans', { summary: 'Issue a book', status: 201, schemas: { body: s.issueBody } }, c.issue);
r.post(
  '/loans/:id/return',
  { summary: 'Return a book with condition check', schemas: { params: idParams, body: s.returnBody } },
  c.returnBook,
);
r.post(
  '/loans/:id/lost',
  { summary: 'Mark a loaned book as lost', schemas: { params: idParams, body: s.lostBody } },
  c.markLost,
);
r.patch(
  '/loans/:id/fine',
  { summary: 'Mark fine as paid / unpaid', schemas: { params: idParams, body: s.finePaidBody } },
  c.setFinePaid,
);

r.get(
  '/reports/most-borrowed',
  { summary: 'Most borrowed books', schemas: { query: s.reportQuery } },
  c.mostBorrowed,
);
r.get('/reports/by-class', { summary: 'Loans per class', schemas: { query: s.reportQuery } }, c.byClass);
r.get('/reports/overdue', { summary: 'Overdue report', schemas: { query: s.reportQuery } }, c.overdue);

export default r;
