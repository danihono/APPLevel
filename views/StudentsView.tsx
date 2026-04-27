import React from 'react';
import StudentRoster from '../components/StudentRoster';
import type { FirestoreEntity } from '../services/firebase/data';
import type { GraduationApprovalRequestRecord } from '../services/firebase/models';
import type { User } from '../types';

interface StudentsViewProps {
  students: User[];
  graduationRequests?: Array<FirestoreEntity<GraduationApprovalRequestRecord>>;
  academyName?: string;
  academies?: Array<{ id: string; name: string }>;
  selectedAcademyId?: string;
  onSelectAcademy?: (academyId: string) => void;
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
}

const StudentsView: React.FC<StudentsViewProps> = ({
  students,
  graduationRequests = [],
  academyName,
  academies = [],
  selectedAcademyId = '',
  onSelectAcademy,
  requireAcademySelection = false,
  selectedStudentId = '',
  onSelectStudent,
  onApproveGraduationRequest,
  onUpdateStudentBeltGrade,
  onSetStudentAttendanceBonus,
  onAdminUpdateStudentProfile,
  onAdminUpdateStudentTimeline,
}) => {
  return (
    <StudentRoster
      students={students}
      graduationRequests={graduationRequests}
      academyName={academyName}
      academies={academies}
      selectedAcademyId={selectedAcademyId}
      onSelectAcademy={onSelectAcademy}
      requireAcademySelection={requireAcademySelection}
      selectedStudentId={selectedStudentId}
      onSelectStudent={onSelectStudent}
      onApproveGraduationRequest={onApproveGraduationRequest}
      onUpdateStudentBeltGrade={onUpdateStudentBeltGrade}
      onSetStudentAttendanceBonus={onSetStudentAttendanceBonus}
      onAdminUpdateStudentProfile={onAdminUpdateStudentProfile}
      onAdminUpdateStudentTimeline={onAdminUpdateStudentTimeline}
    />
  );
};

export default StudentsView;
