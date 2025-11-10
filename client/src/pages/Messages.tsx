'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/lib/wallet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, User, ArrowLeft, MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { DirectMessageWithUsers, User as UserType } from '@shared/schema';
import { useLocation } from 'wouter';
import { Navbar } from '@/components/Navbar';
import { useWebSocketMessage } from '@/lib/WebSocketContext';
import { apiRequest } from '@/lib/queryClient';

interface Conversation {
  user: UserType;
  lastMessage: string;
  lastMessageAt: string;
  hasUnread: boolean;
}

export default function Messages() {
  const { address } = useWallet();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Parse query param (auto-open chat with ?user=<id>)
  const queryParams = new URLSearchParams(location.split('?')[1] || '');
  const userIdFromQuery = queryParams.get('user');

  // -----------------------------
  // 1. Current User
  // -----------------------------
  const { data: currentUser } = useQuery<UserType>({
    queryKey: ['current-user', address],
    enabled: !!address,
    queryFn: async () => {
      const authResponse = await apiRequest('POST', '/api/users/auth', { walletAddress: address });
      const authData = await authResponse.json() as UserType;

      // Fetch full user profile to get profileImagePath
      const profileResponse = await fetch(`/api/users/${authData.username}`, {
        headers: { 'x-wallet-address': address || '' },
      });
      if (!profileResponse.ok) return authData;

      return profileResponse.json() as Promise<UserType>;
    },
  });

  // -----------------------------
  // 2. Conversations (actual DM threads with messages)
  // -----------------------------
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['conversations', address],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch('/api/messages/conversations', {
        headers: { 'x-wallet-address': address || '' },
      });
      if (!res.ok) throw new Error('Failed to fetch conversations');
      return res.json();
    },
  });

  // -----------------------------
  // 3. Messages
  // -----------------------------
  const { data: messages = [] } = useQuery<DirectMessageWithUsers[]>({
    queryKey: ['messages', selectedUser?.id],
    enabled: !!selectedUser && !!address,
    queryFn: async () => {
      if (!selectedUser) return [];
      const res = await fetch(`/api/messages/${selectedUser.id}`, {
        headers: { 'x-wallet-address': address || '' },
      });
      if (!res.ok) throw new Error('Failed to load messages');
      return res.json() as Promise<DirectMessageWithUsers[]>;
    },
  });

  // -----------------------------
  // 4. WebSocket (Live Updates)
  // -----------------------------
  useWebSocketMessage((message) => {
    if (message.type === 'newMessage' && message.payload) {
      const msg = message.payload as DirectMessageWithUsers;

      if (selectedUser && (msg.senderId === selectedUser.id || msg.receiverId === selectedUser.id)) {
        queryClient.invalidateQueries({ queryKey: ['messages', selectedUser.id] });
      }

      queryClient.invalidateQueries({ queryKey: ['conversations', address] });
    }
  });

  // -----------------------------
  // 5. Auto-select user if opened via ?user=<id>
  // -----------------------------
  useEffect(() => {
    if (userIdFromQuery && conversations.length > 0 && !selectedUser) {
      const conversation = conversations.find((conv) => conv.user.id === userIdFromQuery);
      if (conversation) {
        setSelectedUser(conversation.user);
        setLocation('/messages');
      }
    }
  }, [userIdFromQuery, conversations, selectedUser, setLocation]);

  // -----------------------------
  // 6. Auto-scroll
  // -----------------------------
  useEffect(() => {
    if (messages.length > 0 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // -----------------------------
  // 7. Send Message
  // -----------------------------
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedUser) throw new Error('No recipient selected');
      const response = await apiRequest('POST', `/api/messages/${selectedUser.id}`, { 
        content: content.trim() 
      });
      return response.json() as Promise<DirectMessageWithUsers>;
    },
    onSuccess: () => {
      setInput('');
      queryClient.invalidateQueries({ queryKey: ['messages', selectedUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations', address] });
    },
    onError: (err: any) => {
      alert(`Send failed: ${err.message}`);
    },
  });

  // -----------------------------
  // 8. Mark as Read
  // -----------------------------
  useEffect(() => {
    if (selectedUser && address) {
      fetch(`/api/messages/${selectedUser.id}/read`, {
        method: 'PUT',
        headers: { 'x-wallet-address': address },
      }).catch(console.error);
    }
  }, [selectedUser, address]);

  // -----------------------------
  // 9. Wallet Not Connected
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

  // -----------------------------
  // 10. Render
  // -----------------------------
  return (
    <>
      <Navbar />
      <div className="container mx-auto p-2 sm:p-4 pt-20">
        <Button variant="ghost" onClick={() => setLocation('/')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Feed
        </Button>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-140px)]">
          {/* Sidebar */}
          <Card className={`${selectedUser ? 'hidden md:block' : ''} md:col-span-1 overflow-hidden flex flex-col`}>
            <div className="p-3 sm:p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-lg">Messages</h2>
            </div>
            <ScrollArea className="flex-1">
              {conversations.length === 0 ? (
                <div className="p-4 sm:p-6 text-center">
                  <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm text-muted-foreground font-medium">No conversations yet</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Unlock content to start chatting with creators
                  </p>
                </div>
              ) : (
                conversations.map((conversation) => (
                  <div
                    key={conversation.user.id}
                    className={`p-3 sm:p-4 border-b cursor-pointer hover:bg-accent/50 active:bg-accent transition-colors ${
                      selectedUser?.id === conversation.user.id ? 'bg-accent/70' : ''
                    }`}
                    onClick={() => setSelectedUser(conversation.user)}
                    data-testid={`conversation-${conversation.user.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="w-10 h-10 sm:w-12 sm:h-12 ring-2 ring-background">
                        <AvatarImage src={conversation.user.profileImagePath || ''} alt={conversation.user.username} />
                        <AvatarFallback>
                          <User className="w-5 h-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <p className="font-semibold truncate text-sm sm:text-base">@{conversation.user.username}</p>
                          {conversation.hasUnread && (
                            <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 ml-2" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{conversation.lastMessage}</p>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          {formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true })}
                        </p>
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
                {/* Header */}
                <div className="p-3 sm:p-4 border-b flex items-center gap-2 bg-background/95 backdrop-blur sticky top-0 z-10">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden flex-shrink-0"
                    onClick={() => setSelectedUser(null)}
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <Avatar className="w-9 h-9 sm:w-10 sm:h-10 ring-2 ring-background">
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

                {/* Scrollable Chat */}
                <ScrollArea
                  className="flex-1 p-3 sm:p-4 overflow-y-auto scroll-smooth"
                  ref={scrollAreaRef}
                  style={{ maxHeight: 'calc(100vh - 220px)' }}
                >
                  <div className="space-y-3 sm:space-y-4">
                    {messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full min-h-[200px]">
                        <p className="text-center text-sm text-muted-foreground">No messages yet. Say hi!</p>
                      </div>
                    ) : (
                      <>
                        {messages.map((msg) => {
                          const isMe = msg.senderId === currentUser?.id;
                          // Determine which user's avatar to show for the message
                          // If it's my message, show my avatar; otherwise, show the other user's (msg.sender)
                          const messageUser = msg.senderId === currentUser?.id ? currentUser : msg.sender;
                          const avatarSrc = messageUser?.profileImagePath || '';
                          const avatarAlt = messageUser?.username || '';

                          return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                              <div className={`flex gap-2 max-w-[85%] sm:max-w-[75%] lg:max-w-md ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                <Avatar className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0">
                                  <AvatarImage src={avatarSrc} alt={avatarAlt} />
                                  <AvatarFallback>
                                    <User className="w-3 h-3 sm:w-4 sm:h-4" />
                                  </AvatarFallback>
                                </Avatar>
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

                {/* Message Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (canSend) sendMutation.mutate(input);
                  }}
                  className="p-3 sm:p-4 border-t bg-background/95 backdrop-blur sticky bottom-0"
                >
                  <div className="flex gap-2 items-end">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (canSend) sendMutation.mutate(input);
                        }
                      }}
                      placeholder="Type a message..."
                      className="flex-1 resize-none min-h-[40px] max-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      disabled={sendMutation.isPending}
                      rows={1}
                      onInput={(e) => {
                        const target = e.target as HTMLTextAreaElement;
                        target.style.height = 'auto';
                        target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                      }}
                    />
                    <Button type="submit" size="icon" disabled={!canSend} className="h-10 w-10">
                      {sendMutation.isPending ? (
                        <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" />
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
                <MessageCircle className="w-12 h-12 mb-2 opacity-50" />
                <p className="text-sm">Select a conversation to start messaging</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}