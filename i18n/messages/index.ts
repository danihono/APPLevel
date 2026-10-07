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
import { rdCalendarMessages } from './rd-calendar';
import { rdCheckinMessages } from './rd-checkin';
import { rdClassModalsMessages } from './rd-class-modals';
import { rdEvolutionMessages } from './rd-evolution';
import { rdHomeMessages } from './rd-home';
import { rdNotificationsMessages } from './rd-notifications';
import { rdPreviewMessages } from './rd-preview';
import { rdProfileMessages } from './rd-profile';
import { rdRankingMessages } from './rd-ranking';
import { rdShellMessages } from './rd-shell';
import { rdStaffHomeMessages } from './rd-staff-home';

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
  ...rdCalendarMessages,
  ...rdCheckinMessages,
  ...rdClassModalsMessages,
  ...rdEvolutionMessages,
  ...rdHomeMessages,
  ...rdNotificationsMessages,
  ...rdPreviewMessages,
  ...rdProfileMessages,
  ...rdRankingMessages,
  ...rdShellMessages,
  ...rdStaffHomeMessages,
};
