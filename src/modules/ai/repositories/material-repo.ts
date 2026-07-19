// Sprint 2: Material Repository — RAG materials & chunks
import { db } from '@/shared/db/db';
import type { Prisma } from '@prisma/client';

export async function findMaterialById(id: string) { return db.material.findUnique({ where: { id } }); }
export async function updateMaterial(id: string, data: Prisma.MaterialUpdateInput) { return db.material.update({ where: { id }, data }); }
export async function listMaterials(filters?: Prisma.MaterialWhereInput) { return db.material.findMany({ where: filters ?? {}, orderBy: { createdAt: 'desc' } }); }
export async function createMaterial(data: Prisma.MaterialCreateInput) { return db.material.create({ data }); }
export async function deleteMaterial(id: string) { return db.material.delete({ where: { id } }); }
export async function deleteMaterialChunks(materialId: string) { return db.materialChunk.deleteMany({ where: { materialId } }); }
export async function createMaterialChunk(data: Prisma.MaterialChunkUncheckedCreateInput) { return db.materialChunk.create({ data }); }
export async function findMaterialChunks(materialId: string) { return db.materialChunk.findMany({ where: { materialId }, orderBy: { chunkIndex: 'asc' } }); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function searchChunks(args: any) {
  return db.materialChunk.findMany(args);
}
export async function countMaterials(where?: Prisma.MaterialWhereInput) { return db.material.count({ where }); }
export async function countMaterialChunks(where?: Prisma.MaterialChunkWhereInput) { return db.materialChunk.count({ where }); }

// Raw SQL helpers for pgvector operations (RAG service)
export async function executeRawUnsafe(query: string, ...params: unknown[]) {
  return db.$executeRawUnsafe(query, ...params);
}
export async function queryRawUnsafe<T = unknown>(query: string, ...params: unknown[]): Promise<T[]> {
  return db.$queryRawUnsafe(query, ...params) as Promise<T[]>;
}
