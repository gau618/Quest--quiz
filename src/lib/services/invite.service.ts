import prisma from '../prisma/client';
import { addDays } from 'date-fns';

export const inviteService = {
  generateInviteCode: async (chatRoomId: string, userId: string) => {
    // Get UserProfile ID first
    const userProfile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { id: true }
    });

    if (!userProfile) {
      throw new Error("User profile not found");
    }

    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    return prisma.groupInvite.create({
      data: {
        code,
        chatRoom: { connect: { id: chatRoomId } },
        admin: { connect: { id: userProfile.id } },
        expiresAt: addDays(new Date(), 1)
      }
    });
  },

  validateInviteCode: async (code: string, userId: string) => {
    // Get UserProfile ID first
    const userProfile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { id: true }
    });

    if (!userProfile) {
      throw new Error("User profile not found");
    }

    const invite = await prisma.groupInvite.findUnique({
      where: { code },
      include: { chatRoom: true }
    });

    if (!invite) throw new Error("Invalid invite code");
    if (invite.expiresAt < new Date()) throw new Error("Invite code expired");
    if (invite.usedById) throw new Error("Invite code already used");

    // Add user to group
    await prisma.chatRoomMember.create({
      data: {
        chatRoom: { connect: { id: invite.chatRoomId } },
        userProfile: { connect: { id: userProfile.id } },
        role: 'MEMBER'
      }
    });

    // Mark invite as used
    await prisma.groupInvite.update({
      where: { id: invite.id },
      data: { 
        usedBy: { connect: { id: userProfile.id } },
        usedAt: new Date()
      }
    });

    return invite.chatRoom;
  },

  getActiveInvites: (chatRoomId: string) => {
    return prisma.groupInvite.findMany({
      where: {
        chatRoomId,
        expiresAt: { gt: new Date() },
        usedById: null
      }
    });
  }
};
