import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Wallet, Upload, Home, BarChart3, LogOut, Moon, Sun, User, Trophy, Bell, MessageCircle, Link as LinkIcon, DollarSign } from 'lucide-react';
import { useWallet } from '@/lib/wallet';
import { useTheme } from '@/lib/theme';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useQuery } from '@tanstack/react-query';
import type { User as UserType } from '@shared/schema';
import { UploadModal } from './UploadModal';
import { UserSearch } from './UserSearch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function Navbar() {
  const { address, isConnecting, connect, disconnect } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showWalletSelector, setShowWalletSelector] = useState(false);

  const { data: currentUser } = useQuery<UserType>({
    queryKey: [`/api/users/${address}`],
    enabled: !!address,
    queryFn: async () => {
      const response = await fetch(`/api/users/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: address,
          username: `user_${address?.substring(2, 8)}`,
        }),
      });
      return response.json();
    },
  });

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: ['/api/notifications/unread-count', address],
    queryFn: async () => {
      const walletAddress = (window as any).walletAddress || address || localStorage.getItem('walletAddress');
      if (!walletAddress) {
        return { count: 0 };
      }
      const response = await fetch('/api/notifications/unread-count', {
        headers: {
          'x-wallet-address': walletAddress,
        },
      });
      if (!response.ok) {
        return { count: 0 };
      }
      return await response.json();
    },
    enabled: !!address,
    refetchInterval: 30000,
  });

  const truncateAddress = (addr: string) => {
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <Link href="/">
            <div className="flex items-center space-x-2 hover-elevate active-elevate-2 rounded-lg px-2 sm:px-3 py-2 -ml-2 sm:-ml-3 cursor-pointer" data-testid="link-home">
              <div className="text-lg sm:text-xl md:text-2xl font-bold font-display bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                TEASR
              </div>
            </div>
          </Link>

          {/* Search Bar - Desktop Only */}
          {address && (
            <div className="block flex-1 max-w-md mx-4 w-full">
              <UserSearch />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-3">
            {/* Theme Toggle */}
            <Button
              onClick={toggleTheme}
              variant="ghost"
              size="icon"
              data-testid="button-theme-toggle"
              className="rounded-full w-9 h-9"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
            </Button>

            {address && (
              <>
                {/* Notifications Bell */}
                <Link href="/notifications">
                  <Button variant="ghost" size="icon" className="relative w-9 h-9" data-testid="link-notifications">
                    <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                    {unreadCount && unreadCount.count > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center p-0 text-[10px] sm:text-xs"
                      >
                        {unreadCount.count > 9 ? '9+' : unreadCount.count}
                      </Badge>
                    )}
                  </Button>
                </Link>

                {/* Messages Navigation Button - Hidden on mobile */}
                <Link href="/messages">
                  <Button variant="ghost" size="icon" className="hidden sm:flex w-9 h-9" data-testid="link-messages">
                    <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                  </Button>
                </Link>

                {/* Leaderboard - Hidden on small screens */}
                <Link href="/leaderboard">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hidden md:flex w-9 h-9"
                    data-testid="link-leaderboard"
                  >
                    <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                  </Button>
                </Link>
              </>
            )}

            {!address ? (
              <Button
                onClick={() => setShowWalletSelector(true)}
                disabled={isConnecting}
                variant="default"
                size="sm"
                className="text-xs sm:text-sm h-9"
                data-testid="button-connect-wallet"
              >
                <Wallet className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                {isConnecting ? 'Connecting...' : 'Connect'}
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full w-9 h-9" data-testid="button-user-menu">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={currentUser?.profileImagePath || undefined} />
                      <AvatarFallback className="text-xs">
                        <User className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">Connected</p>
                      <p className="text-xs leading-none text-muted-foreground" data-testid="text-wallet-address">
                        {truncateAddress(address)}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  {/* Upload Button in Dropdown */}
                  <DropdownMenuItem 
                    onClick={() => setShowUploadModal(true)}
                    data-testid="menu-item-upload"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Content
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem asChild data-testid="menu-item-feed">
                    <Link href="/">
                      <Home className="w-4 h-4 mr-2" />
                      Feed
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild data-testid="menu-item-profile">
                    <Link href={currentUser ? `/profile/${currentUser.username}` : '#'}>
                      <User className="w-4 h-4 mr-2" />
                      Profile
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild data-testid="menu-item-messages" className="sm:hidden">
                    <Link href="/messages">
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Messages
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild data-testid="menu-item-leaderboard">
                    <Link href="/leaderboard">
                      <Trophy className="w-4 h-4 mr-2" />
                      Leaderboard
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild data-testid="menu-item-investor-dashboard">
                    <Link href="/investor-dashboard">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Investor Dashboard
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild data-testid="menu-item-admin">
                    <Link href="/admin">
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Admin
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onClick={() => setShowWalletSelector(true)} data-testid="menu-item-switch-wallet">
                    <Wallet className="w-4 h-4 mr-2" />
                    Switch Wallet
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={disconnect} data-testid="menu-item-disconnect">
                    <LogOut className="w-4 h-4 mr-2" />
                    Disconnect
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {address && (
        <UploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onUploadSuccess={() => {
            setShowUploadModal(false);
          }}
        />
      )}

      {/* Wallet Selector Modal */}
      <Dialog open={showWalletSelector} onOpenChange={setShowWalletSelector}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Select Wallet</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Choose which wallet to connect
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <Button
              onClick={async () => {
                setShowWalletSelector(false);
                await connect('metamask');
              }}
              variant="outline"
              className="w-full justify-start h-auto py-3 sm:py-4"
              data-testid="button-select-metamask"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm sm:text-base">MetaMask</div>
                  <div className="text-xs text-muted-foreground">Connect with MetaMask</div>
                </div>
              </div>
            </Button>

            <Button
              onClick={async () => {
                setShowWalletSelector(false);
                await connect('phantom');
              }}
              variant="outline"
              className="w-full justify-start h-auto py-3 sm:py-4"
              data-testid="button-select-phantom"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm sm:text-base">Phantom</div>
                  <div className="text-xs text-muted-foreground">Connect with Phantom</div>
                </div>
              </div>
            </Button>

            <Button
              onClick={async () => {
                setShowWalletSelector(false);
                await connect('coinbase');
              }}
              variant="outline"
              className="w-full justify-start h-auto py-3 sm:py-4"
              data-testid="button-select-coinbase"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm sm:text-base">Coinbase Wallet</div>
                  <div className="text-xs text-muted-foreground">Connect with Coinbase</div>
                </div>
              </div>
            </Button>
          </div>

          <Button 
            onClick={() => setShowWalletSelector(false)} 
            variant="ghost" 
            className="w-full"
            data-testid="button-cancel-wallet-select"
          >
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
    </nav>
  );
}