
import { useQuery } from '@tanstack/react-query';
import { PostWithCreator } from '@shared/schema';
import { TrendingUp, DollarSign } from 'lucide-react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

function ViralPostCard({ post, index }: { post: PostWithCreator; index: number }) {
  const [revenue, setRevenue] = useState<string>('0.00');
  const [, setLocation] = useLocation();

  useEffect(() => {
    const fetchRevenue = async () => {
      try {
        const response = await fetch(`/api/posts/${post.id}/revenue?t=${Date.now()}`);
        if (!response.ok) {
          throw new Error('Failed to fetch revenue');
        }
        const data = await response.json();
        setRevenue(data.revenue || '0.00');
      } catch (err) {
        console.error('Error fetching revenue for post', post.id, err);
        setRevenue('0.00');
      }
    };
    
    fetchRevenue();
    // Refetch every 10 seconds to get updated revenue
    const interval = setInterval(fetchRevenue, 10000);
    return () => clearInterval(interval);
  }, [post.id]);

  const handleClick = () => {
    // Navigate to feed if not already there
    setLocation('/');
    
    // Wait for navigation and DOM update, then scroll to post
    setTimeout(() => {
      const postElement = document.querySelector(`[data-post-id="${post.id}"]`);
      if (postElement) {
        postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add a brief highlight effect
        postElement.classList.add('ring-2', 'ring-orange-500', 'ring-offset-2');
        setTimeout(() => {
          postElement.classList.remove('ring-2', 'ring-orange-500', 'ring-offset-2');
        }, 2000);
      }
    }, 100);
  };

  return (
    <div 
      onClick={handleClick}
      className="flex items-center gap-2 px-4 py-1 bg-background/50 backdrop-blur-sm rounded-full border border-orange-500/30 hover:border-orange-500/60 transition-colors cursor-pointer whitespace-nowrap min-w-max"
    >
      <TrendingUp className="w-4 h-4 text-orange-500" />
      <span className="text-sm font-medium">
        {post.title}
      </span>
      <span className="text-xs text-muted-foreground">
        by @{post.creator.username}
      </span>
      <div className="flex items-center gap-1 text-xs text-green-600 font-semibold">
        <DollarSign className="w-3 h-3" />
        {parseFloat(revenue).toFixed(2)}
      </div>
    </div>
  );
}

export function ViralPostBanner() {
  const { data: posts } = useQuery<PostWithCreator[]>({
    queryKey: ['/api/posts'],
  });

  const viralPosts = posts?.filter(p => p.isViral) || [];

  if (viralPosts.length === 0) return null;

  // Create enough duplicates for seamless infinite scroll
  const duplicatedPosts = [...viralPosts, ...viralPosts, ...viralPosts, ...viralPosts];
  
  // Calculate total width for animation (approximate 250px per card)
  const cardWidth = 250;
  const totalWidth = viralPosts.length * cardWidth;

  return (
    <div className="w-full bg-gradient-to-r from-orange-500/10 via-red-500/10 to-pink-500/10 border-b border-orange-500/20 overflow-hidden py-2">
      <motion.div
        className="flex gap-6"
        animate={{
          x: [-totalWidth, 0],
        }}
        transition={{
          x: {
            repeat: Infinity,
            repeatType: "loop",
            duration: viralPosts.length * 5,
            ease: "linear",
          },
        }}
      >
        {duplicatedPosts.map((post, index) => (
          <ViralPostCard key={`${post.id}-${index}`} post={post} index={index} />
        ))}
      </motion.div>
    </div>
  );
}
