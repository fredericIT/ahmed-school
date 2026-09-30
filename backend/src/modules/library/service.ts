import crypto from 'crypto';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma, type Tx } from '../../config/prisma';
import { audit, diff } from '../../utils/audit';
import { addDays, fmtDate, toDateOnly, todayIn } from '../../utils/dates';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { pdfToBuffer, type Report } from '../../utils/export';
import { removeUpload } from '../../utils/files';
import { notifyAllStaff } from '../../utils/notify';
import { orderBy, paged, skipTake } from '../../utils/pagination';
import { getSettings } from '../../utils/settings';
import type * as s from './schema';
import { createPdf } from '../../utils/pdf';
import { periodLabel, plural, storedPlural, t } from '../../i18n';
import { label } from '../../i18n/labels';

// ─── Helpers ───

/** Recomputes the denormalised copy counters on a book from its copies. */
async function recount(tx: Tx, bookId: number) {
  const [total, available] = await Promise.all([
    tx.bookCopy.count({ where: { bookId, deletedAt: null, status: { not: 'LOST' } } }),
    tx.bookCopy.count({ where: { bookId, deletedAt: null, status: 'AVAILABLE' } }),
  ]);
  await tx.book.update({ where: { id: bookId }, data: { totalCopies: total, availableCopies: available } });
}

async function createCopies(
  tx: Tx,
  bookId: number,
  count: number,
  condition: z.infer<typeof s.copyCondition>,
) {
  // Insert with unique placeholders, then derive the public code from the auto-increment id in one statement.
  await tx.bookCopy.createMany({
    data: Array.from({ length: count }, () => ({
      bookId,
      condition,
      copyCode: `T-${crypto.randomBytes(8).toString('hex')}`,
    })),
  });
  await tx.$executeRaw`UPDATE BookCopy SET copyCode = CONCAT('LIB-', LPAD(id, 6, '0')) WHERE bookId = ${bookId} AND copyCode LIKE 'T-%'`;
  await recount(tx, bookId);
}

// ─── Categories ───

export async function listCategories() {
  const cats = await prisma.bookCategory.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    include: { _count: { select: { books: { where: { deletedAt: null } } } } },
  });
  return cats.map(({ _count, ...c }) => ({ ...c, bookCount: _count.books }));
}

export async function createCategory(data: z.infer<typeof s.categoryBody>, req: Request) {
  const c = await prisma.bookCategory.create({ data });
  await audit(req, { action: 'CREATE', entity: 'BookCategory', entityId: c.id, newValues: c });
  return c;
}

export async function updateCategory(id: number, data: z.infer<typeof s.categoryUpdateBody>, req: Request) {
  const before = await prisma.bookCategory.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Category');
  const after = await prisma.bookCategory.update({ where: { id }, data });
  await audit(req, { action: 'UPDATE', entity: 'BookCategory', entityId: id, ...diff(before, after) });
  return after;
}

export async function deleteCategory(id: number, req: Request) {
  const before = await prisma.bookCategory.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Category');
  const books = await prisma.book.count({ where: { categoryId: id, deletedAt: null } });
  if (books)
    throw conflict(
      plural(books, 'This category still has {count} book', 'This category still has {count} books'),
    );
  await prisma.bookCategory.update({
    where: { id },
    data: { deletedAt: new Date(), name: `${before.name}#deleted-${id}` },
  });
  await audit(req, { action: 'DELETE', entity: 'BookCategory', entityId: id, oldValues: before });
  return { deleted: true };
}

// ─── Books ───

function bookWhere(q: z.infer<typeof s.bookListQuery>): Prisma.BookWhereInput {
  return {
    deletedAt: null,
    categoryId: q.categoryId,
    language: q.language,
    ageLevel: q.ageLevel,
    ...(q.available && { availableCopies: { gt: 0 } }),
    ...(q.search && {
      OR: [
        { title: { contains: q.search } },
        { author: { contains: q.search } },
        { isbn: { contains: q.search } },
        { copies: { some: { copyCode: { contains: q.search } } } },
      ],
    }),
  };
}

const bookInclude = { category: { select: { id: true, name: true } } } satisfies Prisma.BookInclude;

export async function listBooks(q: z.infer<typeof s.bookListQuery>) {
  const where = bookWhere(q);
  const [data, total] = await Promise.all([
    prisma.book.findMany({
      where,
      include: bookInclude,
      orderBy: orderBy(
        q,
        ['title', 'author', 'createdAt', 'availableCopies', 'publishedYear'] as const,
        'title',
      ),
      ...skipTake(q),
    }),
    prisma.book.count({ where }),
  ]);
  return paged(data, total, q);
}

export async function booksReport(q: z.infer<typeof s.bookListQuery>): Promise<Report> {
  const rows = await prisma.book.findMany({
    where: bookWhere(q),
    include: bookInclude,
    orderBy: [{ categoryId: 'asc' }, { title: 'asc' }],
  });
  return {
    title: t('Library Catalogue'),
    columns: [
      { key: 'title', header: t('Title'), width: 3.5 },
      { key: 'author', header: t('Author'), width: 2.4 },
      { key: 'category', header: t('Category'), width: 2 },
      { key: 'isbn', header: 'ISBN', width: 2 },
      { key: 'ageLevel', header: t('Age'), width: 1.2 },
      { key: 'shelfLocation', header: t('Shelf'), width: 1.2 },
      { key: 'totalCopies', header: t('Copies'), format: 'number', width: 1 },
      { key: 'availableCopies', header: t('Available'), format: 'number', width: 1.2 },
    ],
    rows: rows.map((b) => ({ ...b, category: b.category.name })),
    summary: [
      { label: t('Titles'), value: rows.length },
      { label: t('Copies'), value: rows.reduce((a, b) => a + b.totalCopies, 0) },
      { label: t('Available'), value: rows.reduce((a, b) => a + b.availableCopies, 0) },
    ],
  };
}

export async function getBook(id: number) {
  const book = await prisma.book.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...bookInclude,
      copies: {
        where: { deletedAt: null },
        orderBy: { copyCode: 'asc' },
        include: {
          loans: {
            where: { status: { in: ['BORROWED', 'OVERDUE'] } },
            include: { student: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      },
    },
  });
  if (!book) throw notFound('Book');
  const [timesBorrowed, recentLoans] = await Promise.all([
    prisma.bookLoan.count({ where: { bookCopy: { bookId: id } } }),
    prisma.bookLoan.findMany({
      where: { bookCopy: { bookId: id } },
      orderBy: { issuedAt: 'desc' },
      take: 20,
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        bookCopy: { select: { copyCode: true } },
      },
    }),
  ]);
  return {
    ...book,
    copies: book.copies.map(({ loans, ...c }) => ({ ...c, currentLoan: loans[0] ?? null })),
    timesBorrowed,
    recentLoans,
  };
}

export async function createBook(data: z.infer<typeof s.bookBody>, req: Request) {
  const { copies, copyCondition, ...fields } = data;
  const cat = await prisma.bookCategory.findFirst({ where: { id: data.categoryId, deletedAt: null } });
  if (!cat) throw badRequest('Category not found');
  const book = await prisma.$transaction(async (tx) => {
    const b = await tx.book.create({ data: { ...fields, createdById: req.user?.id } });
    if (copies) await createCopies(tx, b.id, copies, copyCondition);
    await audit(req, { action: 'CREATE', entity: 'Book', entityId: b.id, newValues: { ...b, copies } }, tx);
    return b;
  });
  return getBook(book.id);
}

export async function updateBook(id: number, data: z.infer<typeof s.bookUpdateBody>, req: Request) {
  const before = await prisma.book.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Book');
  const after = await prisma.book.update({ where: { id }, data });
  await audit(req, { action: 'UPDATE', entity: 'Book', entityId: id, ...diff(before, after) });
  return getBook(id);
}

export async function setCover(id: number, url: string, req: Request) {
  const before = await prisma.book.findFirst({ where: { id, deletedAt: null } });
  if (!before) {
    removeUpload(url);
    throw notFound('Book');
  }
  await prisma.book.update({ where: { id }, data: { coverImage: url } });
  removeUpload(before.coverImage);
  await audit(req, {
    action: 'UPDATE',
    entity: 'Book',
    entityId: id,
    oldValues: { coverImage: before.coverImage },
    newValues: { coverImage: url },
  });
  return getBook(id);
}

export async function deleteBook(id: number, hard: boolean, req: Request) {
  const before = await prisma.book.findFirst({ where: { id, deletedAt: hard ? undefined : null } });
  if (!before) throw notFound('Book');
  const onLoan = await prisma.bookLoan.count({
    where: { bookCopy: { bookId: id }, status: { in: ['BORROWED', 'OVERDUE'] } },
  });
  if (onLoan)
    throw conflict(
      plural(
        onLoan,
        '{count} copy of this book is on loan. Return it first.',
        '{count} copies of this book are on loan. Return them first.',
      ),
    );
  if (hard) {
    await prisma.book.delete({ where: { id } });
    removeUpload(before.coverImage);
  } else {
    await prisma.$transaction([
      prisma.bookCopy.updateMany({ where: { bookId: id }, data: { deletedAt: new Date() } }),
      prisma.book.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
  }
  await audit(req, {
    action: 'DELETE',
    entity: 'Book',
    entityId: id,
    oldValues: before,
    newValues: { hard },
  });
  return { deleted: true };
}

// ─── Copies ───

export async function addCopies(bookId: number, data: z.infer<typeof s.addCopiesBody>, req: Request) {
  const book = await prisma.book.findFirst({ where: { id: bookId, deletedAt: null } });
  if (!book) throw notFound('Book');
  await prisma.$transaction(async (tx) => {
    await createCopies(tx, bookId, data.count, data.condition);
    await audit(req, { action: 'CREATE', entity: 'BookCopy', entityId: bookId, newValues: data }, tx);
  });
  return getBook(bookId);
}

export async function updateCopy(id: number, data: z.infer<typeof s.copyUpdateBody>, req: Request) {
  const before = await prisma.bookCopy.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Copy');
  if (data.status && before.status === 'BORROWED')
    throw conflict('This copy is on loan; use the return or lost action instead');
  await prisma.$transaction(async (tx) => {
    const after = await tx.bookCopy.update({ where: { id }, data });
    await recount(tx, before.bookId);
    await audit(req, { action: 'UPDATE', entity: 'BookCopy', entityId: id, ...diff(before, after) }, tx);
  });
  return getBook(before.bookId);
}

export async function deleteCopy(id: number, req: Request) {
  const before = await prisma.bookCopy.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Copy');
  if (before.status === 'BORROWED') throw conflict('This copy is on loan');
  await prisma.$transaction(async (tx) => {
    await tx.bookCopy.update({ where: { id }, data: { deletedAt: new Date() } });
    await recount(tx, before.bookId);
    await audit(req, { action: 'DELETE', entity: 'BookCopy', entityId: id, oldValues: before }, tx);
  });
  return { deleted: true };
}

export function searchCopies(q: z.infer<typeof s.copySearchQuery>) {
  return prisma.bookCopy.findMany({
    where: {
      deletedAt: null,
      bookId: q.bookId,
      book: { deletedAt: null },
      ...(q.available && { status: 'AVAILABLE' }),
      ...(q.search && {
        OR: [
          { copyCode: { contains: q.search } },
          { book: { title: { contains: q.search } } },
          { book: { author: { contains: q.search } } },
        ],
      }),
    },
    include: { book: { select: { id: true, title: true, author: true, coverImage: true, ageLevel: true } } },
    orderBy: { copyCode: 'asc' },
    take: 30,
  });
}

/** Printable A4 sheet of copy labels (3 × 8 grid). */
export async function labelsPdf(bookId: number, copyIds?: number[]): Promise<Buffer> {
  const book = await prisma.book.findFirst({ where: { id: bookId, deletedAt: null } });
  if (!book) throw notFound('Book');
  const copies = await prisma.bookCopy.findMany({
    where: { bookId, deletedAt: null, ...(copyIds && { id: { in: copyIds } }) },
    orderBy: { copyCode: 'asc' },
  });
  const settings = await getSettings();
  const doc = createPdf({ size: 'A4', margin: 24 });
  const cols = 3;
  const rows = 8;
  const w = (doc.page.width - 48) / cols;
  const h = (doc.page.height - 48) / rows;
  copies.forEach((c, i) => {
    const pos = i % (cols * rows);
    if (i > 0 && pos === 0) doc.addPage();
    const x = 24 + (pos % cols) * w;
    const y = 24 + Math.floor(pos / cols) * h;
    doc
      .roundedRect(x + 4, y + 4, w - 8, h - 8, 6)
      .lineWidth(0.8)
      .dash(3, { space: 2 })
      .strokeColor('#94A3B8')
      .stroke()
      .undash();
    doc.rect(x + 4, y + 4, 6, h - 8).fill('#4F6BED');
    doc
      .fillColor('#64748B')
      .font('Helvetica')
      .fontSize(6.5)
      .text(settings.name.toUpperCase(), x + 16, y + 10, { width: w - 28, lineBreak: false, ellipsis: true });
    doc
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(c.copyCode, x + 16, y + 22, { width: w - 28 });
    doc
      .fillColor('#334155')
      .font('Helvetica')
      .fontSize(7.5)
      .text(book.title, x + 16, y + 44, { width: w - 28, height: 20, ellipsis: true });
    doc
      .fillColor('#64748B')
      .fontSize(6.5)
      .text(book.shelfLocation ? t('Shelf {shelf}', { shelf: book.shelfLocation }) : '', x + 16, y + h - 20, {
        width: w - 28,
      });
  });
  if (!copies.length) doc.font('Helvetica').fontSize(12).text(t('This book has no copies.'));
  return pdfToBuffer(doc);
}

// ─── Loans ───

const loanInclude = {
  bookCopy: { include: { book: { select: { id: true, title: true, author: true, coverImage: true } } } },
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNumber: true,
      photo: true,
      currentClass: { select: { id: true, name: true } },
    },
  },
  issuedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.BookLoanInclude;

function loanWhere(q: z.infer<typeof s.loanListQuery>): Prisma.BookLoanWhereInput {
  return {
    status: q.status === 'ACTIVE' ? { in: ['BORROWED', 'OVERDUE'] } : q.status,
    studentId: q.studentId,
    ...(q.classId && { student: { currentClassId: q.classId } }),
    issuedAt:
      q.from || q.to
        ? {
            gte: q.from ? toDateOnly(q.from) : undefined,
            lte: q.to ? toDateOnly(addDays(q.to, 1)) : undefined,
          }
        : undefined,
    ...(q.search && {
      OR: [
        { borrowerName: { contains: q.search } },
        { bookCopy: { copyCode: { contains: q.search } } },
        { bookCopy: { book: { title: { contains: q.search } } } },
        { student: { firstName: { contains: q.search } } },
        { student: { lastName: { contains: q.search } } },
        { student: { admissionNumber: { contains: q.search } } },
      ],
    }),
  };
}

export async function listLoans(q: z.infer<typeof s.loanListQuery>) {
  const where = loanWhere(q);
  const { timezone } = await getSettings();
  const today = todayIn(timezone);
  const [rows, total] = await Promise.all([
    prisma.bookLoan.findMany({
      where,
      include: loanInclude,
      orderBy: orderBy(q, ['issuedAt', 'dueDate', 'returnedAt', 'status'] as const, 'issuedAt'),
      ...skipTake(q),
    }),
    prisma.bookLoan.count({ where }),
  ]);
  return paged(
    rows.map((l) => ({
      ...l,
      dueDate: fmtDate(l.dueDate),
      daysOverdue: !l.returnedAt && fmtDate(l.dueDate) < today ? daysBetween(fmtDate(l.dueDate), today) : 0,
    })),
    total,
    q,
  );
}

function daysBetween(a: string, b: string) {
  return Math.round((toDateOnly(b).getTime() - toDateOnly(a).getTime()) / 86_400_000);
}

function borrowerLabel(l: {
  borrowerName: string | null;
  student: { firstName: string; lastName: string } | null;
}) {
  return l.student ? `${l.student.firstName} ${l.student.lastName}` : `${l.borrowerName ?? ''} (staff)`;
}

export async function loansReport(
  q: z.infer<typeof s.loanListQuery>,
  title = t('Library Loans'),
): Promise<Report> {
  const { timezone } = await getSettings();
  const today = todayIn(timezone);
  const rows = await prisma.bookLoan.findMany({
    where: loanWhere(q),
    include: loanInclude,
    orderBy: { issuedAt: 'desc' },
    take: 10_000,
  });
  return {
    title,
    subtitle:
      [q.status && label(q.status), periodLabel(q.from, q.to)].filter(Boolean).join(' · ') || undefined,
    columns: [
      { key: 'copyCode', header: t('Copy'), width: 1.5 },
      { key: 'title', header: t('Book'), width: 3 },
      { key: 'borrower', header: t('Borrower'), width: 2.5 },
      { key: 'className', header: t('Class'), width: 1.4 },
      { key: 'issuedAt', header: t('Issued'), format: 'date', width: 1.4 },
      { key: 'dueDate', header: t('Due'), format: 'date', width: 1.4 },
      { key: 'returnedAt', header: t('Returned'), format: 'date', width: 1.4 },
      { key: 'status', header: t('Status'), width: 1.4 },
      { key: 'daysOverdue', header: t('Days late'), format: 'number', width: 1.1 },
      { key: 'fine', header: t('Fine'), format: 'money', width: 1.5 },
    ],
    rows: rows.map((l) => {
      const due = fmtDate(l.dueDate);
      const end = l.returnedAt ? fmtDate(l.returnedAt) : today;
      return {
        copyCode: l.bookCopy.copyCode,
        title: l.bookCopy.book.title,
        borrower: borrowerLabel(l),
        className: l.student?.currentClass?.name ?? '',
        issuedAt: fmtDate(l.issuedAt),
        dueDate: due,
        returnedAt: l.returnedAt ? fmtDate(l.returnedAt) : '',
        status: l.status,
        daysOverdue: end > due ? daysBetween(due, end) : 0,
        fine: Number(l.fine),
      };
    }),
    summary: [
      { label: t('Loans'), value: rows.length },
      {
        label: t('Total fines'),
        value: Math.round(rows.reduce((a, l) => a + Number(l.fine), 0)),
      },
    ],
  };
}

export async function issue(data: z.infer<typeof s.issueBody>, req: Request) {
  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const dueDate = data.dueDate ?? addDays(today, settings.loanPeriodDays);
  if (dueDate < today) throw badRequest('Due date cannot be in the past');

  const loan = await prisma.$transaction(async (tx) => {
    const copy = await tx.bookCopy.findFirst({
      where: {
        deletedAt: null,
        book: { deletedAt: null },
        ...(data.bookCopyId ? { id: data.bookCopyId } : { copyCode: data.copyCode }),
      },
      include: { book: true },
    });
    if (!copy) throw notFound('Book copy');

    if (data.studentId) {
      const student = await tx.student.findFirst({ where: { id: data.studentId, deletedAt: null } });
      if (!student) throw notFound('Student');
      if (student.status !== 'ACTIVE') throw badRequest('Only active students can borrow books');
      const active = await tx.bookLoan.count({
        where: { studentId: student.id, status: { in: ['BORROWED', 'OVERDUE'] } },
      });
      if (active >= settings.maxBooksPerStudent)
        throw conflict(
          t('{name} already has {count} book(s) on loan (limit {limit})', {
            name: student.firstName,
            count: active,
            limit: settings.maxBooksPerStudent,
          }),
        );
    }

    // Atomic claim of the copy: only succeeds if it is still AVAILABLE.
    const claimed = await tx.bookCopy.updateMany({
      where: { id: copy.id, status: 'AVAILABLE' },
      data: { status: 'BORROWED' },
    });
    if (claimed.count === 0)
      throw conflict(
        t('Copy {code} is not available ({status})', { code: copy.copyCode, status: label(copy.status) }),
      );

    const created = await tx.bookLoan.create({
      data: {
        bookCopyId: copy.id,
        studentId: data.studentId ?? null,
        borrowerName: data.borrowerName ?? null,
        dueDate: toDateOnly(dueDate),
        remark: data.remark ?? null,
        issuedById: req.user?.id,
      },
      include: loanInclude,
    });
    await recount(tx, copy.bookId);
    await audit(
      req,
      {
        action: 'ISSUE',
        entity: 'BookLoan',
        entityId: created.id,
        newValues: {
          copy: copy.copyCode,
          book: copy.book.title,
          studentId: data.studentId,
          borrowerName: data.borrowerName,
          dueDate,
        },
      },
      tx,
    );
    return created;
  });
  return { ...loan, dueDate: fmtDate(loan.dueDate) };
}

async function openLoan(tx: Tx, id: number) {
  const loan = await tx.bookLoan.findUnique({ where: { id }, include: { bookCopy: true } });
  if (!loan) throw notFound('Loan');
  if (loan.status === 'RETURNED' || loan.status === 'LOST')
    throw conflict(
      loan.status === 'LOST' ? t('This loan is already marked lost') : t('This loan is already returned'),
    );
  return loan;
}

export async function returnBook(id: number, data: z.infer<typeof s.returnBody>, req: Request) {
  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const result = await prisma.$transaction(async (tx) => {
    const loan = await openLoan(tx, id);
    const due = fmtDate(loan.dueDate);
    const daysLate = today > due ? daysBetween(due, today) : 0;
    const fine = daysLate * settings.overdueFinePerDay + data.damageFine;
    const damaged = data.condition === 'DAMAGED';
    // Guard against double returns racing each other.
    const res = await tx.bookLoan.updateMany({
      where: { id, status: { in: ['BORROWED', 'OVERDUE'] } },
      data: {
        status: 'RETURNED',
        returnedAt: new Date(),
        returnCondition: data.condition,
        fine,
        remark: data.remark ?? loan.remark,
      },
    });
    if (res.count === 0) throw conflict('This loan was already closed');
    await tx.bookCopy.update({
      where: { id: loan.bookCopyId },
      data: { status: damaged ? 'DAMAGED' : 'AVAILABLE', condition: data.condition },
    });
    await recount(tx, loan.bookCopy.bookId);
    await audit(
      req,
      {
        action: 'RETURN',
        entity: 'BookLoan',
        entityId: id,
        oldValues: { status: loan.status },
        newValues: { status: 'RETURNED', condition: data.condition, daysLate, fine },
      },
      tx,
    );
    return { daysLate, fine };
  });
  const loan = await prisma.bookLoan.findUniqueOrThrow({ where: { id }, include: loanInclude });
  return { ...loan, dueDate: fmtDate(loan.dueDate), ...result };
}

export async function markLost(id: number, data: z.infer<typeof s.lostBody>, req: Request) {
  const settings = await getSettings();
  await prisma.$transaction(async (tx) => {
    const loan = await openLoan(tx, id);
    const fine = data.fine ?? settings.lostBookFine;
    await tx.bookLoan.update({
      where: { id },
      data: { status: 'LOST', fine, remark: data.remark ?? loan.remark, returnedAt: null },
    });
    await tx.bookCopy.update({ where: { id: loan.bookCopyId }, data: { status: 'LOST' } });
    await recount(tx, loan.bookCopy.bookId);
    await audit(
      req,
      {
        action: 'UPDATE',
        entity: 'BookLoan',
        entityId: id,
        oldValues: { status: loan.status },
        newValues: { status: 'LOST', fine },
      },
      tx,
    );
  });
  const loan = await prisma.bookLoan.findUniqueOrThrow({ where: { id }, include: loanInclude });
  return { ...loan, dueDate: fmtDate(loan.dueDate) };
}

export async function setFinePaid(id: number, finePaid: boolean, req: Request) {
  const loan = await prisma.bookLoan.findUnique({ where: { id } });
  if (!loan) throw notFound('Loan');
  if (Number(loan.fine) <= 0) throw badRequest('This loan has no fine');
  const after = await prisma.bookLoan.update({ where: { id }, data: { finePaid } });
  await audit(req, {
    action: 'UPDATE',
    entity: 'BookLoan',
    entityId: id,
    oldValues: { finePaid: loan.finePaid },
    newValues: { finePaid },
  });
  return after;
}

/** Flags loans past their due date as OVERDUE and notifies staff. Used by the daily cron job. */
export async function markOverdueLoans(): Promise<number> {
  const { timezone } = await getSettings();
  const today = todayIn(timezone);
  const due = await prisma.bookLoan.findMany({
    where: { status: 'BORROWED', dueDate: { lt: toDateOnly(today) } },
    include: loanInclude,
  });
  if (!due.length) return 0;
  await prisma.bookLoan.updateMany({
    where: { id: { in: due.map((l) => l.id) } },
    data: { status: 'OVERDUE' },
  });
  await audit(null, {
    action: 'UPDATE',
    entity: 'BookLoan',
    userId: null,
    newValues: { markedOverdue: due.map((l) => l.id) },
  });
  await notifyAllStaff({
    type: 'OVERDUE',
    title: storedPlural(due.length, '{count} library book is overdue', '{count} library books are overdue'),
    message:
      due
        .slice(0, 5)
        .map((l) => `"${l.bookCopy.book.title}" – ${borrowerLabel(l)}`)
        .join('; ') + (due.length > 5 ? '…' : ''),
    link: '/library/loans?status=OVERDUE',
    dedupeKey: `overdue:${today}`,
  });
  return due.length;
}

// ─── Reports ───

export async function mostBorrowedReport(q: z.infer<typeof s.reportQuery>): Promise<Report> {
  const where: Prisma.BookLoanWhereInput = {
    issuedAt:
      q.from || q.to
        ? {
            gte: q.from ? toDateOnly(q.from) : undefined,
            lte: q.to ? toDateOnly(addDays(q.to, 1)) : undefined,
          }
        : undefined,
  };
  const loans = await prisma.bookLoan.findMany({ where, select: { bookCopy: { select: { bookId: true } } } });
  const counts = new Map<number, number>();
  loans.forEach((l) => counts.set(l.bookCopy.bookId, (counts.get(l.bookCopy.bookId) ?? 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, q.limit);
  const books = await prisma.book.findMany({
    where: { id: { in: top.map(([id]) => id) } },
    include: bookInclude,
  });
  return {
    title: t('Most Borrowed Books'),
    subtitle: periodLabel(q.from, q.to) || t('All time'),
    columns: [
      { key: 'rank', header: '#', format: 'number', width: 0.6 },
      { key: 'title', header: t('Title'), width: 3.5 },
      { key: 'author', header: t('Author'), width: 2.5 },
      { key: 'category', header: t('Category'), width: 2 },
      { key: 'loans', header: t('Times borrowed'), format: 'number', width: 1.5 },
      { key: 'totalCopies', header: t('Copies'), format: 'number', width: 1 },
    ],
    rows: top.map(([id, n], i) => {
      const b = books.find((x) => x.id === id);
      return {
        rank: i + 1,
        title: b?.title ?? '',
        author: b?.author ?? '',
        category: b?.category.name ?? '',
        loans: n,
        totalCopies: b?.totalCopies ?? 0,
      };
    }),
    summary: [{ label: t('Loans in period'), value: loans.length }],
  };
}

export async function loansByClassReport(q: z.infer<typeof s.reportQuery>): Promise<Report> {
  const loans = await prisma.bookLoan.findMany({
    where: {
      studentId: { not: null },
      issuedAt:
        q.from || q.to
          ? {
              gte: q.from ? toDateOnly(q.from) : undefined,
              lte: q.to ? toDateOnly(addDays(q.to, 1)) : undefined,
            }
          : undefined,
    },
    select: {
      status: true,
      studentId: true,
      student: { select: { currentClass: { select: { id: true, name: true } } } },
    },
  });
  const classes = await prisma.class.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } });
  const rows = classes.map((c) => {
    const ls = loans.filter((l) => l.student?.currentClass?.id === c.id);
    return {
      className: c.name,
      loans: ls.length,
      borrowers: new Set(ls.map((l) => l.studentId)).size,
      active: ls.filter((l) => l.status === 'BORROWED' || l.status === 'OVERDUE').length,
      overdue: ls.filter((l) => l.status === 'OVERDUE').length,
      lost: ls.filter((l) => l.status === 'LOST').length,
    };
  });
  return {
    title: t('Library Loans per Class'),
    subtitle: periodLabel(q.from, q.to) || t('All time'),
    columns: [
      { key: 'className', header: t('Class'), width: 2.5 },
      { key: 'loans', header: t('Loans'), format: 'number', width: 1 },
      { key: 'borrowers', header: t('Students borrowing'), format: 'number', width: 1.6 },
      { key: 'active', header: t('On loan now'), format: 'number', width: 1.3 },
      { key: 'overdue', header: t('Overdue'), format: 'number', width: 1.2 },
      { key: 'lost', header: t('Lost'), format: 'number', width: 1 },
    ],
    rows,
    summary: [{ label: t('Total loans'), value: loans.length }],
  };
}

export const overdueReport = (q: z.infer<typeof s.reportQuery>) =>
  loansReport(
    { page: 1, pageSize: 1, sortOrder: 'desc', status: 'OVERDUE', format: q.format },
    t('Overdue Books'),
  );
