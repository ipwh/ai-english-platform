// v5: AdminClassRepository — class, assignment, submission, review, material
import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';

export async function adminFindClasses(args: Prisma.ClassFindManyArgs) { return db.class.findMany(args); }
export async function adminCreateClass(args: Prisma.ClassCreateArgs) { return db.class.create(args); }
export async function adminUpsertClass(args: Prisma.ClassUpsertArgs) { return db.class.upsert(args); }
export async function adminDeleteClass(args: Prisma.ClassDeleteArgs) { return db.class.delete(args); }
export async function adminDeleteClasses(args: Prisma.ClassDeleteManyArgs) { return db.class.deleteMany(args); }
export async function adminCountClasses(args?: Prisma.ClassCountArgs) { return db.class.count(args as any); }

export async function adminFindAssignments(args: Prisma.AssignmentFindManyArgs) { return db.assignment.findMany(args); }
export async function adminFindAssignment(args: Prisma.AssignmentFindUniqueArgs) { return db.assignment.findUnique(args); }
export async function adminCreateAssignment(args: Prisma.AssignmentCreateArgs) { return db.assignment.create(args); }
export async function adminDeleteAssignments(args: Prisma.AssignmentDeleteManyArgs) { return db.assignment.deleteMany(args); }
export async function adminCountAssignments(args?: Prisma.AssignmentCountArgs) { return db.assignment.count(args as any); }

export async function adminFindSubmissions(args: Prisma.SubmissionFindManyArgs) { return db.submission.findMany(args); }
export async function adminFindSubmission(args: Prisma.SubmissionFindFirstArgs) { return db.submission.findFirst(args); }
export async function adminUpdateSubmission(args: Prisma.SubmissionUpdateArgs) { return db.submission.update(args); }
export async function adminDeleteSubmissions(args: Prisma.SubmissionDeleteManyArgs) { return db.submission.deleteMany(args); }
export async function adminCountSubmissions(args?: Prisma.SubmissionCountArgs) { return db.submission.count(args as any); }

export async function adminFindReview(args: Prisma.ReviewFindFirstArgs) { return db.review.findFirst(args); }
export async function adminCreateReview(args: Prisma.ReviewCreateArgs) { return db.review.create(args); }
export async function adminDeleteReviews(args: Prisma.ReviewDeleteManyArgs) { return db.review.deleteMany(args); }

export async function adminFindMaterial(args: Prisma.MaterialFindUniqueArgs) { return db.material.findUnique(args); }
export async function adminCreateMaterial(args: Prisma.MaterialCreateArgs) { return db.material.create(args); }
export async function adminDeleteMaterials(args: Prisma.MaterialDeleteManyArgs) { return db.material.deleteMany(args); }
