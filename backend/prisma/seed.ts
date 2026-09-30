/* eslint-disable no-console */
import {
  PrismaClient,
  type ActivityCategory,
  type ActivityStatus,
  type AssessmentType,
  type AttendanceStatus,
  type Gender,
  type Grade,
  type ItemUnit,
  type MovementType,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { storedPlural, storedText } from '../src/i18n';

const prisma = new PrismaClient();

// ─── Deterministic randomness so every seed produces the same demo ───
let seedState = 20260928;
function rand(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

// ─── Date helpers (calendar dates as UTC midnight) ───
const TZ = 'Africa/Kigali';
const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const x = d(s);
  x.setUTCDate(x.getUTCDate() + n);
  return iso(x);
};
const isWeekend = (s: string) => [0, 6].includes(d(s).getUTCDay());
const at = (s: string, hh: number, mm = 0) =>
  new Date(`${s}T${String(hh - 2).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`); // Kigali is UTC+2

// ─── Name pools ───
const BOY_NAMES = [
  'Ishimwe',
  'Mugisha',
  'Ganza',
  'Shema',
  'Hirwa',
  'Irakoze',
  'Nshuti',
  'Kwizera',
  'Cyusa',
  'Manzi',
  'Mucyo',
  'Gisa',
  'Kevin',
  'Olivier',
  'Patrick',
  'Eric',
  'Jean Paul',
  'Bruno',
  'Davis',
  'Fabrice',
  'Igor',
  'Ange',
  'Prince',
  'Brian',
];
const GIRL_NAMES = [
  'Keza',
  'Teta',
  'Uwase',
  'Ineza',
  'Isimbi',
  'Kaze',
  'Umutoni',
  'Iriza',
  'Ishema',
  'Mahoro',
  'Neza',
  'Kamikazi',
  'Ingabire',
  'Mutesi',
  'Umuhoza',
  'Aline',
  'Divine',
  'Grace',
  'Diane',
  'Gisele',
  'Sandrine',
  'Belyse',
  'Queen',
  'Ella',
];
const FAMILY_NAMES = [
  'Habimana',
  'Niyonzima',
  'Uwimana',
  'Mugabo',
  'Nkurunziza',
  'Hakizimana',
  'Nsengiyumva',
  'Bizimana',
  'Ndayisaba',
  'Uwamahoro',
  'Munyaneza',
  'Tuyishime',
  'Nshimiyimana',
  'Rwigema',
  'Kayitesi',
  'Gasana',
  'Murenzi',
  'Karangwa',
  'Mutabazi',
  'Iradukunda',
  'Niyomugabo',
  'Twizeyimana',
  'Umubyeyi',
  'Sibomana',
];
const MOTHER_NAMES = [
  'Jeanne Mukamana',
  'Claudine Uwera',
  'Solange Mukeshimana',
  'Alice Uwineza',
  'Chantal Nyirahabimana',
  'Josiane Umutesi',
  'Vestine Mukandayisenga',
  'Esperance Uwamariya',
  'Immaculée Mukagasana',
  'Clementine Ingabire',
  'Liliane Uwamahoro',
  'Donatha Mukamurenzi',
  'Pascaline Nyiransabimana',
  'Olive Umuhoza',
  'Beatha Mukarugwiza',
  'Sylvie Kayitesi',
];
const FATHER_NAMES = [
  'Jean Bosco Habimana',
  'Emmanuel Niyonsaba',
  'Innocent Mugabo',
  'Théoneste Bizimana',
  'Alexis Nkurunziza',
  'Fidèle Hakizimana',
  'Jean Claude Ndayisaba',
  'Faustin Munyaneza',
  'Célestin Twagirayezu',
  'Aimable Nsengimana',
  'Pacifique Kamanzi',
  'Gaspard Rutayisire',
  'Vincent Karangwa',
  'Eugène Gatera',
  'Didier Mutabazi',
  'Joseph Rwigema',
];
const OCCUPATIONS = [
  'Teacher',
  'Nurse',
  'Business owner',
  'Accountant',
  'Engineer',
  'Driver',
  'Farmer',
  'Civil servant',
  'Tailor',
  'Doctor',
  'Mechanic',
  'Banker',
  'Trader',
  'Police officer',
  'IT specialist',
];
const SECTORS = [
  'Kicukiro',
  'Kagarama',
  'Niboye',
  'Gikondo',
  'Kanombe',
  'Nyarugunga',
  'Gahanga',
  'Remera',
  'Kimironko',
  'Kacyiru',
  'Nyamirambo',
  'Kimihurura',
];

const phone = () => `+2507${pick(['8', '9', '2', '3'])}${String(int(1000000, 9999999))}`;
const nationalId = (gender: 'M' | 'F') =>
  `1${int(1970, 1995)}${gender === 'M' ? 8 : 7}${String(int(0, 9999999)).padStart(7, '0')}${int(0, 9)}${String(int(10, 99))}`;

async function wipe() {
  // Order matters because of foreign keys.
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.mark.deleteMany(),
    prisma.assessment.deleteMany(),
    prisma.teacherAssignment.deleteMany(),
    prisma.course.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.bookLoan.deleteMany(),
    prisma.bookCopy.deleteMany(),
    prisma.book.deleteMany(),
    prisma.bookCategory.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.inventoryItem.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.inventoryCategory.deleteMany(),
    prisma.activityPhoto.deleteMany(),
    prisma.activityParticipant.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.studentGuardian.deleteMany(),
    prisma.guardian.deleteMany(),
    prisma.student.deleteMany(),
    prisma.class.deleteMany(),
    prisma.holiday.deleteMany(),
    prisma.term.deleteMany(),
    prisma.academicYear.deleteMany(),
    prisma.schoolSettings.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== 'true') {
    throw new Error('Refusing to wipe and seed a production database. Set SEED_FORCE=true to override.');
  }
  console.log(`Seeding demo data (today is ${todayIso} in ${TZ})…`);
  await wipe();

  // ─── Users ───
  const [superAdmin, admin] = await Promise.all([
    prisma.user.create({
      data: {
        firstName: 'Grace',
        lastName: 'Uwimana',
        email: 'superadmin@school.rw',
        phone: '+250788000001',
        role: 'SUPER_ADMIN',
        passwordHash: await bcrypt.hash('SuperAdmin@123', 12),
      },
    }),
    prisma.user.create({
      data: {
        firstName: 'Eric',
        lastName: 'Mugisha',
        email: 'admin@school.rw',
        phone: '+250788000002',
        role: 'ADMIN',
        passwordHash: await bcrypt.hash('Admin@123', 12),
      },
    }),
  ]);
  const staff = [superAdmin, admin];

  // ─── Settings & calendar ───
  await prisma.schoolSettings.create({
    data: {
      name: 'Little Stars Nursery & Primary School',
      motto: 'Learning with joy, growing with love',
      address: 'KK 15 Ave, Kicukiro, Kigali, Rwanda',
      phone: '+250 788 123 456',
      email: 'info@littlestars.rw',
      website: 'www.littlestars.rw',
      currency: 'RWF',
      timezone: TZ,
      admissionPrefix: 'SCH',
    },
  });

  const prevYear = await prisma.academicYear.create({
    data: { name: '2025-2026', startDate: d('2025-09-08'), endDate: d('2026-07-17') },
  });
  await prisma.term.createMany({
    data: [
      { academicYearId: prevYear.id, name: 'Term 1', startDate: d('2025-09-08'), endDate: d('2025-12-12') },
      { academicYearId: prevYear.id, name: 'Term 2', startDate: d('2026-01-05'), endDate: d('2026-04-03') },
      { academicYearId: prevYear.id, name: 'Term 3', startDate: d('2026-04-20'), endDate: d('2026-07-17') },
    ],
  });
  const year = await prisma.academicYear.create({
    data: { name: '2026-2027', startDate: d('2026-08-17'), endDate: d('2027-07-16'), isCurrent: true },
  });
  const term1 = await prisma.term.create({
    data: {
      academicYearId: year.id,
      name: 'Term 1',
      startDate: d('2026-08-17'),
      endDate: d('2026-11-27'),
      isCurrent: true,
    },
  });
  await prisma.term.createMany({
    data: [
      { academicYearId: year.id, name: 'Term 2', startDate: d('2027-01-05'), endDate: d('2027-04-02') },
      { academicYearId: year.id, name: 'Term 3', startDate: d('2027-04-19'), endDate: d('2027-07-16') },
    ],
  });

  const holidays: [string, string][] = [
    ['2026-01-01', "New Year's Day"],
    ['2026-02-01', 'National Heroes Day'],
    ['2026-04-07', 'Genocide against the Tutsi Memorial Day'],
    ['2026-05-01', 'Labour Day'],
    ['2026-07-01', 'Independence Day'],
    ['2026-07-04', 'Liberation Day'],
    ['2026-08-07', 'Umuganura Day'],
    ['2026-08-15', 'Assumption Day'],
    ['2026-12-25', 'Christmas Day'],
    ['2026-12-26', 'Boxing Day'],
    ['2027-01-01', "New Year's Day"],
    ['2027-02-01', 'National Heroes Day'],
    ['2027-04-07', 'Genocide against the Tutsi Memorial Day'],
    ['2027-05-01', 'Labour Day'],
    ['2027-07-01', 'Independence Day'],
    ['2027-07-04', 'Liberation Day'],
  ];
  await prisma.holiday.createMany({ data: holidays.map(([date, name]) => ({ date: d(date), name })) });
  const holidaySet = new Set(holidays.map(([x]) => x));

  // ─── Classes ───
  const classDefs: {
    name: string;
    grade: Grade;
    level: 'NURSERY' | 'PRIMARY';
    section: string | null;
    capacity: number;
    teacher: string;
    room: string;
    age: number;
  }[] = [
    {
      name: 'Baby Class',
      grade: 'BABY',
      level: 'NURSERY',
      section: null,
      capacity: 20,
      teacher: 'Mrs. Solange Uwera',
      room: 'N1',
      age: 3,
    },
    {
      name: 'Middle Class',
      grade: 'MIDDLE',
      level: 'NURSERY',
      section: null,
      capacity: 22,
      teacher: 'Mrs. Claudine Mukamana',
      room: 'N2',
      age: 4,
    },
    {
      name: 'Top Class',
      grade: 'TOP',
      level: 'NURSERY',
      section: null,
      capacity: 25,
      teacher: 'Ms. Alice Ingabire',
      room: 'N3',
      age: 5,
    },
    {
      name: 'P1 A',
      grade: 'P1',
      level: 'PRIMARY',
      section: 'A',
      capacity: 30,
      teacher: 'Mr. Jean Claude Ndayisaba',
      room: 'P1',
      age: 6,
    },
    {
      name: 'P2 A',
      grade: 'P2',
      level: 'PRIMARY',
      section: 'A',
      capacity: 30,
      teacher: 'Mrs. Josiane Umutesi',
      room: 'P2',
      age: 7,
    },
  ];
  const classes: (Awaited<ReturnType<typeof prisma.class.create>> & { age: number })[] = [];
  for (const c of classDefs) {
    classes.push({
      ...(await prisma.class.create({
        data: {
          name: c.name,
          grade: c.grade,
          level: c.level,
          section: c.section,
          capacity: c.capacity,
          classTeacherName: c.teacher,
          room: c.room,
          createdById: superAdmin.id,
        },
      })),
      age: c.age,
    });
  }

  // ─── Courses & teachers ───
  const courseDefs: [string, string, 'NURSERY' | 'PRIMARY' | null][] = [
    ['Literacy & Language', 'LIT', 'NURSERY'],
    ['Numeracy', 'NUM', 'NURSERY'],
    ['Discovery of the World', 'DISC', 'NURSERY'],
    ['Mathematics', 'MATH', 'PRIMARY'],
    ['English', 'ENG', 'PRIMARY'],
    ['Kinyarwanda', 'KIN', null],
    ['French', 'FR', 'PRIMARY'],
    ['Science & Elementary Technology', 'SET', 'PRIMARY'],
    ['Social & Religious Studies', 'SRS', 'PRIMARY'],
    ['Creative Arts & Music', 'ART', null],
    ['Physical Education', 'PE', null],
  ];
  const courses: Record<string, number> = {};
  for (const [name, code, level] of courseDefs)
    courses[code] = (await prisma.course.create({ data: { name, code, level } })).id;

  const yy = todayIso.slice(2, 4);
  const teacherPassword = await bcrypt.hash('Teacher@123', 12);
  const teacherDefs: {
    first: string;
    last: string;
    email: string;
    post: string;
    seq: number;
    active: boolean;
    assign: [string, number][];
  }[] = [
    // assign: [course code, class index]
    {
      first: 'Jean Claude',
      last: 'Ndayisaba',
      email: 'jc.ndayisaba@gmail.com',
      post: 'TR',
      seq: 1,
      active: true,
      assign: [
        ['MATH', 3],
        ['ENG', 3],
        ['KIN', 3],
        ['MATH', 4],
      ],
    },
    {
      first: 'Solange',
      last: 'Uwera',
      email: 'solange.uwera@gmail.com',
      post: 'TR',
      seq: 2,
      active: true,
      assign: [
        ['LIT', 0],
        ['NUM', 0],
        ['LIT', 1],
        ['NUM', 1],
        ['DISC', 2],
      ],
    },
    {
      first: 'Josiane',
      last: 'Umutesi',
      email: 'josiane.umutesi@gmail.com',
      post: 'TR',
      seq: 3,
      active: true,
      assign: [
        ['ENG', 4],
        ['FR', 4],
        ['SET', 4],
        ['SRS', 4],
      ],
    },
    {
      first: 'Didier',
      last: 'Mutabazi',
      email: 'didier.mutabazi@gmail.com',
      post: 'TR',
      seq: 4,
      active: false,
      assign: [
        ['PE', 1],
        ['PE', 2],
        ['PE', 3],
        ['PE', 4],
      ],
    },
    {
      first: 'Aline',
      last: 'Ingabire',
      email: 'aline.ingabire@gmail.com',
      post: 'TA',
      seq: 1,
      active: false,
      assign: [
        ['ART', 0],
        ['ART', 1],
      ],
    },
  ];
  const teacherFor = new Map<string, number>(); // `${course code}:${class index}` → teacher id
  for (const t of teacherDefs) {
    const created = await prisma.user.create({
      data: {
        firstName: t.first,
        lastName: t.last,
        email: t.email,
        role: 'TEACHER',
        post: t.post,
        regNumber: `${yy}${t.post}${String(t.seq).padStart(3, '0')}`,
        // Pending teachers get an unusable random password until they activate.
        passwordHash: t.active ? teacherPassword : await bcrypt.hash(`pending-${Math.random()}`, 4),
        activatedAt: t.active ? new Date() : null,
      },
    });
    for (const [code, idx] of t.assign) teacherFor.set(`${code}:${idx}`, created.id);
    await prisma.teacherAssignment.createMany({
      data: t.assign.map(([code, idx]) => ({
        teacherId: created.id,
        courseId: courses[code],
        classId: classes[idx].id,
      })),
    });
  }

  // ─── Students & guardians ───
  const perClass = [11, 12, 12, 13, 12]; // 60 students
  const used = new Set<string>();
  const students: { id: number; classId: number; gender: Gender; name: string }[] = [];
  let seq = 0;
  let sharedFamily: { guardianIds: number[]; lastName: string } | null = null;
  const bloodGroups = ['A+', 'A+', 'B+', 'O+', 'O+', 'O+', 'AB+', 'A-', 'O-', null, null, null];
  const allergyPool = ['Peanuts', 'Milk (lactose)', 'Eggs', 'Penicillin', 'Dust and pollen', 'Bee stings'];

  for (const [ci, cls] of classes.entries()) {
    for (let i = 0; i < perClass[ci]; i++) {
      seq++;
      const gender: Gender = rand() < 0.5 ? 'MALE' : 'FEMALE';
      let firstName: string;
      let lastName: string;
      do {
        firstName = pick(gender === 'MALE' ? BOY_NAMES : GIRL_NAMES);
        lastName = pick(FAMILY_NAMES);
      } while (used.has(`${firstName} ${lastName}`));
      used.add(`${firstName} ${lastName}`);

      const birthYear = 2026 - cls.age - (rand() < 0.25 ? 1 : 0);
      const dob = `${birthYear}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`;
      const isNew = ci === 0 || rand() < 0.15; // Baby class and a few others joined this year
      const admissionYear = isNew ? 2026 : 2026 - int(1, Math.min(ci, 3));
      const admissionDate = isNew
        ? addDays('2026-08-17', -int(0, 25))
        : `${admissionYear}-09-${String(int(1, 15)).padStart(2, '0')}`;
      const admissionNumber = `SCH-${admissionYear}-${String(seq).padStart(4, '0')}`;
      const sector = pick(SECTORS);
      const hasAllergy = rand() < 0.15;

      const st = await prisma.student.create({
        data: {
          admissionNumber,
          firstName,
          lastName,
          gender,
          dateOfBirth: d(dob),
          nationality:
            rand() < 0.93 ? 'Rwandan' : pick(['Ugandan', 'Kenyan', 'Burundian', 'Congolese (DRC)']),
          address: `${sector}, Kigali`,
          bloodGroup: pick(bloodGroups),
          allergies: hasAllergy ? pick(allergyPool) : null,
          medicalNotes:
            rand() < 0.1
              ? pick([
                  'Mild asthma – inhaler kept in the office',
                  'Wears glasses',
                  'Recovering from malaria, extra rest advised',
                ])
              : null,
          specialNeeds: rand() < 0.05 ? 'Speech therapy twice a week (Tuesday, Thursday)' : null,
          previousSchool:
            !isNew || ci === 0
              ? null
              : pick([
                  'Kigali Parents School',
                  'Green Hills Nursery',
                  'Ecole Maternelle Les Anges',
                  'Umucyo Nursery',
                ]),
          admissionDate: d(admissionDate),
          currentClassId: cls.id,
          createdById: pick(staff).id,
          createdAt: at(admissionDate, int(8, 15), int(0, 59)),
        },
      });
      students.push({ id: st.id, classId: cls.id, gender, name: `${firstName} ${lastName}` });

      // Every 7th child is a sibling of the previous family (shared guardians).
      if (sharedFamily && seq % 7 === 0) {
        for (const [gi, gid] of sharedFamily.guardianIds.entries()) {
          await prisma.studentGuardian.create({
            data: { studentId: st.id, guardianId: gid, isPrimary: gi === 0 },
          });
        }
      } else {
        const mother = await prisma.guardian.create({
          data: {
            fullName: pick(MOTHER_NAMES),
            relationship: 'Mother',
            phone: phone(),
            altPhone: rand() < 0.3 ? phone() : null,
            email: rand() < 0.5 ? `parent${seq}@gmail.com` : null,
            occupation: pick(OCCUPATIONS),
            address: `${sector}, Kigali`,
            nationalId: nationalId('F'),
            isEmergencyContact: true,
            canPickUp: true,
          },
        });
        const ids = [mother.id];
        if (rand() < 0.7) {
          const father = await prisma.guardian.create({
            data: {
              fullName: pick(FATHER_NAMES),
              relationship: 'Father',
              phone: phone(),
              email: rand() < 0.4 ? `father${seq}@gmail.com` : null,
              occupation: pick(OCCUPATIONS),
              address: `${sector}, Kigali`,
              nationalId: nationalId('M'),
              isEmergencyContact: rand() < 0.5,
              canPickUp: true,
            },
          });
          ids.push(father.id);
        }
        if (rand() < 0.2) {
          const other = await prisma.guardian.create({
            data: {
              fullName: `${pick(['Marie', 'Agnes', 'Jean', 'Samuel'])} ${pick(FAMILY_NAMES)}`,
              relationship: pick(['Aunt', 'Uncle', 'Grandmother', 'Nanny']),
              phone: phone(),
              canPickUp: true,
              isEmergencyContact: false,
            },
          });
          ids.push(other.id);
        }
        for (const [gi, gid] of ids.entries()) {
          await prisma.studentGuardian.create({
            data: { studentId: st.id, guardianId: gid, isPrimary: gi === 0 },
          });
        }
        sharedFamily = { guardianIds: ids, lastName };
      }

      // Enrolment history: previous year's class for returning pupils.
      if (!isNew && ci > 0)
        await prisma.enrollment.create({
          data: {
            studentId: st.id,
            classId: classes[ci - 1].id,
            academicYearId: prevYear.id,
            enrolledAt: at('2025-09-08', 8),
            note: 'Previous year',
          },
        });
      await prisma.enrollment.create({
        data: {
          studentId: st.id,
          classId: cls.id,
          academicYearId: year.id,
          enrolledAt: at(isNew ? admissionDate : '2026-08-17', 8),
          note: isNew ? 'Admission' : `Promoted to ${cls.name}`,
        },
      });
    }
  }

  // A couple of historical statuses
  const leaver = await prisma.student.create({
    data: {
      admissionNumber: 'SCH-2024-0901',
      firstName: 'Ange',
      lastName: 'Mutoni',
      gender: 'FEMALE',
      dateOfBirth: d('2019-05-10'),
      admissionDate: d('2024-09-09'),
      status: 'TRANSFERRED',
      statusReason: 'Family relocated to Musanze',
      currentClassId: classes[3].id,
      nationality: 'Rwandan',
    },
  });
  await prisma.enrollment.create({
    data: {
      studentId: leaver.id,
      classId: classes[3].id,
      academicYearId: prevYear.id,
      note: 'Previous year',
    },
  });
  const grad = await prisma.student.create({
    data: {
      admissionNumber: 'SCH-2023-0902',
      firstName: 'Yves',
      lastName: 'Gatera',
      gender: 'MALE',
      dateOfBirth: d('2018-02-14'),
      admissionDate: d('2023-09-11'),
      status: 'GRADUATED',
      statusReason: 'Graduated 2025-2026',
      currentClassId: classes[4].id,
      nationality: 'Rwandan',
    },
  });
  await prisma.enrollment.create({
    data: { studentId: grad.id, classId: classes[4].id, academicYearId: prevYear.id, note: 'Previous year' },
  });
  const g1 = await prisma.guardian.create({
    data: {
      fullName: 'Beatha Mutoni',
      relationship: 'Mother',
      phone: phone(),
      canPickUp: true,
      isEmergencyContact: true,
    },
  });
  const g2 = await prisma.guardian.create({
    data: {
      fullName: 'Eugène Gatera',
      relationship: 'Father',
      phone: phone(),
      canPickUp: true,
      isEmergencyContact: true,
    },
  });
  await prisma.studentGuardian.createMany({
    data: [
      { studentId: leaver.id, guardianId: g1.id, isPrimary: true },
      { studentId: grad.id, guardianId: g2.id, isPrimary: true },
    ],
  });

  // ─── Attendance: last 30 school days ───
  const days: string[] = [];
  for (let x = todayIso; days.length < 30; x = addDays(x, -1)) {
    if (!isWeekend(x) && !holidaySet.has(x) && x >= '2026-08-17') days.push(x);
    if (x < '2026-08-17') break;
  }
  const chronic = new Set([students[5].id, students[27].id, students[44].id]);
  const skipTodayClass = classes[4].id; // leave P2 A untaken today so the demo has something to do
  const attendanceRows = [];
  for (const day of days) {
    for (const st of students) {
      if (day === todayIso && st.classId === skipTodayClass) continue;
      const r = rand();
      let status: AttendanceStatus;
      if (chronic.has(st.id)) status = r < 0.3 ? 'ABSENT' : r < 0.38 ? 'SICK' : r < 0.45 ? 'LATE' : 'PRESENT';
      else
        status =
          r < 0.86 ? 'PRESENT' : r < 0.92 ? 'LATE' : r < 0.96 ? 'ABSENT' : r < 0.985 ? 'SICK' : 'EXCUSED';
      attendanceRows.push({
        studentId: st.id,
        classId: st.classId,
        termId: term1.id,
        date: d(day),
        status,
        arrivalTime:
          status === 'PRESENT'
            ? `07:${String(int(15, 55)).padStart(2, '0')}`
            : status === 'LATE'
              ? `08:${String(int(10, 45)).padStart(2, '0')}`
              : null,
        pickedUpBy:
          status === 'PRESENT' || status === 'LATE'
            ? rand() < 0.6
              ? 'Mother'
              : pick(['Father', 'Nanny', 'School bus', 'Aunt'])
            : null,
        remark:
          status === 'SICK'
            ? pick(['Fever', 'Stomach ache', 'Flu', 'Malaria (doctor note)'])
            : status === 'EXCUSED'
              ? pick(['Family event', 'Hospital appointment'])
              : status === 'LATE' && rand() < 0.3
                ? 'Traffic'
                : null,
        recordedById: pick(staff).id,
        createdAt: at(day, 9, int(0, 30)),
      });
    }
  }
  await prisma.attendance.createMany({ data: attendanceRows });

  // ─── Marks: three assessments per course so far this term ───
  // A separate generator, so adding marks does not change the rest of the demo data.
  let markState = 7919;
  const mrand = () => {
    markState = (markState + 0x6d2b79f5) | 0;
    let t = Math.imul(markState ^ (markState >>> 15), 1 | markState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ability = new Map(
    students.map((st) => [st.id, chronic.has(st.id) ? 0.35 + mrand() * 0.15 : 0.5 + mrand() * 0.45]),
  );
  const schoolDays = [...days].reverse(); // oldest first
  const plan: { title: string; type: AssessmentType; max: number; at: number }[] = [
    { title: 'Classwork', type: 'CLASSWORK', max: 10, at: 0.25 },
    { title: 'Quiz', type: 'QUIZ', max: 10, at: 0.55 },
    { title: 'Mid-term test', type: 'TEST', max: 30, at: 0.85 },
  ];
  const levelCourses = (level: string) =>
    courseDefs.filter(([, , l]) => l === null || l === level).map(([name, code]) => ({ name, code }));
  for (const [idx, cls] of classes.entries()) {
    const pupils = students.filter((st) => st.classId === cls.id);
    for (const course of levelCourses(cls.level)) {
      const bias = (mrand() - 0.5) * 0.2; // some courses are harder than others
      for (const [k, p] of plan.entries()) {
        const day =
          schoolDays[
            Math.min(schoolDays.length - 2, Math.floor(p.at * schoolDays.length) + (k === 2 ? 0 : idx % 3))
          ];
        const a = await prisma.assessment.create({
          data: {
            title: `${p.title}: ${course.name}`,
            type: p.type,
            date: d(day),
            maxScore: p.max,
            termId: term1.id,
            classId: cls.id,
            courseId: courses[course.code],
            createdById: teacherFor.get(`${course.code}:${idx}`) ?? admin.id,
            createdAt: at(day, 14, 0),
          },
        });
        await prisma.mark.createMany({
          data: pupils.map((st) => {
            const absent = mrand() < 0.02;
            const level = Math.min(
              1,
              Math.max(0.1, (ability.get(st.id) ?? 0.7) + bias + (mrand() - 0.5) * 0.25),
            );
            return {
              assessmentId: a.id,
              studentId: st.id,
              absent,
              score: absent ? null : Math.round(level * p.max * 2) / 2,
              recordedById: a.createdById,
            };
          }),
        });
      }
    }
  }
  // A quiz waiting for marks, so the demo teacher has something to do.
  await prisma.assessment.create({
    data: {
      title: 'Fractions quiz',
      type: 'QUIZ',
      date: d(schoolDays[schoolDays.length - 1]),
      maxScore: 20,
      termId: term1.id,
      classId: classes[4].id,
      courseId: courses.MATH,
      createdById: teacherFor.get('MATH:4') ?? admin.id,
    },
  });

  // ─── Activities ───
  const activityDefs: {
    title: string;
    category: ActivityCategory;
    date: string;
    start: string;
    end: string;
    location: string;
    organizer: string;
    status: ActivityStatus;
    budget: number;
    cost?: number;
    outcome?: string;
    description: string;
    classIdx: number[];
  }[] = [
    {
      title: 'Welcome Back Party',
      category: 'CELEBRATION',
      date: '2026-08-17',
      start: '10:00',
      end: '12:00',
      location: 'School playground',
      organizer: 'Mrs. Solange Uwera',
      status: 'COMPLETED',
      budget: 150000,
      cost: 138500,
      outcome:
        'All classes took part. Children received welcome packs; new Baby Class pupils settled in well with parents present for the first hour.',
      description: 'Games, music and snacks to welcome children to the new school year.',
      classIdx: [0, 1, 2, 3, 4],
    },
    {
      title: 'Deworming & Vitamin A Campaign',
      category: 'HEALTH',
      date: '2026-08-26',
      start: '09:00',
      end: '11:30',
      location: 'Sick bay',
      organizer: 'Kicukiro Health Centre',
      status: 'COMPLETED',
      budget: 0,
      cost: 0,
      outcome:
        '58 children received deworming tablets and vitamin A. Two absent children to be followed up at the next campaign.',
      description: 'Ministry of Health campaign in partnership with the local health centre.',
      classIdx: [0, 1, 2, 3, 4],
    },
    {
      title: 'Term 1 Parents Meeting',
      category: 'PARENT_MEETING',
      date: '2026-09-05',
      start: '09:00',
      end: '12:00',
      location: 'Main hall',
      organizer: 'School administration',
      status: 'COMPLETED',
      budget: 80000,
      cost: 72000,
      outcome:
        '47 families attended. Agreed on the school feeding contribution and the new pick-up procedure. Parents requested more reading homework for P1/P2.',
      description: 'Presentation of the term calendar, school feeding and safety rules.',
      classIdx: [0, 1, 2, 3, 4],
    },
    {
      title: 'Reading Week',
      category: 'ACADEMIC',
      date: '2026-09-14',
      start: '08:00',
      end: '12:00',
      location: 'Library corner',
      organizer: 'Mr. Jean Claude Ndayisaba',
      status: 'COMPLETED',
      budget: 60000,
      cost: 64500,
      outcome:
        'Story-telling sessions in English and Kinyarwanda. Library loans doubled during the week; P2 pupils read aloud to Top Class.',
      description: 'A week of stories, read-aloud sessions and book exchanges.',
      classIdx: [2, 3, 4],
    },
    {
      title: 'Inter-class Sports Day',
      category: 'SPORTS',
      date: '2026-09-25',
      start: '08:30',
      end: '13:00',
      location: 'Amahoro sports ground',
      organizer: 'Mr. Didier Mutabazi (PE)',
      status: 'COMPLETED',
      budget: 250000,
      cost: 231000,
      outcome:
        'Sack race, relay and football. P2 A won the relay; every child received a medal. One minor knee scrape treated on site.',
      description: 'Races and team games for all classes. Parents invited to cheer.',
      classIdx: [1, 2, 3, 4],
    },
    {
      title: 'Trip to Nyandungu Eco-Park',
      category: 'TRIP',
      date: addDays(todayIso, 11),
      start: '08:00',
      end: '14:00',
      location: 'Nyandungu Urban Wetland Eco-Tourism Park',
      organizer: 'Ms. Alice Ingabire',
      status: 'PLANNED',
      budget: 420000,
      description: 'Nature walk, bird watching and picnic. Consent forms due one week before.',
      classIdx: [2, 3, 4],
    },
    {
      title: 'Art & Craft Exhibition',
      category: 'CULTURAL',
      date: addDays(todayIso, 25),
      start: '10:00',
      end: '13:00',
      location: 'Main hall',
      organizer: 'Mrs. Josiane Umutesi',
      status: 'PLANNED',
      budget: 120000,
      description: 'Children exhibit paintings, clay work and imigongo-inspired art for parents.',
      classIdx: [0, 1, 2, 3, 4],
    },
    {
      title: 'Dental Check-up',
      category: 'HEALTH',
      date: addDays(todayIso, 4),
      start: '09:00',
      end: '12:00',
      location: 'Sick bay',
      organizer: 'Smile Dental Clinic',
      status: 'PLANNED',
      budget: 50000,
      description: 'Free dental screening and tooth-brushing lesson.',
      classIdx: [0, 1, 2],
    },
    {
      title: 'Swimming Lessons (pilot)',
      category: 'SPORTS',
      date: addDays(todayIso, 2),
      start: '14:00',
      end: '15:30',
      location: 'Cercle Sportif pool',
      organizer: 'Mr. Didier Mutabazi (PE)',
      status: 'CANCELLED',
      budget: 300000,
      outcome: 'Cancelled: pool closed for maintenance. To be rescheduled in Term 2.',
      description: 'Pilot swimming programme for P1 and P2.',
      classIdx: [3, 4],
    },
    {
      title: 'End of Term Christmas Party',
      category: 'CELEBRATION',
      date: '2026-11-26',
      start: '10:00',
      end: '13:00',
      location: 'School playground',
      organizer: 'Parents committee',
      status: 'PLANNED',
      budget: 350000,
      description: 'Carols, nativity play by Top Class, gifts and lunch.',
      classIdx: [0, 1, 2, 3, 4],
    },
  ];
  for (const a of activityDefs) {
    const act = await prisma.activity.create({
      data: {
        title: a.title,
        description: a.description,
        category: a.category,
        date: d(a.date),
        startTime: a.start,
        endTime: a.end,
        location: a.location,
        organizer: a.organizer,
        status: a.status,
        budget: a.budget,
        actualCost: a.cost ?? null,
        outcome: a.outcome ?? null,
        termId: term1.id,
        createdById: pick(staff).id,
      },
    });
    await prisma.activityParticipant.createMany({
      data: a.classIdx.map((i) => ({ activityId: act.id, classId: classes[i].id })),
    });
  }

  // ─── Inventory ───
  const categories = await Promise.all(
    [
      ['Stationery', 'Pencils, crayons, exercise books and paper', false],
      ['Toys & Learning Materials', 'Educational toys, puzzles, blocks and charts', false],
      ['Furniture', 'Tables, chairs, shelves and mats', false],
      ['Cleaning Supplies', 'Detergents, brooms, mops and hygiene products', false],
      ['Kitchen & Food', 'Porridge flour, milk, sugar, beans and kitchen items', true],
      ['Uniforms', 'School uniforms, sweaters and sports kits', false],
      ['Electronics', 'Projector, speakers, laptops and tablets', false],
      ['Medical & First Aid', 'First-aid kit items and medicines', true],
    ].map(([name, description, perishable]) =>
      prisma.inventoryCategory.create({
        data: { name: name as string, description: description as string, perishable: perishable as boolean },
      }),
    ),
  );
  const cat = Object.fromEntries(categories.map((c) => [c.name, c.id]));

  const suppliers = await Promise.all(
    [
      [
        'Kigali Stationery Ltd',
        'Patrick Nsengimana',
        '+250788555101',
        'sales@kigalistationery.rw',
        'Nyarugenge, Kigali',
      ],
      ['Edu Toys Rwanda', 'Aline Uwase', '+250788555202', 'hello@edutoys.rw', 'Kimihurura, Kigali'],
      ['Simba Supermarket', 'Customer Service', '+250788555303', 'orders@simba.rw', 'Kicukiro Centre'],
      [
        'Inyange Industries',
        'Jean Pierre Kamanzi',
        '+250788555404',
        'distribution@inyange.rw',
        'Masaka, Kigali',
      ],
      [
        'Pharmacie Conseil',
        'Dr. Sylvie Uwamahoro',
        '+250788555505',
        'contact@pharmaconseil.rw',
        'Remera, Kigali',
      ],
      [
        'Uniform House Rwanda',
        'Gaspard Rutayisire',
        '+250788555606',
        'uniformhouse@gmail.com',
        'Nyabugogo, Kigali',
      ],
    ].map(([name, contactPerson, ph, email, address]) =>
      prisma.supplier.create({ data: { name, contactPerson, phone: ph, email, address } }),
    ),
  );
  const sup = Object.fromEntries(suppliers.map((s) => [s.name.split(' ')[0], s.id]));

  type ItemDef = [
    name: string,
    category: string,
    unit: ItemUnit,
    opening: number,
    reorder: number,
    cost: number,
    supplier: string,
    location: string,
    expiryOffset?: number,
  ];
  const itemDefs: ItemDef[] = [
    ['HB Pencils (box of 12)', 'Stationery', 'BOX', 60, 15, 1500, 'Kigali', 'Store A-1'],
    ['Wax Crayons (12 colours)', 'Stationery', 'PACK', 80, 20, 1200, 'Kigali', 'Store A-1'],
    ['Exercise Books 48 pages', 'Stationery', 'PCS', 400, 100, 300, 'Kigali', 'Store A-2'],
    ['A4 Printing Paper (ream)', 'Stationery', 'PACK', 25, 8, 6500, 'Kigali', 'Office'],
    ['Glue Sticks', 'Stationery', 'PCS', 60, 20, 800, 'Kigali', 'Store A-1'],
    ['Safety Scissors', 'Stationery', 'PCS', 40, 10, 1000, 'Kigali', 'Store A-1'],
    ['Manila Paper (sheets)', 'Stationery', 'PCS', 150, 50, 200, 'Kigali', 'Store A-2'],
    ['Whiteboard Markers', 'Stationery', 'BOX', 12, 5, 7000, 'Kigali', 'Office'],
    ['Building Blocks Set', 'Toys & Learning Materials', 'PCS', 10, 3, 25000, 'Edu', 'Store B-1'],
    ['Wooden Alphabet Puzzle', 'Toys & Learning Materials', 'PCS', 15, 4, 12000, 'Edu', 'Store B-1'],
    ['Counting Beads Frame', 'Toys & Learning Materials', 'PCS', 12, 3, 9000, 'Edu', 'Store B-1'],
    ['Play Dough (tub)', 'Toys & Learning Materials', 'PCS', 30, 12, 2500, 'Edu', 'Store B-2'],
    [
      'Wall Charts (Kinyarwanda alphabet)',
      'Toys & Learning Materials',
      'PCS',
      8,
      2,
      5000,
      'Edu',
      'Store B-2',
    ],
    ['Footballs', 'Toys & Learning Materials', 'PCS', 6, 2, 15000, 'Edu', 'Sports room'],
    ['Skipping Ropes', 'Toys & Learning Materials', 'PCS', 20, 5, 2000, 'Edu', 'Sports room'],
    ['Children Chairs (plastic)', 'Furniture', 'PCS', 120, 10, 8000, 'Edu', 'Classrooms'],
    ['Children Tables (6-seat)', 'Furniture', 'PCS', 22, 2, 45000, 'Edu', 'Classrooms'],
    ['Nap Mats', 'Furniture', 'PCS', 45, 10, 6000, 'Edu', 'Nursery rest room'],
    ['Bookshelf', 'Furniture', 'PCS', 5, 1, 85000, 'Edu', 'Library'],
    ['Liquid Soap (5 L)', 'Cleaning Supplies', 'LITRE', 40, 15, 1800, 'Simba', 'Store C-1'],
    ['Toilet Paper (pack of 10)', 'Cleaning Supplies', 'PACK', 30, 10, 4500, 'Simba', 'Store C-1'],
    ['Floor Detergent', 'Cleaning Supplies', 'LITRE', 25, 10, 2200, 'Simba', 'Store C-1'],
    ['Brooms', 'Cleaning Supplies', 'PCS', 10, 4, 2500, 'Simba', 'Store C-2'],
    ['Hand Sanitizer (500 ml)', 'Cleaning Supplies', 'PCS', 24, 10, 3000, 'Pharmacie', 'Store C-1'],
    ['Porridge Flour (Sosoma)', 'Kitchen & Food', 'KG', 150, 40, 1400, 'Simba', 'Kitchen store', 90],
    ['Fresh Milk (Inyange)', 'Kitchen & Food', 'LITRE', 60, 30, 900, 'Inyange', 'Kitchen fridge', 5],
    ['Sugar', 'Kitchen & Food', 'KG', 40, 15, 1600, 'Simba', 'Kitchen store', 300],
    ['Beans', 'Kitchen & Food', 'KG', 80, 25, 1100, 'Simba', 'Kitchen store', 200],
    ['Rice', 'Kitchen & Food', 'KG', 70, 25, 1500, 'Simba', 'Kitchen store', 250],
    ['Cooking Oil', 'Kitchen & Food', 'LITRE', 20, 8, 3200, 'Simba', 'Kitchen store', 150],
    ['Biscuits (carton)', 'Kitchen & Food', 'BOX', 10, 4, 12000, 'Simba', 'Kitchen store', 20],
    ['School Uniform – Nursery', 'Uniforms', 'PCS', 40, 10, 9000, 'Uniform', 'Office store'],
    ['School Uniform – Primary', 'Uniforms', 'PCS', 35, 10, 11000, 'Uniform', 'Office store'],
    ['School Sweaters', 'Uniforms', 'PCS', 30, 10, 8500, 'Uniform', 'Office store'],
    ['Sports T-shirts', 'Uniforms', 'PCS', 50, 15, 5000, 'Uniform', 'Office store'],
    ['Projector', 'Electronics', 'PCS', 1, 0, 450000, 'Kigali', 'Office'],
    ['Bluetooth Speaker', 'Electronics', 'PCS', 2, 1, 60000, 'Kigali', 'Office'],
    ['Tablets for Learning', 'Electronics', 'PCS', 10, 2, 120000, 'Kigali', 'Office'],
    ['Paracetamol Syrup (children)', 'Medical & First Aid', 'PCS', 12, 5, 2500, 'Pharmacie', 'Sick bay', 180],
    ['Plasters (box)', 'Medical & First Aid', 'BOX', 10, 4, 3000, 'Pharmacie', 'Sick bay', 400],
    ['Antiseptic Solution', 'Medical & First Aid', 'PCS', 8, 3, 4000, 'Pharmacie', 'Sick bay', -3],
    ['ORS Sachets', 'Medical & First Aid', 'PCS', 30, 10, 300, 'Pharmacie', 'Sick bay', 25],
  ];

  const openingDate = '2026-08-10';
  const issueDays = days.slice().reverse();
  for (const [
    idx,
    [name, category, unit, opening, reorder, cost, supplierKey, location, expiryOffset],
  ] of itemDefs.entries()) {
    const item = await prisma.inventoryItem.create({
      data: {
        sku: `INV-${String(idx + 1).padStart(5, '0')}`,
        name,
        categoryId: cat[category],
        unit,
        quantity: 0,
        reorderLevel: reorder,
        unitCost: cost,
        location,
        condition: 'NEW',
        expiryDate: expiryOffset !== undefined ? d(addDays(todayIso, expiryOffset)) : null,
        supplierId: sup[supplierKey],
        createdById: superAdmin.id,
        createdAt: at(openingDate, 9),
      },
    });
    let qty = 0;
    const movements: {
      type: MovementType;
      quantity: number;
      date: string;
      reason?: string;
      reference?: string;
      issuedTo?: string;
      issuedClassId?: number;
      supplierId?: number;
      unitCost: number;
    }[] = [];
    const add = (m: (typeof movements)[number]) => {
      const delta =
        m.type === 'IN' || m.type === 'RETURN'
          ? m.quantity
          : m.type === 'ADJUSTMENT'
            ? m.quantity
            : -m.quantity;
      if (qty + delta < 0) return;
      qty += delta;
      movements.push(m);
    };
    add({
      type: 'IN',
      quantity: opening,
      date: openingDate,
      reason: 'Opening stock – purchase for Term 1',
      reference: `PO-2026-${String(idx + 1).padStart(3, '0')}`,
      supplierId: sup[supplierKey],
      unitCost: cost,
    });

    const consumable =
      ['Stationery', 'Cleaning Supplies', 'Kitchen & Food', 'Medical & First Aid', 'Uniforms'].includes(
        category,
      ) || name.includes('Play Dough');
    if (consumable) {
      // Consume enough over the month that a handful of items end up low.
      const target =
        idx % 5 === 0
          ? opening - reorder + int(1, Math.max(1, reorder))
          : Math.floor(opening * (0.3 + rand() * 0.35));
      let consumed = 0;
      const perIssue = Math.max(1, Math.round(target / 8));
      for (const day of issueDays) {
        if (consumed >= target || rand() < 0.65) continue;
        const q = Math.min(perIssue + int(0, 2), target - consumed);
        if (q <= 0) continue;
        const toKitchen = category === 'Kitchen & Food';
        const cls = pick(classes);
        add({
          type: 'OUT',
          quantity: q,
          date: day,
          reason: toKitchen
            ? 'Daily porridge & lunch'
            : category === 'Cleaning Supplies'
              ? 'Weekly cleaning'
              : 'Class use',
          issuedTo: toKitchen
            ? 'Kitchen – Mama Chantal'
            : category === 'Cleaning Supplies'
              ? 'Cleaner – Jean Damascène'
              : (cls.classTeacherName ?? undefined),
          issuedClassId: toKitchen || category === 'Cleaning Supplies' ? undefined : cls.id,
          unitCost: cost,
        });
        consumed += q;
      }
      if (category === 'Kitchen & Food' && rand() < 0.5) {
        add({
          type: 'IN',
          quantity: Math.round(opening * 0.4),
          date: issueDays[Math.floor(issueDays.length / 2)],
          reason: 'Restock',
          reference: `INV-${int(1000, 9999)}`,
          supplierId: sup[supplierKey],
          unitCost: Math.round(cost * 1.05),
        });
      }
    }
    if (idx % 9 === 3)
      add({
        type: 'DAMAGED',
        quantity: 1,
        date: pick(issueDays),
        reason: 'Broken during class activity',
        unitCost: cost,
      });
    if (idx % 11 === 5)
      add({
        type: 'ADJUSTMENT',
        quantity: -2,
        date: pick(issueDays),
        reason: 'Physical count variance',
        unitCost: cost,
      });
    if (idx === 13)
      add({
        type: 'RETURN',
        quantity: 1,
        date: issueDays[issueDays.length - 3],
        reason: 'Returned after sports day',
        unitCost: cost,
      });
    if (name === 'Paracetamol Syrup (children)')
      add({
        type: 'IN',
        quantity: 6,
        date: issueDays[5],
        reason: 'Donation from Kicukiro Health Centre',
        reference: 'DONATION',
        supplierId: sup['Pharmacie'],
        unitCost: 0,
      });

    movements.sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    for (const m of movements) {
      running +=
        m.type === 'IN' || m.type === 'RETURN'
          ? m.quantity
          : m.type === 'ADJUSTMENT'
            ? m.quantity
            : -m.quantity;
      await prisma.stockMovement.create({
        data: {
          itemId: item.id,
          type: m.type,
          quantity: m.quantity,
          balanceAfter: running,
          unitCost: m.unitCost,
          reason: m.reason,
          reference: m.reference,
          issuedTo: m.issuedTo,
          issuedClassId: m.issuedClassId,
          supplierId: m.supplierId,
          date: d(m.date),
          userId: pick(staff).id,
          createdAt: at(m.date, int(8, 16), int(0, 59)),
        },
      });
    }
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { quantity: running, condition: idx % 9 === 3 ? 'GOOD' : 'NEW' },
    });
  }

  // ─── Library ───
  const bookCats = await Promise.all(
    [
      'Story Books',
      'Picture Books',
      'Early Reading',
      'Mathematics',
      'Science & Nature',
      'Religion',
      'Kinyarwanda',
      'Teacher Guides',
    ].map((name) => prisma.bookCategory.create({ data: { name } })),
  );
  const bc = Object.fromEntries(bookCats.map((c) => [c.name, c.id]));
  type BookDef = [
    title: string,
    author: string,
    category: string,
    age: string,
    language: string,
    copies: number,
    publisher?: string,
    year?: number,
  ];
  const bookDefs: BookDef[] = [
    ['The Very Hungry Caterpillar', 'Eric Carle', 'Picture Books', '3-5', 'English', 3, 'Puffin', 1969],
    [
      'Brown Bear, Brown Bear, What Do You See?',
      'Bill Martin Jr.',
      'Picture Books',
      '3-5',
      'English',
      2,
      'Henry Holt',
      1967,
    ],
    ["Handa's Surprise", 'Eileen Browne', 'Picture Books', '3-6', 'English', 3, 'Walker Books', 1994],
    [
      'Where the Wild Things Are',
      'Maurice Sendak',
      'Picture Books',
      '4-7',
      'English',
      2,
      'Harper & Row',
      1963,
    ],
    [
      'Goodnight Moon',
      'Margaret Wise Brown',
      'Picture Books',
      '3-5',
      'English',
      2,
      'Harper & Brothers',
      1947,
    ],
    ['The Gruffalo', 'Julia Donaldson', 'Story Books', '4-7', 'English', 3, 'Macmillan', 1999],
    ['Room on the Broom', 'Julia Donaldson', 'Story Books', '4-7', 'English', 2, 'Macmillan', 2001],
    [
      'Anansi and the Moss-Covered Rock',
      'Eric A. Kimmel',
      'Story Books',
      '5-8',
      'English',
      2,
      'Holiday House',
      1988,
    ],
    [
      "Mama Panya's Pancakes",
      'Mary & Rich Chamberlin',
      'Story Books',
      '5-8',
      'English',
      2,
      'Barefoot Books',
      2005,
    ],
    ['A Chair for My Mother', 'Vera B. Williams', 'Story Books', '5-8', 'English', 1, 'Greenwillow', 1982],
    ['Abiyoyo', 'Pete Seeger', 'Story Books', '4-7', 'English', 2, 'Macmillan', 1986],
    [
      "Why Mosquitoes Buzz in People's Ears",
      'Verna Aardema',
      'Story Books',
      '5-8',
      'English',
      2,
      'Dial Press',
      1975,
    ],
    ['The Snowy Day', 'Ezra Jack Keats', 'Story Books', '3-6', 'English', 1, 'Viking', 1962],
    ['Not So Fast Songololo', 'Niki Daly', 'Story Books', '4-7', 'English', 2, 'Frances Lincoln', 1985],
    ["Emeka's Gift", 'Ifeoma Onyefulu', 'Mathematics', '4-7', 'English', 2, 'Frances Lincoln', 1995],
    ['Ten Black Dots', 'Donald Crews', 'Mathematics', '3-6', 'English', 2, 'Greenwillow', 1968],
    [
      'Chicka Chicka 1, 2, 3',
      'Bill Martin Jr.',
      'Mathematics',
      '3-6',
      'English',
      2,
      'Simon & Schuster',
      2004,
    ],
    ['My First Number Book', 'DK', 'Mathematics', '3-5', 'English', 3, 'Dorling Kindersley', 2012],
    ['Shapes All Around', 'Sarah Lee', 'Mathematics', '4-6', 'English', 2, 'Pan African Press', 2018],
    ["Let's Count to 100", 'Masayuki Sebe', 'Mathematics', '4-7', 'English', 1, 'Kids Can Press', 2011],
    ['From Seed to Plant', 'Gail Gibbons', 'Science & Nature', '5-8', 'English', 2, 'Holiday House', 1991],
    ['Animals of Africa', 'Jinny Johnson', 'Science & Nature', '5-8', 'English', 2, 'Franklin Watts', 2014],
    [
      'What Happens to a Hamburger?',
      'Paul Showers',
      'Science & Nature',
      '6-8',
      'English',
      1,
      'HarperCollins',
      2001,
    ],
    ['The Tiny Seed', 'Eric Carle', 'Science & Nature', '4-7', 'English', 2, 'Simon & Schuster', 1970],
    ['Gorillas of Rwanda', 'Rwanda Education Board', 'Science & Nature', '5-8', 'English', 3, 'REB', 2019],
    [
      'Water Everywhere',
      'Christina Wilsdon',
      'Science & Nature',
      '5-8',
      'English',
      1,
      'National Geographic',
      2016,
    ],
    ['My First Bible Stories', 'Tim Dowley', 'Religion', '4-8', 'English', 2, 'Candle Books', 2008],
    ["Noah's Ark", 'Peter Spier', 'Religion', '3-7', 'English', 1, 'Doubleday', 1977],
    ["Children's Prayers", 'Lois Rock', 'Religion', '4-8', 'English', 2, 'Lion Hudson', 2004],
    [
      'Inkuru za Kera (Old Tales)',
      'Mureke Dusome',
      'Kinyarwanda',
      '5-8',
      'Kinyarwanda',
      3,
      'Mureke Dusome',
      2017,
    ],
    [
      "Umukobwa n'Intare",
      'Save the Children',
      'Kinyarwanda',
      '5-8',
      'Kinyarwanda',
      2,
      'Save the Children',
      2016,
    ],
    ["Imbeba n'Injangwe", 'Bakame Editions', 'Kinyarwanda', '4-7', 'Kinyarwanda', 2, 'Bakame Editions', 2015],
    ['Ndabara 1 kugeza 10', 'REB', 'Kinyarwanda', '3-6', 'Kinyarwanda', 3, 'REB', 2020],
    ['Inyuguti Zanjye (My Letters)', 'REB', 'Kinyarwanda', '3-6', 'Kinyarwanda', 3, 'REB', 2020],
    ['Bakame na Impyisi', 'Bakame Editions', 'Kinyarwanda', '5-8', 'Kinyarwanda', 2, 'Bakame Editions', 2014],
    ['Twige Gusoma P1', 'REB', 'Kinyarwanda', '6-7', 'Kinyarwanda', 4, 'REB', 2021],
    [
      'Oxford Reading Tree Level 1',
      'Roderick Hunt',
      'Early Reading',
      '4-6',
      'English',
      3,
      'Oxford University Press',
      2011,
    ],
    [
      'Oxford Reading Tree Level 2',
      'Roderick Hunt',
      'Early Reading',
      '5-7',
      'English',
      3,
      'Oxford University Press',
      2011,
    ],
    [
      'Oxford Reading Tree Level 3',
      'Roderick Hunt',
      'Early Reading',
      '6-8',
      'English',
      2,
      'Oxford University Press',
      2011,
    ],
    ['Jolly Phonics Pupil Book 1', 'Sue Lloyd', 'Early Reading', '4-6', 'English', 4, 'Jolly Learning', 2010],
    ['Jolly Phonics Pupil Book 2', 'Sue Lloyd', 'Early Reading', '5-7', 'English', 3, 'Jolly Learning', 2010],
    ['Green Eggs and Ham', 'Dr. Seuss', 'Early Reading', '5-8', 'English', 2, 'Random House', 1960],
    ['The Cat in the Hat', 'Dr. Seuss', 'Early Reading', '5-8', 'English', 2, 'Random House', 1957],
    [
      'Le Petit Chaperon Rouge',
      'Charles Perrault',
      'Story Books',
      '5-8',
      'French',
      1,
      'Gallimard Jeunesse',
      2010,
    ],
    ['Mon Imagier', 'Nathan', 'Picture Books', '3-5', 'French', 2, 'Nathan', 2015],
    ["English P1 Teacher's Guide", 'REB', 'Teacher Guides', 'Teacher', 'English', 1, 'REB', 2020],
    ["Mathematics P2 Teacher's Guide", 'REB', 'Teacher Guides', 'Teacher', 'English', 1, 'REB', 2020],
    [
      'Pre-primary Competence-Based Curriculum',
      'REB',
      'Teacher Guides',
      'Teacher',
      'English',
      2,
      'REB',
      2015,
    ],
    [
      'Play-based Learning Activities',
      'VVOB Rwanda',
      'Teacher Guides',
      'Teacher',
      'English',
      1,
      'VVOB',
      2019,
    ],
    [
      'Songs and Rhymes for Nursery',
      'Rwanda Education Board',
      'Teacher Guides',
      'Teacher',
      'English',
      1,
      'REB',
      2018,
    ],
  ];
  const copies: { id: number; bookId: number; teacher: boolean }[] = [];
  let copyNo = 0;
  for (const [
    i,
    [title, author, category, ageLevel, language, n, publisher, publishedYear],
  ] of bookDefs.entries()) {
    const book = await prisma.book.create({
      data: {
        title,
        author,
        publisher,
        publishedYear,
        language,
        ageLevel,
        categoryId: bc[category],
        isbn: `978${String(int(1000000000, 9999999999))}`,
        shelfLocation: `${String.fromCharCode(65 + (i % 6))}-${(i % 4) + 1}`,
        totalCopies: n,
        availableCopies: n,
        createdById: superAdmin.id,
      },
    });
    for (let k = 0; k < n; k++) {
      copyNo++;
      const c = await prisma.bookCopy.create({
        data: {
          bookId: book.id,
          copyCode: `LIB-${String(copyNo).padStart(6, '0')}`,
          condition: rand() < 0.7 ? 'GOOD' : 'NEW',
        },
      });
      copies.push({ id: c.id, bookId: book.id, teacher: category === 'Teacher Guides' });
    }
  }

  // Loans: history (returned), active (borrowed), overdue and one lost.
  const readers = students.filter((s) => [classes[2].id, classes[3].id, classes[4].id].includes(s.classId));
  const studentCopies = copies.filter((c) => !c.teacher);
  const busy = new Set<number>();
  const activePerStudent = new Map<number, number>();
  const makeLoan = async (kind: 'RETURNED' | 'BORROWED' | 'OVERDUE' | 'LOST', issued: string) => {
    const copy =
      studentCopies.find((c) => !busy.has(c.id) && rand() < 0.3) ??
      studentCopies.find((c) => !busy.has(c.id));
    if (!copy) return;
    const candidates = readers.filter((r) => (activePerStudent.get(r.id) ?? 0) < 2);
    const reader = kind === 'RETURNED' ? pick(readers) : pick(candidates);
    const due = addDays(issued, 7);
    const returnedOn = kind === 'RETURNED' ? addDays(issued, int(3, 9)) : null;
    const late = returnedOn && returnedOn > due;
    await prisma.bookLoan.create({
      data: {
        bookCopyId: copy.id,
        studentId: reader.id,
        issuedAt: at(issued, int(9, 15), int(0, 59)),
        dueDate: d(due),
        returnedAt: returnedOn ? at(returnedOn, int(9, 15)) : null,
        status: kind,
        returnCondition: returnedOn ? 'GOOD' : null,
        fine: kind === 'LOST' ? 5000 : 0,
        remark: late ? 'Returned late' : kind === 'LOST' ? 'Parent reported the book lost' : null,
        issuedById: pick(staff).id,
      },
    });
    if (kind !== 'RETURNED') {
      busy.add(copy.id);
      await prisma.bookCopy.update({
        where: { id: copy.id },
        data: { status: kind === 'LOST' ? 'LOST' : 'BORROWED' },
      });
      if (kind !== 'LOST') activePerStudent.set(reader.id, (activePerStudent.get(reader.id) ?? 0) + 1);
    }
  };
  for (let i = 0; i < 45; i++) await makeLoan('RETURNED', pick(days.slice(8)));
  for (let i = 0; i < 12; i++) await makeLoan('BORROWED', pick(days.slice(0, 5)));
  for (let i = 0; i < 5; i++) await makeLoan('OVERDUE', pick(days.slice(9, 18)));
  await makeLoan('LOST', days[20]);
  // A teacher borrowing a guide
  const guide = copies.find((c) => c.teacher);
  if (guide) {
    await prisma.bookLoan.create({
      data: {
        bookCopyId: guide.id,
        borrowerName: 'Mr. Jean Claude Ndayisaba',
        issuedAt: at(days[3], 10),
        dueDate: d(addDays(days[3], 14)),
        status: 'BORROWED',
        issuedById: admin.id,
      },
    });
    await prisma.bookCopy.update({ where: { id: guide.id }, data: { status: 'BORROWED' } });
  }
  // Recompute book counters from copies.
  const books = await prisma.book.findMany({ select: { id: true } });
  for (const b of books) {
    const [total, available] = await Promise.all([
      prisma.bookCopy.count({ where: { bookId: b.id, status: { not: 'LOST' } } }),
      prisma.bookCopy.count({ where: { bookId: b.id, status: 'AVAILABLE' } }),
    ]);
    await prisma.book.update({
      where: { id: b.id },
      data: { totalCopies: total, availableCopies: available },
    });
  }

  // ─── Notifications & audit trail samples ───
  const low = await prisma.$queryRaw<
    { id: number; name: string; quantity: number }[]
  >`SELECT id, name, quantity FROM InventoryItem WHERE quantity <= reorderLevel`;
  const overdue = await prisma.bookLoan.count({ where: { status: 'OVERDUE' } });
  for (const u of staff) {
    await prisma.notification.createMany({
      data: [
        {
          userId: u.id,
          type: 'LOW_STOCK',
          title: storedPlural(
            low.length,
            '{count} item at or below reorder level',
            '{count} items at or below reorder level',
          ),
          message: low
            .slice(0, 5)
            .map((i) => `${i.name} (${i.quantity})`)
            .join(', '),
          link: '/inventory?lowStock=true',
          dedupeKey: `low-stock-daily:${todayIso}`,
        },
        {
          userId: u.id,
          type: 'OVERDUE',
          title: storedPlural(
            overdue,
            '{count} library book is overdue',
            '{count} library books are overdue',
          ),
          message: storedText('Please follow up with the pupils and their parents.'),
          link: '/library/loans?status=OVERDUE',
          dedupeKey: `overdue:${todayIso}`,
        },
        {
          userId: u.id,
          type: 'EXPIRY',
          title: storedText('Food and medical items expiring soon'),
          message: 'Fresh Milk, Biscuits, ORS sachets, Antiseptic Solution',
          link: '/inventory?expiring=true',
          dedupeKey: `expiry-daily:${todayIso}`,
        },
        {
          userId: u.id,
          type: 'INFO',
          title: storedText('Welcome to the School Management System'),
          message: storedText('Explore the dashboard, register students and take daily attendance.'),
          link: '/dashboard',
          isRead: true,
        },
      ],
    });
  }
  await prisma.auditLog.createMany({
    data: [
      {
        userId: superAdmin.id,
        action: 'CREATE',
        entity: 'AcademicYear',
        entityId: String(year.id),
        newValues: { name: year.name },
      },
      {
        userId: superAdmin.id,
        action: 'UPDATE',
        entity: 'SchoolSettings',
        entityId: '1',
        oldValues: { name: 'My School' },
        newValues: { name: 'Little Stars Nursery & Primary School' },
      },
      { userId: admin.id, action: 'LOGIN', entity: 'User', entityId: String(admin.id), ip: '127.0.0.1' },
    ],
  });

  const counts = {
    students: await prisma.student.count(),
    guardians: await prisma.guardian.count(),
    attendance: await prisma.attendance.count(),
    assessments: await prisma.assessment.count(),
    marks: await prisma.mark.count(),
    activities: await prisma.activity.count(),
    items: await prisma.inventoryItem.count(),
    movements: await prisma.stockMovement.count(),
    books: await prisma.book.count(),
    copies: await prisma.bookCopy.count(),
    loans: await prisma.bookLoan.count(),
  };
  console.log('Seed complete:', counts);
  console.log('\nLogins (change these passwords after first sign-in!):');
  console.log('  Super admin: superadmin@school.rw / SuperAdmin@123');
  console.log('  Admin:       admin@school.rw / Admin@123');
  console.log(
    `  Teacher:     ${todayIso.slice(2, 4)}TR001 / Teacher@123   (registration number login; ${todayIso.slice(2, 4)}TR004 and ${todayIso.slice(2, 4)}TA001 are pending activation)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
