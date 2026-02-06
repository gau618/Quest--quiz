// src/lib/services/chat.service.ts
import prisma from '@/lib/prisma/client';
import { ChatRoomType, MessageType, ChatRoomMemberRole } from '@prisma/client';
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
   * Creates a new Group Chat room and assigns the creator as ADMIN.
   */
 async createGroupChatRoom(creatorId: string, name: string, memberIds: string[]) {
    if (!name.trim()) throw new Error("Group chat name cannot be empty.");
    if (name.length > 100) throw new Error("Group name is too long. Maximum 100 characters.");
    if (memberIds.length === 0) throw new Error("A group must have at least one other member.");
    if (memberIds.length > 50) throw new Error("Too many members. Maximum 50 members per group.");
    
    const allMemberIds = Array.from(new Set([creatorId, ...memberIds]));

    return prisma.chatRoom.create({
      data: {
        type: ChatRoomType.GROUP,
        name,
        members: {
          create: allMemberIds.map(id => ({
            userId: id,
            role: id === creatorId ? 'ADMIN' : 'MEMBER',
          })),
        },
      },
      include: {
        members: {
          select: {
            userId: true,
            role: true, // Select 'role' from the ChatRoomMember level
            userProfile: { // Select user details from the nested UserProfile
              select: {
                userId: true,
                username: true,
                avatarUrl: true
              }
            }
          }
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
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
    if (content.length > 2000) throw new Error("Message is too long. Maximum 2000 characters.");
    
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
  

  /**
   * Deletes a group chat, but only if the user is an admin.
   */
  async deleteGroupAsAdmin(userId: string, chatRoomId: string) {
    const member = await prisma.chatRoomMember.findUnique({
      where: { chatRoomId_userId: { chatRoomId, userId } },
    });
    console.log(member)

    if (!member) {
      throw new Error("Access Denied: You are not a member of this group.");
    }

    if (member.role !== ChatRoomMemberRole.ADMIN) {
      throw new Error("Permission Denied: Only group admins can delete the group.");
    }

    // Notify all members that the group is being deleted in real-time
    notificationService.sendToRoom(chatRoomId, 'chat:group_deleted', { chatRoomId });

    // Use a transaction to delete all related data atomically
   await prisma.$transaction([
    // Delete all messages associated with the chat room
    prisma.message.deleteMany({ where: { chatRoomId } }),
    
    // --- THE CRITICAL FIX IS HERE ---
    // Delete all group invites associated with the chat room
    prisma.groupInvite.deleteMany({ where: { chatRoomId } }),
    
    // Delete all memberships for the chat room
    prisma.chatRoomMember.deleteMany({ where: { chatRoomId } }),
    
    // Finally, delete the chat room itself now that all dependencies are gone
    prisma.chatRoom.delete({ where: { id: chatRoomId } }),
  ]);

    return { success: true, message: "Group deleted successfully." };
  },

    async updateGroupDetails(userId: string, chatRoomId: string, data: { name?: string; description?: string }) {
    const member = await prisma.chatRoomMember.findUnique({
      where: { chatRoomId_userId: { chatRoomId, userId } },
    });

    if (!member || member.role !== 'ADMIN') {
      throw new Error("Permission Denied: Only group admins can change group details.");
    }

    const updatedRoom = await prisma.chatRoom.update({
      where: { id: chatRoomId },
      data: {
        name: data.name,
        description: data.description,
      },
      // Include the full data to broadcast back to the clients
      include: {
        members: { select: { userId: true, role: true, userProfile: { select: { userId: true, username: true, avatarUrl: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });

    // Notify all room members of the update in real-time
    notificationService.sendToRoom(chatRoomId, 'chat:group_updated', { updatedRoom });
    return updatedRoom;
  },

 async addMemberByAdmin(adminAuthId: string, chatRoomId: string, newMemberAuthId: string) {
    // 1. Verify the person adding is an admin of that room
    const adminMembership = await prisma.chatRoomMember.findUnique({
      where: {
        chatRoomId_userId: { chatRoomId, userId: adminAuthId }, // Assuming userId here is UserProfile.id
        role: 'ADMIN',
      },
    });

    if (!adminMembership) {
      throw new Error("Permission Denied: Only group admins can add new members.");
    }
  console.log(newMemberAuthId)
    // --- CRITICAL FIX 1: Ensure the new member has a UserProfile record ---
    // We need the UserProfile.id, not the authentication ID.
    const newMemberProfile = await prisma.userProfile.findUnique({
      where: { userId: newMemberAuthId }, // Assuming UserProfile has a 'userId' field that stores the Auth ID
    });

    if (!newMemberProfile) {
      throw new Error("Cannot add member: User profile not found for this user ID. Please ensure they have a complete profile.");
    }

    // 2. Check if the user is already a member
    const existingMembership = await prisma.chatRoomMember.findUnique({
      where: { chatRoomId_userId: { chatRoomId, userId: newMemberProfile.id } }, // Use newMemberProfile.id here
    });

    if (existingMembership) {
      throw new Error("User is already a member of this group.");
    }

    // 3. Create the new member record
    const newMember = await prisma.chatRoomMember.create({
      data: {
        chatRoomId,
        userId: newMemberProfile.userId, // --- CRITICAL FIX 2: Use newMemberProfile.id for the foreign key ---
        role: 'MEMBER',
      },
      // IMPORTANT: Include the userProfile to send complete data to the frontend
      include: {
        userProfile: {
          select: { id: true, userId: true, username: true, avatarUrl: true },
        },
      },
    });

    return newMember;
  }
,
  /**
   * Removes a member from a group.
   * Can be called by an admin to remove another user, or by a member to leave.
   */
  async removeMemberFromGroup(actingUserId: string, chatRoomId: string, memberToRemoveId: string) {
    const actingUserMembership = await prisma.chatRoomMember.findUnique({
      where: { chatRoomId_userId: { chatRoomId, userId: actingUserId } },
    });

    if (!actingUserMembership) {
      throw new Error("Access Denied: You are not a member of this group.");
    }

    // Check permissions: Admin can remove anyone, Member can only remove themselves
    const isAdmin = actingUserMembership.role === 'ADMIN';
    const isSelfRemoval = actingUserId === memberToRemoveId;

    if (!isSelfRemoval && !isAdmin) {
      throw new Error("Permission Denied: You are not an admin.");
    }

    // Edge Case: Prevent the last admin from leaving or being removed
    if (isSelfRemoval || isAdmin) {
      const admins = await prisma.chatRoomMember.findMany({
        where: { chatRoomId, role: 'ADMIN' },
      });
      if (admins.length === 1 && admins[0].userId === memberToRemoveId) {
        throw new Error("A group must have at least one admin. Promote another member before leaving.");
      }
    }
    
    // Proceed with removal
    await prisma.chatRoomMember.delete({
      where: { chatRoomId_userId: { chatRoomId, userId: memberToRemoveId } },
    });
    // Notify all remaining room members
    notificationService.sendToRoom(chatRoomId, 'chat:member_removed', { chatRoomId, removedUserId: memberToRemoveId });
    // Also notify the removed user so their UI updates
    notificationService.sendToUsers([memberToRemoveId], 'chat:you_were_removed', { chatRoomId });

    return { success: true };
  },
};
