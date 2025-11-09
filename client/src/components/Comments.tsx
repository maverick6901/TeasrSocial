import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Lock, Send, User, MessageCircle, Heart, Trash2 } from 'lucide-react';
import { CommentWithUser, PostWithCreator } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import { useWallet } from '@/lib/wallet';

interface CommentsProps {
  post: PostWithCreator;
  comments: CommentWithUser[];
  hasCommentAccess: boolean;
  onPayForComments: () => void;
  onCommentAdded: () => void;
  compact?: boolean;
}

export function Comments({ post, comments, hasCommentAccess, onPayForComments, onCommentAdded, compact = false }: CommentsProps) {
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const { toast } = useToast();
  const { address } = useWallet();

  const handleSubmitComment = async () => {
    if (!commentText.trim()) return;

    setIsSubmitting(true);
    try {
      await apiRequest('POST', `/api/posts/${post.id}/comments`, {
        content: commentText.trim(),
      });

      setCommentText('');
      onCommentAdded();

      toast({
        title: 'Comment posted',
        description: 'Your comment has been added',
      });
    } catch (error) {
      console.error('Comment error:', error);
      toast({
        title: 'Failed to post comment',
        description: 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    setDeletingCommentId(commentId);
    try {
      await apiRequest('DELETE', `/api/comments/${commentId}`);
      onCommentAdded(); // Refresh comments
      toast({
        title: 'Comment deleted',
        description: 'Your comment has been removed',
      });
    } catch (error) {
      console.error('Delete comment error:', error);
      toast({
        title: 'Failed to delete comment',
        description: 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    try {
      await apiRequest('POST', `/api/comments/${commentId}/like`);
      onCommentAdded(); // Refresh comments to show updated like count
    } catch (error) {
      console.error('Like comment error:', error);
      toast({
        title: 'Failed to like comment',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  if (post.commentsLocked && !hasCommentAccess) {
    const lockedContent = (
      <div className="space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted">
          <Lock className="w-8 h-8 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">Comments Locked</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Pay to unlock comments and join the discussion
          </p>
          <Button onClick={onPayForComments} data-testid="button-unlock-comments">
            <Lock className="w-4 h-4 mr-2" />
            Unlock for {post.commentFee} USDC
          </Button>
        </div>
      </div>
    );

    return compact ? (
      <div className="p-8 text-center" data-testid="comments-locked">{lockedContent}</div>
    ) : (
      <Card className="p-8 text-center" data-testid="comments-locked">{lockedContent}</Card>
    );
  }

  // Function to parse @mentions in comment content
  const renderCommentContent = (content: string) => {
    const parts = content.split(/(@\w+)/g); // split by @username
    return parts.map((part, idx) => {
      if (part.startsWith('@')) {
        const username = part.slice(1);
        return (
          <Link key={idx} href={`/profile/${username}`}>
            <span className="text-blue-500 hover:underline cursor-pointer">{part}</span>
          </Link>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const commentsContent = (
    <>
      <div className="flex items-center space-x-2 mb-4">
        <MessageCircle className="w-5 h-5 text-muted-foreground" />
        <h3 className={`${compact ? 'text-base' : 'text-lg'} font-semibold`}>
          Comments ({comments.length})
        </h3>
      </div>

      {/* Comment Input */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 space-y-3"
      >
        <Textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Share your thoughts..."
          className="resize-none touch-manipulation"
          rows={compact ? 2 : 3}
          data-testid="textarea-comment"
        />
        <div className="flex justify-end">
          <Button
            onClick={handleSubmitComment}
            disabled={!commentText.trim() || isSubmitting}
            size={compact ? "sm" : "default"}
            className="hover-elevate active-elevate-2"
            data-testid="button-submit-comment"
          >
            <Send className="w-4 h-4 mr-2" />
            {isSubmitting ? 'Posting...' : 'Post Comment'}
          </Button>
        </div>
      </motion.div>

      {/* Comments List */}
      <div className="space-y-3">
        {comments.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-6 text-muted-foreground"
          >
            <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No comments yet. Be the first!</p>
          </motion.div>
        ) : (
          <AnimatePresence>
            {comments.map((comment, index) => (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.05 }}
                className="flex space-x-3 pb-3 border-b border-border last:border-0 last:pb-0"
                data-testid={`comment-${comment.id}`}
              >
                <Avatar className={`${compact ? 'h-8 w-8' : 'h-10 w-10'} flex-shrink-0`}>
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <User className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline space-x-2 mb-1">
                    <Link href={`/profile/${comment.user.username}`}>
                      <span className="font-semibold text-sm hover:underline cursor-pointer" data-testid={`comment-author-${comment.id}`}>
                        {comment.user.username}
                      </span>
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm mb-2" data-testid={`comment-content-${comment.id}`}>
                    {renderCommentContent(comment.content)}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 px-2 text-xs ${comment.hasUserLiked ? 'text-red-500' : 'text-muted-foreground'}`}
                      onClick={() => handleLikeComment(comment.id)}
                      disabled={!address}
                    >
                      <Heart className={`w-3 h-3 mr-1 ${comment.hasUserLiked ? 'fill-current' : ''}`} />
                      {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
                    </Button>
                    {address && comment.user.walletAddress === address && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteComment(comment.id)}
                        disabled={deletingCommentId === comment.id}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </>
  );

  return compact ? (
    <div className="py-4" data-testid="comments-section">{commentsContent}</div>
  ) : (
    <Card className="p-6" data-testid="comments-section">{commentsContent}</Card>
  );
}

