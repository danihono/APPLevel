import React from 'react';
import LearningAdminView from './learning/LearningAdminView';
import LearningPlayerView from './learning/LearningPlayerView';
import type { LearningHubHandlers, LearningPlayerHandlers } from './learning/learningHandlers';
import type {
  CourseEntity,
  LessonBlockEntity,
  LessonEntity,
  ProgressEntity,
  QuizEntity,
  TrackEntity,
} from './learning/learningShared';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AcademyRecord, UserRecord } from '../services/firebase/models';
import { UserRole } from '../types';

interface LearningHubViewProps extends LearningHubHandlers, LearningPlayerHandlers {
  academyName: string;
  userName: string;
  /** Visão ativa (o superadmin pode simular a visão de professor). */
  userRole?: UserRole;
  /** Papel real do usuário logado, usado para o filtro de público-alvo. */
  viewerRole?: string;
  viewerBelt?: string;
  selectedAcademyId?: string;
  selectedAcademy?: FirestoreEntity<AcademyRecord> | null;
  academies?: Array<FirestoreEntity<AcademyRecord>>;
  allUsers?: Array<FirestoreEntity<UserRecord>>;
  academyUsers?: Array<FirestoreEntity<UserRecord>>;
  tracks: TrackEntity[];
  courses: CourseEntity[];
  lessons: LessonEntity[];
  lessonBlocks: LessonBlockEntity[];
  quizzes: QuizEntity[];
  progressRecords: ProgressEntity[];
  onSelectAcademy?: (academyId: string) => void;
}

/**
 * Casca do Learning Hub: separa o CMS do superadmin do player de quem consome.
 * A implementação de cada lado vive em `views/learning/`.
 */
const LearningHubView: React.FC<LearningHubViewProps> = (props) => {
  const {
    academyName,
    userName,
    userRole,
    viewerRole,
    viewerBelt,
    selectedAcademyId,
    selectedAcademy,
    academies = [],
    allUsers = [],
    academyUsers = [],
    tracks,
    courses,
    lessons,
    lessonBlocks,
    quizzes,
    progressRecords,
    onSelectAcademy,
    onUpsertTrack,
    onUpsertCourse,
    onUpsertLesson,
    onDeleteTrack,
    onDeleteCourse,
    onDeleteLesson,
    onBackfillAudience,
    onReplaceLessonBlocks,
    onUpsertQuiz,
    onUploadLearningAsset,
    onRecordPlayback,
    onMarkBlockComplete,
    onStartQuiz,
    onSubmitQuiz,
  } = props;

  if (userRole === UserRole.SUPERADMIN) {
    return (
      <LearningAdminView
        selectedAcademyId={selectedAcademyId}
        selectedAcademy={selectedAcademy}
        academies={academies}
        allUsers={allUsers}
        academyUsers={academyUsers}
        tracks={tracks}
        courses={courses}
        lessons={lessons}
        lessonBlocks={lessonBlocks}
        quizzes={quizzes}
        progressRecords={progressRecords}
        onSelectAcademy={onSelectAcademy}
        onUpsertTrack={onUpsertTrack}
        onUpsertCourse={onUpsertCourse}
        onUpsertLesson={onUpsertLesson}
        onDeleteTrack={onDeleteTrack}
        onDeleteCourse={onDeleteCourse}
        onDeleteLesson={onDeleteLesson}
        onBackfillAudience={onBackfillAudience}
        onReplaceLessonBlocks={onReplaceLessonBlocks}
        onUpsertQuiz={onUpsertQuiz}
        onUploadLearningAsset={onUploadLearningAsset}
      />
    );
  }

  return (
    <LearningPlayerView
      academyName={academyName}
      userName={userName}
      viewerRole={viewerRole}
      viewerBelt={viewerBelt}
      tracks={tracks}
      courses={courses}
      lessons={lessons}
      lessonBlocks={lessonBlocks}
      progressRecords={progressRecords}
      onRecordPlayback={onRecordPlayback}
      onMarkBlockComplete={onMarkBlockComplete}
      onStartQuiz={onStartQuiz}
      onSubmitQuiz={onSubmitQuiz}
    />
  );
};

export default LearningHubView;
