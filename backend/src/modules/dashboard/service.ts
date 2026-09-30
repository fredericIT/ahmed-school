import { prisma } from '../../config/prisma';
import { addDays, eachDay, fmtDate, isWeekend, toDateOnly, todayIn } from '../../utils/dates';
import { GRADE_ORDER } from '../../utils/grades';
import { getSettings } from '../../utils/settings';
import { EXPIRY_WARNING_DAYS } from '../inventory/service';

function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export async function stats() {
  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const todayDate = toDateOnly(today);
  const trendFrom = addDays(today, -29);
  const months = lastMonths(today, 6);
  const monthStart = toDateOnly(`${months[0]}-01`);

  const activeStudent = { status: 'ACTIVE' as const, deletedAt: null };

  const [
    byLevel,
    byGender,
    classes,
    todayRecords,
    trendRaw,
    upcoming,
    upcomingCount,
    lowStockIds,
    expiringCount,
    borrowed,
    overdueCount,
    recent,
    movementsRaw,
    loansRaw,
    overdueList,
  ] = await Promise.all([
    prisma.student.findMany({ where: activeStudent, select: { currentClass: { select: { level: true } } } }),
    prisma.student.groupBy({ by: ['gender'], where: activeStudent, _count: true }),
    prisma.class.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { students: { where: activeStudent } } } },
    }),
    prisma.attendance.findMany({
      where: { date: todayDate },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, photo: true, admissionNumber: true },
        },
        class: { select: { id: true, name: true } },
      },
    }),
    prisma.attendance.groupBy({
      by: ['date', 'status'],
      where: { date: { gte: toDateOnly(trendFrom), lte: todayDate } },
      _count: true,
    }),
    prisma.activity.findMany({
      where: { deletedAt: null, date: { gte: todayDate }, status: { in: ['PLANNED', 'ONGOING'] } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 5,
      select: {
        id: true,
        title: true,
        category: true,
        date: true,
        startTime: true,
        location: true,
        status: true,
      },
    }),
    prisma.activity.count({
      where: { deletedAt: null, date: { gte: todayDate }, status: { in: ['PLANNED', 'ONGOING'] } },
    }),
    prisma.$queryRaw<
      { id: number }[]
    >`SELECT id FROM InventoryItem WHERE deletedAt IS NULL AND quantity <= reorderLevel`,
    prisma.inventoryItem.count({
      where: {
        deletedAt: null,
        quantity: { gt: 0 },
        expiryDate: { not: null, lte: toDateOnly(addDays(today, EXPIRY_WARNING_DAYS)) },
      },
    }),
    prisma.bookLoan.count({ where: { status: { in: ['BORROWED', 'OVERDUE'] } } }),
    prisma.bookLoan.count({ where: { status: 'OVERDUE' } }),
    prisma.student.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        photo: true,
        admissionNumber: true,
        createdAt: true,
        gender: true,
        currentClass: { select: { name: true } },
      },
    }),
    prisma.stockMovement.findMany({
      where: { date: { gte: monthStart } },
      select: { date: true, type: true, quantity: true, unitCost: true },
    }),
    prisma.bookLoan.findMany({
      where: { issuedAt: { gte: monthStart } },
      select: { issuedAt: true, returnedAt: true },
    }),
    prisma.bookLoan.findMany({
      where: { status: 'OVERDUE' },
      orderBy: { dueDate: 'asc' },
      take: 5,
      include: {
        bookCopy: { select: { copyCode: true, book: { select: { title: true } } } },
        student: {
          select: { id: true, firstName: true, lastName: true, currentClass: { select: { name: true } } },
        },
      },
    }),
  ]);

  const lowStock = await prisma.inventoryItem.findMany({
    where: { id: { in: lowStockIds.map((r) => Number(r.id)) } },
    orderBy: { quantity: 'asc' },
    take: 5,
    select: { id: true, name: true, sku: true, quantity: true, reorderLevel: true, unit: true, image: true },
  });

  // Attendance today
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, SICK: 0 };
  todayRecords.forEach((r) => counts[r.status]++);
  const totalStudents = byLevel.length;
  const recordedToday = todayRecords.length;
  const classesWithStudents = classes.filter((c) => c._count.students > 0);
  const classesTaken = new Set(todayRecords.map((r) => r.classId)).size;

  // 30-day trend (school days only)
  const trend = eachDay(trendFrom, today)
    .filter((d) => settings.allowWeekendAttendance || !isWeekend(d))
    .map((d) => {
      const rows = trendRaw.filter((r) => fmtDate(r.date) === d);
      const total = rows.reduce((a, r) => a + r._count, 0);
      const present = rows
        .filter((r) => r.status === 'PRESENT' || r.status === 'LATE')
        .reduce((a, r) => a + r._count, 0);
      const absent = rows.filter((r) => r.status === 'ABSENT').reduce((a, r) => a + r._count, 0);
      return {
        date: d,
        rate: total ? Math.round((present / total) * 1000) / 10 : null,
        present,
        absent,
        total,
      };
    })
    .filter((d) => d.total > 0 || d.date === today);

  const stockByMonth = months.map((m) => {
    const rows = movementsRaw.filter((r) => fmtDate(r.date).startsWith(m));
    const sumBy = (types: string[]) =>
      Math.round(
        rows
          .filter((r) => types.includes(r.type))
          .reduce((a, r) => a + Math.abs(r.quantity) * Number(r.unitCost ?? 0), 0),
      );
    return { month: m, in: sumBy(['IN', 'RETURN']), out: sumBy(['OUT']), damaged: sumBy(['DAMAGED']) };
  });

  const loansByMonth = months.map((m) => ({
    month: m,
    issued: loansRaw.filter((l) => l.issuedAt.toISOString().startsWith(m)).length,
    returned: loansRaw.filter((l) => l.returnedAt?.toISOString().startsWith(m)).length,
  }));

  return {
    today,
    kpis: {
      students: {
        total: totalStudents,
        nursery: byLevel.filter((s) => s.currentClass?.level === 'NURSERY').length,
        primary: byLevel.filter((s) => s.currentClass?.level === 'PRIMARY').length,
      },
      attendanceToday: {
        ...counts,
        recorded: recordedToday,
        rate: recordedToday ? Math.round(((counts.PRESENT + counts.LATE) / recordedToday) * 1000) / 10 : null,
        classesTaken,
        classesTotal: classesWithStudents.length,
      },
      upcomingActivities: upcomingCount,
      lowStockItems: lowStockIds.length,
      expiringItems: expiringCount,
      booksBorrowed: borrowed,
      overdueLoans: overdueCount,
    },
    charts: {
      attendanceTrend: trend,
      studentsPerClass: classes
        .sort((a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade))
        .map((c) => ({ classId: c.id, name: c.name, students: c._count.students, capacity: c.capacity })),
      gender: byGender.map((g) => ({ gender: g.gender, count: g._count })),
      stockByMonth,
      loansByMonth,
    },
    lists: {
      recentRegistrations: recent,
      todaysAbsentees: todayRecords
        .filter((r) => r.status !== 'PRESENT' && r.status !== 'LATE')
        .map((r) => ({ student: r.student, class: r.class, status: r.status, remark: r.remark })),
      upcomingActivities: upcoming,
      lowStock,
      overdueBooks: overdueList,
    },
  };
}
