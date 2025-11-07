// This file implements database operations for a social media platform, including user management, posts, payments, notifications, direct messages, and now, a referral system.
// Using javascript_database blueprint pattern - DatabaseStorage implementation
import {
  users,
  posts,
  payments,
  comments,
  votes,
  viralNotifications,
  follows,
  notifications,
  directMessages,
  referralCodes as referralCodesTable, // Added for referral system, aliased to avoid naming conflict
  referrals, // Added for referral system
  investors,
  pinnedPosts,
  type User,
  type InsertUser,
  type Post,
  type InsertPost,
  type Payment,
  type InsertPayment,
  type Comment,
  type InsertComment,
  type Vote,
  type InsertVote,
  type PostWithCreator,
  type CommentWithUser,
  type Notification,
  type InsertNotification,
  type NotificationWithActor,
  type DirectMessage,
  type InsertDirectMessage,
  type DirectMessageWithUsers,
  type ReferralCode, // Added for referral system
  type Referral, // Added for referral system
  type ReferralCodeWithStats, // Added for referral system
  type ReferralStats, // Added for referral system
  type UserWithStats, // Assuming this type exists and includes referralCode
  type Investor,
  type InsertInvestor,
  type InvestorEarning,
  type InvestorDashboard,
  type PinnedPost,
  type InsertPinnedPost,
} from "@shared/schema";
import { db, pool } from './db';
import { eq, and, desc, sql, inArray, or } from 'drizzle-orm';
import crypto from 'crypto'; // Import crypto for random bytes generation

// Helper function to retry database operations
async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      // Retry on connection errors
      if (error.code === '57P01' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        console.log(`Database connection error, retrying (${i + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByWalletAddress(walletAddress: string): Promise<User | undefined>;
  getUserByWallet(walletAddress: string): Promise<User | undefined>; // Added function signature
  getUserByUsername(username: string): Promise<User | undefined>; // Added function signature
  createUser(user: InsertUser): Promise<User>;
  searchUsers(query: string): Promise<User[]>; // Added for user search

  // Posts
  getPost(id: string): Promise<Post | undefined>;
  getPostWithCreator(id: string, userId?: string): Promise<PostWithCreator | undefined>;
  getAllPostsWithCreators(userId?: string): Promise<PostWithCreator[]>;
  createPost(post: InsertPost): Promise<Post>;
  incrementViewCount(postId: string): Promise<void>;
  markPostViral(postId: string): Promise<void>;

  // Payments
  createPayment(payment: InsertPayment): Promise<Payment>;
  hasUserPaid(userId: string, postId: string, paymentType: string): Promise<boolean>;
  getUserRecentPayments(userId: string, limit?: number): Promise<any[]>; // Added user-specific method
  getRecentPayments(limit: number): Promise<any[]>;
  getTotalRevenue(): Promise<string>;
  hasUserPaidForAnyContent(payerId: string, creatorId: string): Promise<boolean>; // Added for checking if user paid for any content from another user

  // Comments
  createComment(comment: InsertComment): Promise<Comment>;
  getCommentsByPost(postId: string): Promise<CommentWithUser[]>;

  // Votes
  createOrUpdateVote(vote: InsertVote): Promise<Vote>;
  getUserVote(userId: string, postId: string): Promise<Vote | undefined>;
  deleteVote(userId: string, postId: string): Promise<void>;

  // User Profile & Follows
  getUserProfile(username: string, currentUserId?: string): Promise<UserWithStats | null>; // Added function signature, updated return type
  updateUserProfile(userId: string, data: { username?: string; bio?: string | null; profileImagePath?: string | null }): Promise<User | undefined>; // Added function signature
  toggleFollow(followerId: string, followingId: string): Promise<{ following: boolean }>; // Added function signature

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: string, limit?: number): Promise<NotificationWithActor[]>;
  markNotificationAsRead(notificationId: string): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  // Direct Messages
  createDirectMessage(data: InsertDirectMessage): Promise<DirectMessage>;
  getMessagesBetweenUsers(userId1: string, userId2: string): Promise<DirectMessageWithUsers[]>;
  getUserConversations(userId: string): Promise<any[]>;
  markMessagesAsRead(receiverId: string, senderId: string): Promise<void>;
  getUnreadMessageCount(userId: string): Promise<number>;
  getUserById(userId: string): Promise<User | null>;

  // Admin
  getAdminStats(): Promise<any>;
  getViralPosts(): Promise<any[]>; // Changed return type to any[]
  getUserViralPosts(userId: string): Promise<any[]>; // Added user-specific method

  // Added method signature
  getUsersWhoPaidForContent(creatorId: string): Promise<User[]>;

  // Revenue methods
  getPostRevenue(postId: string): Promise<string>;
  getUserTotalRevenue(userId: string): Promise<string>;

  // Referral Methods (Added)
  generateReferralCode(userId: string, maxUses?: number, expiresAt?: Date): Promise<ReferralCode>;
  createReferralCodeWithCode(userId: string, code: string, maxUses?: number, expiresAt?: Date): Promise<ReferralCode>;
  getReferralCodeByCode(code: string): Promise<ReferralCode | null>;
  getUserReferralCodes(userId: string): Promise<ReferralCodeWithStats[]>;
  createReferral(referrerId: string, referredId: string, referralCodeId?: string): Promise<Referral>;
  getReferralStats(userId: string): Promise<ReferralStats>;
  getUserReferrals(userId: string): Promise<any[]>;
  toggleReferralCodeStatus(codeId: string, userId: string): Promise<ReferralCode>;

  // Investor Methods
  createInvestor(investor: InsertInvestor): Promise<Investor>;
  getInvestorsByPost(postId: string): Promise<Investor[]>;
  getInvestorsByUser(userId: string): Promise<InvestorEarning[]>;
  getUserInvestorDashboard(userId: string): Promise<InvestorDashboard>;
  updateInvestorEarnings(postId: string, earningAmount: string): Promise<void>;
  getInvestorCount(postId: string): Promise<number>;
  getUserInvestorPosition(userId: string, postId: string): Promise<number | null>;
  // Investor dashboard is simplified to show overall performance rather than post-specific progress bars.

  // Pinned Posts Methods
  createPinnedPost(userId: string, postId: string): Promise<PinnedPost>;
  removePinnedPost(userId: string, postId: string): Promise<void>;
  getPinnedPostsByUser(userId: string): Promise<string[]>;
  isPinnedByUser(userId: string, postId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByWalletAddress(walletAddress: string): Promise<User | undefined> {
    return await withRetry(() => {
      return db
        .select()
        .from(users)
        .where(eq(users.walletAddress, walletAddress))
        .limit(1);
    }).then(res => res[0]);
  }

  // Alias for compatibility
  async getUserByWallet(walletAddress: string): Promise<User | undefined> {
    return this.getUserByWalletAddress(walletAddress);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await withRetry(() =>
      db.select().from(users).where(sql`LOWER(${users.username}) = LOWER(${username})`).limit(1)
    );
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await withRetry(() =>
      db
        .insert(users)
        .values(insertUser)
        .returning()
    );
    return user;
  }

  async searchUsers(query: string): Promise<User[]> {
    const searchResults = await withRetry(() =>
      db.select().from(users)
        .where(sql`LOWER(${users.username}) LIKE ${`%${query.toLowerCase()}%`}`)
        .limit(10)
    );
    return searchResults;
  }

  // Posts
  async getPost(id: string): Promise<Post | undefined> {
    const [post] = await withRetry(() =>
      db.select().from(posts).where(eq(posts.id, id))
    );
    return post || undefined;
  }

  async getPostWithCreator(id: string, userId?: string): Promise<PostWithCreator | undefined> {
    const [result] = await withRetry(() =>
      db
        .select({
          post: posts,
          creator: users,
        })
        .from(posts)
        .leftJoin(users, eq(posts.creatorId, users.id))
        .where(eq(posts.id, id))
    );

    if (!result) return undefined;

    const post = result.post;
    const creator = result.creator!;

    // Check payment status or if user is the creator
    const hasUserPaid = userId
      ? (userId === post.creatorId || await this.hasUserPaid(userId, id, 'content'))
      : false;

    // Get user vote
    const userVote = userId
      ? await this.getUserVote(userId, id)
      : undefined;

    // Get comment count
    const commentCount = await withRetry(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(comments)
        .where(eq(comments.postId, id))
        .then(rows => Number(rows[0].count))
    );

    return {
      ...post,
      creator,
      hasUserPaid,
      hasUserVoted: userVote?.voteType as 'up' | 'down' | null || null,
      commentCount,
    };
  }

  async getAllPostsWithCreators(userId?: string): Promise<PostWithCreator[]> {
    const results = await withRetry(() =>
      db
        .select({
          post: posts,
          creator: users,
        })
        .from(posts)
        .leftJoin(users, eq(posts.creatorId, users.id))
        .orderBy(desc(posts.createdAt))
    );

    const postsWithCreators = await Promise.all(
      results.map(async (result) => {
        const post = result.post;
        const creator = result.creator!;

        // Check payment status or if user is the creator
        const hasUserPaid = userId
          ? (userId === post.creatorId || await this.hasUserPaid(userId, post.id, 'content'))
          : false;

        // Get user vote
        const userVote = userId
          ? await this.getUserVote(userId, post.id)
          : undefined;

        // Get comment count
        const commentCount = await withRetry(() =>
          db
            .select({ count: sql<number>`count(*)` })
            .from(comments)
            .where(eq(comments.postId, post.id))
            .then(rows => Number(rows[0].count)
          )
        );

        return {
          ...post,
          creator,
          hasUserPaid,
          hasUserVoted: userVote?.voteType as 'up' | 'down' | null || null,
          commentCount,
        };
      })
    );

    return postsWithCreators;
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    const [post] = await withRetry(() =>
      db
        .insert(posts)
        .values(insertPost)
        .returning()
    );
    return post;
  }

  async incrementViewCount(postId: string): Promise<void> {
    await withRetry(() =>
      db
        .update(posts)
        .set({
          viewCount: sql`${posts.viewCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, postId))
    );
  }

  async markPostViral(postId: string): Promise<void> {
    await withRetry(() =>
      db
        .update(posts)
        .set({
          isViral: true,
          viralDetectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(posts.id, postId))
    );
  }

  // Payments
  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const [payment] = await withRetry(() =>
      db
        .insert(payments)
        .values(insertPayment)
        .returning()
    );

    // Automatically add the creator to the payer's paid user list in direct messages
    // This assumes that a direct message conversation might be initiated or updated here.
    // The actual logic for "paid user list" might be a separate concept or integrated into DM.
    // For now, we'll ensure a message can be sent/retrieved between them.
    const post = await this.getPost(insertPayment.postId);
    if (post && post.creatorId !== insertPayment.userId) {
      // Ensure there's a way to communicate or acknowledge this payment for DM context
      // This could involve creating a dummy message or updating a status if a 'paid user list'
      // is a distinct feature. For now, we'll ensure the user can be found.
      await this.getUserById(post.creatorId); // Ensure creator exists
      await this.getUserById(insertPayment.userId); // Ensure payer exists
    }


    return payment;
  }

  async hasUserPaid(userId: string, postId: string, paymentType: 'content' | 'comment'): Promise<boolean> {
    // Check if content is free
    const post = await this.getPost(postId);
    if (post?.isFree) {
      return true;
    }

    const [payment] = await withRetry(() =>
      db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.userId, userId),
            eq(payments.postId, postId),
            eq(payments.paymentType, paymentType)
          )
        )
        .limit(1)
    );

    console.log(`hasUserPaid check - userId: ${userId}, postId: ${postId}, paymentType: ${paymentType}, found: ${!!payment}`);
    return !!payment;
  }

  async hasUserPaidForAnyContent(payerId: string, creatorId: string): Promise<boolean> {
    const [payment] = await withRetry(() =>
      db.select()
        .from(payments)
        .innerJoin(posts, eq(payments.postId, posts.id))
        .where(and(
          eq(payments.userId, payerId),
          eq(posts.creatorId, creatorId),
          eq(payments.paymentType, 'content')
        ))
        .limit(1)
    );
    return !!payment;
  }


  async getUserRecentPayments(userId: string, limit: number = 50): Promise<any[]> {
    return await withRetry(() =>
      db
        .select()
        .from(payments)
        .innerJoin(posts, eq(payments.postId, posts.id))
        .innerJoin(users, eq(payments.userId, users.id))
        .where(eq(posts.creatorId, userId))
        .orderBy(desc(payments.paidAt))
        .limit(limit)
    );
  }

  async getRecentPayments(limit: number = 50): Promise<any[]> {
    return await withRetry(() =>
      db
        .select()
        .from(payments)
        .innerJoin(posts, eq(payments.postId, posts.id))
        .innerJoin(users, eq(payments.userId, users.id))
        .orderBy(desc(payments.paidAt))
        .limit(limit)
    );
  }

  async getTotalRevenue(): Promise<string> {
    // Get all payments
    const allPayments = await withRetry(() =>
      db
        .select({
          amount: payments.amount,
          cryptocurrency: payments.cryptocurrency,
        })
        .from(payments)
    );

    // Import price conversion at runtime to avoid circular dependency
    const { getPriceInUSD } = await import('./services/priceConversion');

    // Calculate total revenue in USD
    let totalUSD = 0;
    for (const payment of allPayments) {
      const amountInCrypto = parseFloat(payment.amount);
      const cryptoPrice = getPriceInUSD(payment.cryptocurrency as any);
      totalUSD += amountInCrypto * cryptoPrice;
    }

    return totalUSD.toFixed(2);
  }

  // Comments
  async createComment(insertComment: InsertComment): Promise<Comment> {
    const [comment] = await withRetry(() =>
      db
        .insert(comments)
        .values(insertComment)
        .returning()
    );
    return comment;
  }

  async getCommentsByPost(postId: string): Promise<CommentWithUser[]> {
    const results = await withRetry(() =>
      db
        .select({
          comment: comments,
          user: users,
        })
        .from(comments)
        .leftJoin(users, eq(comments.userId, users.id))
        .where(eq(comments.postId, postId))
        .orderBy(desc(comments.createdAt))
    );

    return results.map(r => ({
      ...r.comment,
      user: r.user!,
    }));
  }

  // Votes
  async createOrUpdateVote(insertVote: InsertVote): Promise<Vote> {
    // Try to get existing vote
    const existing = await this.getUserVote(insertVote.userId, insertVote.postId);

    if (existing) {
      // Update vote count on post
      const post = await this.getPost(insertVote.postId);
      if (post) {
        const updates: any = { updatedAt: new Date() };

        if (existing.voteType === 'up') {
          updates.upvoteCount = sql`${posts.upvoteCount} - 1`;
        } else {
          updates.downvoteCount = sql`${posts.downvoteCount} - 1`;
        }

        if (insertVote.voteType === 'up') {
          updates.upvoteCount = sql`${posts.upvoteCount} + 1`;
        } else {
          updates.downvoteCount = sql`${posts.downvoteCount} + 1`;
        }

        await withRetry(() =>
          db.update(posts).set(updates).where(eq(posts.id, insertVote.postId))
        );
      }

      // Update the vote
      const [vote] = await withRetry(() =>
        db
          .update(votes)
          .set({ voteType: insertVote.voteType })
          .where(and(
            eq(votes.userId, insertVote.userId),
            eq(votes.postId, insertVote.postId)
          ))
          .returning()
      );
      return vote;
    } else {
      // Create new vote and update post counts
      const [vote] = await withRetry(() =>
        db.insert(votes).values(insertVote).returning()
      );

      const updates: any = { updatedAt: new Date() };
      if (insertVote.voteType === 'up') {
        updates.upvoteCount = sql`${posts.upvoteCount} + 1`;
      } else {
        updates.downvoteCount = sql`${posts.downvoteCount} + 1`;
      }

      await withRetry(() =>
        db.update(posts).set(updates).where(eq(posts.id, insertVote.postId))
      );

      return vote;
    }
  }

  async getUserVote(userId: string, postId: string): Promise<Vote | undefined> {
    const [vote] = await withRetry(() =>
      db
        .select()
        .from(votes)
        .where(and(
          eq(votes.userId, userId),
          eq(votes.postId, postId)
        ))
    );
    return vote || undefined;
  }

  async deleteVote(userId: string, postId: string): Promise<void> {
    const vote = await this.getUserVote(userId, postId);
    if (!vote) return;

    await withRetry(() =>
      db
        .delete(votes)
        .where(and(
          eq(votes.userId, userId),
          eq(votes.postId, postId)
        ))
    );

    // Update post counts
    const updates: any = { updatedAt: new Date() };
    if (vote.voteType === 'up') {
      updates.upvoteCount = sql`${posts.upvoteCount} - 1`;
    } else {
      updates.downvoteCount = sql`${posts.downvoteCount} - 1`;
    }

    await withRetry(() =>
      db.update(posts).set(updates).where(eq(posts.id, postId))
    );
  }

  // User Profile & Follows
  async getUserProfile(username: string, currentUserId?: string): Promise<UserWithStats | null> {
    const [user] = await withRetry(() =>
      db.select().from(users).where(sql`LOWER(${users.username}) = LOWER(${username})`).limit(1)
    );
    if (!user) return null;

    // Helper functions for counts and follow status - assuming they exist and work correctly
    const followerCount = await this.getFollowerCount(user.id);
    const followingCount = await this.getFollowingCount(user.id);
    const postCount = await this.getUserPostCount(user.id);
    const isFollowing = currentUserId ? await this.isFollowing(currentUserId, user.id) : false;

    // Get user's referral code
    const referralCodes = await db
      .select()
      .from(referralCodesTable)
      .where(eq(referralCodesTable.userId, user.id))
      .limit(1);

    const referralCode = referralCodes.length > 0 ? referralCodes[0] : null;

    return {
      ...user,
      followerCount,
      followingCount,
      postCount,
      isFollowing,
      referralCode,
    };
  }

  // Placeholder helper functions (replace with actual implementations if they exist elsewhere or implement them here)
  async getFollowerCount(userId: string): Promise<number> {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(follows).where(eq(follows.followingId, userId));
    return count;
  }

  async getFollowingCount(userId: string): Promise<number> {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(follows).where(eq(follows.followerId, userId));
    return count;
  }

  async getUserPostCount(userId: string): Promise<number> {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(posts).where(eq(posts.creatorId, userId));
    return count;
  }

  async getCommentCount(postId: string): Promise<number> {
    const [{ count }] = await withRetry(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(comments)
        .where(eq(comments.postId, postId))
    );
    return Number(count);
  }

  async isFollowing(currentUserId: string, targetUserId: string): Promise<boolean> {
    const follow = await db.query.follows.findFirst({
      where: and(
        eq(follows.followerId, currentUserId),
        eq(follows.followingId, targetUserId)
      ),
    });
    return !!follow;
  }

  async updateUserProfile(userId: string, data: { username?: string; bio?: string | null; profileImagePath?: string | null }): Promise<User | undefined> {
    const [updated] = await withRetry(() =>
      db.update(users)
        .set(data)
        .where(eq(users.id, userId))
        .returning()
    );
    return updated;
  }

  async toggleFollow(followerId: string, followingId: string) {
    const existing = await withRetry(() => db.query.follows.findFirst({
      where: and(
        eq(follows.followerId, followerId),
        eq(follows.followingId, followingId)
      ),
    }));

    if (existing) {
      await withRetry(() => db.delete(follows).where(eq(follows.id, existing.id)));
      return { following: false };
    } else {
      await withRetry(() => db.insert(follows).values({
        followerId,
        followingId,
      }));
      return { following: true };
    }
  }

  // Notifications
  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await withRetry(() =>
      db
        .insert(notifications)
        .values(insertNotification)
        .returning()
    );
    return notification;
  }

  async getUserNotifications(userId: string, limit: number = 50): Promise<NotificationWithActor[]> {
    const results = await withRetry(() =>
      db
        .select({
          notification: notifications,
          actor: users,
          post: posts,
        })
        .from(notifications)
        .leftJoin(users, eq(notifications.actorId, users.id))
        .leftJoin(posts, eq(notifications.postId, posts.id))
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
    );

    return results.map(r => ({
      ...r.notification,
      actor: r.actor,
      post: r.post,
    }));
  }

  async markNotificationAsRead(notificationId: string): Promise<void> {
    await withRetry(() =>
      db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, notificationId))
    );
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await withRetry(() =>
      db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.userId, userId))
    );
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await withRetry(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(and(
          eq(notifications.userId, userId),
          eq(notifications.isRead, false)
        ))
    );
    return Number(result[0].count);
  }

  // Direct Messages
  async createDirectMessage(data: InsertDirectMessage): Promise<DirectMessage> {
    const [message] = await withRetry(() =>
      db.insert(directMessages).values(data).returning()
    );
    return message;
  }

  async getMessagesBetweenUsers(userId1: string, userId2: string): Promise<DirectMessageWithUsers[]> {
    const messages = await withRetry(() =>
      db
        .select({
          direct_messages: directMessages,
          users: users,
          posts: posts,
        })
        .from(directMessages)
        .leftJoin(users, eq(directMessages.senderId, users.id))
        .leftJoin(posts, eq(directMessages.postId, posts.id))
        .where(
          or(
            and(eq(directMessages.senderId, userId1), eq(directMessages.receiverId, userId2)),
            and(eq(directMessages.senderId, userId2), eq(directMessages.receiverId, userId1))
          )
        )
        .orderBy(directMessages.createdAt)
    );

    return messages.map((row) => {
      const sender = row.users;
      // Placeholder for receiver, as receiver info is not directly joined in this query
      const receiver = { id: '', walletAddress: '', username: '', bio: null, profileImagePath: null, createdAt: new Date() };

      return {
        ...row.direct_messages,
        sender: sender!,
        receiver,
        post: row.posts,
      };
    });
  }

  async getUserConversations(userId: string): Promise<any[]> {
    const sentMessages = await withRetry(() =>
      db
        .select({
          otherUserId: directMessages.receiverId,
          lastMessage: directMessages.content,
          lastMessageAt: directMessages.createdAt,
          isRead: directMessages.isRead,
        })
        .from(directMessages)
        .where(eq(directMessages.senderId, userId))
        .orderBy(desc(directMessages.createdAt))
    );

    const receivedMessages = await withRetry(() =>
      db
        .select({
          otherUserId: directMessages.senderId,
          lastMessage: directMessages.content,
          lastMessageAt: directMessages.createdAt,
          isRead: directMessages.isRead,
        })
        .from(directMessages)
        .where(eq(directMessages.receiverId, userId))
        .orderBy(desc(directMessages.createdAt))
    );

    const allMessages = [...sentMessages, ...receivedMessages];
    const conversationMap = new Map();

    for (const msg of allMessages) {
      if (!conversationMap.has(msg.otherUserId)) {
        const otherUser = await this.getUserById(msg.otherUserId); // Use helper function
        if (otherUser) {
          conversationMap.set(msg.otherUserId, {
            user: otherUser,
            lastMessage: msg.lastMessage,
            lastMessageAt: msg.lastMessageAt,
            hasUnread: receivedMessages.some(m => m.otherUserId === msg.otherUserId && !m.isRead),
          });
        }
      }
    }

    return Array.from(conversationMap.values()).sort((a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
  }

  async markMessagesAsRead(receiverId: string, senderId: string): Promise<void> {
    await withRetry(() =>
      db
        .update(directMessages)
        .set({ isRead: true })
        .where(
          and(
            eq(directMessages.receiverId, receiverId),
            eq(directMessages.senderId, senderId)
          )
        )
    );
  }

  async getUnreadMessageCount(userId: string): Promise<number> {
    const result = await withRetry(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(directMessages)
        .where(and(eq(directMessages.receiverId, userId), eq(directMessages.isRead, false)))
    );

    return Number(result[0].count);
  }

  async getUserById(userId: string): Promise<User | null> {
    const [user] = await withRetry(() =>
      db.select().from(users).where(eq(users.id, userId))
    );
    return user || null;
  }

  // Get users who have paid for the creator's content
  async getUsersWhoPaidForContent(creatorId: string): Promise<User[]> {
    const paidUsers = await withRetry(() =>
      db
        .selectDistinct({
          id: users.id,
          username: users.username,
          walletAddress: users.walletAddress,
          profileImagePath: users.profileImagePath,
          bio: users.bio,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .innerJoin(payments, eq(payments.userId, users.id))
        .innerJoin(posts, eq(posts.id, payments.postId))
        .where(and(
          eq(posts.creatorId, creatorId),
          eq(payments.paymentType, 'content')
        ))
        .orderBy(desc(payments.paidAt))
    );

    return paidUsers;
  }

  // Referral Code Methods (Added)
  async generateReferralCode(userId: string, maxUses: number = 0, expiresAt?: Date): Promise<ReferralCode> {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();

    const [referralCode] = await withRetry(() => db
      .insert(referralCodesTable)
      .values({
        code,
        userId,
        maxUses,
        expiresAt: expiresAt || null,
      })
      .returning());

    return referralCode;
  }

  async createReferralCodeWithCode(userId: string, code: string, maxUses: number = 0, expiresAt?: Date): Promise<ReferralCode> {
    const [referralCode] = await withRetry(() => db
      .insert(referralCodesTable)
      .values({
        code,
        userId,
        maxUses,
        expiresAt: expiresAt || null,
      })
      .returning());

    return referralCode;
  }

  async getReferralCodeByCode(code: string): Promise<ReferralCode | null> {
    const [referralCode] = await withRetry(() => db
      .select()
      .from(referralCodesTable)
      .where(eq(referralCodesTable.code, code)));

    return referralCode || null;
  }

  async getUserReferralCodes(userId: string): Promise<ReferralCodeWithStats[]> {
    const codes = await withRetry(() => db
      .select({
        id: referralCodesTable.id,
        code: referralCodesTable.code,
        userId: referralCodesTable.userId,
        maxUses: referralCodesTable.maxUses,
        currentUses: referralCodesTable.currentUses,
        isActive: referralCodesTable.isActive,
        createdAt: referralCodesTable.createdAt,
        expiresAt: referralCodesTable.expiresAt,
        referralCount: sql<number>`count(${referrals.id})`,
      })
      .from(referralCodesTable)
      .leftJoin(referrals, eq(referrals.referralCodeId, referralCodesTable.id))
      .where(eq(referralCodesTable.userId, userId))
      .groupBy(referralCodesTable.id)
      .orderBy(desc(referralCodesTable.createdAt)));

    return codes.map(code => ({
      ...code,
      referralCount: Number(code.referralCount),
    }));
  }

  async createReferral(referrerId: string, referredId: string, referralCodeId?: string): Promise<Referral> {
    const [referral] = await withRetry(() => db
      .insert(referrals)
      .values({
        referrerId,
        referredId,
        referralCodeId: referralCodeId || null,
      })
      .returning());

    // Update referral code usage count
    if (referralCodeId) {
      await withRetry(() => db
        .update(referralCodesTable)
        .set({
          currentUses: sql`${referralCodesTable.currentUses} + 1`,
        })
        .where(eq(referralCodesTable.id, referralCodeId)));
    }

    return referral;
  }

  async getReferralStats(userId: string): Promise<ReferralStats> {
    const [stats] = await withRetry(() => db
      .select({
        totalReferrals: sql<number>`count(distinct ${referrals.referredId})`,
        activeReferralCodes: sql<number>`count(distinct case when ${referralCodesTable.isActive} = true then ${referralCodesTable.id} end)`,
      })
      .from(referralCodesTable)
      .leftJoin(referrals, eq(referrals.referralCodeId, referralCodesTable.id))
      .where(eq(referralCodesTable.userId, userId)));

    return {
      totalReferrals: Number(stats?.totalReferrals || 0),
      activeReferralCodes: Number(stats?.activeReferralCodes || 0),
      referralEarnings: 0, // Can be calculated based on payment rewards
    };
  }

  async getUserReferrals(userId: string): Promise<any[]> {
    const userReferrals = await withRetry(() => db
      .select({
        id: referrals.id,
        createdAt: referrals.createdAt,
        referredUser: {
          id: users.id,
          username: users.username,
          profileImagePath: users.profileImagePath,
        },
        referralCode: {
          code: referralCodesTable.code,
        },
      })
      .from(referrals)
      .innerJoin(users, eq(users.id, referrals.referredId))
      .leftJoin(referralCodesTable, eq(referralCodesTable.id, referrals.referralCodeId))
      .where(eq(referrals.referrerId, userId))
      .orderBy(desc(referrals.createdAt)));

    return userReferrals;
  }

  async toggleReferralCodeStatus(codeId: string, userId: string): Promise<ReferralCode> {
    const [code] = await withRetry(() => db
      .update(referralCodesTable)
      .set({
        isActive: sql`not ${referralCodesTable.isActive}`,
      })
      .where(and(
        eq(referralCodesTable.id, codeId),
        eq(referralCodesTable.userId, userId)
      ))
      .returning());

    return code;
  }

  // Admin
  async getAdminStats(): Promise<any> {
    const [totalUsers] = await withRetry(() => db.select({ count: sql<number>`count(*)` }).from(users));
    const [totalPosts] = await withRetry(() => db.select({ count: sql<number>`count(*)` }).from(posts));
    const [totalPayments] = await withRetry(() => db.select({ count: sql<number>`count(*)` }).from(payments));
    const [viralCount] = await withRetry(() => db.select({ count: sql<number>`count(*)` }).from(posts).where(eq(posts.isViral, true)));
    const [viewsSum] = await withRetry(() => db.select({ sum: sql<number>`COALESCE(SUM(${posts.viewCount}), 0)` }).from(posts));

    const totalRevenue = await this.getTotalRevenue();

    return {
      totalUsers: Number(totalUsers.count),
      totalPosts: Number(totalPosts.count),
      totalPayments: Number(totalPayments.count),
      totalRevenue,
      totalViews: Number(viewsSum.sum),
      viralPosts: Number(viralCount.count),
    };
  }

  async getUserViralPosts(userId: string): Promise<any[]> {
    return await withRetry(() =>
      db
        .select()
        .from(posts)
        .where(and(
          eq(posts.creatorId, userId),
          eq(posts.isViral, true)
        ))
        .orderBy(desc(posts.viralDetectedAt))
    );
  }

  async getViralPosts(): Promise<any[]> {
    return await withRetry(() =>
      db
        .select()
        .from(posts)
        .where(eq(posts.isViral, true))
        .orderBy(desc(posts.viralDetectedAt))
    );
  }

  async getPostRevenue(postId: string): Promise<string> {
    // Get all payments for this post
    const postPayments = await withRetry(() =>
      db
        .select({
          amount: payments.amount,
          cryptocurrency: payments.cryptocurrency,
        })
        .from(payments)
        .where(eq(payments.postId, postId))
    );

    // Import price conversion at runtime to avoid circular dependency
    const { getPriceInUSD } = await import('./services/priceConversion');

    // Calculate total revenue in USD
    let totalUSD = 0;
    for (const payment of postPayments) {
      const amountInCrypto = parseFloat(payment.amount);
      const cryptoPrice = getPriceInUSD(payment.cryptocurrency as any);
      totalUSD += amountInCrypto * cryptoPrice;
    }

    return totalUSD.toFixed(2);
  }

  async getUserTotalRevenue(userId: string): Promise<string> {
    // Get all payments for this user's content
    const userPayments = await withRetry(() =>
      db
        .select({
          amount: payments.amount,
          cryptocurrency: payments.cryptocurrency,
        })
        .from(payments)
        .innerJoin(posts, eq(payments.postId, posts.id))
        .where(eq(posts.creatorId, userId))
    );

    // Import price conversion at runtime to avoid circular dependency
    const { getPriceInUSD } = await import('./services/priceConversion');

    // Calculate total revenue in USD
    let totalUSD = 0;
    for (const payment of userPayments) {
      const amountInCrypto = parseFloat(payment.amount);
      const cryptoPrice = getPriceInUSD(payment.cryptocurrency as any);
      totalUSD += amountInCrypto * cryptoPrice;
    }

    return totalUSD.toFixed(2);
  }

  // Investor Methods
  // The investor dashboard is simplified to show overall performance.
  // The previous detailed progress bar logic per post is removed,
  // and replaced with a summary of total earnings and investments.
  async createInvestor(investor: InsertInvestor): Promise<Investor> {
    const [newInvestor] = await withRetry(() =>
      db
        .insert(investors)
        .values(investor)
        .returning()
    );
    return newInvestor;
  }

  async getInvestorsByPost(postId: string): Promise<Investor[]> {
    // This method is less relevant with the simplified dashboard.
    // It might be used for historical data or specific admin features.
    return await withRetry(() =>
      db
        .select()
        .from(investors)
        .where(eq(investors.postId, postId))
        .orderBy(investors.position)
    );
  }

  async getInvestorsByUser(userId: string): Promise<InvestorEarning[]> {
    const userInvestments = await withRetry(() =>
      db
        .select({
          investor: investors,
          post: posts,
          unlockCount: sql<number>`(
            SELECT COUNT(*)
            FROM ${payments}
            WHERE ${payments.postId} = ${investors.postId}
            AND ${payments.paymentType} = 'content'
          )`,
        })
        .from(investors)
        .innerJoin(posts, eq(investors.postId, posts.id))
        .where(eq(investors.userId, userId))
        .orderBy(desc(investors.totalEarnings))
    );

    return userInvestments.map(inv => {
      const totalUnlocks = Number(inv.unlockCount);
      const unlocksAfterFirst10 = Math.max(0, totalUnlocks - 10); // Example logic: royalties only apply after first 10 unlocks

      return {
        postId: inv.investor.postId,
        postTitle: inv.post.title,
        position: inv.investor.position, // This might represent the order of investment or royalty percentage
        earningsGenerated: inv.investor.totalEarnings,
        totalUnlocks: unlocksAfterFirst10, // Simplified metric for dashboard
        investmentAmount: inv.investor.investmentAmount,
        // Add creator royalty percentage if available in investor schema or post schema
      };
    });
  }

  async getUserInvestorDashboard(userId: string): Promise<InvestorDashboard> {
    const investments = await this.getInvestorsByUser(userId);

    const totalEarnings = investments.reduce((sum, inv) => {
      return sum + parseFloat(inv.earningsGenerated);
    }, 0);

    // Simplified dashboard: Total earnings and a list of investments with key metrics.
    // Removed post-specific progress bars.
    return {
      totalEarnings: totalEarnings.toFixed(2),
      investments, // This list contains simplified metrics per investment
    };
  }

  async updateInvestorEarnings(postId: string, earningAmount: string): Promise<void> {
    // Add earnings to all investors for this post
    await withRetry(() =>
      db
        .update(investors)
        .set({
          totalEarnings: sql`${investors.totalEarnings} + ${earningAmount}`,
        })
        .where(eq(investors.postId, postId))
    );
  }

  async getInvestorCount(postId: string): Promise<number> {
    const [result] = await withRetry(() =>
      db
        .select({ count: sql<number>`count(*)` })
        .from(investors)
        .where(eq(investors.postId, postId))
    );
    return Number(result.count);
  }

  async getUserInvestorPosition(userId: string, postId: string): Promise<number | null> {
    const [investor] = await withRetry(() =>
      db
        .select({ position: investors.position })
        .from(investors)
        .where(and(
          eq(investors.userId, userId),
          eq(investors.postId, postId)
        ))
    );
    return investor?.position ?? null;
  }

  // Pinned Posts Methods
  async createPinnedPost(userId: string, postId: string): Promise<PinnedPost> {
    const [pinned] = await withRetry(() =>
      db
        .insert(pinnedPosts)
        .values({ userId, postId })
        .returning()
    );
    return pinned;
  }

  async removePinnedPost(userId: string, postId: string): Promise<void> {
    await withRetry(() =>
      db
        .delete(pinnedPosts)
        .where(and(
          eq(pinnedPosts.userId, userId),
          eq(pinnedPosts.postId, postId)
        ))
    );
  }

  async getPinnedPostsByUser(userId: string): Promise<string[]> {
    const pinned = await withRetry(() =>
      db
        .select({ postId: pinnedPosts.postId })
        .from(pinnedPosts)
        .where(eq(pinnedPosts.userId, userId))
        .orderBy(desc(pinnedPosts.createdAt))
    );
    return pinned.map(p => p.postId);
  }

  async isPinnedByUser(userId: string, postId: string): Promise<boolean> {
    const [pinned] = await withRetry(() =>
      db
        .select()
        .from(pinnedPosts)
        .where(and(
          eq(pinnedPosts.userId, userId),
          eq(pinnedPosts.postId, postId)
        ))
    );
    return !!pinned;
  }
}

export const storage = new DatabaseStorage();