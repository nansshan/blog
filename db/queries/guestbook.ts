import { desc } from 'drizzle-orm'

import { db } from '~/db'
import { type GuestbookDto, GuestbookHashids } from '~/db/dto/guestbook.dto'
import { guestbook } from '~/db/schema'

export async function fetchGuestbookMessages({
  limit = 200,
}: { limit?: number } = {}) {
  const data = await db
    .select({
      id: guestbook.id,
      userId: guestbook.userId,
      userInfo: guestbook.userInfo,
      message: guestbook.message,
      parentId: guestbook.parentId,
      createdAt: guestbook.createdAt,
    })
    .from(guestbook)
    .orderBy(desc(guestbook.createdAt))
    .limit(limit)

  // Build a map of raw id -> userInfo for parent author lookup
  const userInfoMap = new Map<
    number,
    { firstName?: string | null; lastName?: string | null }
  >()
  for (const item of data) {
    if (item.userInfo) {
      userInfoMap.set(
        item.id,
        item.userInfo as {
          firstName?: string | null
          lastName?: string | null
        }
      )
    }
  }

  return data.map(
    ({ id, parentId, ...rest }) =>
      ({
        ...rest,
        id: GuestbookHashids.encode(id),
        parentId: parentId ? GuestbookHashids.encode(parentId) : null,
        parentUserInfo: parentId
          ? (userInfoMap.get(parentId) ?? null)
          : null,
      } as GuestbookDto)
  )
}
