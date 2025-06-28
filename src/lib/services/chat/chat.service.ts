// src/lib/services/chat.service.ts
import prisma from '@/lib/prisma/client';
import { ChatRoomType, MessageType } from '@prisma/client';
import { notificationService } from '../notification/notification.service';

export const chatService = {
  /**
   * Gets or creates a Direct Message (DM) room between two users.
   */
  async getOrCreateDMRoom(user1Id: string, user2Id: string) {
    if (user1Id === user2Id) throw new Error("Cannot create a DM room with yourself.");

    const existingRoom = await prisma.chatRoom.findFirst({
      where: { type: ChatRoomType.DM, members: { every: { userId: { in: [user1Id, user2Id] } } } },
    });
    if (existingRoom) return existingRoom;

    return prisma.chatRoom.create({
      data: { type: ChatRoomType.DM, members: { create: [{ userId: user1Id }, { userId: user2Id }] } },
    });
  },

  /**
   * Creates a new Group Chat room.
   */
  // In chat.service.ts
async createGroupChatRoom(creatorId: string, name: string, memberIds: string[]) {
  // ... (validation logic remains the same)
  const allMemberIds = Array.from(new Set([creatorId, ...memberIds]));

  return prisma.chatRoom.create({
    data: {
      type: ChatRoomType.GROUP,
      name,
      // --- UPDATED LOGIC ---
      members: {
        create: allMemberIds.map(id => ({
          userId: id,
          // Assign the ADMIN role to the creator, others are MEMBERS
          role: id === creatorId ? 'ADMIN' : 'MEMBER',
        })),
      },
    },
  });
},


  /**
   * Fetches all chat rooms for a user, including the last message for a preview.
   */
  async getChatRoomsForUser(userId: string) {
    return prisma.chatRoom.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { include: { userProfile: { select: { userId: true, username: true, avatarUrl: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });
  },

  /**
   * Fetches the message history for a specific chat room, ensuring the user is a member.
   */
  async getMessagesForRoom(userId: string, chatRoomId: string, limit: number = 50) {
    const member = await prisma.chatRoomMember.findUnique({ where: { chatRoomId_userId: { chatRoomId, userId } } });
    if (!member) throw new Error("Access denied. You are not a member of this chat room.");

    return prisma.message.findMany({
      where: { chatRoomId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: { sender: { select: { userId: true, username: true, avatarUrl: true } } },
    });
  },
  
  /**
   * Saves a new message and triggers a real-time notification via Redis Pub/Sub.
   */
  async sendMessage(senderId: string, chatRoomId: string, content: string) {
    if (!content.trim()) throw new Error("Message content cannot be empty.");
    
    const member = await prisma.chatRoomMember.findUnique({ where: { chatRoomId_userId: { chatRoomId, userId: senderId } } });
    if (!member) throw new Error("You are not a member of this chat room.");

    const [newMessage] = await prisma.$transaction([
      prisma.message.create({
        data: { senderId, chatRoomId, content, type: MessageType.TEXT },
        include: { sender: { select: { userId: true, username: true, avatarUrl: true } } },
      }),
      prisma.chatRoom.update({
        where: { id: chatRoomId },
        data: { updatedAt: new Date() },
      }),
    ]);

    notificationService.sendToRoom(chatRoomId, 'chat:receive_message', newMessage);
    return newMessage;
  },
};
