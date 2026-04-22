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
    />
  );
};

export default StudentsView;
