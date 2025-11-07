import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useWallet } from '@/lib/wallet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Send, User, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import type { DirectMessageWithUsers, User as UserType } from '@shared/schema';
import { useLocation } from 'wouter';
import { Navbar } from '@/components/Navbar';

interface Conversation {
  user: UserType;
  lastMessage: string;
  lastMessageAt: string;
  hasUnread: boolean;
}

export default function Messages() {
  const { address } = useWallet();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [selectedConversation, setSelectedConversation] = useState<UserType | null>(null);
  const [messageInput, setMessageInput] = useState('');

  // Get current user data
  const { data: currentUser } = useQuery<UserType>({
    queryKey: [`/api/users/auth`, address],
    enabled: !!address,
    queryFn: async () => {
      const response = await fetch(`/api/users/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          username: `user_${address?.substring(2, 8)}`,
        }),
      });
      return response.json();
    },
  });

  // Typed conversations
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['/api/messages/conversations'],
    enabled: !!address,
  });

  // Users who paid for content
  const { data: paidUsers = [] } = useQuery<UserType[]>({
    queryKey: ['/api/users/paid-for-content', currentUser?.id],
    enabled: !!currentUser?.id,
    queryFn: async () => {
      const response = await fetch('/api/users/paid-for-content', {
        headers: { 'x-wallet-address': address || '' },
      });
      if (!response.ok) throw new Error('Failed to fetch paid users');
      return response.json();
    },
  });

  // Messages for selected conversation
  const { data: messages = [] } = useQuery<DirectMessageWithUsers[]>({
    queryKey: ['/api/messages', selectedConversation?.id],
    enabled: !!selectedConversation && !!address,
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedConversation) return;
      return apiRequest<DirectMessageWithUsers>(`/api/messages/${selectedConversation.id}`, {
        method: 'POST',
        body: JSON.stringify({ content }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/messages/conversations'] });
      setMessageInput('');
    },
  });

  useEffect(() => {
    if (selectedConversation && address) {
      apiRequest(`/api/messages/${selectedConversation.id}/read`, { method: 'PUT' })
        .then(() => queryClient.invalidateQueries({ queryKey: ['/api/messages/unread/count'] }));
    }
  }, [selectedConversation, address, queryClient]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageInput.trim()) sendMessage.mutate(messageInput);
  };

  const canMessage = paidUsers.some(u => u.id === selectedConversation?.id);

  if (!address) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="p-6 text-center">
          <p>Please connect your wallet to view messages</p>
        </Card>
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 pt-24">
        <div className="mb-4">
          <Button
            variant="ghost"
            onClick={() => setLocation('/')}
            className="hover-elevate active-elevate-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Feed
          </Button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-4 h-[calc(100vh-120px)] md:h-[600px]"
        >
          {/* Conversations & Paid Users */}
          <Card className={`${selectedConversation ? 'hidden md:block' : ''} md:col-span-1 overflow-hidden`}>
            <div className="p-3 sm:p-4 border-b bg-card/50 backdrop-blur-sm">
              <h2 className="text-lg sm:text-xl font-bold">Messages</h2>
            </div>
            <Tabs defaultValue="conversations" className="h-[calc(600px-65px)]">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="conversations">Conversations</TabsTrigger>
                <TabsTrigger value="paid-users">Paid Users</TabsTrigger>
              </TabsList>

              <TabsContent value="conversations" className="h-[calc(100%-40px)] m-0">
                <ScrollArea className="h-full">
                  {conversations.length === 0 ? (
                    <motion.div className="p-4 text-center text-muted-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      No conversations yet
                    </motion.div>
                  ) : (
                    conversations.map((conv, index) => (
                      <motion.div
                        key={conv.user.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`p-3 sm:p-4 border-b cursor-pointer hover-elevate active-elevate-2 transition-all touch-manipulation ${selectedConversation?.id === conv.user.id ? 'bg-accent/50' : ''}`}
                        onClick={() => setSelectedConversation(conv.user)}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar>
                            {conv.user.profileImagePath ? (
                              <AvatarImage src={conv.user.profileImagePath} alt={conv.user.username} />
                            ) : (
                              <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                            )}
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <p className="font-semibold truncate">@{conv.user.username}</p>
                              {conv.hasUnread && <div className="w-2 h-2 bg-primary rounded-full" />}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="paid-users" className="h-[calc(100%-40px)] m-0">
                <ScrollArea className="h-full">
                  {paidUsers.length === 0 ? (
                    <motion.div className="p-4 text-center text-muted-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      No users have paid for your content yet
                    </motion.div>
                  ) : (
                    paidUsers.map((user, index) => (
                      <motion.div
                        key={user.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`p-3 sm:p-4 border-b cursor-pointer hover-elevate active-elevate-2 transition-all touch-manipulation ${selectedConversation?.id === user.id ? 'bg-accent/50' : ''}`}
                        onClick={() => setSelectedConversation(user)}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar>
                            {user.profileImagePath ? (
                              <AvatarImage src={user.profileImagePath} alt={user.username} />
                            ) : (
                              <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                            )}
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">@{user.username}</p>
                            <p className="text-xs text-muted-foreground">Paid for your content</p>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </Card>

          {/* Messages Thread */}
          <AnimatePresence mode="wait">
            <Card className={`${!selectedConversation ? 'hidden md:block' : ''} md:col-span-2 overflow-hidden`}>
              {selectedConversation ? (
                <motion.div key="conversation" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                  <div className="p-3 sm:p-4 border-b flex items-center gap-3 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:hidden min-h-10 min-w-10 hover-elevate active-elevate-2"
                      onClick={() => setSelectedConversation(null)}
                      data-testid="button-back-messages"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <Avatar>
                      {selectedConversation.profileImagePath ? (
                        <AvatarImage src={selectedConversation.profileImagePath} alt={selectedConversation.username} />
                      ) : (
                        <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                      )}
                    </Avatar>
                    <div>
                      <h3 className="font-semibold">@{selectedConversation.username}</h3>
                    </div>
                  </div>

                  <ScrollArea className="h-[calc(100vh-240px)] md:h-[calc(600px-130px)] p-3 sm:p-4">
                    <div className="space-y-3 sm:space-y-4">
                      <AnimatePresence initial={false}>
                        {messages.map((message, index) => {
                          const isOwnMessage = message.senderId === currentUser?.id;
                          return (
                            <motion.div
                              key={message.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ delay: index * 0.03 }}
                              className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                            >
                              <div className={`max-w-[85%] sm:max-w-[70%] rounded-lg p-3 shadow-sm ${isOwnMessage ? 'bg-primary text-primary-foreground' : 'bg-accent'}`}>
                                <p className="text-sm">{message.content}</p>
                                <p className="text-xs opacity-70 mt-1">{formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}</p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </ScrollArea>

                  <form onSubmit={handleSendMessage} className="p-3 sm:p-4 border-t bg-card/50 backdrop-blur-sm">
                    <div className="flex gap-2">
                      <Input
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        placeholder={canMessage ? "Type a message..." : "Unlock content first to message"}
                        className="flex-1 min-h-10 touch-manipulation"
                        data-testid="input-message"
                        disabled={!canMessage}
                      />
                      <Button
                        type="submit"
                        size="icon"
                        className="min-h-10 min-w-10 hover-elevate active-elevate-2"
                        data-testid="button-send-message"
                        disabled={!canMessage}
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </form>
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex items-center justify-center text-muted-foreground p-8 text-center">
                  <div>
                    <User className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>Select a conversation to start messaging</p>
                  </div>
                </motion.div>
              )}
            </Card>
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}
