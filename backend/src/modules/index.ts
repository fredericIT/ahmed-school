import { Router } from 'express';
import type { ApiRouter } from '../utils/router';
import academic from './academic/routes';
import activities from './activities/routes';
import attendance from './attendance/routes';
import audit from './audit/routes';
import auth from './auth/routes';
import classes from './classes/routes';
import courses from './courses/routes';
import dashboard from './dashboard/routes';
import inventory from './inventory/routes';
import library from './library/routes';
import marks from './marks/routes';
import notifications from './notifications/routes';
import reports from './reports/routes';
import search from './search/routes';
import settings from './settings/routes';
import students from './students/routes';
import teachers from './teachers/routes';
import users from './users/routes';

const modules: ApiRouter[] = [
  auth,
  users,
  settings,
  academic,
  classes,
  courses,
  teachers,
  students,
  attendance,
  marks,
  activities,
  inventory,
  library,
  notifications,
  reports,
  dashboard,
  search,
  audit,
];

export function apiRouter(): Router {
  const router = Router();
  for (const m of modules) router.use(m.basePath, m.router);
  return router;
}
