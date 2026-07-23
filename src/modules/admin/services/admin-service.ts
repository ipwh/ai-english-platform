// v5: Admin Service — wraps repository calls for admin routes
import {
  listClasses, createClass, deleteClass, findClassByName,
  listAllUsers, countUsers, findUserById, findUserByIdSelect,
  updateUser, deleteUser, createTeacherClass, listTeacherClasses, findTeacherClass,
  getAdminStats, cleanupMockData, ensureAdmin,
  listLoginLogs, createLoginLog, getStudentAnalytics,
  listAllClasses, listUsersAdmin, findUserByEmail, createUser, upsertClass,
} from '@/modules/student/repositories/user-repo';

export { listClasses, createClass, deleteClass, findClassByName, listAllClasses };
export { listAllUsers, countUsers, findUserById, findUserByIdSelect, updateUser, deleteUser, listUsersAdmin, findUserByEmail, createUser, upsertClass };
export { createTeacherClass, listTeacherClasses, findTeacherClass };
export { getAdminStats, cleanupMockData, ensureAdmin, listLoginLogs, createLoginLog };
export { getStudentAnalytics };
