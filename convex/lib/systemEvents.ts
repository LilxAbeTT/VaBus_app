import type { DatabaseWriter } from '../_generated/server'

export async function recordSystemEvent(
  db: DatabaseWriter,
  {
    category,
    title,
    description,
    actorName,
    actorRole,
    targetType,
    targetId,
  }: {
    category: 'service' | 'driver' | 'vehicle' | 'route' | 'stop'
    title: string
    description: string
    actorName?: string
    actorRole?: 'driver' | 'admin'
    targetType?: 'service' | 'driver' | 'vehicle' | 'route' | 'stop'
    targetId?: string
  },
) {
  await db.insert('systemEvents', {
    category,
    title,
    description,
    actorName,
    actorRole,
    targetType,
    targetId,
    createdAt: new Date().toISOString(),
  })
}
