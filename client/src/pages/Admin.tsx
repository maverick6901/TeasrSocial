import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, DollarSign, Eye, TrendingUp, Users, FileText, CreditCard } from 'lucide-react';
import { Payment, Post, User } from '@shared/schema';
import { useWebSocketMessage } from '@/lib/WebSocketContext';

interface AdminStats {
  totalRevenue: string;
  totalPayments: number;
  totalPosts: number;
  totalUsers: number;
  totalViews: number;
  viralPosts: number;
}

export default function Admin() {
  const queryClient = useQueryClient();
  
  const { data: stats } = useQuery<AdminStats>({
    queryKey: ['/api/admin/stats'],
    queryFn: async () => {
      const walletAddress = (window as any).walletAddress;
      const response = await fetch('/api/admin/stats', {
        headers: {
          'x-wallet-address': walletAddress || '',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
  });

  const { data: recentPayments } = useQuery<(Payment & { post: Post; user: User })[]>({
    queryKey: ['/api/admin/payments'],
    queryFn: async () => {
      const walletAddress = (window as any).walletAddress;
      const response = await fetch('/api/admin/payments', {
        headers: {
          'x-wallet-address': walletAddress || '',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch payments');
      return response.json();
    },
  });

  const { data: viralPosts } = useQuery<Post[]>({
    queryKey: ['/api/admin/viral-posts'],
    queryFn: async () => {
      const walletAddress = (window as any).walletAddress;
      const response = await fetch('/api/admin/viral-posts', {
        headers: {
          'x-wallet-address': walletAddress || '',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch viral posts');
      return response.json();
    },
  });

  // WebSocket for live updates
  useWebSocketMessage((message) => {
    if (message.type === 'viewUpdate' || message.type === 'voteUpdate' || message.type === 'viralNotification') {
      // Refresh admin stats when any engagement happens
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
    }
  });

  const StatCard = ({ icon: Icon, label, value, subtitle }: any) => (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 rounded-lg bg-primary/10">
          <Icon className="w-6 h-6 text-primary" />
        </div>
      </div>
      <div>
        <p className="text-sm text-muted-foreground mb-1">{label}</p>
        <p className="text-3xl font-bold" data-testid={`stat-${label.toLowerCase().replace(/\s/g, '-')}`}>
          {value}
        </p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/">
                <div>
                  <Button variant="ghost" size="icon" data-testid="button-back">
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                </div>
              </Link>
              <div>
                <h1 className="text-2xl font-bold font-display">Admin Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  Monitor payments, engagement, and viral content
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={Users}
          label="Total Followers"
          value={stats?.totalUsers || 0}
        />
        <StatCard
          icon={FileText}
          label="Total Posts"
          value={stats?.totalPosts || 0}
        />
        <StatCard
          icon={DollarSign}
          label="Total Revenue"
          value={`${parseFloat(stats?.totalRevenue || '0').toFixed(2)} USDC`}
        />
        <StatCard
          icon={Eye}
          label="Total Views"
          value={stats?.totalViews?.toLocaleString() || '0'}
        />
        <StatCard
          icon={CreditCard}
          label="Total Purchases"
          value={stats?.totalPayments || 0}
        />
        <StatCard
          icon={TrendingUp}
          label="Viral Posts"
          value={stats?.viralPosts || 0}
        />
      </div>

        {/* Recent Payments */}
        <Card className="mb-8">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold">Recent Payments</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Post
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Network
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!recentPayments || recentPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                      No payments yet
                    </td>
                  </tr>
                ) : (
                  recentPayments.map((payment) => (
                    <tr key={payment.payments.id} className="hover:bg-muted/30" data-testid={`payment-row-${payment.payments.id}`}>
                      <td className="px-6 py-4 text-sm">
                        {payment.users?.username || 'Unknown User'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {payment.posts?.title || 'Deleted Post'}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold">
                        {payment.payments.amount} {payment.payments.cryptocurrency}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Badge variant="outline">
                          {payment.payments.network}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Badge variant={payment.payments.paymentType === 'content' ? 'default' : 'secondary'}>
                          {payment.payments.paymentType}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {new Date(payment.payments.paidAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Viral Posts */}
        <Card>
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-orange-500" />
              Viral Posts
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Views
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Upvotes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Revenue
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Went Viral
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!viralPosts || viralPosts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                      No viral posts yet
                    </td>
                  </tr>
                ) : (
                  viralPosts.map((post) => (
                    <tr key={post.id} className="hover:bg-muted/30" data-testid={`viral-post-${post.id}`}>
                      <td className="px-6 py-4 text-sm font-medium">
                        {post.title}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {post.viewCount}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {post.upvoteCount}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold">
                        {post.price} USDC
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-green-600">
                        {parseFloat(post.revenue || '0').toFixed(2)} USDC
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {post.viralDetectedAt 
                          ? new Date(post.viralDetectedAt).toLocaleDateString()
                          : '-'
                        }
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}