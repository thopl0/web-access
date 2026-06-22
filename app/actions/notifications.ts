"use server";

import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/server/db";
import { verifySession } from "@/lib/server/dal";
import { getNotificationFeed, type NotificationItem } from "@/lib/server/notifications";

/**
 * Open the notifications bell: build the feed (with unread flags computed against the OLD marker, so the
 * dropdown can still highlight what's new this time) and THEN advance the "seen" marker to now, so the
 * badge clears and these items read as read on the next open.
 */
export async function openNotifications(): Promise<{ items: NotificationItem[] }> {
  const { userId } = await verifySession();
  const items = await getNotificationFeed(userId);
  await db
    .update(schema.users)
    .set({ notificationsSeenAt: new Date() })
    .where(eq(schema.users.id, userId));
  return { items };
}
