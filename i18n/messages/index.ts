import type { MessageCatalog } from './types';
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
};
