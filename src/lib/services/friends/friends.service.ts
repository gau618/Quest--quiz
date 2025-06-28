// src/lib/services/friends.service.ts

import prisma from '@/lib/prisma/client'; // Your shared Prisma client instance
import { FriendRequestStatus } from '@prisma/client';

// This is a placeholder for your real-time notification service.
// In a later step, we'll replace this with a real implementation that uses Socket.IO.
const notificationService = {
  sendNotification: async (userId: string, type: string, payload: any) => {
    console.log(`[Notification Stub] To ${userId}: ${type}`, payload);
    // In a real implementation, this would emit a socket event via Redis Pub/Sub
    // to ensure it reaches the correct user on any server instance.
    // e.g., redis.publish('socket-notifications', JSON.stringify({ userId, type, payload }));
  },
};

export const friendsService = {
  /**
   * Searches for users by their username or name, excluding the current user.
   * This is used for the "Add Friend" search functionality.
   * @param query The search string.
   * @param currentUserId The ID of the user performing the search, to exclude them from results.
   * @returns A list of user profiles matching the query.
   */
  async searchUsers(query: string, currentUserId: string) {
    if (!query || query.length < 2) {
      return [];
    }
    return prisma.userProfile.findMany({
      where: {
        AND: [
          {
            OR: [
              { username: { contains: query, mode: 'insensitive' } },
              { name: { contains: query, mode: 'insensitive' } },
            ],
          },
          { userId: { not: currentUserId } },
        ],
      },
      select: { userId: true, username: true, name: true, avatarUrl: true },
      take: 10,
    });
  },

  /**
   * Sends a new friend request from one user to another.
   * Validates that a request isn't sent to oneself, or if a friendship or pending request already exists.
   * @param requesterId The ID of the user sending the request.
   * @param receiverId The ID of the user receiving the request.
   * @returns The newly created friend request.
   */
  async sendFriendRequest(requesterId: string, receiverId: string) {
    if (requesterId === receiverId) {
      throw new Error("You cannot send a friend request to yourself.");
    }

    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { user1Id: requesterId, user2Id: receiverId },
          { user1Id: receiverId, user2Id: requesterId },
        ],
      },
    });
    if (existingFriendship) {
      throw new Error("You are already friends with this user.");
    }

    const existingRequest = await prisma.friendRequest.findFirst({
      where: {
        requesterId,
        receiverId,
      },
    });
    if (existingRequest && existingRequest.status === 'PENDING') {
      throw new Error("A friend request has already been sent to this user.");
    }

    const newRequest = await prisma.friendRequest.upsert({
      where: { requesterId_receiverId: { requesterId, receiverId } },
      update: { status: FriendRequestStatus.PENDING },
      create: {
        requesterId,
        receiverId,
        status: FriendRequestStatus.PENDING,
      },
    });

    await notificationService.sendNotification(receiverId, 'FRIEND_REQUEST_RECEIVED', {
      from: {
        userId: requesterId,
      },
      requestId: newRequest.id,
    });

    return newRequest;
  },

  /**
   * Responds to a pending friend request (accept or decline).
   * Ensures the user responding is the intended receiver of the request.
   * @param currentUserId The ID of the user responding.
   * @param requestId The ID of the friend request.
   * @param action The response action ('accept' or 'decline').
   * @returns The updated friend request.
   */
  async respondToFriendRequest(currentUserId: string, requestId: string, action: 'accept' | 'decline') {
    const request = await prisma.friendRequest.findFirst({
      where: { id: requestId, receiverId: currentUserId, status: 'PENDING' },
    });

    if (!request) {
      throw new Error("Friend request not found or you don't have permission to respond.");
    }

    if (action === 'accept') {
      return prisma.$transaction(async (tx) => {
        const updatedRequest = await tx.friendRequest.update({
          where: { id: requestId },
          data: { status: FriendRequestStatus.ACCEPTED },
        });

        const user1Id = request.requesterId < request.receiverId ? request.requesterId : request.receiverId;
        const user2Id = request.requesterId > request.receiverId ? request.requesterId : request.receiverId;

        await tx.friendship.create({
          data: { user1Id, user2Id },
        });

        await notificationService.sendNotification(request.requesterId, 'FRIEND_REQUEST_ACCEPTED', {
          from: { userId: currentUserId },
        });

        return updatedRequest;
      });
    } else { // 'decline' action
      const updatedRequest = await prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: FriendRequestStatus.DECLINED },
      });

      await notificationService.sendNotification(request.requesterId, 'FRIEND_REQUEST_DECLINED', {
        from: { userId: currentUserId },
      });

      return updatedRequest;
    }
  },

  /**
   * Retrieves a user's complete list of friends.
   * @param userId The ID of the user whose friends to fetch.
   * @returns A list of friend user profiles.
   */
  async getFriends(userId: string) {
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
      include: {
        user1: { select: { userId: true, username: true, name: true, avatarUrl: true } },
        user2: { select: { userId: true, username: true, name: true, avatarUrl: true } },
      },
    });
    return friendships.map(f => (f.user1Id === userId ? f.user2 : f.user1));
  },

  /**
   * Retrieves a user's pending incoming friend requests.
   * @param userId The ID of the user.
   * @returns A list of pending friend requests.
   */
  async getPendingRequests(userId: string) {
    return prisma.friendRequest.findMany({
      where: { receiverId: userId, status: 'PENDING' },
      include: {
        requester: { select: { userId: true, username: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Removes a friend by deleting the friendship record.
   * @param currentUserId The ID of the user initiating the removal.
   * @param friendIdToRemove The ID of the friend to remove.
   */
  async removeFriend(currentUserId: string, friendIdToRemove: string) {
    const user1Id = currentUserId < friendIdToRemove ? currentUserId : friendIdToRemove;
    const user2Id = currentUserId > friendIdToRemove ? currentUserId : friendIdToRemove;

    return prisma.$transaction(async (tx) => {
      const deletedFriendship = await tx.friendship.deleteMany({
        where: { user1Id, user2Id },
      });

      if (deletedFriendship.count === 0) {
        throw new Error("Friendship not found.");
      }

      await tx.friendRequest.updateMany({
        where: {
          OR: [
            { requesterId: currentUserId, receiverId: friendIdToRemove, status: 'ACCEPTED' },
            { requesterId: friendIdToRemove, receiverId: currentUserId, status: 'ACCEPTED' },
          ],
        },
        data: { status: FriendRequestStatus.DECLINED },
      });

      await notificationService.sendNotification(friendIdToRemove, 'FRIEND_REMOVED', {
        by: { userId: currentUserId },
      });
    });
  },
};
