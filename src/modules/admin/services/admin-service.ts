// v5: Admin Service — re-exports the admin-facing user/class operations.
//
// 2026-10-08: reaches the student domain through its FACADE, not through
// `student/repositories/user-repo` — a service must never import another domain's
// repository (architecture rule "Services do not import repositories from other
// domains"). The admin module owns no data of its own here; it exposes what the
// student domain already publishes.
import {
  listClasses, createClass, deleteClass, findClassByName,
  listAllUsers, countUsers, findUserById, findUserByIdSelect,
  updateUser, deleteUser, createTeacherClass, listTeacherClasses, findTeacherClass,
  getAdminStats, cleanupMockData, ensureAdmin,
  listLoginLogs, createLoginLog, getStudentAnalytics,
  listAllClasses, listUsersAdmin, findUserByEmail, createUser, upsertClass,
} from '@/modules/student';

export { listClasses, createClass, deleteClass, findClassByName, listAllClasses };
export { listAllUsers, countUsers, findUserById, findUserByIdSelect, updateUser, deleteUser, listUsersAdmin, findUserByEmail, createUser, upsertClass };
export { createTeacherClass, listTeacherClasses, findTeacherClass };
export { getAdminStats, cleanupMockData, ensureAdmin, listLoginLogs, createLoginLog };
export { getStudentAnalytics };
