import { prisma } from "@/lib/prisma"

const JABATAN_STAF = ["Staff", "Staf", "Koordinator", "Bendahara", "Sekretaris", "Ketua"]
const JABATAN_KEPALA = ["Kepala Divisi", "Kepala Bagian"]
const JABATAN_MANAGER = ["Manager", "Manajer", "Direktur"]

type KaryawanInfo = {
  jabatan: string | null
  divisi_id: number | null
  subdivisi_id: number | null
}

function jabatanContains(jabatan: string | null | undefined, candidates: string[]): boolean {
  const value = (jabatan ?? "").toLowerCase()
  return candidates.some(candidate => value.includes(candidate.toLowerCase()))
}

export async function getBawahanIds(karyawanId: number | bigint, recursive = true): Promise<bigint[]> {
  const rows = await prisma.karyawans.findMany({
    where: {
      OR: [
        { status_karyawan: null },
        { status_karyawan: { notIn: ["Pensiun", "Nonaktif"] } },
      ],
    },
    select: { id: true, atasan_id: true },
  })

  const rootId = BigInt(karyawanId)
  const byAtasan = new Map<string, bigint[]>()
  rows.forEach(row => {
    if (!row.atasan_id) return
    const key = row.atasan_id.toString()
    byAtasan.set(key, [...(byAtasan.get(key) ?? []), row.id])
  })

  const result: bigint[] = []
  const queue = [...(byAtasan.get(rootId.toString()) ?? [])]
  while (queue.length > 0) {
    const current = queue.shift()!
    result.push(current)
    if (recursive) queue.push(...(byAtasan.get(current.toString()) ?? []))
  }
  return result
}

export async function getBawahanPenilaianIds(karyawanId: number | bigint): Promise<bigint[]> {
  const rows = await prisma.$queryRaw<KaryawanInfo[]>`
    SELECT jabatan, divisi_id, subdivisi_id
    FROM karyawans
    WHERE id = ${BigInt(karyawanId)}
    LIMIT 1
  `
  const info = rows[0]
  if (!info) return []

  if (jabatanContains(info.jabatan, JABATAN_MANAGER)) {
    const result = await prisma.karyawans.findMany({
      where: {
        jabatan: { in: JABATAN_KEPALA },
        id: { not: BigInt(karyawanId) },
        OR: [
          { status_karyawan: null },
          { status_karyawan: { notIn: ["Pensiun", "Nonaktif"] } },
        ],
      },
      select: { id: true },
    })
    if (result.length > 0) return result.map(row => row.id)
  }

  if (jabatanContains(info.jabatan, JABATAN_KEPALA)) {
    const orFilters = [
      ...(info.subdivisi_id ? [{ subdivisi_id: info.subdivisi_id }] : []),
      ...(info.divisi_id ? [{ divisi_id: info.divisi_id }] : []),
      { atasan_id: BigInt(karyawanId) },
    ]

    const result = await prisma.karyawans.findMany({
      where: {
        OR: orFilters,
        jabatan: { in: JABATAN_STAF },
        id: { not: BigInt(karyawanId) },
        AND: [
          {
            OR: [
              { status_karyawan: null },
              { status_karyawan: { notIn: ["Pensiun", "Nonaktif"] } },
            ],
          },
        ],
      },
      select: { id: true },
    })
    if (result.length > 0) return result.map(row => row.id)
  }

  return getBawahanIds(karyawanId, true)
}

export async function getBawahanPenilaianMultiLevelIds(karyawanId: number | bigint): Promise<bigint[]> {
  const level1 = await getBawahanPenilaianIds(karyawanId)
  const allIds = new Set(level1.map(id => id.toString()))

  for (const id of level1) {
    const level2 = await getBawahanPenilaianIds(id)
    level2.forEach(id2 => allIds.add(id2.toString()))
  }

  if (allIds.size === 0) {
    const fallback = await getBawahanIds(karyawanId, true)
    fallback.forEach(id => allIds.add(id.toString()))
  }

  return Array.from(allIds).map(id => BigInt(id))
}
