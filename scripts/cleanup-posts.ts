
import { db } from '../server/db';
import { posts, payments, comments, votes, notifications, users } from '../shared/schema';
import { eq, inArray } from 'drizzle-orm';

async function cleanupPosts() {
  console.log('Starting cleanup of posts and related data...');

  try {
    // Get the users we want to clean posts from
    const targetUsernames = ['TEASR', 'KingDYOR', 'Abum'];
    
    const targetUsers = await db
      .select()
      .from(users)
      .where(
        inArray(
          users.username,
          targetUsernames
        )
      );

    if (targetUsers.length === 0) {
      console.log('No users found with those usernames');
      return;
    }

    console.log(`Found ${targetUsers.length} users:`, targetUsers.map(u => u.username));

    const userIds = targetUsers.map(u => u.id);

    // Get all posts from these users
    const postsToDelete = await db
      .select()
      .from(posts)
      .where(inArray(posts.creatorId, userIds));

    console.log(`Found ${postsToDelete.length} posts to delete`);

    if (postsToDelete.length === 0) {
      console.log('No posts found to delete');
      return;
    }

    const postIds = postsToDelete.map(p => p.id);

    // Delete in order to respect foreign key constraints
    
    // 1. Delete notifications related to these posts
    const deletedNotifications = await db
      .delete(notifications)
      .where(inArray(notifications.postId, postIds))
      .returning();
    console.log(`Deleted ${deletedNotifications.length} notifications`);

    // 2. Delete votes on these posts
    const deletedVotes = await db
      .delete(votes)
      .where(inArray(votes.postId, postIds))
      .returning();
    console.log(`Deleted ${deletedVotes.length} votes`);

    // 3. Delete comments on these posts
    const deletedComments = await db
      .delete(comments)
      .where(inArray(comments.postId, postIds))
      .returning();
    console.log(`Deleted ${deletedComments.length} comments`);

    // 4. Delete payments for these posts
    const deletedPayments = await db
      .delete(payments)
      .where(inArray(payments.postId, postIds))
      .returning();
    console.log(`Deleted ${deletedPayments.length} payments`);

    // 5. Finally, delete the posts themselves
    const deletedPosts = await db
      .delete(posts)
      .where(inArray(posts.id, postIds))
      .returning();
    console.log(`Deleted ${deletedPosts.length} posts`);

    console.log('\n✅ Cleanup completed successfully!');
    console.log('Summary:');
    console.log(`  - Posts deleted: ${deletedPosts.length}`);
    console.log(`  - Payments deleted: ${deletedPayments.length}`);
    console.log(`  - Comments deleted: ${deletedComments.length}`);
    console.log(`  - Votes deleted: ${deletedVotes.length}`);
    console.log(`  - Notifications deleted: ${deletedNotifications.length}`);
    console.log('\nUser profiles have been preserved.');

  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  }
}

// Run the cleanup
cleanupPosts()
  .then(() => {
    console.log('\nCleanup script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Cleanup script failed:', error);
    process.exit(1);
  });
