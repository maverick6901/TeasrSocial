import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import { storage } from "./storage";
import {
  encryptBuffer,
  decryptBuffer,
  generateContentKey,
  encryptContentKey,
  decryptContentKey
} from "./services/encryption";
import {
  saveEncryptedFile,
  readEncryptedFile,
  generateBlurredThumbnail,
  getFileExtension
} from "./services/fileStorage";
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { generateAccessToken, verifyAccessToken } from "./services/jwt";
import cron from "node-cron";
import { convertFromUSD, formatPrice, getAllPrices } from "./services/priceConversion";
import { db } from './db';
import { users, posts, payments, comments, votes, investors, platformFees, commentLikes } from '@shared/schema';
import { eq, desc, and, sql, count, inArray } from 'drizzle-orm';
import { x402PaymentService } from './services/x402-payment';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// WebSocket clients
const wsClients = new Set<WebSocket>();

// Middleware to get current user from wallet address
async function getCurrentUser(req: any) {
  const walletAddress = req.headers['x-wallet-address'];
  if (!walletAddress) {
    console.log('No wallet address in headers');
    return null;
  }

  console.log('Getting user for wallet address:', walletAddress);

  try {
    const user = await storage.getUserByWalletAddress(walletAddress);
    console.log('Found user:', user?.id, user?.username);
    return user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // WebSocket server on /ws path (using javascript_websocket blueprint pattern)
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    wsClients.add(ws);

    ws.on('close', () => {
      wsClients.delete(ws);
      console.log('WebSocket client disconnected');
    });
  });

  // Broadcast to all WebSocket clients
  function broadcast(message: any) {
    const data = JSON.stringify(message);
    wsClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  // ===== Crypto Price Routes =====

  // Get current cryptocurrency prices
  app.get('/api/prices', async (req, res) => {
    try {
      const prices = getAllPrices();
      res.json(prices);
    } catch (error: any) {
      console.error('Get prices error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== User Routes =====

  // Get or create user by wallet address
  app.post('/api/users/auth', async (req, res) => {
    try {
      const { walletAddress, username, referralCode } = req.body;

      if (!walletAddress || !username) {
        return res.status(400).json({ error: 'Wallet address and username required' });
      }

      // Check if user exists
      let user = await storage.getUserByWalletAddress(walletAddress);
      let isNewUser = false;

      if (!user) {
        isNewUser = true;
        try {
          // Create new user with unique username
          const baseUsername = username;
          let uniqueUsername = baseUsername;
          let attempt = 0;

          while (!user && attempt < 10) {
            try {
              user = await storage.createUser({ walletAddress, username: uniqueUsername });
            } catch (createError: any) {
              if (createError.code === '23505' && createError.constraint === 'users_username_unique') {
                // Username exists, try with suffix
                attempt++;
                uniqueUsername = `${baseUsername}_${attempt}`;
              } else if (createError.code === '23505' && createError.constraint === 'users_wallet_address_unique') {
                // Wallet exists, fetch it
                user = await storage.getUserByWalletAddress(walletAddress);
                break;
              } else {
                throw createError;
              }
            }
          }

          if (!user) {
            throw new Error('Failed to create user after multiple attempts');
          }

          // Auto-generate unique referral code for new user
          if (user) {
            try {
              // Create a unique code based on wallet address (last 6 chars + random)
              const walletSuffix = walletAddress.slice(-6).toUpperCase();
              const randomPart = crypto.randomBytes(2).toString('hex').toUpperCase();
              const uniqueCode = `${walletSuffix}${randomPart}`;

              await storage.createReferralCodeWithCode(user.id, uniqueCode, 0); // 0 = unlimited uses
            } catch (refError) {
              console.error('Failed to generate referral code:', refError);
              // Don't fail user creation if referral code generation fails
            }
          }

          // Handle referral code if provided
          if (referralCode && user) {
            const code = await storage.getReferralCodeByCode(referralCode);
            if (code && code.isActive) {
              // Check if code is still valid
              const isExpired = code.expiresAt && new Date(code.expiresAt) < new Date();
              const isMaxUsed = code.maxUses !== null && code.maxUses > 0 && code.currentUses >= code.maxUses;

              if (!isExpired && !isMaxUsed) {
                await storage.createReferral(code.userId, user.id, code.id);
              }
            }
          }
        } catch (createError: any) {
          console.error('User creation error:', createError);
          throw createError;
        }
      }

      res.json(user);
    } catch (error: any) {
      console.error('Auth error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Search users by username
  app.get('/api/users/search', async (req, res) => {
    try {
      const query = req.query.q as string;
      
      if (!query || query.length < 2) {
        return res.json([]);
      }

      const users = await storage.searchUsers(query);
      res.json(users);
    } catch (error: any) {
      console.error('Search users error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get users who have paid for current user's content (legacy)
  app.get('/api/users/paid-for-content', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const paidUsers = await storage.getUsersWhoPaidForContent(user.id);
      res.json(paidUsers);
    } catch (error: any) {
      console.error('Get paid users error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get payment relationships (both directions)
  app.get('/api/users/payment-relationships', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const relationships = await storage.getPaymentRelationshipsForUser(user.id);
      res.json(relationships);
    } catch (error: any) {
      console.error('Get payment relationships error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user profile by username
  app.get('/api/users/:username', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      const currentUserId = user?.id;

      const profile = await storage.getUserProfile(req.params.username, currentUserId);

      if (!profile) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(profile);
    } catch (error: any) {
      console.error('Get user error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update user profile
  app.put('/api/users/profile', upload.single('profileImage'), async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { username, bio } = req.body;
      let profileImagePath = user.profileImagePath;

      // Handle profile image upload - use regular save, not blurred
      if (req.file) {
        const fileExtension = getFileExtension(req.file.mimetype);
        const filename = `profile_${crypto.randomUUID()}.${fileExtension}`;
        const filepath = path.join(process.cwd(), 'uploads', 'thumbnails', filename);

        // Save the profile image directly (no blur)
        await fs.writeFile(filepath, req.file.buffer);
        profileImagePath = `/uploads/thumbnails/${filename}`;
      }

      const updatedUser = await storage.updateUserProfile(user.id, {
        username: username || user.username,
        bio: bio || user.bio,
        profileImagePath,
      });

      res.json(updatedUser);
    } catch (error: any) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Follow/unfollow user
  app.post('/api/users/:username/follow', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const targetUser = await storage.getUserByUsername(req.params.username);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.id === targetUser.id) {
        return res.status(400).json({ error: 'Cannot follow yourself' });
      }

      const result = await storage.toggleFollow(user.id, targetUser.id);

      // Create notification if user followed (not unfollowed)
      if (result.following) {
        await storage.createNotification({
          userId: targetUser.id,
          type: 'follow',
          actorId: user.id,
          message: `started following you`,
        }).catch(err => console.error('Error creating follow notification:', err));
      }

      res.json(result);
    } catch (error: any) {
      console.error('Follow error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Post Routes =====

  // Upload post with encryption
  app.post('/api/posts/upload', upload.single('file'), async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { title, description, price, isFree, buyoutPrice, maxInvestors, investorRevenueShare, acceptedCryptos, commentsLocked, commentFee } = req.body;

      // Generate content encryption key
      const contentKey = generateContentKey();

      // Encrypt the file content
      const encryptionResult = encryptBuffer(req.file.buffer, contentKey);

      // Encrypt the content key with master key for storage
      const encryptedKeyData = encryptContentKey(contentKey);

      // Save encrypted file with IV and authTag prepended/appended
      const fileExtension = getFileExtension(req.file.mimetype);
      // Format: [12 bytes IV][encrypted data][16 bytes auth tag]
      const fileWithMetadata = Buffer.concat([
        encryptionResult.iv,
        encryptionResult.encrypted,
        encryptionResult.authTag
      ]);
      const encryptedFilename = await saveEncryptedFile(fileWithMetadata, fileExtension);

      // Generate blurred thumbnail from original
      const thumbnailPath = await generateBlurredThumbnail(req.file.buffer);

      // Create post in database
      const post = await storage.createPost({
        creatorId: user.id,
        title,
        description: description || '',
        encryptedMediaPath: encryptedFilename,
        blurredThumbnailPath: `/uploads/${thumbnailPath}`,
        mediaType: req.file.mimetype.startsWith('image/') ? 'image' : 'video',
        encryptedKey: encryptedKeyData.encryptedKey,
        iv: encryptedKeyData.iv,
        authTag: encryptedKeyData.authTag,
        price: isFree === 'true' ? '0' : price,
        isFree: isFree === 'true',
        buyoutPrice: buyoutPrice || null,
        maxInvestors: maxInvestors ? parseInt(maxInvestors) : 10,
        investorRevenueShare: investorRevenueShare || '0',
        acceptedCryptos: acceptedCryptos || 'USDC',
        commentsLocked: commentsLocked === 'true',
        commentFee: commentsLocked === 'true' ? commentFee : null,
      });

      res.json(post);
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all posts
  app.get('/api/posts', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      const userId = user?.id;

      const allPosts = await storage.getAllPostsWithCreators(userId);

      const postsWithDetails = await Promise.all(
        allPosts.map(async (post) => {
          const hasUserPaid = user ? await storage.hasUserPaid(user.id, post.id, 'content') : false;
          const hasUserVoted = user ? await storage.getUserVote(user.id, post.id) : null;
          const commentCount = await storage.getCommentCount(post.id);

          // Get investor count for posts with buyout pricing
          let investorCount = 0;
          let userInvestorPosition = null;
          if (post.buyoutPrice) {
            investorCount = await storage.getInvestorCount(post.id);
            if (user) {
              userInvestorPosition = await storage.getUserInvestorPosition(user.id, post.id);
            }
          }

          return {
            ...post,
            hasUserPaid,
            hasUserVoted: hasUserVoted?.voteType || null,
            commentCount,
            investorCount,
            userInvestorPosition,
          };
        })
      );

      res.json(postsWithDetails);
    } catch (error: any) {
      console.error('Get posts error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get single post
  app.get('/api/posts/:id', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      const userId = user?.id;

      // Get post first
      const post = await storage.getPostWithCreator(req.params.id, userId);

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      res.json(post);
    } catch (error: any) {
      console.error('Get post error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get buyout investor count for a post
  app.get('/api/posts/:id/buyout-count', async (req, res) => {
    try {
      const post = await storage.getPost(req.params.id);
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      if (!post.buyoutPrice) {
        return res.json({ count: 0 });
      }

      const count = await storage.getInvestorCount(req.params.id);
      res.json({ count });
    } catch (error: any) {
      console.error('Get buyout count error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Track view for a post
  app.post('/api/posts/:id/view', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      const post = await storage.getPost(req.params.id);

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      // Increment view count
      await storage.incrementViewCount(req.params.id);

      // Get updated view count
      const updatedPost = await storage.getPost(req.params.id);
      if (updatedPost) {
        // Broadcast view count update via WebSocket
        broadcast({
          type: 'viewUpdate',
          payload: {
            postId: req.params.id,
            viewCount: updatedPost.viewCount,
          },
        });

        // Create view milestone notifications
        const viewMilestones = [100, 500, 1000, 5000, 10000];
        if (viewMilestones.includes(updatedPost.viewCount) && user?.id !== post.creatorId) {
          await storage.createNotification({
            userId: post.creatorId,
            type: 'view_milestone',
            postId: post.id,
            message: `reached ${updatedPost.viewCount} views!`,
          }).catch(err => console.error('Error creating notification:', err));
        }
      }

      res.json({ success: true, viewCount: updatedPost?.viewCount });
    } catch (error: any) {
      console.error('Track view error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get post media (with x402 payment gating)
  app.get('/api/posts/:id/media', async (req, res) => {
    try {
      // Try to get user from header or query param (for img src URLs)
      const walletFromQuery = req.query.wallet as string;
      if (walletFromQuery && !req.headers['x-wallet-address']) {
        req.headers['x-wallet-address'] = walletFromQuery;
      }
      const user = await getCurrentUser(req);
      const post = await storage.getPost(req.params.id);

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      // If content is free, skip payment check
      if (post.isFree) {
        console.log('Content is free, serving decrypted media');
        try {
          const encryptedBuffer = await readEncryptedFile(post.encryptedMediaPath);
          const contentKey = decryptContentKey({
            encryptedKey: post.encryptedKey,
            iv: post.iv,
            authTag: post.authTag,
          });
          const fileIv = encryptedBuffer.slice(0, 12);
          const fileAuthTag = encryptedBuffer.slice(-16);
          const fileEncryptedData = encryptedBuffer.slice(12, -16);
          const decryptedBuffer = decryptBuffer(fileEncryptedData, contentKey, fileIv, fileAuthTag);
          const mimeType = post.mediaType === 'image' ? 'image/jpeg' : 'video/mp4';
          res.set('Content-Type', mimeType);
          res.set('Cache-Control', 'private, max-age=3600');
          res.set('Content-Length', decryptedBuffer.length.toString());
          return res.send(decryptedBuffer);
        } catch (decryptError) {
          console.error('Decryption error for free content:', decryptError);
          return res.redirect(post.blurredThumbnailPath);
        }
      }

      // Check if user has paid or is the creator
      let isCreator = false;
      let hasPaid = false;

      if (user) {
        isCreator = user.id === post.creatorId;
        if (!isCreator) {
          hasPaid = await storage.hasUserPaid(user.id, req.params.id, 'content');
        }
      }

      console.log(`Media request for post ${post.id}: userId=${user?.id}, walletAddress=${req.headers['x-wallet-address']}, isCreator=${isCreator}, hasPaid=${hasPaid}, isFree=${post.isFree}`);

      // If not paid and not creator, serve blurred thumbnail
      if (!isCreator && !hasPaid) {
        console.log('User has not paid, serving blurred thumbnail');
        return res.redirect(post.blurredThumbnailPath);
      }

      // User has paid OR is creator - decrypt and serve actual content
      try {
        console.log('User has access, decrypting and serving content');
        const encryptedBuffer = await readEncryptedFile(post.encryptedMediaPath);
        const contentKey = decryptContentKey({
          encryptedKey: post.encryptedKey,
          iv: post.iv,
          authTag: post.authTag,
        });
        const fileIv = encryptedBuffer.slice(0, 12);
        const fileAuthTag = encryptedBuffer.slice(-16);
        const fileEncryptedData = encryptedBuffer.slice(12, -16);
        const decryptedBuffer = decryptBuffer(fileEncryptedData, contentKey, fileIv, fileAuthTag);
        const mimeType = post.mediaType === 'image' ? 'image/jpeg' : 'video/mp4';
        res.set('Content-Type', mimeType);
        res.set('Cache-Control', 'private, max-age=3600');
        res.set('Content-Length', decryptedBuffer.length.toString());
        res.send(decryptedBuffer);
      } catch (decryptError) {
        console.error('Decryption error:', decryptError);
        return res.redirect(post.blurredThumbnailPath);
      }
    } catch (error: any) {
      console.error('Get media error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stream decrypted content (with token validation)
  app.get('/api/posts/:id/stream', async (req, res) => {
    try {
      const { token } = req.query;

      if (!token) {
        return res.status(401).json({ error: 'Token required' });
      }

      // Verify token
      const payload = verifyAccessToken(token as string);

      if (payload.postId !== req.params.id) {
        return res.status(403).json({ error: 'Invalid token' });
      }

      // Get post
      const post = await storage.getPost(req.params.id);
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      // For this prototype, serve the blurred thumbnail
      // In production, this would decrypt and stream the actual content
      res.redirect(post.blurredThumbnailPath);
    } catch (error: any) {
      console.error('Stream error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Pay for post (x402 payment with multi-crypto support)
  app.post('/api/posts/:id/pay', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized - wallet not connected' });
      }

      const { amount, transactionHash, cryptocurrency, network, isBuyout } = req.body;
      const post = await storage.getPost(req.params.id);

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      // Track view when payment modal is opened (before actual payment)
      await storage.incrementViewCount(req.params.id).catch(err => 
        console.error('Error incrementing view count:', err)
      );

      // Check if cryptocurrency is accepted
      const acceptedCryptos = post.acceptedCryptos.split(',');
      if (!acceptedCryptos.includes(cryptocurrency)) {
        return res.status(400).json({ error: `${cryptocurrency} is not accepted for this content` });
      }

      // Check if already paid
      const alreadyPaid = await storage.hasUserPaid(user.id, post.id, 'content');
      if (alreadyPaid) {
        // Already paid, just return success
        return res.json({ success: true, alreadyPaid: true });
      }

      // Validate network for cryptocurrency
      const isProduction = process.env.NODE_ENV === 'production';
      const validNetworks: Record<string, string[]> = {
        'USDC': isProduction ? ['base-mainnet'] : ['base-sepolia', 'ethereum-sepolia', 'polygon-mumbai'],
        'SOL': isProduction ? ['solana-mainnet'] : ['solana-devnet'],
        'ETH': isProduction ? ['ethereum-mainnet'] : ['ethereum-sepolia'],
        'MATIC': isProduction ? ['polygon-mainnet'] : ['polygon-mumbai'],
        'BNB': isProduction ? ['bsc-mainnet'] : ['bsc-testnet'],
      };

      const selectedNetwork = network || (isProduction ? 'base-mainnet' : 'base-sepolia');
      if (cryptocurrency && validNetworks[cryptocurrency] && !validNetworks[cryptocurrency].includes(selectedNetwork)) {
        return res.status(400).json({ error: `Invalid network ${selectedNetwork} for ${cryptocurrency}` });
      }

      // Check investor limit (use post's maxInvestors setting)
      const maxInvestorSlots = post.maxInvestors || 10;
      const investorCount = await db.select({ count: count() })
        .from(investors)
        .where(eq(investors.postId, post.id))
        .then(result => result[0]?.count ?? 0);

      console.log(`Payment attempt - postId: ${post.id}, investorCount: ${investorCount}/${maxInvestorSlots}, isBuyout: ${isBuyout}`);

      // Prevent buyout if max investor spots filled, but allow regular unlock
      if (isBuyout && investorCount >= maxInvestorSlots) {
        return res.status(400).json({ 
          error: `All ${maxInvestorSlots} investor spots are filled. You can unlock at regular price.` 
        });
      }

      // Calculate actual payment amount
      // If buyout is selected AND spots available AND buyoutPrice exists, use buyout price
      // Otherwise use regular price
      const actualPrice = (isBuyout && investorCount < maxInvestorSlots && post.buyoutPrice) 
        ? post.buyoutPrice 
        : post.price;

      console.log(`Calculated price: ${actualPrice} (isBuyout: ${isBuyout}, investorCount: ${investorCount}/${maxInvestorSlots})`);

      // Create payment record
      const paymentRecord = await storage.createPayment({
        userId: user.id,
        postId: post.id,
        amount: amount.toString(),
        cryptocurrency: cryptocurrency || 'USDC',
        network: selectedNetwork,
        isBuyout: isBuyout || false,
        transactionHash: transactionHash || `mock_tx_${cryptocurrency}_${Date.now()}`,
        paymentType: 'content',
      });

      // Platform fee configuration (0.05 USDC on all locked content)
      const PLATFORM_FEE_USDC = 0.05;
      const PLATFORM_WALLET = '0x47aB5ba5f987A8f75f8Ef2F0D8FF33De1A04a020';

      // Record platform fee (0.05 USDC on every transaction for locked content)
      if (!post.isFree) {
        await db.insert(platformFees).values({
          paymentId: paymentRecord.id,
          postId: post.id,
          amount: PLATFORM_FEE_USDC.toString(),
          cryptocurrency: 'USDC',
          transactionHash: transactionHash || `platform_fee_${Date.now()}`,
          platformWallet: PLATFORM_WALLET,
          status: 'completed',
        });
        console.log(`Platform fee recorded: $${PLATFORM_FEE_USDC} for payment ${paymentRecord.id}`);
      }

      // Get creator wallet address and existing investors for x402 payment processing
      const creator = await db.select()
        .from(users)
        .where(eq(users.id, post.creatorId))
        .limit(1)
        .then(res => res[0]);

      const existingInvestors = await db.select()
        .from(investors)
        .where(eq(investors.postId, post.id))
        .orderBy(investors.position);

      // Get total payment count for this post to track which payment this is
      const totalPayments = await db.select({ count: count() })
        .from(payments)
        .where(and(
          eq(payments.postId, post.id),
          eq(payments.paymentType, 'content')
        ))
        .then(result => result[0]?.count ?? 0);

      const paymentNumber = totalPayments; // Already includes this payment

      console.log(`Post ${post.id} - Payment #${paymentNumber}, Existing investors: ${existingInvestors.length}/${maxInvestorSlots}, isBuyout: ${isBuyout}`);

      if (isBuyout && existingInvestors.length < maxInvestorSlots) {
        // User becomes an investor (buyers who choose buyout up to maxInvestors limit)
        const position = existingInvestors.length + 1;
        await db.insert(investors).values({
          postId: post.id,
          userId: user.id,
          position,
          investmentAmount: post.buyoutPrice || post.price,
          totalEarnings: '0.00',
        });
        
        console.log(`User ${user.id} became investor #${position}/${maxInvestorSlots} for post ${post.id}`);
      } else if (paymentNumber > maxInvestorSlots && existingInvestors.length === maxInvestorSlots && parseFloat(post.investorRevenueShare || '0') > 0) {
        // This is a payment after all investor slots filled - distribute revenue share
        const paymentAmount = parseFloat(amount);
        const revenueAfterPlatformFee = paymentAmount - PLATFORM_FEE_USDC;
        const investorSharePercentage = parseFloat(post.investorRevenueShare || '0') / 100;
        const totalInvestorShare = revenueAfterPlatformFee * investorSharePercentage;
        const earningsPerInvestor = totalInvestorShare / existingInvestors.length;
        
        console.log(`Payment #${paymentNumber} - Distributing investor revenue:
          Payment: $${paymentAmount}
          Platform Fee: $${PLATFORM_FEE_USDC}
          After Fee: $${revenueAfterPlatformFee}
          Investor Share %: ${post.investorRevenueShare}%
          Total to Investors: $${totalInvestorShare.toFixed(6)}
          Per Investor (${existingInvestors.length} investors): $${earningsPerInvestor.toFixed(6)}`);
        
        // Update investor earnings in database
        for (const investor of existingInvestors) {
          const currentEarnings = parseFloat(investor.totalEarnings || '0');
          const newEarnings = (currentEarnings + earningsPerInvestor).toFixed(6);
          await db.update(investors)
            .set({ totalEarnings: newEarnings })
            .where(eq(investors.id, investor.id));
          
          console.log(`Investor ${investor.userId} (position ${investor.position}): $${investor.totalEarnings} -> $${newEarnings}`);
        }

        // Get investor wallet addresses for x402 payment processing
        const investorUserIds = existingInvestors.map(inv => inv.userId);
        const investorUsers = investorUserIds.length > 0 
          ? await db.select()
              .from(users)
              .where(inArray(users.id, investorUserIds))
          : [];
        
        const investorsWithWallets = existingInvestors.map(inv => {
          const investorUser = investorUsers.find(u => u.id === inv.userId);
          return {
            userId: inv.userId,
            walletAddress: investorUser?.walletAddress || '',
            position: inv.position
          };
        });

        // Process payment split with x402 service (logs intended on-chain transfers)
        if (creator) {
          await x402PaymentService.processPaymentWithSplits({
            totalAmount: amount.toString(),
            cryptocurrency: cryptocurrency || 'USDC',
            creatorWallet: creator.walletAddress,
            transactionHash: transactionHash || `mock_tx_${cryptocurrency}_${Date.now()}`,
            investorRevenueSharePercent: parseFloat(post.investorRevenueShare || '0'),
            investors: investorsWithWallets.filter(inv => inv.walletAddress)
          });
        }
      } else {
        // Regular payment (no investor distribution)
        // Process payment split with x402 service (logs intended on-chain transfers)
        if (creator && !post.isFree) {
          await x402PaymentService.processPaymentWithSplits({
            totalAmount: amount.toString(),
            cryptocurrency: cryptocurrency || 'USDC',
            creatorWallet: creator.walletAddress,
            transactionHash: transactionHash || `mock_tx_${cryptocurrency}_${Date.now()}`
          });
        }
      }

      // Get updated investor data for broadcast
      const newInvestorCount = await storage.getInvestorCount(post.id);
      const updatedInvestors = await db.select()
        .from(investors)
        .where(eq(investors.postId, post.id));
      
      // Broadcast investor count and earnings update to all connected clients
      broadcast({
        type: 'buyoutUpdate',
        payload: {
          postId: post.id,
          investorCount: newInvestorCount,
          investorEarnings: updatedInvestors.map(inv => ({
            userId: inv.userId,
            totalEarnings: inv.totalEarnings,
          })),
        },
      });
      
      // Broadcast individual earnings updates to each investor
      for (const investor of updatedInvestors) {
        broadcast({
          type: 'investorEarningsUpdate',
          payload: {
            userId: investor.userId,
            postId: post.id,
            totalEarnings: investor.totalEarnings,
          },
        });
      }


      // Create notification for post creator (only if not creator themselves)
      if (user.id !== post.creatorId) {
        await storage.createNotification({
          userId: post.creatorId,
          type: 'purchase',
          actorId: user.id,
          postId: post.id,
          message: `purchased your content for ${amount} ${cryptocurrency}`,
        }).catch(err => console.error('Error creating purchase notification:', err));

        // Auto-create a welcome message to establish the DM conversation
        try {
          await storage.createDirectMessage({
            senderId: post.creatorId,
            receiverId: user.id,
            postId: post.id,
            content: `Thanks for unlocking my content! Feel free to message me anytime.`,
          });
          console.log(`Auto-created DM conversation between creator ${post.creatorId} and buyer ${user.id}`);
        } catch (dmError) {
          console.error('Error creating auto-DM:', dmError);
          // Don't fail the payment if DM creation fails
        }
      }

      // Also grant comment access if comments are locked
      if (post.commentsLocked) {
        await storage.createPayment({
          userId: user.id,
          postId: post.id,
          amount: '0',
          cryptocurrency: cryptocurrency || 'USDC',
          network: network || 'base-sepolia',
          isBuyout: false,
          transactionHash: transactionHash || `mock_tx_${cryptocurrency}_${Date.now()}_comment`,
          paymentType: 'comment',
        });
      }

      res.json({ success: true, alreadyPaid: false });
    } catch (error: any) {
      console.error('Payment error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Pay for comment access
  app.post('/api/posts/:id/pay-comment', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { amount, transactionHash, cryptocurrency, network } = req.body;
      const post = await storage.getPost(req.params.id);

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      if (!post.commentsLocked) {
        return res.json({ success: true, alreadyPaid: true });
      }

      // Check if already paid for comments
      const alreadyPaid = await storage.hasUserPaid(user.id, post.id, 'comment');
      if (alreadyPaid) {
        return res.json({ success: true, alreadyPaid: true });
      }

      // Create payment record for comment access
      const commentPaymentRecord = await storage.createPayment({
        userId: user.id,
        postId: post.id,
        amount: post.commentFee || '0',
        cryptocurrency: cryptocurrency || 'USDC',
        network: network || 'base-sepolia',
        isBuyout: false,
        transactionHash: transactionHash || `mock_tx_comment_${cryptocurrency}_${Date.now()}`,
        paymentType: 'comment',
      });

      // Platform fee for comment unlock (0.05 USDC)
      const PLATFORM_FEE_USDC = 0.05;
      const PLATFORM_WALLET = '0x47aB5ba5f987A8f75f8Ef2F0D8FF33De1A04a020';
      
      await db.insert(platformFees).values({
        paymentId: commentPaymentRecord.id,
        postId: post.id,
        amount: PLATFORM_FEE_USDC.toString(),
        cryptocurrency: 'USDC',
        transactionHash: transactionHash || `platform_fee_comment_${Date.now()}`,
        platformWallet: PLATFORM_WALLET,
        status: 'completed',
      });
      console.log(`Platform fee recorded for comment unlock: $${PLATFORM_FEE_USDC} for payment ${commentPaymentRecord.id}`);

      // Create notification for post creator
      await storage.createNotification({
        userId: post.creatorId,
        type: 'comment_unlock',
        actorId: user.id,
        postId: post.id,
        message: `unlocked comments for ${post.commentFee} ${cryptocurrency}`,
      }).catch(err => console.error('Error creating comment unlock notification:', err));

      res.json({ success: true, alreadyPaid: false });
    } catch (error: any) {
      console.error('Comment payment error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vote on post
  app.post('/api/posts/:id/vote', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { voteType } = req.body;

      if (!['up', 'down'].includes(voteType)) {
        return res.status(400).json({ error: 'Invalid vote type' });
      }

      // Create or update vote
      await storage.createOrUpdateVote({
        userId: user.id,
        postId: req.params.id,
        voteType,
      });

      // Get updated post for counts
      const post = await storage.getPost(req.params.id);

      // Create notification for post creator (only for upvotes)
      if (post && voteType === 'up' && post.creatorId !== user.id) {
        await storage.createNotification({
          userId: post.creatorId,
          type: 'like',
          actorId: user.id,
          postId: post.id,
          message: `upvoted your post`,
        });
      }

      // Broadcast vote update via WebSocket
      broadcast({
        type: 'voteUpdate',
        payload: {
          postId: req.params.id,
          upvoteCount: post?.upvoteCount || 0,
          downvoteCount: post?.downvoteCount || 0,
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('Vote error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Notification Routes =====

  // Get user notifications
  app.get('/api/notifications', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const notifications = await storage.getUserNotifications(user.id);
      res.json(notifications);
    } catch (error: any) {
      console.error('Get notifications error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get unread notification count
  app.get('/api/notifications/unread-count', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const count = await storage.getUnreadNotificationCount(user.id);
      res.json({ count });
    } catch (error: any) {
      console.error('Get unread count error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Mark notification as read
  app.put('/api/notifications/:id/read', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await storage.markNotificationAsRead(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Mark notification read error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Mark all notifications as read
  app.put('/api/notifications/read-all', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await storage.markAllNotificationsAsRead(user.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Mark all read error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Direct Messages Routes =====

  // Get conversations (list of users with messages)
  app.get('/api/messages/conversations', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const conversations = await storage.getUserConversations(user.id);
      res.json(conversations);
    } catch (error: any) {
      console.error('Get conversations error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get messages with a specific user
  app.get('/api/messages/:otherUserId', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const messages = await storage.getMessagesBetweenUsers(user.id, req.params.otherUserId);
      res.json(messages);
    } catch (error: any) {
      console.error('Get messages error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Send a direct message
  app.post('/api/messages/:receiverId', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { content, postId } = req.body;
      const receiverId = req.params.receiverId;

      // Always verify payment relationship exists
      // Check if sender paid for receiver's content OR receiver paid for sender's content
      const senderPaidForReceiver = await storage.hasUserPaidForAnyContent(user.id, receiverId);
      const receiverPaidForSender = await storage.hasUserPaidForAnyContent(receiverId, user.id);

      if (!senderPaidForReceiver && !receiverPaidForSender) {
        return res.status(403).json({
          error: 'You can only message users whose content you have unlocked or who have unlocked your content'
        });
      }

      const message = await storage.createDirectMessage({
        senderId: user.id,
        receiverId,
        postId: postId || null,
        content,
      });

      // Create notification for receiver
      await storage.createNotification({
        userId: receiverId,
        type: 'comment',
        actorId: user.id,
        message: 'sent you a message',
      });

      // Broadcast message via WebSocket
      broadcast({
        type: 'newMessage',
        payload: message,
      });

      res.json(message);
    } catch (error: any) {
      console.error('Send message error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Mark messages as read
  app.put('/api/messages/:otherUserId/read', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      await storage.markMessagesAsRead(user.id, req.params.otherUserId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Mark messages read error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get unread message count
  app.get('/api/messages/unread/count', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const count = await storage.getUnreadMessageCount(user.id);
      res.json({ count });
    } catch (error: any) {
      console.error('Get unread message count error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Comment Routes =====

  // Get comments for post
  app.get('/api/posts/:id/comments', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      const post = await storage.getPost(req.params.id);

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      // Check if comments are locked
      if (post.commentsLocked && user) {
        // Allow viewing if user paid for content OR comments specifically OR is the creator
        const hasPaidContent = await storage.hasUserPaid(user.id, req.params.id, 'content');
        const hasPaidComment = await storage.hasUserPaid(user.id, req.params.id, 'comment');
        const isCreator = user.id === post.creatorId;

        if (!hasPaidContent && !hasPaidComment && !isCreator) {
          return res.status(403).json({
            error: 'Comments locked',
            requiresPayment: true,
            fee: post.commentFee,
          });
        }
      } else if (post.commentsLocked && !user) {
        return res.status(403).json({
          error: 'Comments locked',
          requiresPayment: true,
          fee: post.commentFee,
        });
      }

      const comments = await storage.getCommentsByPost(req.params.id);
      
      // Add like info for each comment if user is logged in
      const commentsWithLikes = await Promise.all(
        comments.map(async (comment) => {
          let hasUserLiked = false;
          if (user) {
            const like = await db.query.commentLikes.findFirst({
              where: and(
                eq(commentLikes.commentId, comment.id),
                eq(commentLikes.userId, user.id)
              ),
            });
            hasUserLiked = !!like;
          }
          return { ...comment, hasUserLiked };
        })
      );
      
      res.json(commentsWithLikes);
    } catch (error: any) {
      console.error('Get comments error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Post comment
  app.post('/api/posts/:id/comments', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { content } = req.body;
      const post = await storage.getPost(req.params.id);

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      // Check if comments are locked
      if (post.commentsLocked) {
        // Check if user paid for content OR comments specifically OR is the creator
        const hasPaidContent = await storage.hasUserPaid(user.id, req.params.id, 'content');
        const hasPaidComment = await storage.hasUserPaid(user.id, req.params.id, 'comment');
        const isCreator = user.id === post.creatorId;

        console.log(`Comment access check - hasPaidContent: ${hasPaidContent}, hasPaidComment: ${hasPaidComment}, isCreator: ${isCreator}`);

        // Allow commenting if user paid for content, paid for comments specifically, or is the creator
        if (!hasPaidContent && !hasPaidComment && !isCreator) {
          return res.status(403).json({ error: 'Payment required for comments' });
        }
      }

      const comment = await storage.createComment({
        postId: req.params.id,
        userId: user.id,
        content,
      });

      // Create notification for post creator
      if (post.creatorId !== user.id) {
        await storage.createNotification({
          userId: post.creatorId,
          type: 'comment',
          actorId: user.id,
          postId: post.id,
          message: `commented on your post`,
        });
      }

      res.json(comment);
    } catch (error: any) {
      console.error('Comment error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete comment
  app.delete('/api/comments/:commentId', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const comment = await db.query.comments.findFirst({
        where: eq(comments.id, req.params.commentId),
      });

      if (!comment) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      // Only the comment author can delete it
      if (comment.userId !== user.id) {
        return res.status(403).json({ error: 'You can only delete your own comments' });
      }

      await db.delete(comments).where(eq(comments.id, req.params.commentId));

      res.json({ success: true });
    } catch (error: any) {
      console.error('Delete comment error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Like/Unlike comment
  app.post('/api/comments/:commentId/like', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const comment = await db.query.comments.findFirst({
        where: eq(comments.id, req.params.commentId),
      });

      if (!comment) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      // Check if user already liked this comment
      const existingLike = await db.query.commentLikes.findFirst({
        where: and(
          eq(commentLikes.commentId, req.params.commentId),
          eq(commentLikes.userId, user.id)
        ),
      });

      if (existingLike) {
        // Unlike - remove the like
        await db.delete(commentLikes).where(eq(commentLikes.id, existingLike.id));
        
        // Decrement like count
        await db.update(comments)
          .set({ likeCount: sql`${comments.likeCount} - 1` })
          .where(eq(comments.id, req.params.commentId));

        res.json({ liked: false });
      } else {
        // Like - add the like
        await db.insert(commentLikes).values({
          commentId: req.params.commentId,
          userId: user.id,
        });
        
        // Increment like count
        await db.update(comments)
          .set({ likeCount: sql`${comments.likeCount} + 1` })
          .where(eq(comments.id, req.params.commentId));

        res.json({ liked: true });
      }
    } catch (error: any) {
      console.error('Like comment error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Referral Routes =====

  // Generate a new referral code
  app.post('/api/referrals/generate', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { maxUses, expiresAt } = req.body;
      const referralCode = await storage.generateReferralCode(
        user.id,
        maxUses || 0,
        expiresAt ? new Date(expiresAt) : undefined
      );

      res.json(referralCode);
    } catch (error: any) {
      console.error('Generate referral code error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user's referral codes
  app.get('/api/referrals/codes', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const codes = await storage.getUserReferralCodes(user.id);
      res.json(codes);
    } catch (error: any) {
      console.error('Get referral codes error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get referral stats
  app.get('/api/referrals/stats', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const stats = await storage.getReferralStats(user.id);
      res.json(stats);
    } catch (error: any) {
      console.error('Get referral stats error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user's referrals
  app.get('/api/referrals/list', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const referralList = await storage.getUserReferrals(user.id);
      res.json(referralList);
    } catch (error: any) {
      console.error('Get referrals error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Toggle referral code active status
  app.put('/api/referrals/codes/:codeId/toggle', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const code = await storage.toggleReferralCodeStatus(req.params.codeId, user.id);
      res.json(code);
    } catch (error: any) {
      console.error('Toggle referral code error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Investor Dashboard =====
  app.get('/api/investors/dashboard', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ message: 'Not authenticated' });
      }

      console.log(`Fetching investor dashboard for user ${user.id}`);

      const userInvestments = await db.select()
        .from(investors)
        .where(eq(investors.userId, user.id))
        .orderBy(desc(investors.totalEarnings));

      console.log(`Found ${userInvestments.length} investments for user ${user.id}`);

      const investments = await Promise.all(
        userInvestments.map(async (investment) => {
          const post = await db.query.posts.findFirst({
            where: eq(posts.id, investment.postId),
          });

          // Count total payments for this post
          const totalUnlocks = await db.select({ count: count() })
            .from(payments)
            .where(and(
              eq(payments.postId, investment.postId),
              eq(payments.paymentType, 'content')
            ))
            .then(result => result[0]?.count ?? 0);

          const unlocksAfterFirst10 = Math.max(0, totalUnlocks - 10);
          
          console.log(`Post ${investment.postId}: ${totalUnlocks} total unlocks, ${unlocksAfterFirst10} after first 10, earnings: $${investment.totalEarnings}`);

          return {
            postId: investment.postId,
            postTitle: post?.title ?? 'Deleted Post',
            position: investment.position,
            earningsGenerated: investment.totalEarnings,
            totalUnlocks: unlocksAfterFirst10,
            investmentAmount: investment.investmentAmount,
          };
        })
      );

      const totalEarnings = userInvestments
        .reduce((sum, inv) => sum + parseFloat(inv.totalEarnings), 0)
        .toFixed(2);

      console.log(`Total earnings for user ${user.id}: $${totalEarnings}`);

      res.json({
        totalEarnings,
        investments,
      });
    } catch (error: any) {
      console.error('Investor dashboard error:', error);
      res.status(500).json({ error: error.message });
    }
  });


  // ===== Admin Routes =====

  app.get('/api/admin/stats', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error: any) {
      console.error('Admin stats error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/payments', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const payments = await storage.getUserRecentPayments(user.id, 50);
      res.json(payments);
    } catch (error: any) {
      console.error('Admin payments error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/viral-posts', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const viralPosts = await storage.getUserViralPosts(user.id);

      // Add revenue for each viral post
      const postsWithRevenue = await Promise.all(
        viralPosts.map(async (post) => {
          const revenue = await storage.getPostRevenue(post.id);
          return { ...post, revenue };
        })
      );

      res.json(postsWithRevenue);
    } catch (error: any) {
      console.error('Admin viral posts error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get user total revenue
  app.get('/api/users/:userId/revenue', async (req, res) => {
    try {
      const revenue = await storage.getUserTotalRevenue(req.params.userId);
      res.json({ revenue });
    } catch (error: any) {
      console.error('Get user revenue error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get post revenue
  app.get('/api/posts/:id/revenue', async (req, res) => {
    try {
      const revenue = await storage.getPostRevenue(req.params.id);
      res.json({ revenue });
    } catch (error: any) {
      console.error('Get post revenue error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Backfill investor earnings for past transactions
  app.post('/api/admin/backfill-investor-earnings', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get all posts with buyout pricing
      const postsWithBuyout = await db.select()
        .from(posts)
        .where(sql`${posts.buyoutPrice} IS NOT NULL`);

      let updatedCount = 0;

      for (const post of postsWithBuyout) {
        // Get all payments for this post
        const postPayments = await db.select()
          .from(payments)
          .where(and(
            eq(payments.postId, post.id),
            eq(payments.paymentType, 'content')
          ))
          .orderBy(payments.paidAt);

        // Get investors for this post
        const postInvestors = await db.select()
          .from(investors)
          .where(eq(investors.postId, post.id))
          .orderBy(investors.position);

        if (postInvestors.length === 0) continue;

        // Reset all investor earnings to 0
        for (const investor of postInvestors) {
          await db.update(investors)
            .set({ totalEarnings: '0' })
            .where(eq(investors.id, investor.id));
        }

        // Calculate earnings based on payments after first 10
        const paymentsAfterFirst10 = postPayments.slice(10);
        const earningsPerInvestor = paymentsAfterFirst10.length * 0.05;

        // Update each investor's earnings
        for (const investor of postInvestors) {
          const newEarnings = earningsPerInvestor.toFixed(2);
          await db.update(investors)
            .set({ totalEarnings: newEarnings })
            .where(eq(investors.id, investor.id));
          updatedCount++;
        }
      }

      res.json({ 
        success: true, 
        message: `Backfilled earnings for ${updatedCount} investors across ${postsWithBuyout.length} posts`,
        updatedCount,
        postsProcessed: postsWithBuyout.length,
      });
    } catch (error: any) {
      console.error('Backfill investor earnings error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== Viral Detection Worker =====
  // Run every 5 minutes to check for viral posts
  cron.schedule('*/5 * * * *', async () => {
    console.log('Running viral detection worker...');

    try {
      const posts = await storage.getAllPostsWithCreators();
      const VIRAL_UPVOTE_THRESHOLD = 10;

      for (const post of posts) {
        if (post.isViral) continue;

        // Check if post meets viral threshold (10 or more upvotes)
        if (post.upvoteCount >= VIRAL_UPVOTE_THRESHOLD) {
          await storage.markPostViral(post.id);

          console.log(`Post ${post.id} went viral!`);

          // Broadcast viral notification
          broadcast({
            type: 'viralNotification',
            payload: {
              postId: post.id,
              message: `"${post.title}" by ${post.creator.username} just went viral! 🔥`,
            },
          });
        }
      }
    } catch (error) {
      console.error('Viral detection error:', error);
    }
  });

  // Serve uploaded files
  const express = await import('express');
  app.use('/uploads/thumbnails', express.default.static(path.join(process.cwd(), 'uploads', 'thumbnails')));

  app.use('/uploads', (req, res, next) => {
    // Block direct access to encrypted files
    if (!req.path.startsWith('/thumbnails/')) {
      res.status(403).json({ error: 'Direct access not allowed' });
    }
  });

  return httpServer;
}