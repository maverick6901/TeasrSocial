
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/lib/wallet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, User, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { DirectMessageWithUsers, User as UserType } from '@shared/schema';
import { useLocation } from 'wouter';
import { Navbar } from '@/components/Navbar';
import { useWebSocket } from '@/lib/useWebSocket';

const API_URL = 'https://c762b603-597d-4da8-ba6b-42f2889fe9d1-00-3qi12bbre3n9x.picard.replit.dev';

export default function Messages() {
  const { address } = useWallet();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Parse query parameter to auto-select user
  const queryParams = new URLSearchParams(location.split('?')[1] || '');
  const userIdFromQuery = queryParams.get('user');

  // -----------------------------
  // 1. Current User
  // -----------------------------
  const { data: currentUser } = useQuery<UserType>({
    queryKey: ['current-user', address],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/users/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });
      if (!res.ok) throw new Error('Auth failed');
      return res.json() as Promise<UserType>;
    },
  });

  // -----------------------------
  // 2. Paid Users (users who paid for your content or you paid for their content)
  // -----------------------------
  const { data: paymentRelationships } = useQuery<{ patrons: UserType[]; creatorsPaid: UserType[] }>({
    queryKey: ['payment-relationships', currentUser?.id],
    enabled: !!currentUser?.id,
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/users/payment-relationships`, {
        headers: { 'x-wallet-address': address || '' },
      });
      if (!res.ok) return { patrons: [], creatorsPaid: [] };
      return res.json();
    },
  });

  // Combine patrons and creators, remove duplicates
  const paidUsers = React.useMemo(() => {
    if (!paymentRelationships) return [];
    const combined = [...paymentRelationships.patrons, ...paymentRelationships.creatorsPaid];
    const uniqueUsers = combined.filter((user, index, self) =>
      index === self.findIndex((u) => u.id === user.id)
    );
    return uniqueUsers;
  }, [paymentRelationships]);

  // -----------------------------
  // 3. Messages Query
  // -----------------------------
  const { data: messages = [] } = useQuery<DirectMessageWithUsers[]>({
    queryKey: ['messages', selectedUser?.id],
    enabled: !!selectedUser && !!address,
    queryFn: async () => {
      if (!selectedUser) return [];
      const res = await fetch(`${API_URL}/api/messages/${selectedUser.id}`, {
        headers: { 'x-wallet-address': address || '' },
      });
      if (!res.ok) throw new Error('Failed to load messages');
      return res.json() as Promise<DirectMessageWithUsers[]>;
    },
  });

  // WebSocket integration for real-time messages
  useWebSocket((message) => {
    if (message.type === 'newMessage' && message.payload) {
      const msg = message.payload as DirectMessageWithUsers;
      
      // Invalidate messages query if this message is relevant to current conversation
      if (selectedUser && (msg.senderId === selectedUser.id || msg.receiverId === selectedUser.id)) {
        queryClient.invalidateQueries({ queryKey: ['messages', selectedUser.id] });
      }
      
      // Always invalidate conversations to update unread counts
      queryClient.invalidateQueries({ queryKey: ['payment-relationships', currentUser?.id] });
    }
  });

  // Auto-select user from query param when paidUsers loads
  useEffect(() => {
    if (userIdFromQuery && paidUsers.length > 0 && !selectedUser) {
      const userToSelect = paidUsers.find(u => u.id === userIdFromQuery);
      if (userToSelect) {
        setSelectedUser(userToSelect);
        // Clear the query param after selecting
        setLocation('/messages');
      }
    }
  }, [userIdFromQuery, paidUsers, selectedUser, setLocation]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // -----------------------------
  // 4. Send Message
  // -----------------------------
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedUser || !address) throw new Error('No recipient or wallet');

      const payload = {
        content: content.trim(),
      };

      console.log('[Send Debug] Sending message to:', selectedUser.id, 'content:', content);

      const res = await fetch(`${API_URL}/api/messages/${selectedUser.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': address,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[Send Debug] Error Body:', errorText);
        throw new Error(errorText || `HTTP ${res.status} - Check backend /api/messages`);
      }

      return res.json() as Promise<DirectMessageWithUsers>;
    },
    onSuccess: () => {
      setInput('');
      queryClient.invalidateQueries({ queryKey: ['messages', selectedUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['payment-relationships', currentUser?.id] });
    },
    onError: (err: any) => {
      console.error('[Send Error]', err);
      alert(`Send failed: ${err.message}`);
    },
  });

  // -----------------------------
  // 5. Mark as Read
  // -----------------------------
  useEffect(() => {
    if (selectedUser && address) {
      fetch(`${API_URL}/api/messages/${selectedUser.id}/read`, {
        method: 'PUT',
        headers: { 'x-wallet-address': address },
      }).catch(console.error);
    }
  }, [selectedUser, address]);

  // -----------------------------
  // 6. No Wallet Guard
  // -----------------------------
  if (!address) {
    return (
      <>
        <Navbar />
        <div className="container mx-auto p-4 pt-20">
          <Card className="p-6 text-center">
            <p>Connect your wallet to view messages</p>
          </Card>
        </div>
      </>
    );
  }

  const canSend = !!selectedUser && !sendMutation.isPending && input.trim().length > 0;

  return (
    <>
      <Navbar />
      <div className="container mx-auto p-2 sm:p-4 pt-20">
        <Button variant="ghost" onClick={() => setLocation('/')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Feed
        </Button>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-140px)]">
          {/* Sidebar: Chats with Paid Users */}
          <Card className={`${selectedUser ? 'hidden md:block' : ''} md:col-span-1 overflow-hidden flex flex-col`}>
            <div className="p-3 sm:p-4 border-b">
              <h2 className="font-semibold text-lg">Messages</h2>
            </div>
            <ScrollArea className="flex-1">
              {paidUsers.length === 0 ? (
                <div className="p-4 sm:p-6 text-center">
                  <User className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm text-muted-foreground font-medium">No chats available</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Unlock content to start chatting with creators
                  </p>
                </div>
              ) : (
                paidUsers.map((user) => (
                  <div
                    key={user.id}
                    data-testid={`chat-user-${user.id}`}
                    className={`p-3 sm:p-4 border-b cursor-pointer hover:bg-accent/50 active:bg-accent transition-colors ${
                      selectedUser?.id === user.id ? 'bg-accent/70' : ''
                    }`}
                    onClick={() => setSelectedUser(user)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 ring-2 ring-background">
                        <AvatarImage src={user.profileImagePath || ''} alt={user.username} />
                        <AvatarFallback>
                          <User className="w-5 h-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate text-sm sm:text-base">@{user.username}</p>
                        <p className="text-xs text-muted-foreground">Tap to chat</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </ScrollArea>
          </Card>

          {/* Chat Panel */}
          <Card className={`${!selectedUser ? 'hidden md:block' : ''} md:col-span-2 flex flex-col overflow-hidden`}>
            {selectedUser ? (
              <>
                <div className="p-3 sm:p-4 border-b flex items-center gap-2 sm:gap-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden flex-shrink-0"
                    onClick={() => setSelectedUser(null)}
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <Avatar className="w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 ring-2 ring-background">
                    <AvatarImage src={selectedUser.profileImagePath || ''} alt={selectedUser.username} />
                    <AvatarFallback>
                      <User className="w-5 h-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-sm sm:text-base">@{selectedUser.username}</p>
                    <p className="text-xs text-muted-foreground">Active now</p>
                  </div>
                </div>

                <ScrollArea className="flex-1 p-3 sm:p-4" ref={scrollAreaRef}>
                  <div className="space-y-3 sm:space-y-4">
                    {messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full min-h-[200px]">
                        <p className="text-center text-sm text-muted-foreground">No messages yet. Say hi!</p>
                      </div>
                    ) : (
                      <>
                        {messages.map((msg) => {
                          const isMe = msg.senderId === currentUser?.id;
                          return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                              <div className={`flex gap-2 max-w-[85%] sm:max-w-[75%] lg:max-w-md ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                {!isMe && (
                                  <Avatar className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0">
                                    <AvatarImage src={selectedUser?.profileImagePath || ''} alt={selectedUser?.username} />
                                    <AvatarFallback>
                                      <User className="w-3 h-3 sm:w-4 sm:h-4" />
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                                <div
                                  className={`rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 text-sm shadow-sm ${
                                    isMe 
                                      ? 'bg-primary text-primary-foreground rounded-br-sm' 
                                      : 'bg-muted text-foreground rounded-bl-sm'
                                  }`}
                                >
                                  <p className="break-words leading-relaxed">{msg.content}</p>
                                  <p className={`text-xs mt-1 ${isMe ? 'opacity-70' : 'opacity-60'}`}>
                                    {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </>
                    )}
                  </div>
                </ScrollArea>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (canSend) {
                      sendMutation.mutate(input);
                    }
                  }}
                  className="p-3 sm:p-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
                >
                  <div className="flex gap-2 items-end">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (canSend) {
                            sendMutation.mutate(input);
                          }
                        }
                      }}
                      placeholder="Type a message..."
                      className="flex-1 resize-none min-h-[40px] max-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={sendMutation.isPending}
                      autoComplete="off"
                      autoFocus
                      rows={1}
                      style={{ 
                        height: 'auto',
                        minHeight: '40px',
                      }}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                      }}
                    />
                    <Button 
                      type="submit" 
                      size="icon" 
                      disabled={!canSend}
                      className="h-10 w-10 flex-shrink-0"
                    >
                      {sendMutation.isPending ? (
                        <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin border-current" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 hidden sm:block">
                    Press Enter to send, Shift+Enter for new line
                  </p>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                <User className="w-12 h-12 mb-2 opacity-50" />
                <p className="text-sm">Select a conversation to start messaging</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
