
-- Add likeCount column to comments
ALTER TABLE comments ADD COLUMN like_count INTEGER DEFAULT 0 NOT NULL;

-- Create comment_likes table
CREATE TABLE comment_likes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, comment_id)
);

-- Create index for faster lookups
CREATE INDEX idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX idx_comment_likes_user_id ON comment_likes(user_id);
