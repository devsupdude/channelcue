import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";

export const getConfigValue = query({
  args: {
    userId: v.string(),
    key: v.string()
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("appConfig")
      .withIndex("by_user_key", q => q.eq("userId", args.userId).eq("key", args.key))
      .unique();
    return doc?.value ?? null;
  }
});

export const setConfigValues = mutation({
  args: {
    userId: v.string(),
    values: v.record(v.string(), v.string())
  },
  handler: async (ctx, args) => {
    const updatedAt = new Date().toISOString();
    for (const [key, value] of Object.entries(args.values)) {
      const existing = await ctx.db
        .query("appConfig")
        .withIndex("by_user_key", q => q.eq("userId", args.userId).eq("key", key))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { value, updatedAt });
      } else {
        await ctx.db.insert("appConfig", {
          userId: args.userId,
          key,
          value,
          updatedAt
        });
      }
    }
    return null;
  }
});

export const getIndex = query({
  args: {
    userId: v.string()
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("videoIndexes")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .unique();
    return doc?.index ?? null;
  }
});

export const setIndex = mutation({
  args: {
    userId: v.string(),
    index: v.any()
  },
  handler: async (ctx, args) => {
    const updatedAt = new Date().toISOString();
    const existing = await ctx.db
      .query("videoIndexes")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { index: args.index, updatedAt });
    } else {
      await ctx.db.insert("videoIndexes", {
        userId: args.userId,
        index: args.index,
        updatedAt
      });
    }
    return null;
  }
});
