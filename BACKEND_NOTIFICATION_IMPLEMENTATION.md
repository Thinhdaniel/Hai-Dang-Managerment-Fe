# Real-Time Notification System - Backend Implementation Guide

This guide provides step-by-step instructions to implement the backend notification system in your Node.js/Express application.

## 📋 Table of Contents
1. [Installation & Setup](#installation--setup)
2. [MongoDB Schema](#mongodb-schema)
3. [Socket.io Server Configuration](#socketio-server-configuration)
4. [REST API Endpoints](#rest-api-endpoints)
5. [Service Layer](#service-layer)
6. [Socket Event Handlers](#socket-event-handlers)
7. [Integration with CRUD Operations](#integration-with-crud-operations)
8. [Testing](#testing)

---

## Installation & Setup

### 1. Install Dependencies

```bash
npm install socket.io socket.io-cors
npm install --save-dev @types/socket.io
```

### 2. Update your main server file (e.g., `server.ts` or `app.ts`)

```typescript
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';

const app = express();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
    cors: {
        origin: [
            'http://localhost:5173',    // Frontend dev
            'http://localhost:3000',    // Local testing
            'https://your-frontend.vercel.app', // Production
        ],
        credentials: true,
        methods: ['GET', 'POST'],
    },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach io to app for use in routes/middleware
app.set('io', io);

// API routes
app.use('/api', apiRoutes);

// Socket.io connection handler
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export default { app, server, io };
```

---

## MongoDB Schema

### Create Notification Model

**File: `src/models/notification.model.ts`**

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
    userId: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    actionType: 'machine' | 'user' | 'asset' | 'transfer' | 'maintenance' | 'borrowing' | 'system';
    actionId?: string;
    isRead: boolean;
    createdAt: Date;
    readAt?: Date;
}

const notificationSchema = new Schema<INotification>({
    userId: {
        type: String,
        required: true,
        index: true,
    },
    title: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum: ['info', 'success', 'warning', 'error'],
        default: 'info',
    },
    actionType: {
        type: String,
        enum: ['machine', 'user', 'asset', 'transfer', 'maintenance', 'borrowing', 'system'],
        required: true,
    },
    actionId: {
        type: String,
        optional: true,
    },
    isRead: {
        type: Boolean,
        default: false,
        index: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    readAt: {
        type: Date,
        optional: true,
    },
});

// Compound index for efficient queries
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

const Notification = mongoose.model<INotification>('Notification', notificationSchema);

export default Notification;
```

---

## Socket.io Server Configuration

### Create Socket Manager

**File: `src/services/socket.manager.ts`**

```typescript
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyJWT } from '../middleware/auth';

interface AuthenticatedSocket extends Socket {
    userId?: string;
    userRole?: string;
}

export class SocketManager {
    private io: SocketIOServer;
    private userSockets: Map<string, Set<string>> = new Map();

    constructor(io: SocketIOServer) {
        this.io = io;
        this.setupMiddleware();
        this.setupConnectionHandlers();
    }

    private setupMiddleware() {
        this.io.use((socket: AuthenticatedSocket, next) => {
            try {
                const token = socket.handshake.auth.token;
                if (!token) {
                    return next(new Error('No token provided'));
                }

                const decoded = verifyJWT(token);
                if (!decoded) {
                    return next(new Error('Invalid token'));
                }

                socket.userId = decoded.userId || decoded.id;
                socket.userRole = decoded.role;
                next();
            } catch (error) {
                next(new Error('Authentication error'));
            }
        });
    }

    private setupConnectionHandlers() {
        this.io.on('connection', (socket: AuthenticatedSocket) => {
            console.log(`User ${socket.userId} connected with socket ${socket.id}`);

            // Track user skets
            if (socket.userId) {
                if (!this.userSockets.has(socket.userId)) {
                    this.userSockets.set(socket.userId, new Set());
                }
                this.userSockets.get(socket.userId)!.add(socket.id);

                // Join user-specific room
                socket.join(`user:${socket.userId}`);
            }

            // Handle disconnect
            socket.on('disconnect', () => {
                console.log(`User ${socket.userId} disconnected`);
                if (socket.userId) {
                    const sockets = this.userSockets.get(socket.userId);
                    if (sockets) {
                        sockets.delete(socket.id);
                        if (sockets.size === 0) {
                            this.userSockets.delete(socket.userId);
                        }
                    }
                }
            });

            // Handle errors
            socket.on('error', (error) => {
                console.error(`Socket error for user ${socket.userId}:`, error);
            });
        });
    }

    /**
     * Emit notification to specific user
     */
    public emitToUser(userId: string, event: string, data: unknown) {
        this.io.to(`user:${userId}`).emit(event, data);
    }

    /**
     * Emit notification to multiple users
     */
    public emitToUsers(userIds: string[], event: string, data: unknown) {
        userIds.forEach((userId) => {
            this.emitToUser(userId, event, data);
        });
    }

    /**
     * Emit to all connected clients
     */
    public broadcastToAll(event: string, data: unknown) {
        this.io.emit(event, data);
    }

    /**
     * Get connected sockets for a user
     */
    public getUserSocketCount(userId: string): number {
        return this.userSockets.get(userId)?.size ?? 0;
    }

    /**
     * Check if user is online
     */
    public isUserOnline(userId: string): boolean {
        return this.userSockets.has(userId);
    }

    /**
     * Get all online users
     */
    public getOnlineUsers(): string[] {
        return Array.from(this.userSockets.keys());
    }
}
```

---

## REST API Endpoints

### Create Notification Controller

**File: `src/controllers/notification.controller.ts`**

```typescript
import { Request, Response } from 'express';
import Notification from '../models/notification.model';

interface AuthRequest extends Request {
    userId?: string;
}

export class NotificationController {
    /**
     * GET /notifications
     * Fetch user's notifications with pagination
     */
    static async getNotifications(req: AuthRequest, res: Response) {
        try {
            const userId = req.userId;
            const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
            const offset = parseInt(req.query.offset as string) || 0;

            const [notifications, total, unreadCount] = await Promise.all([
                Notification.find({ userId })
                    .sort({ createdAt: -1 })
                    .limit(limit)
                    .skip(offset),
                Notification.countDocuments({ userId }),
                Notification.countDocuments({ userId, isRead: false }),
            ]);

            res.json({
                notifications,
                total,
                unreadCount,
                hasMore: offset + limit < total,
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch notifications' });
        }
    }

    /**
     * PATCH /notifications/:id/read
     * Mark single notification as read
     */
    static async markAsRead(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const userId = req.userId;

            const notification = await Notification.findOneAndUpdate(
                { _id: id, userId },
                {
                    isRead: true,
                    readAt: new Date(),
                },
                { new: true }
            );

            if (!notification) {
                return res.status(404).json({ error: 'Notification not found' });
            }

            // Emit socket event
            const io = req.app.get('io');
            io.to(`user:${userId}`).emit('notify:read', {
                notificationId: id,
            });

            res.json(notification);
        } catch (error) {
            res.status(500).json({ error: 'Failed to mark notification as read' });
        }
    }

    /**
     * PATCH /notifications/read-all
     * Mark all notifications as read
     */
    static async markAllAsRead(req: AuthRequest, res: Response) {
        try {
            const userId = req.userId;

            const result = await Notification.updateMany(
                { userId, isRead: false },
                {
                    isRead: true,
                    readAt: new Date(),
                }
            );

            // Emit socket event
            const io = req.app.get('io');
            io.to(`user:${userId}`).emit('notify:cleared');

            res.json({ updatedCount: result.modifiedCount });
        } catch (error) {
            res.status(500).json({ error: 'Failed to mark all as read' });
        }
    }

    /**
     * DELETE /notifications/:id
     * Delete single notification
     */
    static async deleteNotification(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const userId = req.userId;

            const result = await Notification.deleteOne({
                _id: id,
                userId,
            });

            if (result.deletedCount === 0) {
                return res.status(404).json({ error: 'Notification not found' });
            }

            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete notification' });
        }
    }

    /**
     * DELETE /notifications
     * Delete all notifications
     */
    static async deleteAllNotifications(req: AuthRequest, res: Response) {
        try {
            const userId = req.userId;

            const result = await Notification.deleteMany({ userId });

            res.json({ deletedCount: result.deletedCount });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete notifications' });
        }
    }

    /**
     * GET /notifications/stats
     * Get notification statistics
     */
    static async getStats(req: AuthRequest, res: Response) {
        try {
            const userId = req.userId;

            const total = await Notification.countDocuments({ userId });
            const unread = await Notification.countDocuments({
                userId,
                isRead: false,
            });

            const byType = await Notification.aggregate([
                { $match: { userId } },
                {
                    $group: {
                        _id: '$type',
                        count: { $sum: 1 },
                    },
                },
            ]);

            res.json({
                total,
                unread,
                byType: Object.fromEntries(
                    byType.map((item) => [item._id, item.count])
                ),
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    }
}
```

### Register API Routes

**File: `src/routes/notification.routes.ts`**

```typescript
import express from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

router.get('/', NotificationController.getNotifications);
router.get('/stats', NotificationController.getStats);
router.patch('/:id/read', NotificationController.markAsRead);
router.patch('/read-all', NotificationController.markAllAsRead);
router.delete('/:id', NotificationController.deleteNotification);
router.delete('/', NotificationController.deleteAllNotifications);

export default router;
```

---

## Service Layer

### Create Notification Service

**File: `src/services/notification.service.ts`**

```typescript
import Notification from '../models/notification.model';
import { Server as SocketIOServer } from 'socket.io';

export interface CreateNotificationDTO {
    userId: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    actionType: string;
    actionId?: string;
}

export class NotificationService {
    constructor(private io: SocketIOServer) {}

    /**
     * Create and emit a notification
     */
    async createNotification(data: CreateNotificationDTO) {
        try {
            const notification = new Notification(data);
            await notification.save();

            // Emit via Socket.io
            this.io.to(`user:${data.userId}`).emit('notify:new', notification);

            return notification;
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    }

    /**
     * Create notifications for multiple users
     */
    async createBulkNotifications(
        userIds: string[],
        data: Omit<CreateNotificationDTO, 'userId'>
    ) {
        try {
            const notifications = userIds.map((userId) => ({
                ...data,
                userId,
            }));

            const created = await Notification.insertMany(notifications);

            // Emit to all users
            created.forEach((notif) => {
                this.io.to(`user:${notif.userId}`).emit('notify:new', notif);
            });

            return created;
        } catch (error) {
            console.error('Error creating bulk notifications:', error);
            throw error;
        }
    }

    /**
     * Get user's unread count
     */
    async getUnreadCount(userId: string): Promise<number> {
        return Notification.countDocuments({
            userId,
            isRead: false,
        });
    }

    /**
     * Clean old notifications (older than 90 days)
     */
    async cleanOldNotifications(daysOld: number = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await Notification.deleteMany({
            createdAt: { $lt: cutoffDate },
        });

        return result.deletedCount;
    }
}
```

---

## Socket Event Handlers

### Setup Event Listeners

**File: `src/services/socket.events.ts`**

```typescript
import { Server as SocketIOServer, Socket } from 'socket.io';
import { NotificationService } from './notification.service';

export function setupSocketEvents(io: SocketIOServer, notificationService: NotificationService) {
    io.on('connection', (socket: any) => {
        const userId = socket.userId;

        // Listen for mark as read event
        socket.on('notify:mark-read', async (notificationId: string) => {
            try {
                // Update in database
                // Handled by API endpoint in production
                console.log(`Notification ${notificationId} marked as read by ${userId}`);
            } catch (error) {
                socket.emit('error', { message: 'Failed to mark as read' });
            }
        });

        // Listen for clear event
        socket.on('notify:clear', async () => {
            try {
                console.log(`All notifications cleared for ${userId}`);
            } catch (error) {
                socket.emit('error', { message: 'Failed to clear notifications' });
            }
        });
    });
}
```

---

## Integration with CRUD Operations

### Example: Emit Notification on Machine Creation

**File: `src/controllers/machine.controller.ts`**

```typescript
import { Request, Response } from 'express';
import Machine from '../models/machine.model';
import { NotificationService } from '../services/notification.service';

interface AuthRequest extends Request {
    userId?: string;
}

export class MachineController {
    static async createMachine(req: AuthRequest, res: Response) {
        try {
            const io = req.app.get('io');
            const notificationService = new NotificationService(io);

            // Create machine
            const machine = new Machine(req.body);
            await machine.save();

            // Notify all admin users
            const adminUsers = await getAdminUsers(); // Your implementation

            await notificationService.createBulkNotifications(
                adminUsers.map((u) => u._id.toString()),
                {
                    title: 'New Machine Created',
                    message: `Machine "${machine.name}" has been added to the system.`,
                    type: 'success',
                    actionType: 'machine',
                    actionId: machine._id.toString(),
                }
            );

            res.status(201).json(machine);
        } catch (error) {
            res.status(500).json({ error: 'Failed to create machine' });
        }
    }
}
```

---

## Testing

### Manual Testing Steps

1. **Start Backend:**
   ```bash
   npm run dev
   ```

2. **Connect Frontend:**
   - Open http://localhost:5173
   - Login

3. **Trigger Notifications:**
   - Create a new machine/asset/user
   - Check notification bell in header
   - Verify Toast notification appears

4. **Test Mark as Read:**
   - Click notification or checkbox
   - Should update in real-time

5. **Test Reconnection:**
   - Open DevTools Network tab
   - Throttle connection
   - Disconnect/reconnect
   - Verify connection restores

---

## Troubleshooting

### Connection Issues
- Check CORS configuration
- Verify Socket.io port is accessible
- Check firewall settings

### Notifications Not Appearing
- Verify user ID is correctly sent
- Check Socket.io event name matches
- Check browser console for errors

### Performance Issues
- Implement notification cleanup job
- Use pagination for notification list
- Consider notification batching

---

## Next Steps

1. Implement cleanup job for old notifications (CronJob)
2. Add notification preferences/settings (opt-in/out)
3. Add email fallback for critical notifications
4. Add notification grouping by type
5. Add real-time notification statistics dashboard
