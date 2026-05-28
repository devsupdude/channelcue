import { mutation, query } from "./_generated/server.js";
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

export const getUserAccess = query({
  args: {
    userId: v.string()
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("userAccess")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .unique();

    return doc
      ? {
          trialStartedAt: doc.trialStartedAt ?? null,
          subscriptionActive: doc.subscriptionActive,
          subscriptionEndsAt: doc.subscriptionEndsAt ?? null,
          accessOverride: doc.accessOverride ?? "none",
          defaultGoogleAccess: doc.defaultGoogleAccess ?? false
        }
      : {
          trialStartedAt: null,
          subscriptionActive: false,
          subscriptionEndsAt: null,
          accessOverride: "none",
          defaultGoogleAccess: false
        };
  }
});

export const startUserTrial = mutation({
  args: {
    userId: v.string(),
    trialStartedAt: v.string()
  },
  handler: async (ctx, args) => {
    const updatedAt = new Date().toISOString();
    const existing = await ctx.db
      .query("userAccess")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        trialStartedAt: existing.trialStartedAt || args.trialStartedAt,
        updatedAt
      });
    } else {
      await ctx.db.insert("userAccess", {
        userId: args.userId,
        trialStartedAt: args.trialStartedAt,
        subscriptionActive: false,
        updatedAt
      });
    }
    return null;
  }
});

export const setSubscriptionActive = mutation({
  args: {
    userId: v.string(),
    subscriptionActive: v.boolean(),
    subscriptionEndsAt: v.optional(v.union(v.string(), v.null())),
    accessOverride: v.optional(v.string()),
    defaultGoogleAccess: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const updatedAt = new Date().toISOString();
    const existing = await ctx.db
      .query("userAccess")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      const patch = {
        subscriptionActive: args.subscriptionActive,
        updatedAt
      };
      if (args.subscriptionEndsAt !== undefined) patch.subscriptionEndsAt = args.subscriptionEndsAt || undefined;
      if (args.accessOverride !== undefined) patch.accessOverride = args.accessOverride;
      if (args.defaultGoogleAccess !== undefined) patch.defaultGoogleAccess = args.defaultGoogleAccess;
      await ctx.db.patch(existing._id, patch);
    } else {
      const doc = {
        userId: args.userId,
        subscriptionActive: args.subscriptionActive,
        updatedAt
      };
      if (args.subscriptionEndsAt) doc.subscriptionEndsAt = args.subscriptionEndsAt;
      if (args.accessOverride) doc.accessOverride = args.accessOverride;
      if (args.defaultGoogleAccess !== undefined) doc.defaultGoogleAccess = args.defaultGoogleAccess;
      await ctx.db.insert("userAccess", doc);
    }
    return null;
  }
});

export const getSession = query({
  args: {
    sid: v.string()
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("appSessions")
      .withIndex("by_sid", q => q.eq("sid", args.sid))
      .unique();

    if (!doc) return null;
    if (doc.expiresAt <= Date.now()) return null;
    return doc.data;
  }
});

export const setSession = mutation({
  args: {
    sid: v.string(),
    data: v.any(),
    expiresAt: v.number()
  },
  handler: async (ctx, args) => {
    const updatedAt = new Date().toISOString();
    const existing = await ctx.db
      .query("appSessions")
      .withIndex("by_sid", q => q.eq("sid", args.sid))
      .unique();

    const doc = {
      sid: args.sid,
      data: args.data,
      expiresAt: args.expiresAt,
      updatedAt
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
    } else {
      await ctx.db.insert("appSessions", doc);
    }
    return null;
  }
});

export const destroySession = mutation({
  args: {
    sid: v.string()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("appSessions")
      .withIndex("by_sid", q => q.eq("sid", args.sid))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  }
});

export const getIndex = query({
  args: {
    userId: v.string()
  },
  handler: async (ctx, args) => {
    const uniqueById = items => {
      const seen = new Set();
      const unique = [];
      for (const item of items || []) {
        const id = item?.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        unique.push(item);
      }
      return unique;
    };

    const metaDoc = await ctx.db
      .query("videoIndexMetas")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .unique();

    if (metaDoc) {
      const activeBatchId = metaDoc.meta?.batchId;
      const chunks = activeBatchId
        ? await ctx.db
            .query("videoIndexChunks")
            .withIndex("by_user_batch", q => q.eq("userId", args.userId).eq("batchId", activeBatchId))
            .collect()
        : await ctx.db
            .query("videoIndexChunks")
            .withIndex("by_user", q => q.eq("userId", args.userId))
            .collect();

      const byKind = kind => {
        const matchingChunks = chunks
          .filter(chunk => {
            const fromActiveBatch = activeBatchId
              ? chunk.batchId === activeBatchId
              : !chunk.batchId;
            return chunk.kind === kind && fromActiveBatch;
          })
          .sort((a, b) => a.chunkIndex - b.chunkIndex)
          .flatMap(chunk => chunk.items || []);
        return uniqueById(matchingChunks);
      };

      return {
        ...metaDoc.meta,
        channels: byKind("channels"),
        videos: byKind("videos")
      };
    }

    const doc = await ctx.db
      .query("videoIndexes")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .unique();
    return doc?.index ?? null;
  }
});

export const replaceIndexStart = mutation({
  args: {
    userId: v.string(),
    meta: v.any()
  },
  handler: async (ctx, args) => {
    const updatedAt = new Date().toISOString();
    const chunks = await ctx.db
      .query("videoIndexChunks")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .collect();

    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    const existing = await ctx.db
      .query("videoIndexMetas")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { meta: args.meta, updatedAt });
    } else {
      await ctx.db.insert("videoIndexMetas", {
        userId: args.userId,
        meta: args.meta,
        updatedAt
      });
    }
    return null;
  }
});

export const setIndexChunk = mutation({
  args: {
    userId: v.string(),
    batchId: v.optional(v.string()),
    kind: v.string(),
    chunkIndex: v.number(),
    items: v.any()
  },
  handler: async (ctx, args) => {
    const updatedAt = new Date().toISOString();
    const existing = args.batchId
      ? await ctx.db
          .query("videoIndexChunks")
          .withIndex("by_user_batch_kind_chunk", q =>
            q
              .eq("userId", args.userId)
              .eq("batchId", args.batchId)
              .eq("kind", args.kind)
              .eq("chunkIndex", args.chunkIndex)
          )
          .unique()
      : await ctx.db
          .query("videoIndexChunks")
          .withIndex("by_user_kind_chunk", q =>
            q.eq("userId", args.userId).eq("kind", args.kind).eq("chunkIndex", args.chunkIndex)
          )
          .unique();

    const doc = {
      userId: args.userId,
      kind: args.kind,
      chunkIndex: args.chunkIndex,
      items: args.items,
      updatedAt
    };
    if (args.batchId) doc.batchId = args.batchId;

    if (existing) {
      await ctx.db.patch(existing._id, doc);
    } else {
      await ctx.db.insert("videoIndexChunks", doc);
    }
    return null;
  }
});

export const commitIndex = mutation({
  args: {
    userId: v.string(),
    batchId: v.string(),
    meta: v.any()
  },
  handler: async (ctx, args) => {
    const updatedAt = new Date().toISOString();
    const existing = await ctx.db
      .query("videoIndexMetas")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .unique();

    const nextMeta = {
      ...args.meta,
      batchId: args.batchId,
      status: "complete"
    };

    if (existing) {
      await ctx.db.patch(existing._id, { meta: nextMeta, updatedAt });
    } else {
      await ctx.db.insert("videoIndexMetas", {
        userId: args.userId,
        meta: nextMeta,
        updatedAt
      });
    }

    const staleChunks = await ctx.db
      .query("videoIndexChunks")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .collect();
    for (const chunk of staleChunks) {
      if (chunk.batchId !== args.batchId) {
        await ctx.db.delete(chunk._id);
      }
    }
    return null;
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
