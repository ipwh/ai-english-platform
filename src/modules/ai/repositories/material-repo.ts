// Sprint 2: Material Repository — RAG materials & chunks
import { db } from '@/shared/db/db';

export async function findMaterialById(id: string) { return db.material.findUnique({ where: { id } }); }
export async function updateMaterial(id: string, data: any) { return db.material.update({ where: { id }, data }); }
export async function listMaterials(filters?: any) { return db.material.findMany({ where: filters ?? {}, orderBy: { createdAt: 'desc' } }); }
export async function createMaterial(data: any) { return db.material.create({ data }); }
export async function deleteMaterial(id: string) { return db.material.delete({ where: { id } }); }
export async function deleteMaterialChunks(materialId: string) { return db.materialChunk.deleteMany({ where: { materialId } }); }
export async function createMaterialChunk(data: any) { return db.materialChunk.create({ data }); }
export async function findMaterialChunks(materialId: string) { return db.materialChunk.findMany({ where: { materialId }, orderBy: { chunkIndex: 'asc' } }); }
export async function executeRawUnsafe(query: string) { return db.$executeRawUnsafe(query); }
export async function queryRawUnsafe(query: string) { return db.$queryRawUnsafe(query); }
export async function countMaterials(where?: any) { return db.material.count({ where }); }
export async function countMaterialChunks(where?: any) { return db.materialChunk.count({ where }); }
