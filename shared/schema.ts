import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, decimal, integer, boolean, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users - wallet-based authentication
export const users = pgTable("users", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: text("wallet_address").notNull().unique(),
  username: text("username").notNull().unique(),
  bio: text("bio"),
  profileImagePath: text("profile_image_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Posts - encrypted content with pay-to-reveal
export const posts = pgTable("posts", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: text("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),

  // Media storage
  encryptedMediaPath: text("encrypted_media_path").notNull(),
  blurredThumbnailPath: text("blurred_thumbnail_path").notNull(),
  mediaType: text("media_type").notNull(), // 'image' or 'video'

  // Encryption - symmetric key encrypted with master key, IV, and auth tag
  encryptedKey: text("encrypted_key").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),

  // Pricing
  price: decimal("price", { precision: 18, scale: 6 }).notNull(), // Base price in USD equivalent
  isFree: boolean("is_free").default(false).notNull(),
  buyoutPrice: decimal("buyout_price", { precision: 18, scale: 6 }), // Optional buyout price
  acceptedCryptos: text("accepted_cryptos").notNull().default('USDC'), // Comma-separated: USDC,SOL,ETH,MATIC
  
  // Investor settings
  maxInvestors: integer("max_investors").default(10).notNull(), // 1-100 investor slots
  investorRevenueShare: decimal("investor_revenue_share", { precision: 5, scale: 2 }).default('0').notNull(), // Percentage (0-100) that investors get from each unlock

  // Comments gating
  commentsLocked: boolean("comments_locked").default(false).notNull(),
  commentFee: decimal("comment_fee", { precision: 18, scale: 6 }),

  // Engagement metrics
  viewCount: integer("view_count").default(0).notNull(),
  upvoteCount: integer("upvote_count").default(0).notNull(),
  downvoteCount: integer("downvote_count").default(0).notNull(),

  // Viral tracking
  isViral: boolean("is_viral").default(false).notNull(),
  viralDetectedAt: timestamp("viral_detected_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Payments - ledger of x402 payments for content access
export const payments = pgTable("payments", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 18, scale: 6 }).notNull(),
  cryptocurrency: text("cryptocurrency").notNull().default('USDC'), // USDC, SOL, ETH, MATIC
  network: text("network").notNull().default('base-sepolia'), // base-sepolia, solana-devnet, polygon-mumbai
  isBuyout: boolean("is_buyout").default(false).notNull(),

  // x402 payment details
  transactionHash: text("transaction_hash"),
  paymentType: text("payment_type").notNull(), // 'content' or 'comment'

  paidAt: timestamp("paid_at").defaultNow().notNull(),
}, (table) => ({
  // Prevent duplicate payments
  uniqueUserPost: unique().on(table.userId, table.postId, table.paymentType),
}));

// Comments - with optional payment gating
export const comments = pgTable("comments", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  likeCount: integer("like_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Comment Likes - users can like comments
export const commentLikes = pgTable("comment_likes", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: text("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // One like per user per comment
  uniqueUserCommentLike: unique().on(table.userId, table.commentId),
}));

// Votes - upvotes and downvotes
export const votes = pgTable("votes", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  voteType: text("vote_type").notNull(), // 'up' or 'down'
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // One vote per user per post
  uniqueUserPostVote: unique().on(table.userId, table.postId),
}));

// Referral Codes
export const referralCodes = pgTable('referral_codes', {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text('code').unique().notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }).notNull(),
  maxUses: integer('max_uses').default(0), // 0 means unlimited
  currentUses: integer('current_uses').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
});

// Referrals - track who referred whom
export const referrals = pgTable('referrals', {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: text("referrer_id").notNull().references(() => users.id, { onDelete: 'cascade' }).notNull(),
  referredId: text("referred_id").notNull().references(() => users.id, { onDelete: 'cascade' }).notNull(),
  referralCodeId: text("referral_code_id").references(() => referralCodes.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // Ensure a user can only be referred once
  referredUnique: unique().on(table.referredId),
}));


// Viral notifications - track when creators are notified about viral posts
export const viralNotifications = pgTable("viral_notifications", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  notifiedAt: timestamp("notified_at").defaultNow().notNull(),
  viewsAtNotification: integer("views_at_notification").notNull(),
  upvotesAtNotification: integer("upvotes_at_notification").notNull(),
});

// Follows - social graph
export const follows = pgTable("follows", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  followerId: text("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  followingId: text("following_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueFollow: unique().on(table.followerId, table.followingId),
}));

// Notifications
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'like', 'comment', 'purchase', 'view_milestone', 'comment_unlock', 'follow'
  actorId: text("actor_id").references(() => users.id, { onDelete: "cascade" }), // Who triggered the notification
  postId: text("post_id").references(() => posts.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Direct Messages - for creator-buyer communication
export const directMessages = pgTable("direct_messages", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: text("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiverId: text("receiver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: text("post_id").references(() => posts.id, { onDelete: "cascade" }), // Optional: link to post
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Investor Tracking Schema
export const investors = pgTable("investors", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  position: integer("position").notNull(), // 1-100 (based on post's maxInvestors setting)
  investmentAmount: decimal("investment_amount", { precision: 18, scale: 6 }).notNull(), // Price they paid
  totalEarnings: decimal("total_earnings", { precision: 18, scale: 6 }).notNull().default(sql`0.0`), // Accumulated earnings
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Prevent duplicate investors for a post
  uniqueInvestorPost: unique().on(table.postId, table.userId),
  // Ensure only one investor per position for a post
  uniquePositionPost: unique().on(table.postId, table.position),
}));

// Platform Fees - Track all TEASR platform fees (0.05 USDC per transaction)
export const platformFees = pgTable("platform_fees", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 18, scale: 6 }).notNull(), // Always 0.05 USDC
  cryptocurrency: text("cryptocurrency").notNull().default('USDC'),
  transactionHash: text("transaction_hash"), // Hash of fee transfer to platform wallet
  platformWallet: text("platform_wallet").notNull().default('0x47aB5ba5f987A8f75f8Ef2F0D8FF33De1A04a020'),
  status: text("status").notNull().default('pending'), // 'pending', 'completed', 'failed'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Pinned Posts - users can pin top-earning posts to their profile
export const pinnedPosts = pgTable("pinned_posts", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Prevent duplicate pins
  uniqueUserPost: unique().on(table.userId, table.postId),
}));


// Relations
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  payments: many(payments),
  comments: many(comments),
  votes: many(votes),
  followers: many(follows, { relationName: 'following' }),
  following: many(follows, { relationName: 'follower' }),
  notifications: many(notifications),
  sentMessages: many(directMessages, { relationName: 'sender' }),
  receivedMessages: many(directMessages, { relationName: 'receiver' }),
  referralCodes: many(referralCodes),
  referralsMade: many(referrals, { relationName: 'referrer' }),
  referralsReceived: many(referrals, { relationName: 'referred' }),
  investments: many(investors),
  pinnedPosts: many(pinnedPosts),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  creator: one(users, {
    fields: [posts.creatorId],
    references: [users.id],
  }),
  payments: many(payments),
  comments: many(comments),
  votes: many(votes),
  viralNotifications: many(viralNotifications),
  notifications: many(notifications),
  investors: many(investors),
  pinnedBy: many(pinnedPosts),
  platformFees: many(platformFees),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
  post: one(posts, {
    fields: [payments.postId],
    references: [posts.id],
  }),
  platformFees: many(platformFees),
}));

export const platformFeesRelations = relations(platformFees, ({ one }) => ({
  payment: one(payments, {
    fields: [platformFees.paymentId],
    references: [payments.id],
  }),
  post: one(posts, {
    fields: [platformFees.postId],
    references: [posts.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, {
    fields: [comments.postId],
    references: [posts.id],
  }),
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
  likes: many(commentLikes),
}));

export const commentLikesRelations = relations(commentLikes, ({ one }) => ({
  comment: one(comments, {
    fields: [commentLikes.commentId],
    references: [comments.id],
  }),
  user: one(users, {
    fields: [commentLikes.userId],
    references: [users.id],
  }),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  post: one(posts, {
    fields: [votes.postId],
    references: [posts.id],
  }),
  user: one(users, {
    fields: [votes.userId],
    references: [users.id],
  }),
}));

// Referral relations
export const referralCodesRelations = relations(referralCodes, ({ one, many }) => ({
  user: one(users, {
    fields: [referralCodes.userId],
    references: [users.id],
  }),
  referrals: many(referrals),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(users, {
    fields: [referrals.referrerId],
    references: [users.id],
    relationName: 'referrer',
  }),
  referred: one(users, {
    fields: [referrals.referredId],
    references: [users.id],
    relationName: 'referred',
  }),
  referralCode: one(referralCodes, {
    fields: [referrals.referralCodeId],
    references: [referralCodes.id],
  }),
}));


export const viralNotificationsRelations = relations(viralNotifications, ({ one }) => ({
  post: one(posts, {
    fields: [viralNotifications.postId],
    references: [posts.id],
  }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, {
    fields: [follows.followerId],
    references: [users.id],
    relationName: 'follower',
  }),
  following: one(users, {
    fields: [follows.followingId],
    references: [users.id],
    relationName: 'following',
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
    relationName: 'actor',
  }),
  post: one(posts, {
    fields: [notifications.postId],
    references: [posts.id],
  }),
}));

export const directMessagesRelations = relations(directMessages, ({ one }) => ({
  sender: one(users, {
    fields: [directMessages.senderId],
    references: [users.id],
    relationName: 'sender',
  }),
  receiver: one(users, {
    fields: [directMessages.receiverId],
    references: [users.id],
    relationName: 'receiver',
  }),
  post: one(posts, {
    fields: [directMessages.postId],
    references: [posts.id],
  }),
}));

export const investorsRelations = relations(investors, ({ one }) => ({
  user: one(users, {
    fields: [investors.userId],
    references: [users.id],
  }),
  post: one(posts, {
    fields: [investors.postId],
    references: [posts.id],
  }),
}));

export const pinnedPostsRelations = relations(pinnedPosts, ({ one }) => ({
  user: one(users, {
    fields: [pinnedPosts.userId],
    references: [users.id],
  }),
  post: one(posts, {
    fields: [pinnedPosts.postId],
    references: [posts.id],
  }),
}));

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  walletAddress: true,
  username: true,
  bio: true,
  profileImagePath: true,
});

export const insertPostSchema = createInsertSchema(posts).pick({
  creatorId: true,
  title: true,
  description: true,
  encryptedMediaPath: true,
  blurredThumbnailPath: true,
  mediaType: true,
  encryptedKey: true,
  iv: true,
  authTag: true,
  price: true,
  commentsLocked: true,
  commentFee: true,
}).extend({
  price: z.string().regex(/^\d+(\.\d{1,6})?$/, "Invalid price format"),
  isFree: z.boolean().optional(),
  buyoutPrice: z.string().regex(/^\d+(\.\d{1,6})?$/, "Invalid price format").optional(),
  acceptedCryptos: z.string().optional(),
  commentFee: z.string().regex(/^\d+(\.\d{1,6})?$/, "Invalid price format").optional(),
  maxInvestors: z.number().min(1).max(100).optional(),
  investorRevenueShare: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid percentage format").optional(),
});

export const insertPaymentSchema = createInsertSchema(payments).pick({
  userId: true,
  postId: true,
  amount: true,
  cryptocurrency: true,
  network: true,
  isBuyout: true,
  transactionHash: true,
  paymentType: true,
});

export const insertCommentSchema = createInsertSchema(comments).pick({
  postId: true,
  userId: true,
  content: true,
}).extend({
  content: z.string().min(1).max(1000),
});

export const insertVoteSchema = createInsertSchema(votes).pick({
  postId: true,
  userId: true,
  voteType: true,
}).extend({
  voteType: z.enum(['up', 'down']),
});

export const insertNotificationSchema = createInsertSchema(notifications).pick({
  userId: true,
  type: true,
  actorId: true,
  postId: true,
  message: true,
});

// Referral Zod Schemas
export const insertReferralCodeSchema = createInsertSchema(referralCodes).pick({
  code: true,
  userId: true,
  maxUses: true,
  expiresAt: true,
});

export const insertReferralSchema = createInsertSchema(referrals).pick({
  referrerId: true,
  referredId: true,
  referralCodeId: true,
});

export const insertInvestorSchema = createInsertSchema(investors).pick({
  postId: true,
  userId: true,
  position: true,
  investmentAmount: true,
}).extend({
  investmentAmount: z.string().regex(/^\d+(\.\d{1,6})?$/, "Invalid amount format"),
  totalEarnings: z.string().regex(/^\d+(\.\d{1,6})?$/, "Invalid earnings format").optional(),
});

export const insertPinnedPostSchema = createInsertSchema(pinnedPosts).pick({
  userId: true,
  postId: true,
});

// TypeScript types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;

export type CommentLike = typeof commentLikes.$inferSelect;
export type InsertCommentLike = typeof commentLikes.$inferInsert;

export type Vote = typeof votes.$inferSelect;
export type InsertVote = typeof votes.$inferInsert;

export type ReferralCode = typeof referralCodes.$inferSelect;
export type InsertReferralCode = typeof referralCodes.$inferInsert;

export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = typeof referrals.$inferInsert;

export interface ReferralStats {
  totalReferrals: number;
  activeReferralCodes: number;
  referralEarnings: number;
}

export interface ReferralCodeWithStats extends ReferralCode {
  referralCount: number;
}

export type ViralNotification = typeof viralNotifications.$inferSelect;

export type Follow = typeof follows.$inferSelect;
export type InsertFollow = typeof follows.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

export type NotificationWithActor = Notification & {
  actor: User | null;
  post: Post | null;
};

export type DirectMessage = typeof directMessages.$inferSelect;
export type InsertDirectMessage = typeof directMessages.$inferInsert;

export type DirectMessageWithUsers = DirectMessage & {
  sender: User;
  receiver: User;
  post: Post | null;
};

// Investor types
export type Investor = typeof investors.$inferSelect;
export type InsertInvestor = z.infer<typeof insertInvestorSchema>;

// Platform fee types
export type PlatformFee = typeof platformFees.$inferSelect;
export type InsertPlatformFee = typeof platformFees.$inferInsert;

// Pinned post types
export type PinnedPost = typeof pinnedPosts.$inferSelect;
export type InsertPinnedPost = z.infer<typeof insertPinnedPostSchema>;

// Extended types with relations for frontend
export type PostWithCreator = Post & {
  creator: User;
  hasUserPaid?: boolean;
  hasUserVoted?: 'up' | 'down' | null;
  commentCount?: number;
  investorCount?: number;
  userInvestorPosition?: number | null;
};

export interface InvestorEarning {
  postId: string;
  postTitle: string;
  position: number;
  earningsGenerated: string;
  totalUnlocks: number;
  investmentAmount: string;
}

export interface InvestorDashboard {
  totalEarnings: string;
  investments: InvestorEarning[];
}

export type CommentWithUser = Comment & {
  user: User;
  hasUserLiked?: boolean;
};

export type UserWithStats = User & {
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  isFollowing?: boolean;
  referralCode?: ReferralCode | null;
  referralStats?: ReferralStats;
  investorPosition?: number | null; // Added for investor specific data
  totalInvestedAmount?: string;
  totalEarnings?: string;
};

export type ReferralCodeExtended = ReferralCode & {
  user: User;
  referrals: Referral[];
};