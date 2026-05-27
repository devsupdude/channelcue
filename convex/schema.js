import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  appConfig: defineTable({
    userId: v.string(),
    key: v.string(),
    value: v.string(),
    updatedAt: v.string()
  }).index("by_user_key", ["userId", "key"]),
  videoIndexes: defineTable({
    userId: v.string(),
    index: v.any(),
    updatedAt: v.string()
  }).index("by_user", ["userId"])
});
