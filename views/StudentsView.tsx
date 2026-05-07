import React from 'react';
import type { ProgressionRules } from '../beltCatalog';
import StudentRoster from '../components/StudentRoster';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, GraduationApprovalRequestRecord } from '../services/firebase/models';
import type { User } from '../types';

interface StudentsViewProps {
  students: User[];
  deactivatedStudents?: User[];
  progressionRules?: ProgressionRules | null;
  graduationRequests?: Array<FirestoreEntity<GraduationApprovalRequestRecord>>;
  rankingAttendances?: Array<FirestoreEntity<AttendanceRecord>>;
  academyName?: string;
  academies?: Array<{ id: string; name: string }>;
  selectedAcademyId?: string;
  onSelectAcademy?: (academyId: string) => void;
  enableAcademyFilter?: boolean;
  requireAcademySelection?: boolean;
  selectedStudentId?: string;
  onSelectStudent?: (studentId: string) => void;
  onApproveGraduationRequest?: (requestId: string) => Promise<void>;
  onUpdateStudentBeltGrade?: (payload: { userId: string; belt: string; grade: number; stripes?: number; kidsCategory?: string }) => Promise<void>;
  onSetStudentAttendanceBonus?: (payload: { userId: string; attendanceCountBonus: number }) => Promise<void>;
  onAdminUpdateStudentProfile?: (payload: {
    userId: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    cpf?: string;
    birthDate?: string;
    isCompetitor?: boolean;
  }) => Promise<void>;
  onAdminUpdateStudentTimeline?: (payload: {
    userId: string;
    trainingStartDate?: string;
    lastGraduationDateOverride?: string;
    lastStripeDateOverride?: string;
  }) => Promise<void>;
  onAdminUpdateStudentPhoto?: (payload: { userId: string; photoFile: File }) => Promise<void>;
  onDeactivateStudent?: (userId: string) => Promise<void>;
  onActivateStudent?: (userId: string) => Promise<void>;
}

const StudentsView: React.FC<StudentsViewProps> = ({
  students,
  deactivatedStudents = [],
  progressionRules,
  graduationRequests = [],
  rankingAttendances = [],
  academyName,
  academies = [],
  selectedAcademyId = '',
  onSelectAcademy,
  enableAcademyFilter = false,
  requireAcademySelection = false,
  selectedStudentId = '',
  onSelectStudent,
  onApproveGraduationRequest,
  onUpdateStudentBeltGrade,
  onSetStudentAttendanceBonus,
  onAdminUpdateStudentProfile,
  onAdminUpdateStudentTimeline,
  onAdminUpdateStudentPhoto,
  onDeactivateStudent,
  onActivateStudent,
}) => {
  return (
    <StudentRoster
      students={students}
      deactivatedStudents={deactivatedStudents}
      progressionRules={progressionRules}
      graduationRequests={graduationRequests}
      rankingAttendances={rankingAttendances}
      academyName={academyName}
      academies={academies}
      selectedAcademyId={selectedAcademyId}
      onSelectAcademy={onSelectAcademy}
      enableAcademyFilter={enableAcademyFilter}
      requireAcademySelection={requireAcademySelection}
      selectedStudentId={selectedStudentId}
      onSelectStudent={onSelectStudent}
      onApproveGraduationRequest={onApproveGraduationRequest}
      onUpdateStudentBeltGrade={onUpdateStudentBeltGrade}
      onSetStudentAttendanceBonus={onSetStudentAttendanceBonus}
      onAdminUpdateStudentProfile={onAdminUpdateStudentProfile}
      onAdminUpdateStudentTimeline={onAdminUpdateStudentTimeline}
      onAdminUpdateStudentPhoto={onAdminUpdateStudentPhoto}
      onDeactivateStudent={onDeactivateStudent}
      onActivateStudent={onActivateStudent}
    />
  );
};

export default StudentsView;
