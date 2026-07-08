-- Check student class status
SELECT COUNT(*) as students_without_class FROM "User" WHERE role = 'student' AND "classId" IS NULL;
SELECT id, name, "gradeLevel" FROM "Class" ORDER BY name;
