import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { InvestorBadge } from "@/components/InvestorBadge";
import { GridToggle } from "@/components/GridToggle";
import { ProfileGrid } from "@/components/ProfileGrid";
import { InvestorEarnings } from "@/components/InvestorEarnings";
import { Sparkles, TrendingUp, Users, Grid3x3 } from "lucide-react";
import { PostWithCreator } from "@shared/schema";
import { useWallet } from "@/lib/wallet";
import { useInvestorDashboard } from "@/hooks/use-investor-dashboard";
import { useWebSocketMessage } from "@/lib/WebSocketContext";

export default function InvestorShowcase() {
  const [gridView, setGridView] = useState<"single" | "grid">("grid");
  const { address } = useWallet();
  const { data: investorData, refetch: refetchInvestorData } = useInvestorDashboard(address);

  // Refresh investor data when WebSocket receives updates
  useWebSocketMessage((message) => {
    if (message.type === 'buyoutUpdate' && message.payload?.investorEarnings) {
      refetchInvestorData();
    }
    if (message.type === 'investorEarningsUpdate') {
      refetchInvestorData();
    }
  });

  // Fetch user's buyout purchases
  const { data: allPosts } = useQuery<PostWithCreator[]>({
    queryKey: ['/api/posts', address],
    enabled: !!address,
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

  // Filter only posts that user bought outright
  const buyoutPosts = allPosts?.filter(post => post.hasUserPaid && post.buyoutPrice) || [];

  // Use real data only - no mock data
  const displayPosts: PostWithCreator[] = buyoutPosts;
  

const pinnedPostIds: string[] = [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-1.5">
            <Sparkles className="w-4 h-4 mr-1" />
            New Features
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-bold">
            Investor Revenue Sharing
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Become an early investor and earn revenue share from every future unlock of that content!
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold">Early Investor Spots</h3>
            <p className="text-sm text-muted-foreground">
              Creators set the number of investor spots (1-100). Visual indicator shows remaining spots in real-time.
            </p>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold">Passive Earnings</h3>
            <p className="text-sm text-muted-foreground">
              Earn a percentage from each subsequent unlock automatically. Track your earnings dashboard in real-time.
            </p>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Grid3x3 className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="text-xl font-semibold">Profile Grid Layouts</h3>
            <p className="text-sm text-muted-foreground">
              Toggle between single-column and 3-column grid views. Pin your top-earning content to profile top.
            </p>
          </Card>
        </div>

        {/* Interactive Demo Tabs */}
        <Tabs defaultValue="investor-badge" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-3">
            <TabsTrigger value="investor-badge">Investor Badge</TabsTrigger>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
            <TabsTrigger value="grid-layout">Grid Layout</TabsTrigger>
          </TabsList>

          <TabsContent value="investor-badge" className="space-y-6">
            <Card className="p-8">
              <h3 className="text-xl font-semibold mb-6">Investor Spot Indicators</h3>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <p className="text-sm font-medium text-muted-foreground">3 out of 10 spots filled</p>
                  <InvestorBadge investorCount={3} showProgress={true} />
                </div>
                
                <div className="space-y-4">
                  <p className="text-sm font-medium text-muted-foreground">9 out of 10 spots filled</p>
                  <InvestorBadge investorCount={9} showProgress={true} />
                </div>
                
                <div className="space-y-4">
                  <p className="text-sm font-medium text-muted-foreground">All spots filled</p>
                  <InvestorBadge investorCount={10} showProgress={true} />
                </div>
                
                <div className="space-y-4">
                  <p className="text-sm font-medium text-muted-foreground">Compact view (no progress)</p>
                  <InvestorBadge investorCount={5} showProgress={false} />
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="earnings" className="space-y-6">
            <Card className="p-8">
              <h3 className="text-xl font-semibold mb-6">Investor Earnings Dashboard</h3>
              {investorData && investorData.investments.length > 0 ? (
                <InvestorEarnings 
                  totalEarnings={investorData.totalEarnings} 
                  investments={investorData.investments}
                />
              ) : (
                <InvestorEarnings 
                  totalEarnings="0.00" 
                  investments={[]}
                />
              )}
            </Card>
          </TabsContent>

          <TabsContent value="grid-layout" className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Profile Post Layouts</h3>
              <GridToggle view={gridView} onChange={setGridView} />
            </div>
            
            {displayPosts.length === 0 ? (
              <Card className="p-12 text-center">
                <Grid3x3 className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">No Buyout Content</h3>
                <p className="text-muted-foreground">
                  Content you purchase outright will appear here
                </p>
              </Card>
            ) : (
              <ProfileGrid 
                posts={displayPosts}
                view={gridView}
                pinnedPostIds={pinnedPostIds}
                onPostClick={(post) => {}}
              />
            )}
          </TabsContent>
        </Tabs>

        {/* How It Works */}
        <Card className="p-8 bg-gradient-to-br from-purple-500/5 to-pink-500/5 border-purple-500/20">
          <h3 className="text-2xl font-semibold mb-6 text-center">How It Works</h3>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-purple-600 text-white text-2xl font-bold flex items-center justify-center mx-auto">
                1
              </div>
              <h4 className="font-semibold">Discover Content</h4>
              <p className="text-sm text-muted-foreground">
                Browse exclusive content and check if investor spots are available
              </p>
            </div>
            
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-purple-600 text-white text-2xl font-bold flex items-center justify-center mx-auto">
                2
              </div>
              <h4 className="font-semibold">Become an Investor</h4>
              <p className="text-sm text-muted-foreground">
                Secure your investor position before all spots are filled
              </p>
            </div>
            
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-purple-600 text-white text-2xl font-bold flex items-center justify-center mx-auto">
                3
              </div>
              <h4 className="font-semibold">Earn Passively</h4>
              <p className="text-sm text-muted-foreground">
                Automatically earn your share from every subsequent unlock of that content
              </p>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
