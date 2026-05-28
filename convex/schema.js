import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  appConfig: defineTable({
    userId: v.string(),
    key: v.string(),
    value: v.string(),
    updatedAt: v.string()
  }).index("by_user_key", ["userId", "key"]),
  appSessions: defineTable({
    sid: v.string(),
    data: v.any(),
    expiresAt: v.number(),
    updatedAt: v.string()
  }).index("by_sid", ["sid"]),
  videoIndexes: defineTable({
    userId: v.string(),
    index: v.any(),
    updatedAt: v.string()
  }).index("by_user", ["userId"]),
  videoIndexMetas: defineTable({
    userId: v.string(),
    meta: v.any(),
    updatedAt: v.string()
  }).index("by_user", ["userId"]),
  videoIndexChunks: defineTable({
    userId: v.string(),
    batchId: v.optional(v.string()),
    kind: v.string(),
    chunkIndex: v.number(),
    items: v.any(),
    updatedAt: v.string()
  })
    .index("by_user", ["userId"])
    .index("by_user_batch", ["userId", "batchId"])
    .index("by_user_kind_chunk", ["userId", "kind", "chunkIndex"])
    .index("by_user_batch_kind_chunk", ["userId", "batchId", "kind", "chunkIndex"])
});
