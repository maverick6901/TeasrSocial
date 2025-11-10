import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PostCard } from '@/components/PostCard';
import { UploadModal } from '@/components/UploadModal';
import { PaymentModal } from '@/components/PaymentModal';
import { Navbar } from '@/components/Navbar';
import { ViralPostBanner } from '@/components/ViralPostBanner';
import { Button } from '@/components/ui/button';
import { Loader2, Upload } from 'lucide-react';
import { PostWithCreator } from '@shared/schema';
import { useWallet } from '@/lib/wallet';
import { useWebSocketMessage } from '@/lib/WebSocketContext';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';

export default function Feed() {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch posts
  const { data: posts, isLoading } = useQuery<PostWithCreator[]>({
    queryKey: ['/api/posts', address],
    queryFn: async () => {
      const walletAddress = (window as any).walletAddress || address;
      const response = await fetch(`/api/posts?t=${Date.now()}`, {
        headers: walletAddress ? { 'x-wallet-address': walletAddress } : {},
      });
      if (!response.ok) {
        throw new Error('Failed to fetch posts');
      }
      return response.json();
    },
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0,
  });

  // WebSocket for live vote and view updates
  useWebSocketMessage((message) => {
    if (message.type === 'voteUpdate' && message.payload) {
      // Update post vote counts in real-time
      queryClient.setQueryData(['/api/posts'], (oldPosts: PostWithCreator[] | undefined) => {
        if (!oldPosts) return oldPosts;
        return oldPosts.map(post =>
          post.id === message.payload.postId
            ? { ...post, upvoteCount: message.payload.upvoteCount, downvoteCount: message.payload.downvoteCount }
            : post
        );
      });
      queryClient.setQueryData(['/api/posts', address], (oldPosts: PostWithCreator[] | undefined) => {
        if (!oldPosts) return oldPosts;
        return oldPosts.map(post =>
          post.id === message.payload.postId
            ? { ...post, upvoteCount: message.payload.upvoteCount, downvoteCount: message.payload.downvoteCount }
            : post
        );
      });
    } else if (message.type === 'viewUpdate' && message.payload && message.payload.postId && message.payload.viewCount !== undefined) {
      // Update post view counts in real-time
      const newViewCount = message.payload.viewCount;
      
      queryClient.setQueryData(['/api/posts'], (oldPosts: PostWithCreator[] | undefined) => {
        if (!oldPosts) return oldPosts;
        return oldPosts.map(post =>
          post.id === message.payload.postId
            ? { ...post, viewCount: newViewCount }
            : post
        );
      });
      queryClient.setQueryData(['/api/posts', address], (oldPosts: PostWithCreator[] | undefined) => {
        if (!oldPosts) return oldPosts;
        return oldPosts.map(post =>
          post.id === message.payload.postId
            ? { ...post, viewCount: newViewCount }
            : post
        );
      });

      // Also update the individual post cache if it exists
      queryClient.setQueryData([`/api/posts/${message.payload.postId}`], (oldPost: PostWithCreator | undefined) => {
        if (!oldPost) return oldPost;
        return { ...oldPost, viewCount: newViewCount };
      });
    } else if (message.type === 'viralNotification' && message.payload) {
      // Show toast for viral posts
      toast({
        title: '🔥 Viral Alert!',
        description: message.payload.message,
      });

      // Update post viral status
      queryClient.setQueryData(['/api/posts'], (oldPosts: PostWithCreator[] | undefined) => {
        if (!oldPosts) return oldPosts;
        return oldPosts.map(post =>
          post.id === message.payload.postId
            ? { ...post, isViral: true, viralDetectedAt: new Date().toISOString() }
            : post
        );
      });
      queryClient.setQueryData(['/api/posts', address], (oldPosts: PostWithCreator[] | undefined) => {
        if (!oldPosts) return oldPosts;
        return oldPosts.map(post =>
          post.id === message.payload.postId
            ? { ...post, isViral: true, viralDetectedAt: new Date().toISOString() }
            : post
        );
      });
    }
  });

  const handleVote = async (postId: string, voteType: 'up' | 'down') => {
    if (!address) {
      toast({
        title: 'Connect wallet',
        description: 'Please connect your wallet to vote',
        variant: 'destructive',
      });
      return;
    }

    try {
      await apiRequest('POST', `/api/posts/${postId}/vote`, { voteType });
      // Invalidate posts query to refetch and get updated counts
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
    } catch (error) {
      console.error('Vote error:', error);
      // Show toast for vote failure
      toast({
        title: 'Vote failed',
        description: 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleUploadSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
  };

  const handlePaymentSuccess = () => {
    // Invalidate queries to refetch posts with updated payment status
    queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
    // Also invalidate with the address key
    queryClient.invalidateQueries({ queryKey: ['/api/posts', address] });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        <ViralPostBanner />
      </div>

      {/* Main Content */}
      <main className="pt-4 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <motion.h1 
              className="text-4xl sm:text-5xl font-bold font-display mb-4"
              initial={{ opacity: 0, y: -20 }}
              animate={{ 
                opacity: 1, 
                y: 0,
              }}
              transition={{ 
                opacity: { duration: 0.6 },
                y: { duration: 0.6 }
              }}
            >
              {['GET', 'PAID', 'TO', 'POST'].map((word, wordIndex) => (
                <motion.span
                  key={wordIndex}
                  className="inline-block bg-gradient-to-r from-primary via-purple-600 to-pink-600 bg-clip-text text-transparent mr-3"
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ 
                    opacity: 1, 
                    y: [0, -5, 0],
                    scale: [1, 1.05, 1],
                    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%']
                  }}
                  transition={{
                    opacity: { duration: 0.3, delay: wordIndex * 0.1 },
                    y: { 
                      duration: 2,
                      repeat: Infinity,
                      delay: wordIndex * 0.2,
                      ease: "easeInOut"
                    },
                    scale: { 
                      duration: 2,
                      repeat: Infinity,
                      delay: wordIndex * 0.2,
                      ease: "easeInOut"
                    },
                    backgroundPosition: {
                      duration: 3,
                      repeat: Infinity,
                      ease: "linear"
                    }
                  }}
                  style={{
                    backgroundSize: '200% 200%'
                  }}
                  whileHover={{
                    scale: 1.1,
                    rotate: [-1, 1, -1],
                    transition: { duration: 0.3 }
                  }}
                >
                  {word.split('').map((letter, letterIndex) => (
                    <motion.span
                      key={letterIndex}
                      className="inline-block"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ 
                        opacity: 1, 
                        y: 0,
                      }}
                      transition={{
                        duration: 0.3,
                        delay: wordIndex * 0.1 + letterIndex * 0.05
                      }}
                      whileHover={{
                        y: -8,
                        scale: 1.2,
                        color: '#ec4899',
                        transition: { duration: 0.2 }
                      }}
                    >
                      {letter}
                    </motion.span>
                  ))}
                </motion.span>
              ))}
            </motion.h1>
            <motion.p 
              className="text-lg text-muted-foreground max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <motion.span
                className="inline-block"
                animate={{ 
                  scale: [1, 1.05, 1],
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                Token Gate your Content
              </motion.span>
              {' & Earn with '}
              <motion.span
                className="inline-block font-semibold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent"
                animate={{ 
                  opacity: [0.7, 1, 0.7],
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 1
                }}
              >
                x402 Protocol
              </motion.span>
            </motion.p>
          </div>

          {/* Connect Wallet CTA */}
          {!address && (
            <div className="mb-12 p-8 rounded-2xl bg-gradient-to-r from-primary/10 via-purple-500/10 to-pink-500/10 border border-primary/20 text-center animate-in fade-in slide-in-from-top">
              <h2 className="text-2xl font-semibold mb-3">Welcome to TEASR</h2>
              <p className="text-muted-foreground mb-6">
                Connect your wallet to unlock exclusive content using x402 protocol and start creating
              </p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {/* Empty State */}
          {!isLoading && (!posts || posts.length === 0) && (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted mb-6">
                <Upload className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-2xl font-semibold mb-3">No content yet</h3>
              <p className="text-muted-foreground mb-6">
                Be the first to upload exclusive content to TEASR
              </p>
              {address && (
                <Button onClick={() => setShowUploadModal(true)} size="lg" data-testid="button-upload-empty">
                  <Upload className="w-5 h-5 mr-2" />
                  Upload Content
                </Button>
              )}
            </div>
          )}

          {/* Posts Feed - Instagram Style */}
          {!isLoading && posts && posts.length > 0 && (
            <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-8 pb-20 sm:pb-8" data-testid="feed-grid">
              <div className="space-y-4 sm:space-y-6">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onVote={handleVote}
                    onPaymentSuccess={handlePaymentSuccess}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Upload Modal */}
      {address && (
        <UploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onUploadSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}