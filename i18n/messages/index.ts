import type { MessageCatalog } from './types';
import { calendarMessages } from './calendar';
import { reportsMessages } from './reports';
import { financeMessages } from './finance';
import { superadminMessages } from './superadmin';
import { notificationsMessages } from './notifications';
import { studentsMessages } from './students';
import { learningMessages } from './learning';
import { learningEditorMessages } from './learning-editor';
import { attendanceMessages } from './attendance';
import { managementMessages } from './management';
import { classesMessages } from './classes';
import { competitionMessages } from './competition';
import { graduationMessages } from './graduation';
import { dashboardMessages } from './dashboard';
import { homeMessages } from './home';
import { examRulesMessages } from './exam-rules';
import { commitmentMessages } from './commitment';
import { learningAudienceMessages } from './learning-audience';
import { calendarUtilsMessages } from './calendar-utils';
import { classRulesMessages } from './class-rules';
import { beltsMessages } from './belts';
import { profileMessages } from './profile';
import { loginMessages } from './login';
import { layoutMessages } from './layout';
import { appMessages } from './app';
import { commonMessages } from './common';

export const messages: MessageCatalog = {
  ...commonMessages,
  ...appMessages,
  ...layoutMessages,
  ...loginMessages,
  ...profileMessages,
  ...beltsMessages,
  ...classRulesMessages,
  ...calendarUtilsMessages,
  ...learningAudienceMessages,
  ...commitmentMessages,
  ...examRulesMessages,
  ...homeMessages,
  ...dashboardMessages,
  ...graduationMessages,
  ...competitionMessages,
  ...classesMessages,
  ...managementMessages,
  ...attendanceMessages,
  ...learningEditorMessages,
  ...learningMessages,
  ...studentsMessages,
  ...notificationsMessages,
  ...superadminMessages,
  ...financeMessages,
  ...reportsMessages,
  ...calendarMessages,
};
