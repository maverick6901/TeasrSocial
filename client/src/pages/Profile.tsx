import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, Link, useLocation } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Upload, User, Users, FileText, Lock, DollarSign, MessageCircle } from 'lucide-react';
import { UserWithStats, PostWithCreator, User as UserType } from '@shared/schema';
import { useWallet } from '@/lib/wallet';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { PostCard } from '@/components/PostCard';
import { Navbar } from '@/components/Navbar';
import { useWebSocket } from '@/lib/useWebSocket';
import { ReferralDashboard } from '@/components/ReferralDashboard';
import { InvestorEarnings } from "@/components/InvestorEarnings";
import { GridToggle } from "@/components/GridToggle";
import { ProfileGrid } from "@/components/ProfileGrid";
import { useInvestorDashboard } from "@/hooks/use-investor-dashboard";

function RevenueDisplay({ userId, walletAddress }: { userId: string; walletAddress?: string | null }) {
  const [revenue, setRevenue] = useState<string>('0');
  const [investorEarnings, setInvestorEarnings] = useState<string>('0');

  useEffect(() => {
    const fetchRevenue = () => {
      fetch(`/api/users/${userId}/revenue`)
        .then(res => res.json())
        .then(data => setRevenue(data.revenue))
        .catch(err => console.error('Error fetching revenue:', err));
    };

    const fetchInvestorEarnings = () => {
      if (!walletAddress) return;
      
      fetch('/api/investors/dashboard', {
        headers: { 'x-wallet-address': walletAddress },
      })
        .then(res => res.json())
        .then(data => {
          if (data.totalEarnings) {
            setInvestorEarnings(data.totalEarnings);
          }
        })
        .catch(err => console.error('Error fetching investor earnings:', err));
    };

    fetchRevenue();
    fetchInvestorEarnings();
    
    // Update every 10 seconds for real-time updates
    const interval = setInterval(() => {
      fetchRevenue();
      fetchInvestorEarnings();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [userId, walletAddress]);

  // Parse revenue values with safety checks to prevent NaN display
  const revenueValue = parseFloat(revenue);
  const investorValue = parseFloat(investorEarnings);
  
  // Default to 0 if values are not finite numbers
  const safeRevenue = Number.isFinite(revenueValue) ? revenueValue : 0;
  const safeInvestorEarnings = Number.isFinite(investorValue) ? investorValue : 0;
  
  const totalRevenue = (safeRevenue + safeInvestorEarnings).toFixed(2);

  return (
    <div className="text-center">
      <div className="text-xl sm:text-2xl font-bold text-green-600 flex items-center justify-center gap-1">
        <DollarSign className="w-5 h-5" />
        {totalRevenue}
      </div>
      <div className="text-xs sm:text-sm text-muted-foreground">
        Revenue (USD)
        {safeInvestorEarnings > 0 && (
          <div className="text-purple-600 font-medium mt-1">
            +${safeInvestorEarnings.toFixed(2)} from investments
          </div>
        )}
      </div>
    </div>
  );
}

export default function Profile() {
  const [, params] = useRoute('/profile/:username');
  const username = params?.username || '';
  const { address } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [showEditModal, setShowEditModal] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('posts');
  const [gridView, setGridView] = useState<"single" | "grid">("grid");
  const { data: investorData, refetch: refetchInvestorData } = useInvestorDashboard(address);

  // Refresh investor data when WebSocket receives updates
  useWebSocket((message) => {
    if (message.type === 'buyoutUpdate' && message.payload?.investorEarnings) {
      refetchInvestorData();
    }
  });


  const { data: profile, isLoading } = useQuery<UserWithStats>({
    queryKey: [`/api/users/${username}`, address],
    enabled: !!username,
    queryFn: async () => {
      const walletAddress = (window as any).walletAddress || address;
      const response = await fetch(`/api/users/${username}`, {
        headers: walletAddress ? { 'x-wallet-address': walletAddress } : {},
      });
      if (!response.ok) {
        throw new Error('Failed to fetch profile');
      }
      return response.json();
    },
  });

  // Check if viewing own profile
  const isOwnProfile = profile && address && profile.walletAddress.toLowerCase() === address.toLowerCase();

  const { data: allPosts } = useQuery<PostWithCreator[]>({
    queryKey: ['/api/posts', address],
    queryFn: async () => {
      const walletAddress = (window as any).walletAddress || address;
      const response = await fetch('/api/posts', {
        headers: walletAddress ? { 'x-wallet-address': walletAddress } : {},
      });
      if (!response.ok) {
        throw new Error('Failed to fetch posts');
      }
      return response.json();
    },
  });

  // Check if current user has paid for this profile user's content OR vice versa
  const { data: paymentRelationships } = useQuery<{ patrons: UserType[]; creatorsPaid: UserType[] }>({
    queryKey: ['payment-relationships', address],
    enabled: !!address && !isOwnProfile,
    queryFn: async () => {
      const walletAddress = (window as any).walletAddress || address;
      const response = await fetch('/api/users/payment-relationships', {
        headers: walletAddress ? { 'x-wallet-address': walletAddress } : {},
      });
      if (!response.ok) {
        return { patrons: [], creatorsPaid: [] };
      }
      return response.json();
    },
  });

  // Bidirectional messaging: show button if EITHER you paid for their content OR they paid for yours
  const hasMessagingAccess = 
    (paymentRelationships?.creatorsPaid?.some(user => user.id === profile?.id) ?? false) || 
    (paymentRelationships?.patrons?.some(user => user.id === profile?.id) ?? false);

  // Show all posts created by this user (including locked ones for visitors)
  const userPosts = allPosts?.filter(post => post.creatorId === profile?.id) || [];

  // Only show unlocked content that the current user has purchased from OTHER creators
  const unlockedPosts = allPosts?.filter(post => {
    // Show posts that user has paid for AND is not the creator
    return post.hasUserPaid && post.creatorId !== profile?.id;
  }) || [];

  // WebSocket for live updates
  useWebSocket((message) => {
    if (message.type === 'viewUpdate' && message.payload) {
      queryClient.setQueryData(['/api/posts', address], (oldPosts: PostWithCreator[] | undefined) => {
        if (!oldPosts) return oldPosts;
        return oldPosts.map(post =>
          post.id === message.payload.postId
            ? { ...post, viewCount: message.payload.viewCount }
            : post
        );
      });
    } else if (message.type === 'voteUpdate') {
      queryClient.setQueryData(['/api/posts', address], (oldPosts: PostWithCreator[] | undefined) => {
        if (!oldPosts) return oldPosts;
        return oldPosts.map(post =>
          post.id === message.payload.postId
            ? { ...post, upvoteCount: message.payload.upvoteCount, downvoteCount: message.payload.downvoteCount }
            : post
        );
      });
    }
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      const walletAddress = (window as any).walletAddress || address;
      if (!walletAddress) {
        throw new Error('Please connect your wallet first');
      }
      const response = await fetch(`/api/users/${username}/follow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': walletAddress,
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to follow/unfollow');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${username}`] });
      toast({
        title: profile?.isFollowing ? 'Unfollowed' : 'Following',
        description: profile?.isFollowing ? `You unfollowed @${username}` : `You are now following @${username}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const walletAddress = (window as any).walletAddress || address;
      const response = await fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          'x-wallet-address': walletAddress || '',
        },
        body: formData,
      });
      if (!response.ok) throw new Error('Failed to update profile');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${username}`] });
      setShowEditModal(false);
      toast({
        title: 'Profile updated',
        description: 'Your profile has been updated successfully',
      });
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfileImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditProfile = () => {
    setEditUsername(profile?.username || '');
    setEditBio(profile?.bio || '');
    setImagePreview(profile?.profileImagePath || null);
    setShowEditModal(true);
  };

  const handleSaveProfile = () => {
    const formData = new FormData();
    if (editUsername) formData.append('username', editUsername);
    if (editBio) formData.append('bio', editBio);
    if (profileImage) formData.append('profileImage', profileImage);
    updateProfileMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="max-w-5xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-muted rounded-lg"></div>
            <div className="h-64 bg-muted rounded-lg"></div>
          </div>
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="max-w-5xl mx-auto px-4 py-8">
          <Card className="p-12 text-center">
            <User className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-semibold mb-2">User not found</h2>
            <p className="text-muted-foreground mb-6">
              The user @{username} doesn't exist
            </p>
            <Link href="/">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Feed
              </Button>
            </Link>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Profile Header */}
        <Card className="p-4 sm:p-6 lg:p-8 mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
            <Avatar className="w-24 h-24 sm:w-32 sm:h-32">
              <AvatarImage src={profile.profileImagePath || undefined} />
              <AvatarFallback className="text-2xl sm:text-3xl">
                {profile.username.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 text-center sm:text-left w-full">
              <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 mb-4">
                <h1 className="text-2xl sm:text-3xl font-bold">@{profile.username}</h1>
                {isOwnProfile ? (
                  <Button onClick={handleEditProfile} variant="outline" size="sm" className="w-full sm:w-auto">
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Profile
                  </Button>
                ) : (
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button 
                      onClick={() => followMutation.mutate()} 
                      variant={profile.isFollowing ? "outline" : "default"}
                      disabled={!address || followMutation.isPending}
                      className="flex-1 sm:flex-initial"
                      data-testid="button-follow"
                    >
                      {profile.isFollowing ? 'Unfollow' : 'Follow'}
                    </Button>
                    {hasMessagingAccess && (
                      <Button 
                        onClick={() => setLocation(`/messages?user=${profile.id}`)} 
                        variant="outline"
                        disabled={!address}
                        className="flex-1 sm:flex-initial"
                        data-testid="button-message"
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Message
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {profile.bio && (
                <p className="text-muted-foreground mb-4">{profile.bio}</p>
              )}

              <div className="flex justify-center sm:justify-start gap-4 sm:gap-6">
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold">{profile.postCount || 0}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Posts</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold">{profile.followerCount || 0}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Followers</div>
                </div>
                <div className="text-center">
                  <div className="text-xl sm:text-2xl font-bold">{profile.followingCount || 0}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Following</div>
                </div>
                <RevenueDisplay userId={profile.id} walletAddress={isOwnProfile ? address : null} />
              </div>
            </div>
          </div>
        </Card>

        {isOwnProfile && investorData && investorData.investments.length > 0 && (
          <Card className="p-4 sm:p-6 mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4">Investor Dashboard</h2>
            <InvestorEarnings 
              totalEarnings={investorData.totalEarnings}
              investments={investorData.investments}
            />
          </Card>
        )}

        {/* Tabbed Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-3">
            <TabsTrigger value="posts">Posts</TabsTrigger>
            {isOwnProfile && <TabsTrigger value="unlocked">Unlocked</TabsTrigger>}
            {isOwnProfile && <TabsTrigger value="referrals">Referrals</TabsTrigger>}
          </TabsList>

          <TabsContent value="posts" className="space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl sm:text-2xl font-semibold">Posts</h2>
              <GridToggle view={gridView} onChange={setGridView} />
            </div>
            {!userPosts || userPosts.length === 0 ? (
              <Card className="p-8 sm:p-12 text-center">
                <FileText className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg sm:text-xl font-semibold mb-2">No posts yet</h3>
                <p className="text-sm sm:text-base text-muted-foreground">
                  {isOwnProfile ? 'Start sharing exclusive content' : `@${username} hasn't posted anything yet`}
                </p>
              </Card>
            ) : (
              <ProfileGrid 
                posts={userPosts}
                view={gridView}
                pinnedPostIds={[]}
                onPostClick={(post) => {
                  // Posts can be viewed inline, no need to navigate
                }}
              />
            )}
          </TabsContent>

          {isOwnProfile && (
            <TabsContent value="unlocked" className="space-y-4 sm:space-y-6">
              <h2 className="text-xl sm:text-2xl font-semibold">Unlocked Content</h2>
              {!unlockedPosts || unlockedPosts.length === 0 ? (
                <Card className="p-8 sm:p-12 text-center">
                  <Lock className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg sm:text-xl font-semibold mb-2">No unlocked content</h3>
                  <p className="text-sm sm:text-base text-muted-foreground">
                    Content you unlock will appear here
                  </p>
                </Card>
              ) : (
                <div className="space-y-4 sm:space-y-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl sm:text-2xl font-semibold">Unlocked Content</h2>
                  <GridToggle view={gridView} onChange={setGridView} />
                </div>
                {gridView === "single" ? (
                  <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">
                    {unlockedPosts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        onVote={() => {}}
                        onPaymentSuccess={() => queryClient.invalidateQueries({ queryKey: [`/api/posts`] })}
                      />
                    ))}
                  </div>
                ) : (
                  <ProfileGrid 
                    posts={unlockedPosts}
                    view={gridView}
                    pinnedPostIds={[]}
                    onPostClick={(post) => {}}
                  />
                )}
              </div>
              )}
            </TabsContent>
          )}

          {isOwnProfile && (
            <TabsContent value="referrals" className="space-y-4 sm:space-y-6">
              <ReferralDashboard />
            </TabsContent>
          )}
        </Tabs>
      </main>

      {/* Edit Profile Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center gap-4">
              <Avatar className="w-24 h-24">
                <AvatarImage src={imagePreview || undefined} />
                <AvatarFallback>
                  {editUsername.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <Label htmlFor="profile-image" className="cursor-pointer">
                <div className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <Upload className="w-4 h-4" />
                  Change Profile Picture
                </div>
                <Input
                  id="profile-image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </Label>
            </div>

            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                placeholder="Enter username"
              />
            </div>

            <div>
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="Tell us about yourself..."
                rows={4}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowEditModal(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSaveProfile} className="flex-1" disabled={updateProfileMutation.isPending}>
              {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}