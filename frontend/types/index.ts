export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'TEACHER';
export type Gender = 'MALE' | 'FEMALE';
export type ClassLevel = 'NURSERY' | 'PRIMARY';
export type Grade = 'BABY' | 'MIDDLE' | 'TOP' | 'P1' | 'P2';
export type StudentStatus = 'ACTIVE' | 'TRANSFERRED' | 'GRADUATED' | 'WITHDRAWN';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'SICK';
export type ActivityCategory =
  'SPORTS' | 'TRIP' | 'CELEBRATION' | 'CULTURAL' | 'ACADEMIC' | 'HEALTH' | 'PARENT_MEETING' | 'OTHER';
export type ActivityStatus = 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
export type ItemUnit = 'PCS' | 'BOX' | 'KG' | 'LITRE' | 'PACK';
export type ItemCondition = 'NEW' | 'GOOD' | 'DAMAGED';
export type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT' | 'DAMAGED' | 'RETURN';
export type CopyCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED';
export type CopyStatus = 'AVAILABLE' | 'BORROWED' | 'LOST' | 'DAMAGED';
export type LoanStatus = 'BORROWED' | 'RETURNED' | 'OVERDUE' | 'LOST';

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  avatar: string | null;
  lastLoginAt: string | null;
  regNumber: string | null;
  post: string | null;
  activatedAt: string | null;
  /** Dashboard widgets this user tracks; null = all (default). */
  dashboardWidgets: string[] | null;
  createdAt: string;
}

export interface SchoolSettings {
  id: number;
  name: string;
  logo: string | null;
  motto: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  currency: string;
  timezone: string;
  locale: 'en' | 'fr' | 'rw';
  admissionPrefix: string;
  allowWeekendAttendance: boolean;
  chronicAbsenceThreshold: number;
  loanPeriodDays: number;
  maxBooksPerStudent: number;
  overdueFinePerDay: number;
  lostBookFine: number;
}

export interface Term {
  id: number;
  academicYearId: number;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  academicYear?: { id: number; name: string };
}

export interface AcademicYear {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  terms: Term[];
}

export interface Holiday {
  id: number;
  name: string;
  date: string;
}

export interface SchoolClass {
  id: number;
  name: string;
  level: ClassLevel;
  grade: Grade;
  section: string | null;
  capacity: number;
  classTeacherName: string | null;
  room: string | null;
  studentCount: number;
  availableSeats: number;
  boys?: number;
  girls?: number;
}

export interface Guardian {
  id: number;
  fullName: string;
  relationship: string;
  phone: string;
  altPhone: string | null;
  email: string | null;
  occupation: string | null;
  address: string | null;
  nationalId: string | null;
  isEmergencyContact: boolean;
  canPickUp: boolean;
  isPrimary?: boolean;
}

export interface StudentListItem {
  id: number;
  admissionNumber: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  dateOfBirth: string;
  photo: string | null;
  status: StudentStatus;
  admissionDate: string;
  allergies: string | null;
  deletedAt: string | null;
  currentClass: { id: number; name: string; grade: Grade; level: ClassLevel } | null;
  primaryGuardian: { id: number; fullName: string; phone: string; relationship: string } | null;
}

export interface Student extends Omit<StudentListItem, 'primaryGuardian' | 'currentClass'> {
  nationality: string | null;
  address: string | null;
  bloodGroup: string | null;
  medicalNotes: string | null;
  specialNeeds: string | null;
  previousSchool: string | null;
  statusReason: string | null;
  currentClassId: number | null;
  currentClass: SchoolClass | null;
  guardians: Guardian[];
  enrollments: {
    id: number;
    enrolledAt: string;
    note: string | null;
    class: { id: number; name: string };
    academicYear: { id: number; name: string };
  }[];
  age: number;
  stats: {
    attendanceRate: number | null;
    daysRecorded: number;
    byStatus: Partial<Record<AttendanceStatus, number>>;
    activeLoans: number;
    activities: number;
  };
}

export interface AttendanceRecord {
  id: number;
  studentId: number;
  classId: number;
  date: string;
  status: AttendanceStatus;
  arrivalTime: string | null;
  pickedUpBy: string | null;
  remark: string | null;
  recordedBy?: { firstName: string; lastName: string } | null;
  class?: { name: string };
}

export interface ActivityListItem {
  id: number;
  title: string;
  description: string | null;
  category: ActivityCategory;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  organizer: string | null;
  status: ActivityStatus;
  budget: number | null;
  actualCost: number | null;
  outcome: string | null;
  termId: number | null;
  classes: { id: number; name: string }[];
  studentCount: number;
  photoCount: number;
}

export interface Activity extends Omit<ActivityListItem, 'classes' | 'studentCount' | 'photoCount'> {
  term: { id: number; name: string } | null;
  classes: { id: number; name: string }[];
  students: { id: number; firstName: string; lastName: string; photo: string | null; admissionNumber: string }[];
  photos: { id: number; url: string; caption: string | null }[];
  totalParticipants: number;
}

export interface InventoryCategory {
  id: number;
  name: string;
  description: string | null;
  perishable: boolean;
  itemCount: number;
}

export interface Supplier {
  id: number;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  itemCount?: number;
}

export interface InventoryItem {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  categoryId: number;
  unit: ItemUnit;
  quantity: number;
  reorderLevel: number;
  unitCost: number;
  location: string | null;
  condition: ItemCondition;
  expiryDate: string | null;
  supplierId: number | null;
  image: string | null;
  category: { id: number; name: string; perishable: boolean };
  supplier: { id: number; name: string } | null;
  stockValue: number;
  isLowStock: boolean;
  isExpired: boolean;
  isExpiringSoon: boolean;
}

export interface StockMovement {
  id: number;
  itemId: number;
  type: MovementType;
  quantity: number;
  balanceAfter: number;
  unitCost: number | null;
  reason: string | null;
  reference: string | null;
  issuedTo: string | null;
  issuedClassId: number | null;
  issuedClass: { id: number; name: string } | null;
  date: string;
  createdAt: string;
  user: { firstName: string; lastName: string } | null;
  supplier: { name: string } | null;
  item?: { id: number; name: string; sku: string; unit: ItemUnit };
}

export interface BookCategory {
  id: number;
  name: string;
  description: string | null;
  bookCount: number;
}

export interface Book {
  id: number;
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  publishedYear: number | null;
  language: string | null;
  ageLevel: string | null;
  categoryId: number;
  coverImage: string | null;
  shelfLocation: string | null;
  totalCopies: number;
  availableCopies: number;
  category: { id: number; name: string };
}

export interface BookCopy {
  id: number;
  bookId: number;
  copyCode: string;
  condition: CopyCondition;
  status: CopyStatus;
  currentLoan?: {
    id: number;
    dueDate: string;
    status: LoanStatus;
    student: { id: number; firstName: string; lastName: string } | null;
    borrowerName: string | null;
  } | null;
  book?: { id: number; title: string; author: string | null; coverImage: string | null; ageLevel: string | null };
}

export interface BookDetail extends Book {
  copies: BookCopy[];
  timesBorrowed: number;
  recentLoans: Loan[];
}

export interface Loan {
  id: number;
  bookCopyId: number;
  studentId: number | null;
  borrowerName: string | null;
  issuedAt: string;
  dueDate: string;
  returnedAt: string | null;
  status: LoanStatus;
  fine: number;
  finePaid: boolean;
  returnCondition: CopyCondition | null;
  remark: string | null;
  daysOverdue?: number;
  bookCopy: { copyCode: string; book: { id: number; title: string; author: string | null; coverImage: string | null } };
  student: {
    id: number;
    firstName: string;
    lastName: string;
    admissionNumber?: string;
    photo?: string | null;
    currentClass?: { id: number; name: string } | null;
  } | null;
  issuedBy?: { firstName: string; lastName: string } | null;
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: number;
  userId: number | null;
  action: string;
  entity: string;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: number; firstName: string; lastName: string; email: string; role: Role } | null;
}

export interface ReportColumn {
  key: string;
  header: string;
  format?: 'text' | 'date' | 'money' | 'number' | 'percent' | 'score';
  width?: number;
}

export interface Report {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary?: { label: string; value: string | number }[];
}

export interface Course {
  id: number;
  name: string;
  code: string;
  description: string | null;
  level: ClassLevel | null;
  teacherCount?: number;
  classCount?: number;
}

export interface TeacherAssignment {
  id: number;
  course: { id: number; name: string; code: string };
  class: { id: number; name: string };
}

export interface Teacher {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  regNumber: string;
  post: string;
  postLabel: string;
  isActive: boolean;
  avatar: string | null;
  activatedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  status: 'ACTIVE' | 'PENDING' | 'INACTIVE';
  assignments: TeacherAssignment[];
}

export interface ActivationResult {
  emailSent: boolean;
  sentTo: string;
  /** Only returned when no SMTP server is configured, so the admin can pass it on. */
  link?: string;
}

// ─── Marks ───

export type AssessmentType = 'CLASSWORK' | 'HOMEWORK' | 'QUIZ' | 'TEST' | 'PROJECT' | 'EXAM';

export interface MarkingPair {
  classId: number;
  className: string;
  courseId: number;
  courseName: string;
  courseCode: string;
}

export interface MarksOptions {
  terms: { id: number; name: string; yearName: string; isCurrent: boolean; startDate: string; endDate: string }[];
  currentTermId: number | null;
  pairs: MarkingPair[];
  typeLabels: Record<AssessmentType, string>;
  gradeScale: { min: number; grade: string; remark: string }[];
  passMark: number;
}

export interface Assessment {
  id: number;
  title: string;
  type: AssessmentType;
  date: string;
  maxScore: number;
  description: string | null;
  termId: number;
  classId: number;
  courseId: number;
  markedCount: number;
  rosterSize: number;
  averagePct: number | null;
}

export interface MarkEntry {
  score: number | null;
  absent: boolean;
  remark: string | null;
}

export interface AssessmentSheet extends Assessment {
  className: string;
  courseName: string;
  termName: string;
  students: {
    id: number;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    gender: Gender;
    photo: string | null;
    mark: MarkEntry | null;
  }[];
}
