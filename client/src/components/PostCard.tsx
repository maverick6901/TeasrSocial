import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Lock, Eye, MessageCircle, TrendingUp, User, DollarSign } from 'lucide-react';
import { PostWithCreator, CommentWithUser } from '@shared/schema';
import { VoteButtons } from './VoteButtons';
import { PaymentModal } from './PaymentModal';
import { Comments } from './Comments';
import { useWallet } from '@/lib/wallet';
import { useWebSocket } from '@/lib/useWebSocket';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import { InvestorBadge } from "./InvestorBadge";


interface PostCardProps {
  post: PostWithCreator;
  onVote: (postId: string, voteType: 'up' | 'down') => void;
  onPaymentSuccess: () => void;
}

export function PostCard({ post, onVote, onPaymentSuccess }: PostCardProps) {
  const { toast } = useToast();
  const { address } = useWallet();
  const [, setLocation] = useLocation();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentType, setPaymentType] = useState<'content' | 'comment'>('content');
  const [showComments, setShowComments] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [localPaid, setLocalPaid] = useState(post.hasUserPaid || post.isFree || false);
  const [hasLocalCommentAccess, setHasLocalCommentAccess] = useState(post.hasUserPaid || post.isFree || false);
  const [imageKey, setImageKey] = useState(Date.now());
  const [viewCount, setViewCount] = useState(post.viewCount || 0); // Initialize with post.viewCount or 0
  const [localUpvoteCount, setLocalUpvoteCount] = useState(post.upvoteCount);
  const [localDownvoteCount, setLocalDownvoteCount] = useState(post.downvoteCount);
  const [investorCount, setInvestorCount] = useState(post.investorCount || 0);

  // Fetch buyout count to check limit
  useEffect(() => {
    const fetchBuyoutCount = async () => {
      try {
        const response = await fetch(`/api/posts/${post.id}/buyout-count`);
        if (!response.ok) {
          throw new Error('Failed to fetch buyout count');
        }
        const data = await response.json();
        setInvestorCount(data.count);
      } catch (error) {
        console.error('Error fetching buyout count:', error);
      }
    };

    if (post.buyoutPrice) {
      fetchBuyoutCount();
    }
  }, [post.id, post.buyoutPrice]);

  // Listen for real-time updates
  useWebSocket((message) => {
    if (message.type === 'viewUpdate' && message.payload?.postId === post.id) {
      setViewCount(message.payload.viewCount);
    }
    if (message.type === 'voteUpdate' && message.payload?.postId === post.id) {
      setLocalUpvoteCount(message.payload.upvoteCount);
      setLocalDownvoteCount(message.payload.downvoteCount);
    }
    if (message.type === 'buyoutUpdate' && message.payload?.postId === post.id) {
      setInvestorCount(message.payload.investorCount);
    }
  });

  // Update local counts when post prop changes
  useEffect(() => {
    setLocalUpvoteCount(post.upvoteCount);
    setLocalDownvoteCount(post.downvoteCount);
    setViewCount(post.viewCount || 0);
    setInvestorCount(post.investorCount || 0);
  }, [post.upvoteCount, post.downvoteCount, post.viewCount, post.investorCount]);


  // Update localPaid when post.hasUserPaid changes
  useEffect(() => {
    if ((post.hasUserPaid || post.isFree) && !localPaid) {
      console.log('Payment status changed, reloading image for post:', post.id);
      setLocalPaid(true);
      setImageKey(Date.now());
      setImageLoaded(false);
    }
  }, [post.hasUserPaid, post.isFree, localPaid, post.id]);

  const isPaid = localPaid || post.hasUserPaid || post.isFree;

  const isBuyoutLimitReached = post.buyoutPrice && investorCount >= (post.maxInvestors || 10);
  const canBuyout = post.buyoutPrice && !isBuyoutLimitReached && !post.hasUserPaid;

  // Add wallet address to media URL for authentication
  const getMediaUrl = () => {
    if (!isPaid) return `${post.blurredThumbnailPath}?t=${Date.now()}`;
    const walletAddress = localStorage.getItem('walletAddress') || (window as any).walletAddress;
    const url = new URL(`/api/posts/${post.id}/media`, window.location.origin);
    url.searchParams.set('t', imageKey.toString());
    url.searchParams.set('r', Date.now().toString()); // Force refresh
    if (walletAddress) {
      url.searchParams.set('wallet', walletAddress);
    }
    return url.pathname + url.search;
  };

  const mediaUrl = getMediaUrl();

  // Fetch comments when unlocked
  const { data: comments = [], refetch: refetchComments } = useQuery<CommentWithUser[]>({
    queryKey: [`/api/posts/${post.id}/comments`],
    queryFn: async () => {
      const walletAddress = localStorage.getItem('walletAddress') || (window as any).walletAddress;
      const headers: Record<string, string> = {};
      if (walletAddress) {
        headers['x-wallet-address'] = walletAddress;
      }
      const response = await fetch(`/api/posts/${post.id}/comments`, {
        credentials: 'include',
        headers,
      });
      if (!response.ok) {
        if (response.status === 403) {
          return []; // Return empty array for locked comments
        }
        throw new Error('Failed to fetch comments');
      }
      return await response.json();
    },
    enabled: showComments,
    retry: false,
  });

  const hasCommentAccess = isPaid || hasLocalCommentAccess;

  const isCreator = address && post.creator.walletAddress.toLowerCase() === address.toLowerCase();

  const handlePayment = async () => {
    setPaymentType('content');
    setShowPaymentModal(true);

    // Track view when payment modal opens
    try {
      await fetch(`/api/posts/${post.id}/view`, {
        method: 'POST',
        headers: {
          'x-wallet-address': address || '',
        },
      });
    } catch (error) {
      console.error('Failed to track view:', error);
    }
  };

  const handleCommentUnlock = () => {
    setPaymentType('comment');
    setShowPaymentModal(true);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Card 
          data-post-id={post.id}
          className="overflow-visible group transition-all duration-300 border-0 rounded-none shadow-none bg-transparent hover-elevate" data-testid={`card-post-${post.id}`}>
          {/* Creator Info - Instagram style at top */}
          <div className="flex items-center space-x-3 px-4 py-3 bg-card border-b border-border">
            <Link href={`/profile/${post.creator.username}`}>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Avatar className="h-8 w-8 cursor-pointer hover:opacity-80 transition-opacity">
                  <AvatarImage src={post.creator.profileImagePath || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <User className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
              </motion.div>
            </Link>
          <div className="flex-1">
            <Link href={`/profile/${post.creator.username}`}>
              <p className="font-semibold text-sm hover:underline cursor-pointer" data-testid={`text-creator-${post.id}`}>
                @{post.creator.username}
              </p>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {post.isViral && (
              <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white">
                <TrendingUp className="w-3 h-3 mr-1" />
                Viral
              </Badge>
            )}
            {post.hasUserPaid && post.buyoutPrice && (
              <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                <DollarSign className="w-3 h-3 mr-1" />
                Owned
              </Badge>
            )}
            {isPaid && !isCreator && address && (
              <Button
                onClick={() => setLocation(`/messages?user=${post.creator.id}`)}
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                data-testid={`button-message-creator-${post.id}`}
              >
                <MessageCircle className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Media Container */}
        <div className="relative aspect-square bg-muted overflow-hidden bg-card">
          <img
            key={imageKey}
            src={mediaUrl}
            alt={post.title}
            className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
            data-testid={`img-post-${post.id}`}
          />

          {/* Blur Overlay for Locked Content */}
          <AnimatePresence>
            {!isPaid && !post.isFree && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 backdrop-blur-2xl bg-gradient-to-b from-black/30 via-black/40 to-black/60 flex items-center justify-center transition-all duration-300 group-hover:backdrop-blur-3xl"
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-center space-y-4 p-6"
                >
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 backdrop-blur-md border-2 border-primary/40"
                  >
                    <Lock className="w-8 h-8 text-primary" />
                  </motion.div>

                  <Button
                      onClick={handlePayment}
                      size="lg"
                      variant="default"
                      className="px-8 py-6 text-lg font-semibold backdrop-blur-md hover-elevate active-elevate-2 touch-manipulation"
                      data-testid={`button-unlock-${post.id}`}
                    >
                      <Lock className="w-5 h-5 mr-2" />
                      Unlock for {post.price}
                    </Button>
                  {isBuyoutLimitReached && (
                    <p className="text-xs text-purple-300 font-medium">
                      All investor spots filled • Unlocking at regular price
                    </p>
                  )}
                  <p className="text-xs text-white/80">
                    Accepts: {post.acceptedCryptos}
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Price Badge */}
          {!isPaid && (
            <div className="absolute top-4 right-4">
              <Badge className="bg-primary/90 backdrop-blur-md text-primary-foreground text-base px-4 py-2 font-bold" data-testid={`badge-price-${post.id}`}>
                {post.isFree ? 'FREE' : `${post.price}`}
              </Badge>
            </div>
          )}
        </div>

        {/* Content - Instagram style below image */}
        <div className="bg-card">
          {/* Engagement Bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            {(isPaid || post.isFree) && (
              <div className="flex items-center space-x-4">
                <VoteButtons
                  postId={post.id}
                  upvoteCount={localUpvoteCount}
                  downvoteCount={localDownvoteCount}
                  userVote={post.hasUserVoted || null}
                  onVote={onVote}
                />
              </div>
            )}
            {!isPaid && !post.isFree && (
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                <Lock className="w-3 h-3" />
                <span>Unlock to vote</span>
              </div>
            )}

            <div className="flex items-center space-x-3 sm:space-x-4 text-xs sm:text-sm text-muted-foreground">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Eye className="w-4 h-4" />
                <span className="text-sm">{viewCount}</span>
              </div>
              <motion.button
                onClick={() => isPaid && setShowComments(!showComments)}
                whileHover={isPaid ? { scale: 1.05 } : {}}
                whileTap={isPaid ? { scale: 0.95 } : {}}
                className={`flex items-center space-x-1 touch-manipulation ${isPaid ? 'cursor-pointer hover:text-primary transition-colors' : 'cursor-default'}`}
                data-testid={`stat-comments-${post.id}`}
              >
                <MessageCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{(post.commentCount || 0).toLocaleString()}</span>
                <span className="sm:hidden">{(post.commentCount || 0) > 999 ? `${((post.commentCount || 0) / 1000).toFixed(1)}k` : (post.commentCount || 0)}</span>
              </motion.button>
              {!post.isFree && post.buyoutPrice && (
                <InvestorBadge 
                  investorCount={post.investorCount || 0}
                  maxInvestors={post.maxInvestors || 10}
                  investorRevenueShare={post.investorRevenueShare || "0"}
                  showProgress={true}
                />
              )}
            </div>
          </div>

          {/* Title & Description */}
          <div className="px-4 pb-3">
            <div className="mb-1">
              <Link href={`/profile/${post.creator.username}`}>
                <span className="font-semibold text-sm mr-2 hover:underline cursor-pointer">
                  @{post.creator.username}
                </span>
              </Link>
              <span className="text-sm" data-testid={`text-title-${post.id}`}>{post.title}</span>
            </div>
            {post.description && (
              <p className="text-sm text-muted-foreground" data-testid={`text-description-${post.id}`}>
                {post.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(post.createdAt).toLocaleDateString()}
            </p>
          </div>

          {/* Comments Section - Scrollable */}
          <AnimatePresence>
            {showComments && isPaid && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="border-t border-border overflow-hidden"
              >
                <div className="max-h-96 overflow-y-auto px-4">
                  <Comments
                    post={post}
                    comments={comments}
                    hasCommentAccess={hasCommentAccess}
                    onPayForComments={handleCommentUnlock}
                    onCommentAdded={() => {
                      refetchComments();
                      onPaymentSuccess(); // Refresh post to update comment count
                    }}
                    compact={true}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
      </motion.div>

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        post={post}
        paymentType={paymentType}
        onSuccess={() => {
          if (paymentType === 'content') {
            setLocalPaid(true);
            setImageKey(prev => prev + 1);
            setImageLoaded(false);
            setHasLocalCommentAccess(true);
          } else {
            setHasLocalCommentAccess(true);
            refetchComments();
          }
          setShowPaymentModal(false);
          onPaymentSuccess();
        }}
      />
    </>
  );
}